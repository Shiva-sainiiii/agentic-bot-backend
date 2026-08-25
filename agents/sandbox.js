// agents/sandbox.js
//
// E2B sandbox ka thin wrapper. Isse Coder/Tester/Fixer roles
// actual isolated environment me file likh/read kar sakte hain
// aur commands run kar sakte hain.
//
// Docs: https://e2b.dev/docs

const { Sandbox } = require("e2b");

const SANDBOX_TIMEOUT_MS = 5 * 60 * 1000; // 5 min — chhoti tasks ke liye kaafi,
// zaroorat par sandbox.setTimeout() se badha sakte ho (Hobby tier max 1 hour)

/**
 * Ek naya sandbox banata hai. Kaam khatam hone ke baad
 * closeSandbox() call karna zaroori hai, warna wo apne aap
 * timeout hone tak billing/quota use karta rahega.
 */
async function createSandbox() {
  if (!process.env.E2B_API_KEY) {
    throw new Error("E2B_API_KEY set nahi hai");
  }
  const sandbox = await Sandbox.create({
    timeoutMs: SANDBOX_TIMEOUT_MS,
  });
  return sandbox;
}

/**
 * Sandbox ke andar ek file likhta/overwrite karta hai.
 * @param {Sandbox} sandbox
 * @param {string} filePath - e.g. "app.py" ya "src/index.js"
 * @param {string} content
 */
async function writeFile(sandbox, filePath, content) {
  await sandbox.files.write(filePath, content);
}

/**
 * Sandbox se ek file padhta hai.
 */
async function readFile(sandbox, filePath) {
  return await sandbox.files.read(filePath);
}

/**
 * Sandbox ke andar shell command chalata hai.
 * E2B SDK non-zero exit code pe by default exception throw karta hai —
 * usse yaha hi catch karke normal {success:false} result banate hain,
 * taaki orchestrator ka fixer-retry loop chal sake (crash na ho).
 * @returns {Promise<{stdout, stderr, exitCode, success}>}
 */
async function runCommand(sandbox, command, opts = {}) {
  try {
    const result = await sandbox.commands.run(command, {
      timeoutMs: opts.timeoutMs || 60000, // per-command default 60s
    });
    return {
      stdout: result.stdout || "",
      stderr: result.stderr || "",
      exitCode: result.exitCode,
      success: result.exitCode === 0,
    };
  } catch (err) {
    // E2B ka CommandExitError (ya timeout) yaha aata hai — isse crash mat hone do,
    // isse ek failed test-result treat karo taaki fixer isse dekh sake.
    return {
      stdout: err.result?.stdout || "",
      stderr: err.result?.stderr || err.message || String(err),
      exitCode: err.result?.exitCode ?? -1,
      success: false,
    };
  }
}

/**
 * Sandbox band karo — zaroor call karo har baar, warna quota waste hoga.
 */
async function closeSandbox(sandbox) {
  try {
    await sandbox.kill();
  } catch (err) {
    // agar already band ho chuka hai to ignore karo
    console.error("Sandbox close karte waqt error (ignoring):", err.message);
  }
}

module.exports = {
  createSandbox,
  writeFile,
  readFile,
  runCommand,
  closeSandbox,
};
