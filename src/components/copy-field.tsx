"use client";

import { useState } from "react";

export function CopyField({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      {label && <div className="label">{label}</div>}
      <div className="flex gap-2">
        <input readOnly value={value} className="input min-w-0 font-mono text-sm" onFocus={(e) => e.target.select()} />
        <button
          type="button"
          className="btn-secondary shrink-0 text-sm"
          onClick={async () => {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? "コピー済" : "コピー"}
        </button>
      </div>
    </div>
  );
}
