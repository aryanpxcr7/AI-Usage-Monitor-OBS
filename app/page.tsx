"use client";

import { useEffect, useState } from "react";

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

const BRIDGE_URL = "http://127.0.0.1:4318/api/usage";

const EMPTY_USAGE: UsageResponse = {
  codex: { available: false, usedPercent: null, resetAt: null, resetLabel: null },
  claude: { available: false, usedPercent: null, resetAt: null, resetLabel: null },
  updatedAt: null,
};

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

  return (
    <main className="overlay-shell">
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
    </main>
  );
}
