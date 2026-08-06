"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

type AgentId =
  | "codex"
  | "claude"
  | "opencode"
  | "gemini"
  | "qwen"
  | "copilot"
  | "amazonq"
  | "aider"
  | "cursor"
  | "goose"
  | "ollama"
  | "lmstudio"
  | "kiro"
  | "vibe"
  | "crush";

type AgentColorKey = "codexColor" | "claudeColor" | "opencodeColor";

type AgentConfig = {
  id: AgentId;
  name: string;
  period: string;
  color: string;
  colorKey: AgentColorKey | null;
  core: boolean;
  defaultVisible: boolean;
};

type AgentUsage = {
  available: boolean;
  usedPercent: number | null;
  resetAt: number | null;
  resetLabel: string | null;
  model: string | null;
  effort: string | null;
  detected: boolean;
  error?: string;
};

type UsageResponse = {
  [key in AgentId]: AgentUsage;
} & {
  updatedAt: string | null;
};

type AppearanceState = {
  backgroundColor: string;
  backgroundOpacity: number;
  codexColor: string;
  claudeColor: string;
  opencodeColor: string;
  barHeight: number;
  textScale: number;
  visibleAgents: Record<AgentId, boolean>;
};

const BRIDGE_URL = "http://127.0.0.1:4318/api/usage";

const AGENT_CONFIG: readonly AgentConfig[] = [
  { id: "codex", name: "CODEX", period: "Weekly", color: "#f2a65a", colorKey: "codexColor", core: true, defaultVisible: true },
  { id: "claude", name: "CLAUDE", period: "Session", color: "#b69bff", colorKey: "claudeColor", core: true, defaultVisible: true },
  { id: "opencode", name: "OPENCODE", period: "Stats", color: "#69d4c6", colorKey: "opencodeColor", core: false, defaultVisible: false },
  { id: "gemini", name: "GEMINI", period: "Stats", color: "#78a9ff", colorKey: null, core: false, defaultVisible: false },
  { id: "qwen", name: "QWEN", period: "Stats", color: "#67e8f9", colorKey: null, core: false, defaultVisible: false },
  { id: "copilot", name: "COPILOT", period: "Stats", color: "#d4a8ff", colorKey: null, core: false, defaultVisible: false },
  { id: "amazonq", name: "AMAZON Q", period: "Stats", color: "#ffb86c", colorKey: null, core: false, defaultVisible: false },
  { id: "aider", name: "AIDER", period: "Stats", color: "#ff7797", colorKey: null, core: false, defaultVisible: false },
  { id: "cursor", name: "CURSOR", period: "Stats", color: "#7bc7ff", colorKey: null, core: false, defaultVisible: false },
  { id: "goose", name: "GOOSE", period: "Stats", color: "#f3dd74", colorKey: null, core: false, defaultVisible: false },
  { id: "ollama", name: "OLLAMA", period: "Local", color: "#c4d7ff", colorKey: null, core: false, defaultVisible: false },
  { id: "lmstudio", name: "LM STUDIO", period: "Local", color: "#9bd8ff", colorKey: null, core: false, defaultVisible: false },
  { id: "kiro", name: "KIRO", period: "Stats", color: "#cfb3ff", colorKey: null, core: false, defaultVisible: false },
  { id: "vibe", name: "MISTRAL VIBE", period: "Stats", color: "#ff9e7a", colorKey: null, core: false, defaultVisible: false },
  { id: "crush", name: "CRUSH", period: "Stats", color: "#98e69c", colorKey: null, core: false, defaultVisible: false },
];

function createAgentFlags(value: boolean) {
  return Object.fromEntries(AGENT_CONFIG.map((agent) => [agent.id, value])) as Record<AgentId, boolean>;
}

function createEmptyAgentUsage(): AgentUsage {
  return { available: false, usedPercent: null, resetAt: null, resetLabel: null, model: null, effort: null, detected: false };
}

const EMPTY_USAGE: UsageResponse = {
  ...Object.fromEntries(AGENT_CONFIG.map((agent) => [agent.id, createEmptyAgentUsage()])),
  updatedAt: null,
} as UsageResponse;

