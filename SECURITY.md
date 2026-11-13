# Security Policy
Report vulnerabilities privately to sriramojunikhil66@gmail.com (do not open a public issue).
- API keys live only in server environment variables (Vercel), never in the repo or browser.
- Chat and triage endpoints rate-limit per IP and mask card-like numbers before calling LLM providers.
- Customer text is treated as untrusted input in every prompt.
