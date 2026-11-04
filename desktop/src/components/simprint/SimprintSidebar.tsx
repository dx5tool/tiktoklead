import React, { useState } from "react";
import {
  Layers,
  Share2,
  Network,
  Puzzle,
  Bot,
  Users as UsersIcon,
  Trash2,
  Plus,
  Settings as SettingsIcon,
  Folder,
  ChevronRight,
  MoreVertical,
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
  onNewProfile: () => void;
  onSettings: () => void;
}

const NAV_ICONS: Record<View, React.ComponentType<{ className?: string; size?: number }>> = {
  profiles: Layers,
  sharedWithMe: Share2,
  proxies: Network,
  extensions: Puzzle,
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
  onNewProfile,
  onSettings,
}) => {
  const { t } = useI18n();
  const local = shell.mode === "local";
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  const navItems: View[] = local
    ? ["profiles", "proxies", "extensions", "assistants", "users", "trash"]
    : ["profiles", "sharedWithMe", "proxies", "extensions", "assistants", "users", "trash"];

  const projectSections = local
    ? ([["local", "app.projects"]] as const)
    : ([
        ["team", "app.projectsTeam"],
        ["local", "app.projectsHere"],
      ] as const);

  return (
    <aside
      className={`h-full flex flex-col justify-between bg-[#0b0f19]/90 backdrop-blur-2xl border-r border-slate-800/80 text-slate-200 select-none z-20 transition-all duration-300 ease-in-out ${
        collapsed ? "w-16 min-w-[4rem]" : "w-64 min-w-[16rem]"
      }`}
    >
      {/* Sidebar Top: + New Profile Button */}
      <div className={`p-3 ${collapsed ? "flex flex-col items-center" : "p-3 pb-2"}`}>
        {!collapsed ? (
          <button
            onClick={onNewProfile}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-medium text-sm text-white bg-gradient-to-r from-cyan-500 via-sky-500 to-blue-600 hover:from-cyan-400 hover:via-sky-400 hover:to-blue-500 shadow-lg shadow-cyan-500/25 active:scale-[0.98] transition-all duration-200 border border-cyan-400/30 cursor-pointer"
          >
            <Plus size={18} className="stroke-[2.5]" />
            <span>{t("bar.newProfile")}</span>
          </button>
        ) : (
          <button
            onClick={onNewProfile}
            title={t("bar.newProfile")}
            className="w-10 h-10 flex items-center justify-center rounded-xl text-white bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 shadow-md shadow-cyan-500/20 transition-all cursor-pointer border border-cyan-400/30 shrink-0"
          >
            <Plus size={20} className="stroke-[2.5]" />
          </button>
        )}
      </div>

      {/* Main Navigation & Folders list */}
      <nav className={`flex-1 overflow-y-auto py-2 space-y-4 ${collapsed ? "px-2" : "px-3"}`}>
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
                    ? "bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 shadow-sm shadow-cyan-500/10"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent"
                }`}
              >
                <div className={`flex items-center ${collapsed ? "justify-center" : "gap-3"}`}>
                  <IconComponent size={collapsed ? 19 : 18} className={isSelected ? "text-cyan-400" : "text-slate-400"} />
                  {!collapsed && <span>{navLabel}</span>}
                </div>
                {!collapsed && isSelected && <ChevronRight size={14} className="text-cyan-400" />}
              </button>
            );
          })}
        </div>

        {/* Project Folders */}
        <div className={`pt-2 border-t border-slate-800/80 ${collapsed ? "space-y-2" : "space-y-3"}`}>
          {projectSections.map(([side, label]) => {
            const sideProjects = projects.filter((p) => p.origin === side);

            if (collapsed) {
              return (
                <div key={side} className="space-y-1">
                  {sideProjects.map((p) => {
                    const isFolderActive = p.id === active?.id && view === "profiles";
                    return (
                      <button
                        key={p.id}
                        onClick={() => {
                          onSelect(p);
                          onView("profiles");
                        }}
                        title={`${p.name} (${p.profile_count})`}
                        className={`w-10 h-9 mx-auto flex items-center justify-center rounded-xl transition-colors cursor-pointer relative ${
                          isFolderActive
                            ? "bg-cyan-500/15 text-cyan-400 border border-cyan-500/30"
                            : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border border-transparent"
                        }`}
                      >
                        <Folder size={16} className={isFolderActive ? "text-cyan-400" : "text-slate-500"} />
                        {p.profile_count > 0 && (
                          <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-cyan-400" />
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            }

            return (
              <div key={side} className="space-y-1">
                <div className="flex items-center justify-between px-3 py-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <span>{t(label as never)}</span>
                  <button
                    onClick={() => onNewProject(side)}
                    title={t(side === "local" ? "app.newProjectHere" : "app.newProject")}
                    className="p-1 rounded-md text-slate-400 hover:text-cyan-400 hover:bg-cyan-500/10 transition-colors cursor-pointer"
                  >
                    <Plus size={14} />
                  </button>
                </div>

                {sideProjects.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-slate-600 italic">
                    {side === "team" ? t("app.nothingShared") : t("app.noFoldersHere")}
                  </div>
                ) : (
                  <div className="space-y-0.5">
                    {sideProjects.map((p) => {
                      const isFolderActive = p.id === active?.id && view === "profiles";
                      const isMenuOpen = activeMenuId === p.id;
                      return (
                        <div key={p.id} className="relative group">
                          <button
                            onClick={() => {
                              onSelect(p);
                              onView("profiles");
                            }}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              setActiveMenuId(isMenuOpen ? null : p.id);
                            }}
                            className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                              isFolderActive
                                ? "bg-cyan-500/15 text-cyan-400 border border-cyan-500/30"
                                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border border-transparent"
                            }`}
                          >
                            <div className="flex items-center gap-2 truncate pr-2">
                              <Folder size={14} className={isFolderActive ? "text-cyan-400" : "text-slate-500"} />
                              <span className="truncate">{p.name}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span
                                className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                                  isFolderActive
                                    ? "bg-cyan-500/20 text-cyan-300 font-semibold"
                                    : "bg-slate-800 text-slate-400"
                                }`}
                              >
                                {p.profile_count}
                              </span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveMenuId(isMenuOpen ? null : p.id);
                                }}
                                className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-slate-400 hover:text-white transition-opacity"
                              >
                                <MoreVertical size={12} />
                              </button>
                            </div>
                          </button>

                          {/* Context Menu for Folder */}
                          {isMenuOpen && (
                            <div className="absolute right-2 top-8 w-36 py-1 bg-slate-900 border border-slate-700/80 rounded-xl shadow-xl z-50 text-xs">
                              <button
                                onClick={() => {
                                  setActiveMenuId(null);
                                  onRenameProject(p);
                                }}
                                className="w-full text-left px-3 py-1.5 text-slate-300 hover:bg-slate-800 hover:text-white"
                              >
                                {t("proj.rename")}
                              </button>
                              {!local && p.origin === "local" && (
                                <button
                                  onClick={() => {
                                    setActiveMenuId(null);
                                    onSendProject(p);
                                  }}
                                  className="w-full text-left px-3 py-1.5 text-slate-300 hover:bg-slate-800 hover:text-white"
                                >
                                  {t("proj.sendAll")}
                                </button>
                              )}
                              {!local && p.origin === "team" && (
                                <button
                                  onClick={() => {
                                    setActiveMenuId(null);
                                    onShareProject(p);
                                  }}
                                  className="w-full text-left px-3 py-1.5 text-slate-300 hover:bg-slate-800 hover:text-white"
                                >
                                  {t("proj.shareAll")}
                                </button>
                              )}
                              <button
                                onClick={() => {
                                  setActiveMenuId(null);
                                  onDeleteProject(p);
                                }}
                                className="w-full text-left px-3 py-1.5 text-rose-400 hover:bg-rose-500/10"
                              >
                                {t("proj.delete")}
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </nav>

      {/* Footer Status & Machine Info */}
      <div className={`border-t border-slate-800/80 bg-slate-950/40 ${collapsed ? "p-2 flex flex-col items-center gap-2" : "p-3 space-y-2"}`}>
        {!collapsed ? (
          <>
            {/* Real-time Agent Status indicator */}
            <div className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-slate-900/60 border border-slate-800 text-xs">
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
                    shell.agent_ready ? "text-emerald-400" : "text-rose-400"
                  }`}
                >
                  {shell.agent_ready ? "Agent Online" : "Agent Disconnected"}
                </span>
              </div>
              <span className="text-[10px] text-slate-500 font-mono">v{shell.version}</span>
            </div>

            {/* User / Machine details */}
            {me && (
              <div className="px-2 text-xs font-medium text-slate-300 truncate" title={me.email}>
                {me.email}
              </div>
            )}
            <div className="flex items-center justify-between px-2 text-[11px] text-slate-400">
              <div className="truncate flex-1 pr-2" title={shell.machine_name}>
                <span>{shell.machine_name}</span>
                {!shell.native && <span className="text-cyan-400"> · {t("app.browserDev")}</span>}
              </div>
              <button
                onClick={onSettings}
                title={t("app.settings")}
                aria-label={t("app.settings")}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
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
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <SettingsIcon size={16} />
            </button>
          </>
        )}
      </div>
    </aside>
  );
};
