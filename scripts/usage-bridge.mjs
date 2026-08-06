import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:http";

const HOST = "127.0.0.1";
const PORT = 4318;
const POLL_INTERVAL_MS = 15_000;
const COMMAND_TIMEOUT_MS = 20_000;

let latest = {
  codex: unavailable("starting"),
  claude: unavailable("starting"),
  opencode: unavailable("starting"),
  updatedAt: null,
};
let pollInFlight = null;

function unavailable(error, { model = null, effort = null, detected = false } = {}) {
  return { available: false, usedPercent: null, resetAt: null, resetLabel: null, model, effort, detected, error };
}

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

async function readCodexAuth() {
  const authPath = join(homedir(), ".codex", "auth.json");
  const auth = JSON.parse(await readFile(authPath, "utf8"));
  return auth.tokens ?? {};
}

async function readConfiguredValue(path, pattern) {
  try {
    const contents = await readFile(path, "utf8");
    const match = contents.match(pattern);
    return match?.[1]?.trim() || null;
  } catch {
    return null;
  }
}

async function readCodexProfile() {
  const path = join(homedir(), ".codex", "config.toml");
  const [model, effort] = await Promise.all([
    readConfiguredValue(path, /^\s*model\s*=\s*["']([^"']+)["']/m),
    readConfiguredValue(path, /^\s*model_reasoning_effort\s*=\s*["']([^"']+)["']/m),
  ]);
  return { model, effort, detected: model !== null || effort !== null };
}

function normalizeClaudeModel(model) {
  if (!model) return null;
  const normalized = model.trim().toLowerCase().replace(/_/g, "-");
  if (normalized === "opus" || normalized === "claude-opus" || normalized === "claude-opus-5") return "Claude Opus 5";
  if (normalized === "sonnet" || normalized === "claude-sonnet") return "Claude Sonnet";
  if (normalized === "haiku" || normalized === "claude-haiku") return "Claude Haiku";
  return model.trim();
}

async function readClaudeProfile() {
  try {
    const settings = JSON.parse(await readFile(join(homedir(), ".claude", "settings.json"), "utf8"));
    const model = typeof settings?.model === "string" && settings.model.trim() ? normalizeClaudeModel(settings.model) : null;
    const effort = typeof settings?.effortLevel === "string" && settings.effortLevel.trim() ? settings.effortLevel.trim() : null;
    return { model, effort, detected: true };
  } catch {
    return { model: null, effort: null, detected: false };
  }
}

async function fetchCodexUsage() {
  const profile = await readCodexProfile();

  try {
    const tokens = await readCodexAuth();
    if (!tokens.access_token) return unavailable("Codex is not signed in", profile);

    const headers = {
      Authorization: `Bearer ${tokens.access_token}`,
      "User-Agent": "usage-overlay-local/0.1",
    };
    if (tokens.account_id) headers["ChatGPT-Account-Id"] = tokens.account_id;

    const response = await fetch("https://chatgpt.com/backend-api/wham/usage", { headers });
    if (!response.ok) return unavailable(`Codex usage unavailable (${response.status})`, profile);

    const data = await response.json();
    const window = data?.rate_limit?.primary_window;
    const usedPercent = finiteNumber(window?.used_percent);
    const resetAtSeconds = finiteNumber(window?.reset_at);

    if (usedPercent === null) return unavailable("Codex usage not reported yet", profile);

    return {
      available: true,
      usedPercent,
      resetAt: resetAtSeconds === null ? null : resetAtSeconds * 1000,
      resetLabel: null,
      ...profile,
    };
  } catch (error) {
    return unavailable(error?.code === "ENOENT" ? "Codex auth file not found" : "Codex usage unavailable", profile);
  }
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "ignore"],
      shell: options.shell ?? false,
    });
    let stdout = "";
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(value);
    };
    const timeout = setTimeout(() => {
      child.kill();
      finish(null);
    }, COMMAND_TIMEOUT_MS);

    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.on("error", () => finish(null));
    child.on("close", (code) => finish(code === 0 ? stdout : null));
  });
}

