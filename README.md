# Local AI usage overlay

Small, transparent OBS Browser Source overlay with two live bars:

- Codex weekly usage from the local Codex account session.
- Claude Code session usage and reset time from `claude /usage`.

## Run locally

```bash
npm install
npm run start:local
```

Keep that terminal running. It starts the browser app and a localhost-only usage bridge. Open the `Local` URL printed by the dev server in a browser once, then use the same URL in an OBS Browser Source. The overlay is intentionally small; `1000 × 250` is a safe OBS source size.

The bridge listens only on `127.0.0.1:4318`. It reads local auth files server-side and never sends credentials to the browser. It refreshes provider data every 15 seconds.

If one provider is unavailable, its row shows `localhost bridge offline` instead of fake data.

Settings appear below the bars in the page. They change background opacity/color, both agent colors, bar height, and text size, and persist in this browser. Crop the OBS source above the settings section to show only the bars.
