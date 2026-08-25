// server.js
// Render pe long-running process — SIRF backend API. Frontend Vercel pe alag se hai.

const express = require("express");
const { runAgent, MODEL_GROUPS } = require("./agents/fallbackEngine");
const { runProjectPipeline } = require("./agents/projectOrchestrator");

const app = express();
app.use(express.json({ limit: "5mb" })); // multi-file logs/code bade ho sakte hain

// CORS — Vercel frontend se cross-origin requests aayengi, isliye allow karna hoga.
// ALLOWED_ORIGIN env variable me apna Vercel URL daalna (jaise https://tera-app.vercel.app).
// Agar set nahi kiya to sabko allow kar dete hain (dev ke liye theek, production me tighten karna).
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    return res.sendStatus(204); // preflight request ka jawab
  }
  next();
});

// Root route — UptimeRobot jaise monitors default me "/" ko hi ping karte hain.
// Isko na rakhne se wo 404 dikhata reh jaata, chahe server bilkul theek chal raha ho.
app.get("/", (req, res) => {
  res.json({ status: "ok", service: "agentic-bot-backend" });
});

// Health check — uptime-pinger (UptimeRobot/cron-job.org) isi ko hit karega
// taaki Render free instance sleep na ho
app.get("/health", (req, res) => {
  res.json({ status: "ok", roles: Object.keys(MODEL_GROUPS), time: new Date().toISOString() });
});

// Phase 1: single-role test (jaisa Vercel version mein tha)
app.post("/api/agent", async (req, res) => {
  const { role, prompt, messages } = req.body || {};
  if (!role) {
    return res.status(400).json({ error: "`role` chahiye", validRoles: Object.keys(MODEL_GROUPS) });
  }
  const finalMessages = messages || [{ role: "user", content: prompt || "" }];
  if (!finalMessages.length || (!prompt && !messages)) {
    return res.status(400).json({ error: "`prompt` ya `messages` chahiye" });
  }
  try {
    const result = await runAgent(role, finalMessages);
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// Phase 2: single-file coding loop — projectOrchestrator ke andar bhi
// yehi pattern hai, lekin ye standalone single-file quick test ke liye rakha hai
app.post("/api/code", async (req, res) => {
  const { task, fileName, runCmd } = req.body || {};
  if (!task || !fileName || !runCmd) {
    return res.status(400).json({
      error: "`task`, `fileName`, aur `runCmd` teeno chahiye",
    });
  }
  try {
    // single-file ko project pipeline jaisa treat karne ke bajaye purana
    // simple orchestrator use karte — lekin us file ko yaha inline rakhne
    // ke bajaye humne pura logic projectOrchestrator me consolidate kar diya.
    // Agar sirf ek file chahiye ho, /api/project ko ek-file scope ke sath bhi
    // use kiya ja sakta hai (Planner khud decide karega single file kaafi hai).
    return res.status(410).json({
      error: "Ye endpoint deprecated hai. /api/project use karo — Planner khud decide karega single file kaafi hai ya nahi.",
    });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// Phase 3: poora multi-file project pipeline — Planner -> Coder -> Test -> Fixer -> Reporter
app.post("/api/project", async (req, res) => {
  const { task } = req.body || {};
  if (!task) {
    return res.status(400).json({ error: "`task` chahiye body me" });
  }
  if (!process.env.OPENROUTER_API_KEY) {
    return res.status(500).json({ error: "OPENROUTER_API_KEY set nahi hai" });
  }
  if (!process.env.E2B_API_KEY) {
    return res.status(500).json({ error: "E2B_API_KEY set nahi hai" });
  }

  try {
    const result = await runProjectPipeline(task);
    res.json(result);
  } catch (err) {
    console.error("runProjectPipeline failed:", err);
    res.status(502).json({ error: err.message || String(err) });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Agentic bot server chal raha hai port ${PORT} par`);
});
