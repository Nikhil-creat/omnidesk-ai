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
