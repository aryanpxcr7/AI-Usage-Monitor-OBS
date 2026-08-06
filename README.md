# Local AI usage overlay

Small, transparent OBS Browser Source overlay with two live percentage bars:

- Codex weekly usage from the local Codex account session.
- Claude Code session usage and reset time from `claude /usage`.

## Run locally

```bash
npm install
npm run start:local
```

Keep that terminal running. It starts the browser app and a localhost-only usage bridge. Open the `Local` URL printed by the dev server in a browser once, then use the same URL in an OBS Browser Source. The overlay is intentionally small; `1000 x 250` is a safe OBS source size.

The bridge listens only on `127.0.0.1:4318`. It reads local auth files server-side and never sends credentials to the browser. It refreshes provider data every 15 seconds.

If one provider is unavailable, its row shows `localhost bridge offline` instead of fake data.

Settings appear below the bars in the page. They change which live models are visible, background opacity/color, the core agent colors, bar height, and text size, and persist in this browser. Colors use hex text fields and preset swatches so they also work in OBS's embedded browser. Crop the OBS source above the settings section to show only the selected bars.

Each row identifies its limit type, such as `CODEX (Weekly)` or `CLAUDE (Session)`. The open-source detector catalog checks for Codex, Claude, OpenCode, Gemini CLI, Qwen Code, GitHub Copilot CLI, Amazon Q Developer, Aider, Cursor Agent, Goose, Ollama, LM Studio, Kiro CLI, Mistral Vibe, and Crush. Installed tools are marked `DETECTED` in settings and start hidden so the OBS crop stays compact; tick a tool to show its row.

Codex and Claude have realtime percentage adapters. OpenCode and the discovered tools currently report model presence/configuration and show `detected - no percentage limit` when their local CLI does not expose a stable background percentage endpoint. This avoids inventing quota numbers. Gemini CLI and Qwen Code expose interactive stats commands, so they are good candidates for future percentage adapters; the bridge intentionally does not launch interactive commands in the background.

Adding another provider is deliberately small: add its command and optional config paths to `scripts/usage-bridge.mjs`, then add its label/color to `AGENT_CONFIG` in `app/page.tsx`. There is no universal operating-system registry for AI agents, so an arbitrary future tool still needs a detector entry.

When a visible model reaches 100%, its row changes to a red dead state with `OUT OF USAGE!` and the overlay plays a short siren. Use the per-model `Test siren` buttons to preview the state and unlock audio in OBS, since embedded browsers require a user gesture before playing sound. The bridge displays each provider's configured model label and effort level when the local settings expose them; Claude's `opus` alias is displayed as `Claude Opus 5`.
