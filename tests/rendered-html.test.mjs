import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the compact local overlay", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  const html = await response.text();

  assert.match(html, /<title>Local AI usage overlay<\/title>/i);
  assert.match(html, /CODEX/);
  assert.match(html, /CLAUDE/);
  assert.match(html, /OPENCODE/);
  assert.match(html, /GEMINI/);
  assert.match(html, /QWEN/);
  assert.match(html, /COPILOT/);
  assert.match(html, /OLLAMA/);
  assert.match(html, /Weekly/);
  assert.match(html, /Session/);
  assert.match(html, /Realtime/);
  assert.match(html, /Overlay settings/);
  assert.match(html, /Background opacity/);
  assert.match(html, /Visible models/);
  assert.match(html, /type="checkbox"/);
  assert.match(html, /Test siren/);
  assert.match(html, /Detected tools are marked live or detected/);
  assert.match(html, /color-text/);
  assert.match(html, /color-preset/);
  assert.doesNotMatch(html, /type="color"/);
  assert.match(html, /id="text-scale"[^>]+max="180"/);
  assert.match(html, /role="progressbar"/);
  assert.doesNotMatch(html, /Your site is taking shape|react-loading-skeleton|codex-preview|Usage overlay<\/h1>/);
});

test("keeps provider credentials in the localhost bridge", async () => {
  const [page, styles, bridge, launcher] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../scripts/usage-bridge.mjs", import.meta.url), "utf8"),
    readFile(new URL("../scripts/start-local.mjs", import.meta.url), "utf8"),
  ]);

  assert.match(page, /127\.0\.0\.1:4318\/api\/usage/);
  assert.match(page, /AGENT_CONFIG/);
  assert.match(page, /period/);
  assert.match(page, /visibleAgents/);
  assert.match(page, /row-model/);
  assert.match(page, /effort/);
  assert.match(page, /OUT OF USAGE!/);
  assert.match(page, /AudioContext/);
  assert.match(styles, /background:\s*transparent/);
  assert.match(styles, /var\(--bar-height/);
  assert.match(styles, /var\(--panel-background/);
  assert.match(styles, /\.color-text/);
  assert.match(styles, /\.color-preset/);
  assert.match(styles, /text-rendering:\s*optimizeLegibility/);
  assert.match(bridge, /backend-api\/wham\/usage/);
  assert.match(bridge, /claude/);
  assert.match(bridge, /readConfiguredValue/);
  assert.match(bridge, /readCodexProfile/);
  assert.match(bridge, /readClaudeProfile/);
  assert.match(bridge, /opencode\.cmd/);
  assert.match(bridge, /stats/);
  assert.match(bridge, /DISCOVERY_AGENTS/);
  assert.match(bridge, /gemini/);
  assert.match(bridge, /qwen/);
  assert.match(bridge, /copilot/);
  assert.match(bridge, /kiro-cli/);
  assert.match(bridge, /detected - no percentage limit/);
  assert.match(bridge, /model_reasoning_effort/);
  assert.match(bridge, /effortLevel/);
  assert.match(bridge, /no-session-persistence/);
  assert.match(bridge, /HOST = "127\.0\.0\.1"/);
  assert.match(launcher, /usage-bridge\.mjs/);
});
