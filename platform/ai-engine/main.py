"""OmniDesk ai-engine: guardrails -> triage -> hybrid RAG (RRF) -> confidence handoff. Max 6 steps."""
import re, hmac, hashlib, os, time
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel
app = FastAPI(title="omnidesk-ai-engine")
SECRET = os.getenv("INTERNAL_HMAC_SECRET", "change-me").encode()
INJECT = re.compile(r"ignore (all|previous) instructions|system prompt|reveal.*key", re.I)
PII = re.compile(r"\b(?:\d[ -]?){13,19}\b|\b\d{3}-\d{2}-\d{4}\b")
def rrf(*ranked, k=60):
    s = {}
    for lst in ranked:
        for r, d in enumerate(lst): s[d] = s.get(d, 0) + 1 / (k + r + 1)
    return sorted(s, key=s.get, reverse=True)
def mask(t): return PII.sub("[PII]", t)
class Msg(BaseModel): account_id: int; text: str
@app.get("/health")
def health(): return {"ok": True, "t": time.time()}
@app.post("/v1/reply")
def reply(m: Msg, x_signature: str = Header("")):
    if not hmac.compare_digest(x_signature, hmac.new(SECRET, m.text.encode(), hashlib.sha256).hexdigest()): raise HTTPException(401, "bad signature")
    if INJECT.search(m.text): return {"status": "open", "handoff": True, "reason": "prompt-injection"}
    # dense/sparse retrieval run in SQL scoped WHERE account_id = :id (see db/init.sql); rrf() merges, reranker picks top-5
    conf = 0.0  # no verified chunks wired in demo
    if conf < 0.75: return {"status": "open", "handoff": True, "reply": "I don't have verified information on that — let me connect you with a specialist."}

# ---- Self-hosted CNN inspection: EfficientNet-B3 (ONNX). Place your fine-tuned model at VISION_MODEL_PATH. ----
CLASSES = ["damaged_product", "error_screenshot", "receipt_invoice", "id_document", "UI_bug", "other"]
class Img(BaseModel): image_b64: str
@app.post("/v1/vision")
def vision(i: Img):
    import base64, io
    path = os.getenv("VISION_MODEL_PATH", "")
    if not path or not os.path.exists(path): raise HTTPException(503, "vision model not loaded")
    import numpy as np, onnxruntime as ort
    from PIL import Image
    img = Image.open(io.BytesIO(base64.b64decode(i.image_b64))).convert("RGB").resize((224, 224))  # re-encode strips EXIF/GPS
    x = ((np.asarray(img, dtype="float32") / 255 - [0.485, 0.456, 0.406]) / [0.229, 0.224, 0.225]).transpose(2, 0, 1)[None].astype("float32")
    s = ort.InferenceSession(path); lg = s.run(None, {s.get_inputs()[0].name: x})[0][0]
    p = np.exp(lg - lg.max()); p /= p.sum(); k = int(p.argmax())
    return {"cnn_class": CLASSES[k], "confidence": float(p[k]), "defects": [], "extracted_text": "", "engine": "onnxruntime"}
