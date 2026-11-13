# OmniDesk AI
Mossline-style scroll-story landing + AI gateway (Groq + Gemini, auto model detection, failover) for the Chatwoot-style omnichannel platform.
## Local
`npm i -g vercel && vercel dev` (set GROQ_API_KEY / GEMINI_API_KEY in `.env`)
## Deploy
GitHub -> Vercel: import repo, add the two env vars, Deploy. Check `/api/health`.
## Platform stack (spec)
Rails 7.2 + Vue 3, Sidekiq, FastAPI + LangGraph, pgvector hybrid RAG, ONNX CNN, Redis, Nginx (6 containers).
