# Usage overlay

A compact browser overlay for showing Codex weekly usage and Claude session usage in an OBS Browser Source.

## Run locally

```bash
npm install
npm run dev
```

Open the local URL in a browser, then add the same URL as an OBS Browser Source. The area around the panel is transparent, so it can sit on top of a stream scene.

## Set values

Open **Settings** in the overlay and save a local snapshot. Values are stored in this browser only.

You can also seed the overlay from the URL:

```text
/?codex=42&claude=68&claudeEnd=18:40
```

The page listens for a browser-safe `postMessage` bridge for future live integrations:

```js
window.postMessage({
  type: "ai-overlay:update",
  codex: 42,
  claude: 68,
  claudeEnd: "18:40",
});
```

The browser page cannot inspect desktop processes directly. A small local companion service can send the message above when live provider data is available.