function runClaudeUsageCommand() {
  return runCommand(
    "claude",
    ["-p", "/usage", "--output-format", "json", "--no-session-persistence", "--max-turns", "1"],
  );
}

function runOpenCodeStatsCommand() {
  const command = process.platform === "win32" ? "opencode.cmd" : "opencode";
  return runCommand(command, ["stats", "--models", "1"], { shell: process.platform === "win32" });
}

function parseClaudeJson(output) {
  if (!output) return null;
  const lines = output.trim().split(/\r?\n/).reverse();
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      if (parsed && typeof parsed === "object") return parsed;
    } catch {
      // Claude may print a non-JSON diagnostic line before its JSON result.
    }
  }
  return null;
}

function compactResetLabel(label) {
  return label.replace(/\s+\([^)]*\)\s*$/, "").trim();
}

function extractModelLabel(text) {
  const match = text.match(/(?:current\s+)?model\s*:\s*([^\r\n]+)/i);
  return normalizeClaudeModel(match?.[1]);
}

function extractEffortLabel(text) {
  const match = text.match(/(?:reasoning\s+)?effort(?:\s+level)?\s*:\s*([^\r\n]+)/i);
  return match?.[1]?.trim() || null;
}

function stripAnsi(text) {
  return text.replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, "");
}

function extractOpenCodeModel(output) {
  const modelSection = stripAnsi(output ?? "").split(/MODEL USAGE/i)[1] ?? "";
  const match = modelSection.match(/([A-Za-z0-9._-]+\/[A-Za-z0-9._-]+)/);
  return match?.[1]?.trim() || null;
}

async function fetchClaudeUsage() {
  const profile = await readClaudeProfile();
  const output = await runClaudeUsageCommand();
  const payload = parseClaudeJson(output);
  const result = typeof payload?.result === "string" ? payload.result : "";
  const match = result.match(/Current session:\s*([\d.]+)%\s*used.*?resets\s+([^\r\n]+)/i);
  const model = extractModelLabel(result) ?? profile.model;
  const effort = extractEffortLabel(result) ?? profile.effort;
  const metadata = { model, effort, detected: profile.detected || Boolean(output) };

  if (!match) return unavailable("Claude session usage unavailable", metadata);

  return {
    available: true,
    usedPercent: Number(match[1]),
    resetAt: null,
    resetLabel: compactResetLabel(match[2]),
    ...metadata,
  };
}

async function fetchOpenCodeUsage() {
  const output = await runOpenCodeStatsCommand();
  if (!output) return unavailable("OpenCode not detected");

  return unavailable("detected · no percentage limit", {
    model: extractOpenCodeModel(output),
    detected: true,
  });
}

async function poll() {
  if (pollInFlight) return pollInFlight;
  pollInFlight = Promise.all([fetchCodexUsage(), fetchClaudeUsage(), fetchOpenCodeUsage()])
    .then(([codex, claude, opencode]) => {
      latest = { codex, claude, opencode, updatedAt: new Date().toISOString() };
    })
    .finally(() => {
      pollInFlight = null;
    });
  return pollInFlight;
}

function sendJson(response, status, body) {
  response.writeHead(status, {
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body));
}

const server = createServer(async (request, response) => {
  if (request.method === "OPTIONS") {
    response.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS" });
    response.end();
    return;
  }

  if (request.method !== "GET") {
    sendJson(response, 405, { error: "GET only" });
    return;
  }

  if (request.url === "/health") {
    sendJson(response, 200, { ok: true, updatedAt: latest.updatedAt });
    return;
  }

  if (request.url === "/api/usage") {
    await poll();
    sendJson(response, 200, latest);
    return;
  }

  sendJson(response, 404, { error: "Not found" });
});

server.listen(PORT, HOST, () => {
  console.log(`Usage bridge listening at http://${HOST}:${PORT}`);
  poll();
  setInterval(poll, POLL_INTERVAL_MS);
});

function shutdown() {
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
