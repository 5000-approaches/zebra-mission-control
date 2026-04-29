"use client";

import { useState, useEffect } from "react";

function elapsedTime(deployTime: string): string {
  const diff = Math.max(0, Date.now() - new Date(deployTime).getTime());
  const d = Math.floor(diff / 86_400_000);
  const h = Math.floor((diff % 86_400_000) / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  const s = Math.floor((diff % 60_000) / 1_000);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0 || d > 0) parts.push(`${h}h`);
  if (m > 0 || h > 0 || d > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(" ");
}

export default function DeployBadge() {
  const version = process.env.NEXT_PUBLIC_APP_VERSION ?? "";
  const deployTime = process.env.NEXT_PUBLIC_DEPLOY_TIME ?? "";

  const [label, setLabel] = useState(() => (deployTime ? elapsedTime(deployTime) : ""));
  const [isFresh, setIsFresh] = useState(() =>
    deployTime ? Date.now() - new Date(deployTime).getTime() < 3_600_000 : false
  );

  useEffect(() => {
    if (!deployTime) return;
    const id = setInterval(() => {
      setLabel(elapsedTime(deployTime));
      setIsFresh(Date.now() - new Date(deployTime).getTime() < 3_600_000);
    }, 1_000);
    return () => clearInterval(id);
  }, [deployTime]);

  return (
    <span className="flex items-center gap-1 text-xs text-white/40 ml-1">
      <span
        style={{
          display: "inline-block",
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: isFresh ? "#22c55e" : "rgba(255,255,255,0.3)",
          flexShrink: 0,
        }}
      />
      <span suppressHydrationWarning>
        v{version}
        {label ? ` · ${label}` : ""}
      </span>
    </span>
  );
}
