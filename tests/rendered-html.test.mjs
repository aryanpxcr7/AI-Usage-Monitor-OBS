import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the usage overlay", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Usage overlay — Codex \+ Claude<\/title>/i);
  assert.match(html, /A compact OBS Browser Source overlay/);
  assert.match(html, /Codex/);
  assert.match(html, /Claude/);
  assert.match(html, /WEEKLY LIMIT USED/);
  assert.match(html, /SESSION USAGE/);
  assert.match(html, /Session ends/);
  assert.match(html, /role="progressbar"/);
  assert.match(html, /DEMO DATA/);
  assert.doesNotMatch(html, /Your site is taking shape|react-loading-skeleton|codex-preview/);
});

test("keeps the overlay controls and browser bridge contract", async () => {
  const [page, layout, styles, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /ai-overlay:update/);
  assert.match(page, /usage-overlay-values/);
  assert.match(page, /new URLSearchParams\(window\.location\.search\)/);
  assert.match(page, /type="range"/);
  assert.match(page, /type="time"/);
  assert.match(layout, /Usage overlay — Codex \+ Claude/);
  assert.match(styles, /background:\s*transparent/);
  assert.match(styles, /\.agent-grid/);
  assert.match(styles, /\.settings-drawer/);
  assert.match(styles, /@media \(max-width: 700px\)/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);

  await assert.rejects(
    access(new URL("../app/_sites-preview/SkeletonPreview.tsx", import.meta.url)),
  );
});
