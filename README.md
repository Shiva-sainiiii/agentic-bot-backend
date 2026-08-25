# Agentic Bot — Backend (Render)

Sirf API — koi frontend nahi. Frontend alag se Vercel pe deploy hoga
(`agentic-bot-frontend` folder dekh, isi conversation mein diya gaya hai).

## Endpoints

- `GET  /health` — uptime-pinger ke liye
- `POST /api/agent` — single-role test (Phase 1)
- `POST /api/project` — poori multi-file pipeline, ek shot mein poora result (Phase 3)
- `POST /api/project/start` — job-based version, turant `jobId` deta hai (Phase 4, frontend isko use karta hai)
- `GET  /api/project/status/:jobId?since=N` — job poll karo, naye events lo

## Live code streaming (NEW)

Coder aur Fixer roles ab OpenRouter se `stream: true` ke saath call hote hain.
Har token chunk aate hi ek `code-chunk` event job ke event log mein push hota
hai (`{ type: "code-chunk", file, delta, model }`). Frontend jab poll karta
hai, ye chunks turant mil jaate hain — is tarah frontend real-time typing
effect dikha sakta hai jaisa model actually likh raha hai, fake typewriter
animation nahi.

Agar ek model beech-stream fail ho jaaye aur fallback chain agle model pe
jaaye, ek `code-chunk-reset` event bhejta hai taaki frontend purana partial
text clear kar de aur naye model se fresh stream dikhaye.

## Deploy on Render

1. Ye folder GitHub repo bana ke push kar (frontend wale se ALAG repo, ya isi repo ka ek subfolder — jo bhi aasan lage)
2. Render → New → Web Service → repo connect
3. Build Command: `npm install`
4. Start Command: `npm start`
5. Environment Variables:
   - `OPENROUTER_API_KEY`
   - `E2B_API_KEY`
   - `ALLOWED_ORIGIN` = tera Vercel frontend ka URL, jaise `https://agentic-bot-frontend.vercel.app`
     (isse sirf tera frontend hi is backend ko call kar payega — CORS security ke liye)
6. Deploy

Deploy hone ke baad tera backend URL milega, jaisa `https://agentic-bot-backend.onrender.com` —
**ye URL frontend ke `index.html` me daalna hoga** (dekh frontend README).

## Render free tier ko sleep se bachana

Render free instance ~15 min inactivity ke baad sleep ho jata hai. Free uptime-monitor se bachao:

- **UptimeRobot** (uptimerobot.com) — free, 5-min interval
- **cron-job.org** — free, custom interval

Setup: naya monitor banao, URL = `https://tera-backend.onrender.com/health`, interval 10-14 min.

## Test (backend seedha, frontend ke bina)

```bash
curl -X POST https://tera-backend.onrender.com/api/project \
  -H "Content-Type: application/json" \
  -d '{"task":"Ek simple todo app banao HTML, CSS aur vanilla JS mein"}'
```

## CORS note

`ALLOWED_ORIGIN` env variable set nahi kiya to sab origins allowed honge (`*`) — testing ke
liye theek hai, lekin production me apna exact Vercel URL daalna better hai taaki koi aur
website tera backend na use kar sake (tera OpenRouter/E2B quota unka use ho sakta hai warna).
