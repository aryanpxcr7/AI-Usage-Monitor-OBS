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
  updatedAt: null,
};
let pollInFlight = null;

function unavailable(error, model = null) {
  return { available: false, usedPercent: null, resetAt: null, resetLabel: null, model, error };
}

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

async function readCodexAuth() {
  const authPath = join(homedir(), ".codex", "auth.json");
  const auth = JSON.parse(await readFile(authPath, "utf8"));
  return auth.tokens ?? {};
}

async function readConfiguredModel(path, pattern) {
  try {
    const contents = await readFile(path, "utf8");
    const match = contents.match(pattern);
    return match?.[1]?.trim() || null;
  } catch {
    return null;
  }
}

async function readCodexModel() {
  return readConfiguredModel(
    join(homedir(), ".codex", "config.toml"),
    /^\s*model\s*=\s*["']([^"']+)["']/m,
  );
}

async function readClaudeModel() {
  try {
    const settings = JSON.parse(await readFile(join(homedir(), ".claude", "settings.json"), "utf8"));
    return typeof settings?.model === "string" && settings.model.trim() ? settings.model.trim() : null;
  } catch {
    return null;
  }
}

async function fetchCodexUsage() {
  const model = await readCodexModel();

  try {
    const tokens = await readCodexAuth();
    if (!tokens.access_token) return unavailable("Codex is not signed in", model);

    const headers = {
      Authorization: `Bearer ${tokens.access_token}`,
      "User-Agent": "usage-overlay-local/0.1",
    };
    if (tokens.account_id) headers["ChatGPT-Account-Id"] = tokens.account_id;

    const response = await fetch("https://chatgpt.com/backend-api/wham/usage", { headers });
    if (!response.ok) return unavailable(`Codex usage unavailable (${response.status})`, model);

    const data = await response.json();
    const window = data?.rate_limit?.primary_window;
    const usedPercent = finiteNumber(window?.used_percent);
    const resetAtSeconds = finiteNumber(window?.reset_at);

    if (usedPercent === null) return unavailable("Codex usage not reported yet", model);

    return {
      available: true,
      usedPercent,
      resetAt: resetAtSeconds === null ? null : resetAtSeconds * 1000,
      resetLabel: null,
      model,
    };
  } catch (error) {
    return unavailable(error?.code === "ENOENT" ? "Codex auth file not found" : "Codex usage unavailable", model);
  }
}

function runClaudeUsageCommand() {
  return new Promise((resolve) => {
    const child = spawn(
      "claude",
      ["-p", "/usage", "--output-format", "json", "--no-session-persistence", "--max-turns", "1"],
      { windowsHide: true, stdio: ["ignore", "pipe", "ignore"] },
    );
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
  return match?.[1]?.trim() || null;
}

async function fetchClaudeUsage() {
  const configuredModel = await readClaudeModel();
  const output = await runClaudeUsageCommand();
  const payload = parseClaudeJson(output);
  const result = typeof payload?.result === "string" ? payload.result : "";
  const match = result.match(/Current session:\s*([\d.]+)%\s*used.*?resets\s+([^\r\n]+)/i);

  if (!match) return unavailable("Claude session usage unavailable", extractModelLabel(result) ?? configuredModel);

  return {
    available: true,
    usedPercent: Number(match[1]),
    resetAt: null,
    resetLabel: compactResetLabel(match[2]),
    model: extractModelLabel(result) ?? configuredModel,
  };
}

async function poll() {
  if (pollInFlight) return pollInFlight;
  pollInFlight = Promise.all([fetchCodexUsage(), fetchClaudeUsage()])
    .then(([codex, claude]) => {
      latest = { codex, claude, updatedAt: new Date().toISOString() };
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
