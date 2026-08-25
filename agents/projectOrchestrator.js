// agents/projectOrchestrator.js
//
// Poori pipeline: Planner -> (Coder -> Test -> Fixer)* per file -> Reporter
// Ek hi sandbox mein saari files banti hain taaki wo ek-doosre ko reference
// kar sakein (jaise index.html -> app.js).

const { runAgent } = require("./fallbackEngine");
const { createSandbox, writeFile, runCommand, closeSandbox, readFile } = require("./sandbox");

const MAX_FIX_ATTEMPTS = 3;

const EXT_TO_LANGUAGE = {
  js: "JavaScript (Node.js)",
  mjs: "JavaScript (Node.js, ES modules)",
  ts: "TypeScript",
  py: "Python",
  html: "HTML",
  css: "CSS",
  rb: "Ruby",
  go: "Go",
  java: "Java",
  rs: "Rust",
  sh: "Bash shell script",
  php: "PHP",
  json: "JSON",
};

function detectLanguage(fileName) {
  const ext = fileName.split(".").pop().toLowerCase();
  return EXT_TO_LANGUAGE[ext] || null;
}

/**
 * Markdown code block se raw code nikalta hai.
 */
function extractCode(text) {
  const match = text.match(/```(?:\w+)?\n([\s\S]*?)```/);
  return match ? match[1].trim() : text.trim();
}

/**
 * Planner ke response se JSON file-list nikalta hai.
 * Planner ko strict JSON bolte hain, lekin LLMs kabhi-kabhi markdown-wrap
 * kar dete hain ya extra text jod dete hain — dono handle karte hain.
 */
function extractFileList(text) {
  // Pehle markdown code block try karo
  const codeBlockMatch = text.match(/```(?:json)?\n([\s\S]*?)```/);
  const jsonText = codeBlockMatch ? codeBlockMatch[1].trim() : text.trim();

  // Agar extra text ke beech JSON array hai, uska sabse bada [...] nikalo
  const arrayMatch = jsonText.match(/\[[\s\S]*\]/);
  const finalText = arrayMatch ? arrayMatch[0] : jsonText;

  const parsed = JSON.parse(finalText); // yaha throw hoga agar invalid — caller handle karega
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("Planner ne khaali ya invalid file-list diya");
  }
  return parsed;
}

/**
 * runProjectPipeline - poora Plan -> Code -> Test -> Fix -> Report chalata hai
 * multiple files ke liye, ek hi sandbox mein.
 *
 * @param {string} task - jo bhi banana hai, jaise "Simple todo app banao HTML/CSS/JS mein"
 * @returns {Promise<{success, files, log, report, plan}>}
 */
