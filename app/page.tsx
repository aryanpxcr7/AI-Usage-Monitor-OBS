"use client";

import { useEffect, useState, type CSSProperties } from "react";

type AgentUsage = {
  available: boolean;
  usedPercent: number | null;
  resetAt: number | null;
  resetLabel: string | null;
  error?: string;
};

type UsageResponse = {
  codex: AgentUsage;
  claude: AgentUsage;
  updatedAt: string | null;
};

type AppearanceState = {
  backgroundColor: string;
  backgroundOpacity: number;
  codexColor: string;
  claudeColor: string;
  barHeight: number;
  textScale: number;
};

const BRIDGE_URL = "http://127.0.0.1:4318/api/usage";

const EMPTY_USAGE: UsageResponse = {
  codex: { available: false, usedPercent: null, resetAt: null, resetLabel: null },
  claude: { available: false, usedPercent: null, resetAt: null, resetLabel: null },
  updatedAt: null,
};

const DEFAULT_APPEARANCE: AppearanceState = {
  backgroundColor: "#08090d",
  backgroundOpacity: 82,
  codexColor: "#f2a65a",
  claudeColor: "#b69bff",
  barHeight: 5,
  textScale: 100,
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

function hexToRgba(hex: string, opacity: number) {
  const red = Number.parseInt(hex.slice(1, 3), 16);
  const green = Number.parseInt(hex.slice(3, 5), 16);
  const blue = Number.parseInt(hex.slice(5, 7), 16);
  return `rgba(${red}, ${green}, ${blue}, ${opacity / 100})`;
}

function formatCountdown(resetAt: number | null, now: number) {
  if (!resetAt) return "reset time unavailable";

  const remaining = Math.max(0, resetAt - now);
  if (remaining === 0) return "resetting";

  const totalMinutes = Math.ceil(remaining / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `resets in ${days}d ${hours}h`;
  if (hours > 0) return `resets in ${hours}h ${minutes}m`;
  return `resets in ${minutes}m`;
}

function UsageRow({
  name,
  accent,
  usage,
  resetText,
}: {
  name: string;
  accent: "codex" | "claude";
  usage: AgentUsage;
  resetText: string;
}) {
  const value = usage.usedPercent === null ? 0 : Math.min(100, Math.max(0, usage.usedPercent));
  const percent = usage.usedPercent === null ? "--" : `${Math.round(usage.usedPercent)}%`;

  return (
    <section className="usage-row" aria-label={`${name} usage`}>
      <div className="row-label">
        <span className={`agent-name agent-name--${accent}`}><span className="agent-dot" />{name}</span>
        <span className="row-percent">{percent}</span>
      </div>
      <div className="usage-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={usage.usedPercent ?? 0} aria-label={`${name} usage percentage`}>
        <span className={`usage-bar__fill usage-bar__fill--${accent} ${usage.available ? "" : "usage-bar__fill--offline"}`} style={{ width: `${value}%` }} />
      </div>
      <p className="row-meta">{usage.available ? resetText : usage.error ?? "localhost bridge offline"}</p>
    </section>
  );
}

export default function Home() {
  const [usage, setUsage] = useState<UsageResponse>(EMPTY_USAGE);
  const [now, setNow] = useState(() => Date.now());
  const [appearance, setAppearance] = useState<AppearanceState>(DEFAULT_APPEARANCE);

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      const stored = window.localStorage.getItem("usage-overlay-appearance");
      if (!stored) return;

      try {
        const parsed = JSON.parse(stored) as Partial<AppearanceState>;
        setAppearance({
          backgroundColor: isHexColor(parsed.backgroundColor) ? parsed.backgroundColor : DEFAULT_APPEARANCE.backgroundColor,
          backgroundOpacity: clamp(Number(parsed.backgroundOpacity ?? DEFAULT_APPEARANCE.backgroundOpacity), 0, 100),
          codexColor: isHexColor(parsed.codexColor) ? parsed.codexColor : DEFAULT_APPEARANCE.codexColor,
          claudeColor: isHexColor(parsed.claudeColor) ? parsed.claudeColor : DEFAULT_APPEARANCE.claudeColor,
          barHeight: clamp(Number(parsed.barHeight ?? DEFAULT_APPEARANCE.barHeight), 2, 12),
          textScale: clamp(Number(parsed.textScale ?? DEFAULT_APPEARANCE.textScale), 80, 140),
        });
      } catch {
        window.localStorage.removeItem("usage-overlay-appearance");
      }
    }, 0);

    return () => window.clearTimeout(loadTimer);
  }, []);

  useEffect(() => {
    let disposed = false;

    const refresh = async () => {
      try {
        const response = await fetch(BRIDGE_URL, { cache: "no-store" });
        if (!response.ok) throw new Error("bridge offline");
        const next = (await response.json()) as UsageResponse;
        if (!disposed) {
          setUsage(next);
          setNow(Date.now());
        }
      } catch {
        if (!disposed) {
          setUsage((current) => ({
            ...current,
            codex: { ...current.codex, available: false, error: "localhost bridge offline" },
            claude: { ...current.claude, available: false, error: "localhost bridge offline" },
          }));
          setNow(Date.now());
        }
      }
    };

    refresh();
    const refreshTimer = window.setInterval(refresh, 15000);
    const clockTimer = window.setInterval(() => setNow(Date.now()), 30000);

    return () => {
      disposed = true;
      window.clearInterval(refreshTimer);
      window.clearInterval(clockTimer);
    };
  }, []);

  const updateAppearance = <Key extends keyof AppearanceState>(key: Key, value: AppearanceState[Key]) => {
    const next = { ...appearance, [key]: value };
    setAppearance(next);
    window.localStorage.setItem("usage-overlay-appearance", JSON.stringify(next));
  };

  const resetAppearance = () => {
    setAppearance(DEFAULT_APPEARANCE);
    window.localStorage.removeItem("usage-overlay-appearance");
  };

  const overlayStyle = {
    "--panel-background": hexToRgba(appearance.backgroundColor, appearance.backgroundOpacity),
    "--codex-color": appearance.codexColor,
    "--claude-color": appearance.claudeColor,
    "--bar-height": `${appearance.barHeight}px`,
    "--text-scale": appearance.textScale / 100,
  } as CSSProperties;

  return (
    <main className="page-shell">
      <section className="overlay-shell" style={overlayStyle} aria-label="AI usage bars">
        <UsageRow
          name="CODEX"
          accent="codex"
          usage={usage.codex}
          resetText={`weekly · ${formatCountdown(usage.codex.resetAt, now)}`}
        />
        <UsageRow
          name="CLAUDE"
          accent="claude"
          usage={usage.claude}
          resetText={`session · ${usage.claude.resetLabel ?? formatCountdown(usage.claude.resetAt, now)}`}
        />
        <p className="bridge-status"><span className="bridge-status__dot" /> Realtime</p>
      </section>

      <section className="settings-panel" aria-label="Overlay settings">
        <div className="settings-heading">
          <div>
            <p className="settings-kicker">LOCAL SETTINGS</p>
            <h1>Overlay settings</h1>
          </div>
          <p className="crop-hint">Crop OBS above this section</p>
        </div>

        <div className="settings-grid">
          <label className="setting-field" htmlFor="background-opacity">
            <span>Background opacity <output>{appearance.backgroundOpacity}%</output></span>
            <input id="background-opacity" type="range" min="0" max="100" value={appearance.backgroundOpacity} onChange={(event) => updateAppearance("backgroundOpacity", Number(event.target.value))} />
          </label>

          <label className="setting-field" htmlFor="bar-height">
            <span>Bar height <output>{appearance.barHeight}px</output></span>
            <input id="bar-height" type="range" min="2" max="12" value={appearance.barHeight} onChange={(event) => updateAppearance("barHeight", Number(event.target.value))} />
          </label>

          <label className="setting-field" htmlFor="text-scale">
            <span>Text size <output>{appearance.textScale}%</output></span>
            <input id="text-scale" type="range" min="80" max="140" value={appearance.textScale} onChange={(event) => updateAppearance("textScale", Number(event.target.value))} />
          </label>

          <label className="setting-field setting-field--color" htmlFor="background-color">
            <span>Background color <output>{appearance.backgroundColor}</output></span>
            <input id="background-color" className="color-input" type="color" value={appearance.backgroundColor} onChange={(event) => updateAppearance("backgroundColor", event.target.value)} />
          </label>

          <label className="setting-field setting-field--color" htmlFor="codex-color">
            <span>Codex color <output>{appearance.codexColor}</output></span>
            <input id="codex-color" className="color-input" type="color" value={appearance.codexColor} onChange={(event) => updateAppearance("codexColor", event.target.value)} />
          </label>

          <label className="setting-field setting-field--color" htmlFor="claude-color">
            <span>Claude color <output>{appearance.claudeColor}</output></span>
            <input id="claude-color" className="color-input" type="color" value={appearance.claudeColor} onChange={(event) => updateAppearance("claudeColor", event.target.value)} />
          </label>
        </div>

        <div className="settings-footer">
          <span>Saved in this browser</span>
          <button type="button" onClick={resetAppearance}>Reset settings</button>
        </div>
      </section>
    </main>
  );
}