const DEFAULT_APPEARANCE: AppearanceState = {
  backgroundColor: "#08090d",
  backgroundOpacity: 82,
  codexColor: "#f2a65a",
  claudeColor: "#b69bff",
  opencodeColor: "#69d4c6",
  barHeight: 7,
  textScale: 100,
  visibleAgents: Object.fromEntries(AGENT_CONFIG.map((agent) => [agent.id, agent.defaultVisible])) as Record<AgentId, boolean>,
};

const COLOR_PRESETS = {
  background: ["#08090d", "#000000", "#121212", "#202124"],
  codex: ["#f2a65a", "#ff8a3d", "#57d6a0", "#75b9ff"],
  claude: ["#b69bff", "#8f7cff", "#ff8fb3", "#7ad7d0"],
  opencode: ["#69d4c6", "#4cb8e8", "#d6a1ff", "#f2c16b"],
} as const;

function normalizeUsageResponse(value: unknown): UsageResponse {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const next = { ...EMPTY_USAGE } as UsageResponse;

  for (const agent of AGENT_CONFIG) {
    const candidate = raw[agent.id];
    if (candidate && typeof candidate === "object") {
      next[agent.id] = { ...EMPTY_USAGE[agent.id], ...(candidate as Partial<AgentUsage>) };
    }
  }

  next.updatedAt = typeof raw.updatedAt === "string" ? raw.updatedAt : null;
  return next;
}

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

function isHexDraft(value: string) {
  return /^#[0-9a-f]{0,6}$/i.test(value);
}

function readVisibleAgents(value: unknown): Record<AgentId, boolean> {
  const stored = value && typeof value === "object" ? value as Partial<Record<AgentId, unknown>> : {};
  return AGENT_CONFIG.reduce((visibility, agent) => {
    visibility[agent.id] = stored[agent.id] === undefined ? agent.defaultVisible : stored[agent.id] !== false;
    return visibility;
  }, {} as Record<AgentId, boolean>);
}

