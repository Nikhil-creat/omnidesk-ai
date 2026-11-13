module.exports = (req, res) => res.status(200).json({ ok: true, groq: !!process.env.GROQ_API_KEY, gemini: !!process.env.GEMINI_API_KEY, t: Date.now() });
