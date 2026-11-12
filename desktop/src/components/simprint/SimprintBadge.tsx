// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Bogdan Shapovalov and the XChange authors

import React from "react";

export type BadgeVariant =
  | "cyan"
  | "emerald"
  | "amber"
  | "rose"
  | "sky"
  | "slate"
  | "indigo";

interface SimprintBadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  dot?: boolean;
  pulse?: boolean;
  className?: string;
  title?: string;
  onClick?: () => void;
}

const VARIANT_STYLES: Record<BadgeVariant, { bg: string; text: string; border: string; dot: string }> = {
  cyan: {
    bg: "bg-cyan-500/10 dark:bg-cyan-500/10",
    text: "text-cyan-700 dark:text-cyan-400",
    border: "border-cyan-500/30 dark:border-cyan-500/30",
    dot: "bg-cyan-600 dark:bg-cyan-400",
  },
  emerald: {
    bg: "bg-emerald-500/10 dark:bg-emerald-500/10",
    text: "text-emerald-700 dark:text-emerald-400",
    border: "border-emerald-500/30 dark:border-emerald-500/30",
    dot: "bg-emerald-600 dark:bg-emerald-400",
  },
  amber: {
    bg: "bg-amber-500/10 dark:bg-amber-500/10",
    text: "text-amber-700 dark:text-amber-400",
    border: "border-amber-500/30 dark:border-amber-500/30",
    dot: "bg-amber-600 dark:bg-amber-400",
  },
  rose: {
    bg: "bg-rose-500/10 dark:bg-rose-500/10",
    text: "text-rose-700 dark:text-rose-400",
    border: "border-rose-500/30 dark:border-rose-500/30",
    dot: "bg-rose-600 dark:bg-rose-400",
  },
  sky: {
    bg: "bg-sky-500/10 dark:bg-sky-500/10",
    text: "text-sky-700 dark:text-sky-400",
    border: "border-sky-500/30 dark:border-sky-500/30",
    dot: "bg-sky-600 dark:bg-sky-400",
  },
  slate: {
    bg: "bg-slate-200/70 dark:bg-slate-800/60",
    text: "text-slate-700 dark:text-slate-300",
    border: "border-slate-300 dark:border-slate-700/60",
    dot: "bg-slate-500 dark:bg-slate-400",
  },
  indigo: {
    bg: "bg-indigo-500/10 dark:bg-indigo-500/10",
    text: "text-indigo-700 dark:text-indigo-400",
    border: "border-indigo-500/30 dark:border-indigo-500/30",
    dot: "bg-indigo-600 dark:bg-indigo-400",
  },
};

export const SimprintBadge: React.FC<SimprintBadgeProps> = ({
  children,
  variant = "slate",
  dot = false,
  pulse = false,
  className = "",
  title,
  onClick,
}) => {
  const styles = VARIANT_STYLES[variant];

  return (
    <span
      title={title}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border tracking-wide transition-colors ${styles.bg} ${styles.text} ${styles.border} ${className}`}
    >
      {dot && (
        <span className="relative flex h-2 w-2">
          {pulse && (
            <span
              className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${styles.dot}`}
            />
          )}
          <span className={`relative inline-flex rounded-full h-2 w-2 ${styles.dot}`} />
        </span>
      )}
      {children}
    </span>
  );
};
