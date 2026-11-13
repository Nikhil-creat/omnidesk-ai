// Supabase REST helpers, Gemini embeddings, chunking and the Captain RAG answer (triage + grounded reply + confidence)
const { ask } = require('./_ai');
const env = () => ({ URL: process.env.SUPABASE_URL, ANON: process.env.SUPABASE_ANON_KEY, SVC: process.env.SUPABASE_SERVICE_KEY });
async function rest(path, { method = 'GET', body, jwt, svc, prefer } = {}) {
  const { URL, ANON, SVC } = env(); if (!URL) throw new Error('SUPABASE_URL missing');
  const r = await fetch(URL + '/rest/v1/' + path, { method, signal: AbortSignal.timeout(12000), body: body ? JSON.stringify(body) : undefined,
    headers: { apikey: svc ? SVC : ANON, Authorization: 'Bearer ' + (svc ? SVC : jwt || ANON), 'Content-Type': 'application/json', ...(prefer ? { Prefer: prefer } : {}) } });
  const t = await r.text(); if (!r.ok) throw new Error(r.status + ' ' + t.slice(0, 200)); return t ? JSON.parse(t) : null;
}
async function user(req) {
  const jwt = (req.headers.authorization || '').replace('Bearer ', ''); if (!jwt) return null;
  const { URL, ANON } = env(); const r = await fetch(URL + '/auth/v1/user', { headers: { apikey: ANON, Authorization: 'Bearer ' + jwt } });
  return r.ok ? { id: (await r.json()).id, jwt } : null;
}
let embModel;
async function embed(text) {
  const key = process.env.GEMINI_API_KEY; if (!key) return null;
  try {
    if (!embModel) { const d = await (await fetch('https://generativelanguage.googleapis.com/v1beta/models?key=' + key)).json();
      const ok = (d.models || []).filter(m => (m.supportedGenerationMethods || []).includes('embedContent')).map(m => m.name);
      embModel = ok.find(n => /gemini-embedding-001/.test(n)) || ok.find(n => /text-embedding-004/.test(n)) || ok[0]; }
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/${embModel}:embedContent?key=${key}`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: { parts: [{ text: text.slice(0, 6000) }] }, outputDimensionality: 768 }), signal: AbortSignal.timeout(10000) });
    const v = (await r.json()).embedding; return v ? v.values : null;
  } catch (e) { console.error('embed', e.message); return null; }
}
const vec = v => v ? '[' + v.join(',') + ']' : null;
function chunk(t, size = 1800, ov = 250) { const out = []; t = t.replace(/\r/g, '').trim(); for (let i = 0; i < t.length; i += size - ov) { out.push(t.slice(i, i + size)); if (i + size >= t.length) break; } return out; }
// Captain: one call = triage (sentiment/priority) + grounded answer + calibrated confidence + handoff signal
async function captain({ acct, question, history = [], jwt, svc }) {
  let chunks = []; try { chunks = await rest('rpc/match_chunks', { method: 'POST', jwt, svc, body: { acct, q_emb: vec(await embed(question)), q_text: question.slice(0, 300), k: 5 } }) || []; } catch (e) { console.error('rag', e.message); }
  const ctx = chunks.map((c, i) => `[${i + 1}] ${c.body}`).join('\n---\n');
  const prompt = `Answer ONLY from the <docs>. Cite sources like [1]. If docs do not contain the answer, set confidence below 0.5.\n<docs>${ctx || '(none)'}</docs>\n<conversation>${history.slice(-6).map(m => m.sender + ': ' + m.body).join('\n').slice(0, 1500)}</conversation>\n<untrusted>${question.slice(0, 1200)}</untrusted>\nReply with ONLY JSON: {"answer":"","confidence":0-1,"sentiment":"frustrated|neutral|positive","priority":"low|medium|high|urgent","human_requested":true|false,"summary":"<=15 words"}`;
  const r = await ask([{ role: 'user', content: prompt }]); if (!r) return null;
  try { const j = JSON.parse(r.reply.match(/\{[\s\S]*\}/)[0]); j.confidence = chunks.length ? +j.confidence || 0 : Math.min(+j.confidence || 0, .4); j.engine = r.provider + ' \u00b7 ' + r.model; j.sources = chunks.length; return j; } catch (e) { return null; }
}
module.exports = { rest, user, embed, vec, chunk, captain };