function getAgentColor(agent: AgentConfig, appearance: AppearanceState) {
  if (agent.colorKey) {
    const configuredColor = appearance[agent.colorKey];
    if (isHexColor(configuredColor)) return configuredColor;
  }
  return agent.color;
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

function formatResetText(id: AgentId, usage: AgentUsage, now: number) {
  if (id === "codex") return `weekly · ${formatCountdown(usage.resetAt, now)}`;
  if (id === "claude") return `session · ${usage.resetLabel ?? formatCountdown(usage.resetAt, now)}`;
  return usage.resetLabel ?? "usage limit unavailable";
}

function isOutOfUsage(usage: AgentUsage) {
  return usage.usedPercent !== null && usage.usedPercent >= 100;
}

function UsageRow({
  name,
  period,
  accent,
  accentColor,
  usage,
  resetText,
  testOutOfUsage,
}: {
  name: string;
  period: string;
  accent: AgentId;
  accentColor: string;
  usage: AgentUsage;
  resetText: string;
  testOutOfUsage: boolean;
}) {
  const outOfUsage = testOutOfUsage || isOutOfUsage(usage);
  const value = outOfUsage ? 100 : usage.usedPercent === null ? 0 : Math.min(100, Math.max(0, usage.usedPercent));
  const percent = outOfUsage ? "100%" : usage.usedPercent === null ? "--" : `${Math.round(usage.usedPercent)}%`;

  return (
    <section className={`usage-row ${outOfUsage ? "usage-row--dead" : ""}`} style={{ "--agent-color": accentColor } as CSSProperties} aria-label={`${name} usage`}>
      <div className="row-label">
        <span className={`agent-name agent-name--${accent}`}>
          <span className="agent-dot" />
          {name}
          <span className="agent-period">({period})</span>
        </span>
        <span className="row-percent">{percent}</span>
      </div>
      <p className={`row-model ${outOfUsage ? "row-model--dead" : ""}`}>
        {usage.model ?? "model unknown"}
        {usage.effort ? <span className="row-model__effort"> · effort {usage.effort}</span> : null}
      </p>
      <div className={`usage-bar ${outOfUsage ? "usage-bar--dead" : ""}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={outOfUsage ? 100 : usage.usedPercent ?? 0} aria-label={`${name} usage percentage`}>
        <span className={`usage-bar__fill usage-bar__fill--${accent} ${outOfUsage ? "usage-bar__fill--dead" : usage.available ? "" : "usage-bar__fill--offline"}`} style={{ width: `${value}%` }} />
      </div>
      <p className={`row-meta ${outOfUsage ? "row-meta--dead" : ""}`}>
        {outOfUsage ? "OUT OF USAGE!" : usage.available ? resetText : usage.error ?? (usage.detected ? "usage percentage unavailable" : "localhost bridge offline")}
      </p>
    </section>
  );
}

function ColorSetting({
  id,
  label,
  value,
  presets,
  onChange,
  onCommit,
}: {
  id: string;
  label: string;
  value: string;
  presets: readonly string[];
  onChange: (value: string) => void;
  onCommit: () => void;
}) {
  const swatchColor = isHexColor(value) ? value : "#777480";

  return (
    <div className="setting-field setting-field--color">
      <span>{label} <output>{value}</output></span>
      <div className="color-control">
        <span className="color-swatch" style={{ backgroundColor: swatchColor }} aria-hidden="true" />
        <input
          id={id}
          className="color-text"
          type="text"
          inputMode="text"
          autoComplete="off"
          maxLength={7}
          spellCheck={false}
          value={value}
          aria-label={`${label} hex value`}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onCommit}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
        />
        <div className="color-presets" aria-label={`${label} presets`}>
          {presets.map((preset) => (
            <button
              key={preset}
              className="color-preset"
              type="button"
              title={preset}
              aria-label={`Set ${label} to ${preset}`}
              style={{ backgroundColor: preset }}
              onClick={() => onChange(preset)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [usage, setUsage] = useState<UsageResponse>(EMPTY_USAGE);
  const [now, setNow] = useState(() => Date.now());
  const [appearance, setAppearance] = useState<AppearanceState>(DEFAULT_APPEARANCE);
  const [testOutOfUsage, setTestOutOfUsage] = useState<Record<AgentId, boolean>>(() => createAgentFlags(false));
  const [soundEnabled, setSoundEnabled] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const alertStateRef = useRef<Record<AgentId, boolean>>(createAgentFlags(false));
  const testTimersRef = useRef<Partial<Record<AgentId, number>>>({});

  const playSiren = useCallback(async () => {
    const AudioContextConstructor = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) return false;

    try {
      const context = audioContextRef.current ?? new AudioContextConstructor();
      audioContextRef.current = context;
      if (context.state === "suspended") await context.resume();
      if (context.state !== "running") return false;

      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = context.currentTime;

      oscillator.type = "triangle";
      oscillator.frequency.setValueAtTime(650, start);
      oscillator.frequency.linearRampToValueAtTime(1100, start + 0.22);
      oscillator.frequency.linearRampToValueAtTime(650, start + 0.44);
      oscillator.frequency.linearRampToValueAtTime(1100, start + 0.66);
      oscillator.frequency.linearRampToValueAtTime(650, start + 0.88);

      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.18, start + 0.03);
      gain.gain.setValueAtTime(0.18, start + 0.84);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 1.05);

      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + 1.08);
      return true;
    } catch {
      return false;
    }
  }, []);

  const triggerTestAlert = (id: AgentId) => {
    setTestOutOfUsage((current) => ({ ...current, [id]: true }));
    void playSiren().then((enabled) => {
      if (enabled) setSoundEnabled(true);
    });

    const previousTimer = testTimersRef.current[id];
    if (previousTimer) window.clearTimeout(previousTimer);
    testTimersRef.current[id] = window.setTimeout(() => {
      setTestOutOfUsage((current) => ({ ...current, [id]: false }));
      delete testTimersRef.current[id];
    }, 6000);
  };

  useEffect(() => {
    let shouldPlay = false;

    for (const agent of AGENT_CONFIG) {
      const exhausted = appearance.visibleAgents[agent.id] && isOutOfUsage(usage[agent.id]);
      if (exhausted && !alertStateRef.current[agent.id]) {
        alertStateRef.current[agent.id] = true;
        shouldPlay = true;
      } else if (!isOutOfUsage(usage[agent.id])) {
        alertStateRef.current[agent.id] = false;
      }
    }

    if (shouldPlay) void playSiren();
  }, [appearance.visibleAgents, playSiren, usage]);

  useEffect(() => () => {
    Object.values(testTimersRef.current).forEach((timer) => {
      if (timer) window.clearTimeout(timer);
    });
    void audioContextRef.current?.close();
  }, []);

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
          opencodeColor: isHexColor(parsed.opencodeColor) ? parsed.opencodeColor : DEFAULT_APPEARANCE.opencodeColor,
          barHeight: clamp(Number(parsed.barHeight ?? DEFAULT_APPEARANCE.barHeight), 4, 16),
          textScale: clamp(Number(parsed.textScale ?? DEFAULT_APPEARANCE.textScale), 80, 180),
          visibleAgents: readVisibleAgents(parsed.visibleAgents),
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
        const next = normalizeUsageResponse(await response.json());
        if (!disposed) {
          setUsage(next);
          setNow(Date.now());
        }
      } catch {
        if (!disposed) {
          setUsage((current) => {
            const next = { ...current };
            for (const agent of AGENT_CONFIG) {
              next[agent.id] = { ...next[agent.id], available: false, error: "localhost bridge offline" };
            }
            return next;
          });
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

  const updateColorDraft = (key: "backgroundColor" | "codexColor" | "claudeColor" | "opencodeColor", value: string) => {
    const normalized = value.startsWith("#") ? value : `#${value}`;
    if (!isHexDraft(normalized)) return;

    const next = { ...appearance, [key]: normalized };
    setAppearance(next);
    if (isHexColor(normalized)) {
      window.localStorage.setItem("usage-overlay-appearance", JSON.stringify(next));
    }
  };

  const updateAgentVisibility = (id: AgentId, visible: boolean) => {
    const next = {
      ...appearance,
      visibleAgents: { ...appearance.visibleAgents, [id]: visible },
    };
    setAppearance(next);
    window.localStorage.setItem("usage-overlay-appearance", JSON.stringify(next));
  };

  const commitColor = (key: "backgroundColor" | "codexColor" | "claudeColor" | "opencodeColor") => {
    if (isHexColor(appearance[key])) return;

    const next = { ...appearance, [key]: DEFAULT_APPEARANCE[key] };
    setAppearance(next);
    window.localStorage.setItem("usage-overlay-appearance", JSON.stringify(next));
  };

  const resetAppearance = () => {
    setAppearance(DEFAULT_APPEARANCE);
    window.localStorage.removeItem("usage-overlay-appearance");
  };

  const overlayStyle = {
    "--panel-background": hexToRgba(
      isHexColor(appearance.backgroundColor) ? appearance.backgroundColor : DEFAULT_APPEARANCE.backgroundColor,
      appearance.backgroundOpacity,
    ),
    "--codex-color": isHexColor(appearance.codexColor) ? appearance.codexColor : DEFAULT_APPEARANCE.codexColor,
    "--claude-color": isHexColor(appearance.claudeColor) ? appearance.claudeColor : DEFAULT_APPEARANCE.claudeColor,
    "--opencode-color": isHexColor(appearance.opencodeColor) ? appearance.opencodeColor : DEFAULT_APPEARANCE.opencodeColor,
    "--bar-height": `${appearance.barHeight}px`,
    "--text-scale": appearance.textScale / 100,
  } as CSSProperties;

  const visibleAgents = AGENT_CONFIG.filter((agent) => appearance.visibleAgents[agent.id]);

  return (
    <main className="page-shell">
      <section className="overlay-shell" style={overlayStyle} aria-label="AI usage bars">
        {visibleAgents.map((agent) => (
          <UsageRow
            key={agent.id}
            name={agent.name}
            period={agent.period}
            accent={agent.id}
            accentColor={getAgentColor(agent, appearance)}
            usage={usage[agent.id]}
            resetText={formatResetText(agent.id, usage[agent.id], now)}
            testOutOfUsage={testOutOfUsage[agent.id]}
          />
        ))}
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
            <input id="bar-height" type="range" min="4" max="16" value={appearance.barHeight} onChange={(event) => updateAppearance("barHeight", Number(event.target.value))} />
          </label>

          <label className="setting-field" htmlFor="text-scale">
            <span>Text size <output>{appearance.textScale}%</output></span>
            <input id="text-scale" type="range" min="80" max="180" value={appearance.textScale} onChange={(event) => updateAppearance("textScale", Number(event.target.value))} />
          </label>

          <fieldset className="model-settings">
            <legend>Visible models</legend>
            <p className="model-settings__hint">Detected tools are marked live or detected; optional rows start hidden.</p>
            <div className="model-options">
              {AGENT_CONFIG.map((agent) => {
                const agentUsage = usage[agent.id];
                return (
                  <div className="model-option" key={agent.id}>
                    <label className="model-option__toggle" htmlFor={`model-toggle-${agent.id}`}>
                      <input
                        id={`model-toggle-${agent.id}`}
                        type="checkbox"
                        checked={appearance.visibleAgents[agent.id]}
                        aria-label={`${agent.name} ${agentUsage.available ? "LIVE" : agentUsage.detected ? "DETECTED" : "OFFLINE"}`}
                        onChange={(event) => updateAgentVisibility(agent.id, event.target.checked)}
                      />
                      <span className="model-option__name">
                        <span
                          className="model-option__dot"
                          style={{ backgroundColor: getAgentColor(agent, appearance) }}
                        />
                        {agent.name}
                      </span>
                      <span className={`model-option__state ${agentUsage.available ? "model-option__state--live" : agentUsage.detected ? "model-option__state--detected" : ""}`}>
                        {agentUsage.available ? "LIVE" : agentUsage.detected ? "DETECTED" : "OFFLINE"}
                      </span>
                    </label>
                    <button
                      className="model-option__test"
                      type="button"
                      aria-label={`Test ${agent.name} out-of-usage alert`}
                      onClick={() => triggerTestAlert(agent.id)}
                    >
                      Test siren
                    </button>
                  </div>
                );
              })}
            </div>
          </fieldset>

          <ColorSetting
            id="background-color"
            label="Background color"
            value={appearance.backgroundColor}
            presets={COLOR_PRESETS.background}
            onChange={(value) => updateColorDraft("backgroundColor", value)}
            onCommit={() => commitColor("backgroundColor")}
          />

          <ColorSetting
            id="codex-color"
            label="Codex color"
            value={appearance.codexColor}
            presets={COLOR_PRESETS.codex}
            onChange={(value) => updateColorDraft("codexColor", value)}
            onCommit={() => commitColor("codexColor")}
          />

          <ColorSetting
            id="claude-color"
            label="Claude color"
            value={appearance.claudeColor}
            presets={COLOR_PRESETS.claude}
            onChange={(value) => updateColorDraft("claudeColor", value)}
            onCommit={() => commitColor("claudeColor")}
          />

          <ColorSetting
            id="opencode-color"
            label="OpenCode color"
            value={appearance.opencodeColor}
            presets={COLOR_PRESETS.opencode}
            onChange={(value) => updateColorDraft("opencodeColor", value)}
            onCommit={() => commitColor("opencodeColor")}
          />
        </div>

        <div className="settings-footer">
          <span>{soundEnabled ? "Sound ready · saved locally" : "Click Test siren to enable sound"}</span>
          <button type="button" onClick={resetAppearance}>Reset settings</button>
        </div>
      </section>
    </main>
  );
}
