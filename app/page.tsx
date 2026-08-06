"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";

type UsageState = {
  codex: number;
  claude: number;
  claudeEnd: string;
};

type ProgressStyle = CSSProperties & {
  "--progress": string;
  "--ring-color": string;
};

const DEFAULT_USAGE: UsageState = {
  codex: 42,
  claude: 68,
  claudeEnd: "18:40",
};

function clampUsage(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function UsageRing({
  value,
  color,
  label,
}: {
  value: number;
  color: string;
  label: string;
}) {
  const style = {
    "--progress": `${value * 3.6}deg`,
    "--ring-color": color,
  } as ProgressStyle;

  return (
    <div
      className="usage-ring"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      style={style}
    >
      <div className="usage-ring__center">
        <strong>{value}</strong>
        <span>% used</span>
      </div>
    </div>
  );
}

function ProgressBar({ value, color, label }: { value: number; color: string; label: string }) {
  return (
    <div
      className="progress-track"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
    >
      <span className="progress-track__fill" style={{ width: `${value}%`, background: color }} />
      <span className="progress-track__glow" style={{ left: `${value}%`, background: color }} />
    </div>
  );
}

function getSessionCountdown(endTime: string, now: Date) {
  if (!/^\d{2}:\d{2}$/.test(endTime)) return "Set an end time";

  const [hours, minutes] = endTime.split(":").map(Number);
  const end = new Date(now);
  end.setHours(hours, minutes, 0, 0);

  if (end.getTime() <= now.getTime()) end.setDate(end.getDate() + 1);

  const remainingMinutes = Math.max(0, Math.floor((end.getTime() - now.getTime()) / 60000));
  const remainingHours = Math.floor(remainingMinutes / 60);
  const minutesAfterHours = remainingMinutes % 60;

  if (remainingHours === 0) return `in ${minutesAfterHours}m`;
  return `in ${remainingHours}h ${String(minutesAfterHours).padStart(2, "0")}m`;
}

function getSessionEndLabel(endTime: string) {
  if (!/^\d{2}:\d{2}$/.test(endTime)) return "—";
  const [hours, minutes] = endTime.split(":").map(Number);
  const suffix = hours >= 12 ? "PM" : "AM";
  const twelveHour = hours % 12 || 12;
  return `${twelveHour}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

function readUsageFromLocation(current: UsageState) {
  const params = new URLSearchParams(window.location.search);
  const next = { ...current };
  let hasQueryValue = false;

  const codex = Number(params.get("codex"));
  if (params.has("codex") && Number.isFinite(codex)) {
    next.codex = clampUsage(codex);
    hasQueryValue = true;
  }

  const claude = Number(params.get("claude"));
  if (params.has("claude") && Number.isFinite(claude)) {
    next.claude = clampUsage(claude);
    hasQueryValue = true;
  }

  const claudeEnd = params.get("claudeEnd") || params.get("sessionEnd");
  if (claudeEnd && /^\d{2}:\d{2}$/.test(claudeEnd)) {
    next.claudeEnd = claudeEnd;
    hasQueryValue = true;
  }

  return { next, hasQueryValue };
}

export default function Home() {
  const [usage, setUsage] = useState<UsageState>(DEFAULT_USAGE);
  const [draft, setDraft] = useState<UsageState>(DEFAULT_USAGE);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hasLocalFeed, setHasLocalFeed] = useState(false);
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem("usage-overlay-values");
    let nextUsage = DEFAULT_USAGE;
    let hasSavedValues = false;

    if (stored) {
      try {
        const parsed = JSON.parse(stored) as Partial<UsageState>;
        nextUsage = {
          codex: clampUsage(Number(parsed.codex ?? DEFAULT_USAGE.codex)),
          claude: clampUsage(Number(parsed.claude ?? DEFAULT_USAGE.claude)),
          claudeEnd: /^\d{2}:\d{2}$/.test(String(parsed.claudeEnd ?? ""))
            ? String(parsed.claudeEnd)
            : DEFAULT_USAGE.claudeEnd,
        };
        hasSavedValues = true;
      } catch {
        window.localStorage.removeItem("usage-overlay-values");
      }
    }

    const fromLocation = readUsageFromLocation(nextUsage);
    nextUsage = fromLocation.next;
    const initialSync = window.setTimeout(() => {
      setUsage(nextUsage);
      setDraft(nextUsage);
      setHasLocalFeed(hasSavedValues || fromLocation.hasQueryValue);
      setNow(new Date());
    }, 0);

    const receiveBridgeUpdate = (event: MessageEvent) => {
      if (!event.data || event.data.type !== "ai-overlay:update") return;
      const incoming = event.data as {
        codex?: number;
        claude?: number;
        claudeEnd?: string;
      };
      const bridgedUsage: UsageState = {
        codex: incoming.codex === undefined ? nextUsage.codex : clampUsage(Number(incoming.codex)),
        claude: incoming.claude === undefined ? nextUsage.claude : clampUsage(Number(incoming.claude)),
        claudeEnd:
          incoming.claudeEnd && /^\d{2}:\d{2}$/.test(incoming.claudeEnd)
            ? incoming.claudeEnd
            : nextUsage.claudeEnd,
      };
      nextUsage = bridgedUsage;
      setUsage(bridgedUsage);
      setDraft(bridgedUsage);
      setHasLocalFeed(true);
      setNow(new Date());
    };

    window.addEventListener("message", receiveBridgeUpdate);
    const ticker = window.setInterval(() => setNow(new Date()), 30000);

    return () => {
      window.removeEventListener("message", receiveBridgeUpdate);
      window.clearInterval(ticker);
      window.clearTimeout(initialSync);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "s") return;
      const target = event.target as HTMLElement | null;
      if (target?.tagName === "INPUT") return;
      setSettingsOpen((open) => !open);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const sessionCountdown = useMemo(
    () => getSessionCountdown(usage.claudeEnd, now ?? new Date(2026, 0, 1, 14, 20)),
    [usage.claudeEnd, now],
  );

  const updateDraft = (key: keyof UsageState, value: string) => {
    if (key === "claudeEnd") {
      setDraft((current) => ({ ...current, claudeEnd: value }));
      return;
    }
    setDraft((current) => ({ ...current, [key]: clampUsage(Number(value)) }));
  };

  const saveSettings = () => {
    const saved = {
      ...draft,
      codex: clampUsage(draft.codex),
      claude: clampUsage(draft.claude),
      claudeEnd: /^\d{2}:\d{2}$/.test(draft.claudeEnd) ? draft.claudeEnd : DEFAULT_USAGE.claudeEnd,
    };
    setUsage(saved);
    setDraft(saved);
    window.localStorage.setItem("usage-overlay-values", JSON.stringify(saved));
    setHasLocalFeed(true);
    setNow(new Date());
    setSettingsOpen(false);
  };

  const resetSettings = () => {
    window.localStorage.removeItem("usage-overlay-values");
    setUsage(DEFAULT_USAGE);
    setDraft(DEFAULT_USAGE);
    setHasLocalFeed(false);
    setNow(new Date());
  };

  return (
    <main className="overlay-stage">
      <div className="ambient-light ambient-light--one" />
      <div className="ambient-light ambient-light--two" />

      <section className="overlay-card" aria-label="AI usage overlay">
        <header className="overlay-header">
          <div className="brand-lockup">
            <div className="brand-mark" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <div>
              <p className="eyebrow">AI WORKSPACE / LIVE BUDGET</p>
              <h1>Usage overlay</h1>
            </div>
          </div>
          <div className="header-actions">
            <span className="feed-status">
              <span className="feed-status__dot" />
              {hasLocalFeed ? "LOCAL FEED" : "DEMO DATA"}
            </span>
            <button className="icon-button" type="button" onClick={() => setSettingsOpen(true)} aria-label="Open overlay settings">
              <span className="sliders-icon" aria-hidden="true"><i /><i /><i /></span>
            </button>
          </div>
        </header>

        <div className="summary-row">
          <div className="summary-item">
            <span className="summary-label">WEEKLY WINDOW</span>
            <strong>Resets Monday <span>·</span> 00:00 UTC</strong>
          </div>
          <div className="summary-item summary-item--right">
            <span className="summary-label">OVERLAY MODE</span>
            <strong><span className="tiny-green-dot" /> Browser source ready</strong>
          </div>
        </div>

        <div className="agent-grid">
          <article className="agent-card agent-card--codex">
            <div className="card-accent" />
            <div className="card-heading">
              <div className="agent-identity">
                <div className="agent-emblem agent-emblem--codex" aria-hidden="true">C</div>
                <div>
                  <h2>Codex</h2>
                  <p>Weekly allowance</p>
                </div>
              </div>
              <span className="status-chip"><span /> ACTIVE</span>
            </div>

            <div className="metric-row">
              <UsageRing value={usage.codex} color="#f2a65a" label={`Codex weekly usage: ${usage.codex}%`} />
              <div className="metric-copy">
                <span className="metric-kicker">WEEKLY LIMIT USED</span>
                <div className="metric-value">{usage.codex}<small>%</small></div>
                <p><strong>{100 - usage.codex}%</strong> remaining</p>
              </div>
            </div>

            <ProgressBar value={usage.codex} color="linear-gradient(90deg, #db7e3f, #ffc477)" label={`Codex weekly limit: ${usage.codex}% used`} />
            <div className="card-foot"><span>Rolling week</span><span>Resets Mon 00:00 UTC</span></div>
          </article>

          <article className="agent-card agent-card--claude">
            <div className="card-accent" />
            <div className="card-heading">
              <div className="agent-identity">
                <div className="agent-emblem agent-emblem--claude" aria-hidden="true">✳</div>
                <div>
                  <h2>Claude</h2>
                  <p>Current session</p>
                </div>
              </div>
              <span className="status-chip status-chip--violet"><span /> ACTIVE</span>
            </div>

            <div className="metric-row">
              <UsageRing value={usage.claude} color="#b79bff" label={`Claude session usage: ${usage.claude}%`} />
              <div className="metric-copy">
                <span className="metric-kicker">SESSION USAGE</span>
                <div className="metric-value">{usage.claude}<small>%</small></div>
                <p><strong>{100 - usage.claude}%</strong> session headroom</p>
              </div>
            </div>

            <ProgressBar value={usage.claude} color="linear-gradient(90deg, #8062dd, #cbb9ff)" label={`Claude session: ${usage.claude}% used`} />
            <div className="card-foot card-foot--session">
              <span className="session-label"><span className="clock-icon" aria-hidden="true" /> Session ends</span>
              <span><strong>{getSessionEndLabel(usage.claudeEnd)}</strong> <em>{sessionCountdown}</em></span>
            </div>
          </article>
        </div>

        <footer className="overlay-footer">
          <div className="footer-note"><span className="footer-spark" aria-hidden="true">✦</span> Read-only display <span className="footer-separator" /> Values persist in this browser</div>
          <button className="settings-link" type="button" onClick={() => setSettingsOpen(true)}>SETTINGS <span>↗</span></button>
        </footer>
      </section>

      <button
        className={`drawer-backdrop ${settingsOpen ? "drawer-backdrop--open" : ""}`}
        type="button"
        aria-label="Close settings"
        onClick={() => setSettingsOpen(false)}
      />
      <aside className={`settings-drawer ${settingsOpen ? "settings-drawer--open" : ""}`} aria-hidden={!settingsOpen}>
        <div className="drawer-heading">
          <div>
            <p className="eyebrow">OVERLAY CONFIG</p>
            <h2>Set your live snapshot</h2>
          </div>
          <button className="close-button" type="button" onClick={() => setSettingsOpen(false)} aria-label="Close settings">×</button>
        </div>

        <div className="drawer-body">
          <p className="drawer-intro">Tune the values shown on stream. The overlay is ready for a local bridge later, but stays useful with a quick manual snapshot today.</p>

          <label className="field-label" htmlFor="codex-usage">Codex weekly usage <span>{draft.codex}%</span></label>
          <div className="field-row">
            <input id="codex-usage" className="range-input range-input--orange" type="range" min="0" max="100" value={draft.codex} onChange={(event) => updateDraft("codex", event.target.value)} />
            <input className="number-input" type="number" min="0" max="100" value={draft.codex} onChange={(event) => updateDraft("codex", event.target.value)} aria-label="Codex usage percentage" />
          </div>

          <label className="field-label" htmlFor="claude-usage">Claude session usage <span>{draft.claude}%</span></label>
          <div className="field-row">
            <input id="claude-usage" className="range-input range-input--violet" type="range" min="0" max="100" value={draft.claude} onChange={(event) => updateDraft("claude", event.target.value)} />
            <input className="number-input" type="number" min="0" max="100" value={draft.claude} onChange={(event) => updateDraft("claude", event.target.value)} aria-label="Claude usage percentage" />
          </div>

          <label className="field-label" htmlFor="session-end">Claude session ends <span>local time</span></label>
          <input id="session-end" className="time-input" type="time" value={draft.claudeEnd} onChange={(event) => updateDraft("claudeEnd", event.target.value)} />

          <div className="bridge-note">
            <span className="bridge-note__icon" aria-hidden="true">⌁</span>
            <div><strong>Browser-safe bridge</strong><p>Send live updates with <code>postMessage</code> using the event type <code>ai-overlay:update</code>.</p></div>
          </div>
        </div>

        <div className="drawer-footer">
          <button className="reset-button" type="button" onClick={resetSettings}>Reset demo</button>
          <button className="save-button" type="button" onClick={saveSettings}>Save snapshot <span>↗</span></button>
        </div>
      </aside>
    </main>
  );
}