async function runProjectPipeline(task) {
  const log = [];
  let sandbox;

  try {
    // ---------- STEP 1: PLANNER ----------
    const plannerPrompt = `Task: "${task}"

Is task ko poora karne ke liye files ki list banao. SIRF ek JSON array return karo, koi extra text nahi, is exact format mein:

[
  {"path": "index.html", "description": "kya hona chahiye is file mein, briefly", "runnable": false},
  {"path": "app.js", "description": "...", "runnable": true, "runCmd": "node app.js"}
]

Rules:
- "path" = file ka naam/relative path sandbox ke andar
- "description" = 1-2 line mein kya likhna hai (Coder isko padhega)
- "runnable" = true sirf agar ye file directly execute/test ho sakti hai (jaise .js script jo node se chale). HTML/CSS files ke liye false.
- "runCmd" = sirf runnable:true ho to do, jaise "node app.js"
- Files ko dependency order mein rakho (jisko doosri file import karti hai, wo pehle)
- Zyada se zyada 6 files rakho, chhota aur practical scope rakho`;

    const plannerResult = await runAgent("planner", [{ role: "user", content: plannerPrompt }]);
    log.push({ step: "planner", model: plannerResult.model_used, raw: plannerResult.content });

    let fileList;
    try {
      fileList = extractFileList(plannerResult.content);
    } catch (parseErr) {
      throw new Error(`Planner ka JSON parse nahi hua: ${parseErr.message}`);
    }
    log.push({ step: "plan-parsed", fileList });

    // ---------- Sandbox banao (saari files isi mein banengi) ----------
    sandbox = await createSandbox();
    log.push({ step: "sandbox-created" });

    const finishedFiles = []; // { path, code, success }

    // ---------- STEP 2: HAR FILE KE LIYE CODER -> TEST -> FIXER ----------
    for (const fileSpec of fileList) {
      const { path: filePath, description, runnable, runCmd } = fileSpec;
      const language = detectLanguage(filePath);
      const languageHint = language ? ` Language: ${language}.` : "";

      // Ab tak ki files ka context — taaki naya file unhe reference kar sake
      const contextLines = finishedFiles
        .map((f) => `--- ${f.path} ---\n${f.code}`)
        .join("\n\n");
      const contextBlock = contextLines
        ? `\n\nAb tak banayi gayi files (reference/import ke liye):\n${contextLines}`
        : "";

      const coderPrompt = `Project task: "${task}"\n\nAb likho: "${filePath}" — ${description}.${languageHint}${contextBlock}\n\nSirf is file ka code do, ek hi markdown code block me, koi extra explanation nahi.`;

      const coderResult = await runAgent("coder", [{ role: "user", content: coderPrompt }]);
      let code = extractCode(coderResult.content);
      log.push({ step: "coder", file: filePath, model: coderResult.model_used, code });

      await writeFile(sandbox, filePath, code);
      log.push({ step: "file-written", file: filePath });

      let fileSuccess = true; // non-runnable files ke liye default success

      if (runnable && runCmd) {
        let attempt = 0;
        let testResult = await runCommand(sandbox, runCmd);
        log.push({ step: "test-run", file: filePath, attempt, ...testResult });

        while (!testResult.success && attempt < MAX_FIX_ATTEMPTS) {
          attempt++;
          const fixerResult = await runAgent("fixer", [
            {
              role: "user",
              content: `Ye code fail ho raha hai (file: ${filePath}):\n\n\`\`\`\n${code}\n\`\`\`\n\nError:\n${testResult.stderr || testResult.stdout}\n\n${languageHint} Bug fix karke sirf corrected code do, ek hi markdown code block me.`,
            },
          ]);
          code = extractCode(fixerResult.content);
          log.push({ step: "fixer", file: filePath, model: fixerResult.model_used, attempt, code });

          await writeFile(sandbox, filePath, code);
          testResult = await runCommand(sandbox, runCmd);
          log.push({ step: "test-run", file: filePath, attempt, ...testResult });
        }
        fileSuccess = testResult.success;
      }

      finishedFiles.push({ path: filePath, code, success: fileSuccess });
    }

    const overallSuccess = finishedFiles.every((f) => f.success);

    // ---------- STEP 3: REPORTER ----------
    const fileSummaryForReport = finishedFiles
      .map((f) => `${f.path}: ${f.success ? "OK" : "FAILED"}`)
      .join(", ");

    const reporterResult = await runAgent("reporter", [
      {
        role: "user",
        content: `Project task tha: "${task}". Files banayi gayi: ${fileSummaryForReport}. Overall result: ${
          overallSuccess ? "SUCCESS" : "KUCH FILES FAILED"
        }. Ek chhota 4-5 line summary do Hinglish me user ke liye — kya bana, kya kaam kar raha hai, agar kuch fail hua to kya.`,
      },
    ]);

    return {
      success: overallSuccess,
      plan: fileList,
      files: finishedFiles,
      log,
      report: reporterResult.content,
    };
  } finally {
    if (sandbox) {
      await closeSandbox(sandbox);
    }
  }
}

module.exports = { runProjectPipeline };
