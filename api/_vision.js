// Image inspection: validation + EXIF-free input + NSFW screen + classification/defects/OCR JSON. Uses Gemini vision here;
// the same JSON contract is served by platform/ai-engine /v1/vision (EfficientNet-B3 / YOLOv8 ONNX) for self-hosted deployments.
const { geminiModel } = require('./_ai');
const CLASSES = ['damaged_product', 'error_screenshot', 'receipt_invoice', 'id_document', 'UI_bug', 'other'];
function validate(b64) {
  const buf = Buffer.from(String(b64 || ''), 'base64'); if (buf.length < 100 || buf.length > 1.5e6) throw new Error('image must be under 1.5 MB');
  const h = buf.subarray(0, 12).toString('hex'), mime = h.startsWith('ffd8ff') ? 'image/jpeg' : h.startsWith('89504e47') ? 'image/png' : (buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') ? 'image/webp' : null;
  if (!mime) throw new Error('only jpeg/png/webp allowed (magic-byte check)'); return mime;
}
async function inspect(b64) {
  const mime = validate(b64), key = process.env.GEMINI_API_KEY; if (!key) return null;
  try {
    const m = await geminiModel(key);
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${key}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(9000),
      body: JSON.stringify({ generationConfig: { temperature: 0, maxOutputTokens: 400 }, contents: [{ parts: [{ inlineData: { mimeType: mime, data: b64 } }, { text: 'Inspect this customer-support image. Reply ONLY JSON: {"cnn_class":"damaged_product|error_screenshot|receipt_invoice|id_document|UI_bug|other","confidence":0-1,"defects":["cracked_screen"],"extracted_text":"short text if error_screenshot or receipt_invoice, else empty","unsafe":false}. Never transcribe ID documents. unsafe=true for explicit/violent content.' }] }] }) });
    const j = JSON.parse((await r.json()).candidates[0].content.parts[0].text.match(/\{[\s\S]*\}/)[0]);
    if (j.unsafe) return { rejected: true };
    if (!CLASSES.includes(j.cnn_class)) j.cnn_class = 'other'; if (j.cnn_class === 'id_document') j.extracted_text = '';
    return { cnn_class: j.cnn_class, confidence: Math.min(1, Math.max(0, +j.confidence || 0)), defects: (j.defects || []).slice(0, 5).map(String), extracted_text: String(j.extracted_text || '').slice(0, 400), engine: 'gemini-vision \u00b7 ' + m };
  } catch (e) { console.error('vision', e.message); return null; } // graceful degrade: message still delivered
}
module.exports = { inspect, validate };
