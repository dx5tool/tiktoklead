// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Bogdan Shapovalov and the XChange authors

import React from "react";
import {
  Layers,
  Share2,
  Network,
  Puzzle,
  Bookmark,
  FolderKanban,
  Bot,
  Users as UsersIcon,
  Trash2,
  Settings as SettingsIcon,
  ChevronRight,
} from "lucide-react";
import { useI18n } from "../../i18n";
import type { Me, Project, Shell } from "../../api";
import type { View } from "../Sidebar";

interface SimprintSidebarProps {
  projects: Project[];
  active: Project | null;
  shell: Shell;
  me: Me | null;
  collapsed?: boolean;
  onSelect: (p: Project | null) => void;
  onNewProject: (origin: "local" | "team") => void;
  onSendProject: (p: Project) => void;
  onShareProject: (p: Project) => void;
  onRenameProject: (p: Project) => void;
  onDeleteProject: (p: Project) => void;
  view: View;
  onView: (v: View) => void;
  onSettings: () => void;
}

const NAV_ICONS: Record<View, React.ComponentType<{ className?: string; size?: number }>> = {
  profiles: Layers,
  sharedWithMe: Share2,
  proxies: Network,
  extensions: Puzzle,
  bookmarks: Bookmark,
  projects: FolderKanban,
  assistants: Bot,
  users: UsersIcon,
  trash: Trash2,
};

export const SimprintSidebar: React.FC<SimprintSidebarProps> = ({
  projects,
  active,
  shell,
  me,
  collapsed = false,
  onSelect,
  onNewProject,
  onSendProject,
  onShareProject,
  onRenameProject,
  onDeleteProject,
  view,
  onView,
  onSettings,
}) => {
  const { t } = useI18n();
  const local = shell.mode === "local";

  const navItems: View[] = local
    ? ["profiles", "proxies", "extensions", "bookmarks", "projects", "trash"]
    : ["profiles", "sharedWithMe", "proxies", "extensions", "bookmarks", "projects", "trash"];

  return (
    <aside
      className={`h-full flex flex-col justify-between bg-[var(--simprint-sidebar-bg)] border-r border-[var(--simprint-border)] text-[var(--simprint-text)] select-none z-20 transition-all duration-300 ease-in-out ${
        collapsed ? "w-12 min-w-[3rem]" : "w-48 min-w-[12rem]"
      }`}
    >
      {/* Main Navigation & Folders list */}
      <nav className={`flex-1 overflow-y-auto py-3 space-y-4 ${collapsed ? "px-1" : "px-3"}`}>
        {/* Core Nav Links */}
        <div className="space-y-1">
          {navItems.map((v) => {
            const IconComponent = NAV_ICONS[v] ?? Layers;
            const isSelected = view === v && !(v === "profiles" && active);
            const navLabel = t(`nav.${v}` as never);

            return (
              <button
                key={v}
                onClick={() => {
                  if (v === "profiles") onSelect(null);
                  onView(v);
                }}
                title={collapsed ? navLabel : undefined}
                className={`flex items-center rounded-xl font-medium transition-all duration-150 cursor-pointer ${
                  collapsed
                    ? "w-10 h-10 mx-auto justify-center"
                    : "w-full justify-between px-3 py-2 text-sm"
                } ${
                  isSelected
                    ? "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30 shadow-xs font-semibold"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800/50 !bg-transparent !border-0"
                }`}
              >
                <div className={`flex items-center ${collapsed ? "justify-center" : "gap-3"}`}>
                  <IconComponent size={collapsed ? 19 : 18} className={isSelected ? "text-cyan-600 dark:text-cyan-400" : "text-slate-500 dark:text-slate-400"} />
                  {!collapsed && <span>{navLabel}</span>}
                </div>
                {!collapsed && isSelected && <ChevronRight size={14} className="text-cyan-600 dark:text-cyan-400" />}
              </button>
            );
          })}
        </div>

        {/* Other settings */}
        <div className="pt-2 border-t border-[var(--simprint-border)] space-y-1">
          {!collapsed && (
            <div className="px-3 py-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
              {t("app.otherSettings")}
            </div>
          )}
          <button
            onClick={onSettings}
            title={collapsed ? t("app.settings") : undefined}
            className={`flex items-center rounded-xl font-medium transition-all duration-150 cursor-pointer ${
              collapsed
                ? "w-10 h-10 mx-auto justify-center"
                : "w-full justify-between px-3 py-2 text-sm"
            } text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800/50 !bg-transparent !border-0`}
          >
            <div className={`flex items-center ${collapsed ? "justify-center" : "gap-3"}`}>
              <SettingsIcon size={collapsed ? 19 : 18} className="text-slate-500 dark:text-slate-400" />
              {!collapsed && <span>{t("app.settings")}</span>}
            </div>
          </button>
        </div>
      </nav>

      {/* Footer Status & Machine Info */}
      <div className={`border-t border-[var(--simprint-border)] bg-slate-100/60 dark:bg-slate-950/40 ${collapsed ? "p-2 flex flex-col items-center gap-2" : "p-3 space-y-2"}`}>
        {!collapsed ? (
          <>
            {/* Real-time Agent Status indicator */}
            <div className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-white/80 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-xs shadow-xs">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  {shell.agent_ready ? (
                    <>
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500 shadow-[0_0_8px_#10b981]" />
                    </>
                  ) : (
                    <>
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500 shadow-[0_0_8px_#f43f5e]" />
                    </>
                  )}
                </span>
                <span
                  className={`font-semibold tracking-wide ${
                    shell.agent_ready ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"
                  }`}
                >
                  {shell.agent_ready ? "Agent Online" : "Agent Disconnected"}
                </span>
              </div>
              <span className="text-[10px] text-slate-500 font-mono">v{shell.version}</span>
            </div>

            {/* User / Machine details */}
            {me && (
              <div className="px-2 text-xs font-medium text-slate-700 dark:text-slate-300 truncate" title={me.email}>
                {me.email}
              </div>
            )}
            <div className="flex items-center justify-between px-2 text-[11px] text-slate-500 dark:text-slate-400">
              <div className="truncate flex-1 pr-2" title={shell.machine_name}>
                <span>{shell.machine_name}</span>
                {!shell.native && <span className="text-cyan-600 dark:text-cyan-400"> · {t("app.browserDev")}</span>}
              </div>
              <button
                onClick={onSettings}
                title={t("app.settings")}
                aria-label={t("app.settings")}
                className="p-1 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200/60 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800 transition-colors cursor-pointer !bg-transparent !border-0"
              >
                <SettingsIcon size={15} />
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Collapsed Agent Status dot */}
            <div
              title={shell.agent_ready ? `Agent Online (v${shell.version})` : "Agent Disconnected"}
              className="relative flex h-3 w-3 my-1 cursor-pointer"
            >
              {shell.agent_ready ? (
                <>
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500 shadow-[0_0_8px_#10b981]" />
                </>
              ) : (
                <>
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500 shadow-[0_0_8px_#f43f5e]" />
                </>
              )}
            </div>

            {/* Collapsed Settings icon */}
            <button
              onClick={onSettings}
              title={t("app.settings")}
              aria-label={t("app.settings")}
              className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200/60 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800 transition-colors cursor-pointer !bg-transparent !border-0"
            >
              <SettingsIcon size={16} />
            </button>
          </>
        )}
      </div>
    </aside>
  );
};
