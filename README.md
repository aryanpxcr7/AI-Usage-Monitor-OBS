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

Settings appear below the bars in the page. They change which live models are visible, background opacity/color, both agent colors, bar height, and text size, and persist in this browser. Colors use hex text fields and preset swatches so they also work in OBS's embedded browser. Crop the OBS source above the settings section to show only the selected bars.

Each row identifies its limit type, such as `CODEX (Weekly)` or `CLAUDE (Session)`. The model picker auto-detects the supported local agents—Codex, Claude, and OpenCode—when they are installed. Codex and Claude have realtime percentage adapters. OpenCode exposes token and cost statistics rather than a percentage limit, so it is listed as detected but hidden by default instead of showing a misleading percentage bar. Arbitrary future agents cannot be treated as percentage providers automatically; each needs a detector and a realtime usage adapter before it can become a trustworthy bar.

When a visible model reaches 100%, its row changes to a red dead state with `OUT OF USAGE!` and the overlay plays a short siren. Use the per-model `Test siren` buttons to preview the state and unlock audio in OBS, since embedded browsers require a user gesture before playing sound. The bridge displays each provider's configured model label and effort level when the local settings expose them; Claude's `opus` alias is displayed as `Claude Opus 5`.
