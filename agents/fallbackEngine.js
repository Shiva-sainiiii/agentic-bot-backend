// agents/fallbackEngine.js
//
// Ye core engine hai. Koi bhi "role" (planner/coder/tester/fixer/reporter)
// ke liye is engine ko call karo, ye khud us role ke model group ko traverse
// karega jab tak koi model successfully respond na kare.

const { MODEL_GROUPS } = require("../config/modelGroups");

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const PER_MODEL_TIMEOUT_MS = 25000; // Render pe tight Vercel-jaisi limit nahi hai, bade models ko time do
const OVERALL_TIMEOUT_MS = 90000; // per-role budget — multi-file loop mein ye kai baar call hoga

// In-memory cooldown tracker: agar ek model abhi-abhi rate-limited hua,
// thodi der ke liye usko skip karo (turant retry na maare).
const cooldowns = new Map(); // model -> timestamp jab tak cooldown hai

const COOLDOWN_MS = 2 * 60 * 1000; // 2 minute cooldown after rate-limit

function isOnCooldown(model) {
  const until = cooldowns.get(model);
  return until && Date.now() < until;
}

function setCooldown(model) {
  cooldowns.set(model, Date.now() + COOLDOWN_MS);
}

async function callModel(model, messages, overallSignal) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PER_MODEL_TIMEOUT_MS);

  if (overallSignal.aborted) {
    clearTimeout(timeoutId);
    throw new Error("overall-timeout");
  }

  try {
    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "HTTP-Referer": process.env.SITE_URL || "https://localhost",
        "X-Title": "Agentic Coding Bot",
      },
      body: JSON.stringify({ model, messages }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.status === 429) {
      setCooldown(model); // rate limit hit -> thodi der ke liye park kar do
      throw new Error("http-429: rate limited");
    }

    if (!response.ok) {
      const errBody = await response.text().catch(() => "");
      throw new Error(`http-${response.status}: ${errBody.slice(0, 200)}`);
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;

    if (!content || typeof content !== "string" || content.trim() === "") {
      throw new Error("empty-response");
    }

    return { content, raw: data };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") throw new Error("model-timeout");
    throw err;
  }
}

/**
 * runAgent - kisi role ke liye fallback chain traverse karta hai.
 * @param {string} role - "planner" | "coder" | "tester" | "fixer" | "reporter"
 * @param {Array} messages - OpenAI-style messages array
 * @returns {Promise<{content, model_used, attempts}>}
 */
async function runAgent(role, messages) {
  const chain = MODEL_GROUPS[role];
  if (!chain) {
    throw new Error(`Unknown role: ${role}. Valid roles: ${Object.keys(MODEL_GROUPS).join(", ")}`);
  }

  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY not set");
  }

  const overallController = new AbortController();
  const overallTimeout = setTimeout(() => overallController.abort(), OVERALL_TIMEOUT_MS);

  const attempts = [];

  try {
    for (const model of chain) {
      if (overallController.signal.aborted) {
        attempts.push({ model, status: "skipped-overall-timeout" });
        break;
      }

      if (isOnCooldown(model)) {
        attempts.push({ model, status: "skipped-cooldown" });
        continue;
      }

      try {
        const result = await callModel(model, messages, overallController.signal);
        attempts.push({ model, status: "success" });
        clearTimeout(overallTimeout);
        return { content: result.content, model_used: model, role, attempts };
      } catch (err) {
        attempts.push({ model, status: "failed", reason: err.message });
      }
    }

    clearTimeout(overallTimeout);
    throw new Error(
      `All models failed for role "${role}": ${JSON.stringify(attempts)}`
    );
  } catch (err) {
    clearTimeout(overallTimeout);
    throw err;
  }
}

module.exports = { runAgent, MODEL_GROUPS };
