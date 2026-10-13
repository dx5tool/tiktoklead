import React, { useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  Home,
  ChevronRight,
  ChevronDown,
  Bell,
  Download,
  Minus,
  Square,
  X,
  Grip,
  PanelLeftClose,
  PanelLeft,
  Layers,
  Network,
  Puzzle,
  Bot,
  Users,
  Trash2,
  Folder,
  ShieldCheck,
  Settings,
  LogOut,
  Laptop,
} from "lucide-react";
import { useI18n } from "../../i18n";
import type { Me, Project, Shell } from "../../api";
import type { View } from "../Sidebar";

interface SimprintTitlebarProps {
  view: View;
  activeProject: Project | null;
  me: Me | null;
  shell: Shell;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  onSelectProject: (p: Project | null) => void;
  onView: (v: View) => void;
  onSettings: () => void;
  onSignOut?: () => void;
  onPaletteOpen?: () => void;
  coreDownloadRunning?: boolean;
  updateAvailable?: boolean;
  onDownloadCore?: () => void;
}

const SECTION_ICONS: Record<View, React.ComponentType<{ size?: number; className?: string }>> = {
  profiles: Layers,
  sharedWithMe: Users,
  proxies: Network,
  extensions: Puzzle,
  assistants: Bot,
  users: Users,
  trash: Trash2,
};

export const SimprintTitlebar: React.FC<SimprintTitlebarProps> = ({
  view,
  activeProject,
  me,
  shell,
  sidebarCollapsed,
  onToggleSidebar,
  onSelectProject,
  onView,
  onSettings,
  onSignOut,
  onPaletteOpen,
  coreDownloadRunning,
  updateAvailable,
  onDownloadCore,
}) => {
  const { t } = useI18n();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

  const handleMinimize = async () => {
    if (isTauri) {
      try {
        await getCurrentWindow().minimize();
      } catch {
        /* ignore */
      }
    }
  };

  const handleMaximize = async () => {
    if (isTauri) {
      try {
        await getCurrentWindow().toggleMaximize();
      } catch {
        /* ignore */
      }
    }
  };

  const handleClose = async () => {
    if (isTauri) {
      try {
        await getCurrentWindow().close();
      } catch {
        /* ignore */
      }
    }
  };

  const CurrentIcon = SECTION_ICONS[view] ?? Layers;
  const sectionTitle =
    view === "trash"
      ? t("trash.title")
      : view === "proxies"
        ? t("nav.proxies")
        : view === "extensions"
        ? t("nav.extensions")
        : view === "assistants"
        ? t("nav.assistants")
        : view === "users"
          ? t("nav.users")
          : view === "sharedWithMe"
            ? t("nav.sharedWithMe")
            : t("nav.profiles");

  return (
    <header
      data-tauri-drag-region
      className="h-10 w-full min-h-[40px] flex items-center justify-between px-3 bg-[#0a0e1a]/95 border-b border-slate-800/80 select-none z-50 text-xs backdrop-blur-2xl"
    >
      {/* Left side: Sidebar Toggle + Brand Logo + Breadcrumbs */}
      <div className="flex items-center gap-2">
        {/* Sidebar Expand / Collapse Toggle Button */}
        <button
          onClick={onToggleSidebar}
          title={sidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors cursor-pointer"
        >
          {sidebarCollapsed ? <PanelLeft size={16} /> : <PanelLeftClose size={16} />}
        </button>

        {/* Brand App Icon & Name */}
        <div
          onClick={() => {
            onSelectProject(null);
            onView("profiles");
          }}
          className="flex items-center gap-2 px-1 py-0.5 rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
        >
          <div className="w-5 h-5 rounded-md bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-white shadow-sm shadow-cyan-500/30">
            <ShieldCheck size={13} className="text-white" />
          </div>
          <span className="font-extrabold text-sm tracking-wider bg-gradient-to-r from-white to-slate-200 bg-clip-text text-transparent">
            Fury
          </span>
        </div>

        <div className="h-4 w-px bg-slate-800 mx-1" />

        {/* Breadcrumb Navigation */}
        <nav className="flex items-center gap-1.5 text-slate-400" aria-label="Breadcrumb">
          <button
            onClick={() => {
              onSelectProject(null);
              onView("profiles");
            }}
            title="Home / All Profiles"
            className="p-1 rounded hover:text-white hover:bg-slate-800/60 transition-colors cursor-pointer"
          >
            <Home size={13} />
          </button>

          <ChevronRight size={12} className="text-slate-600 shrink-0" />

          {/* Current Section */}
          <button
            onClick={() => onView(view)}
            className="flex items-center gap-1.5 px-1.5 py-0.5 rounded text-slate-300 hover:text-white hover:bg-slate-800/60 transition-colors font-medium cursor-pointer"
          >
            <CurrentIcon size={13} className="text-cyan-400" />
            <span>{sectionTitle}</span>
          </button>

          {/* Active Folder / Project if chosen */}
          {activeProject && view === "profiles" && (
            <>
              <ChevronRight size={12} className="text-slate-600 shrink-0" />
              <div className="flex items-center gap-1 px-1.5 py-0.5 rounded text-cyan-300 font-semibold bg-cyan-500/10 border border-cyan-500/30">
                <Folder size={12} className="text-cyan-400" />
                <span className="max-w-[140px] truncate">{activeProject.name}</span>
              </div>
            </>
          )}
        </nav>
      </div>

      {/* Middle Drag Area */}
      <div data-tauri-drag-region className="flex-1 h-full cursor-default" />

      {/* Right side: Actions + User Profile + Window Controls */}
      <div className="flex items-center gap-2">
        {/* Core download / update button */}
        {(coreDownloadRunning || updateAvailable || (shell.agent_ready && !shell.core_ready)) && (
          <button
            onClick={onDownloadCore}
            title={coreDownloadRunning ? "Downloading core..." : "Update Available"}
            className="p-1.5 rounded-lg text-cyan-400 hover:bg-cyan-500/15 transition-colors cursor-pointer"
          >
            <Download size={14} className={coreDownloadRunning ? "animate-bounce" : ""} />
          </button>
        )}

        {/* Agent status / Notification Bell */}
        <div
          title={shell.agent_ready ? "Agent Online" : "Agent Disconnected"}
          className="relative p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition-colors cursor-pointer"
        >
          <Bell size={14} />
          <span
            className={`absolute top-1 right-1 h-2 w-2 rounded-full ${
              shell.agent_ready ? "bg-emerald-400" : "bg-rose-500"
            }`}
          />
        </div>

        {/* User Profile Dropdown Pill */}
        <div className="relative">
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="flex items-center gap-2 px-2.5 py-1 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-slate-800 text-slate-200 transition-colors cursor-pointer"
          >
            <div className="w-4 h-4 rounded-full bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-[10px] font-bold text-white shadow-sm">
              {me?.email ? me.email.charAt(0).toUpperCase() : "U"}
            </div>
            <span className="max-w-[120px] truncate text-xs font-medium">
              {me?.email ?? (shell.mode === "local" ? "Local User" : "User")}
            </span>
            <ChevronDown size={12} className="text-slate-500" />
          </button>

          {/* User Menu Popup */}
          {userMenuOpen && (
            <div className="absolute right-0 top-9 w-52 py-2 bg-slate-900/95 border border-slate-700/80 rounded-2xl shadow-2xl backdrop-blur-2xl z-50 text-xs">
              <div className="px-3 py-1.5 border-b border-slate-800/80 mb-1">
                <div className="font-semibold text-slate-200 truncate">{me?.email ?? "Local User"}</div>
                <div className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5">
                  <Laptop size={11} />
                  <span className="truncate">{shell.machine_name}</span>
                </div>
              </div>

              <button
                onClick={() => {
                  setUserMenuOpen(false);
                  onSettings();
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-slate-300 hover:bg-slate-800 hover:text-white transition-colors cursor-pointer"
              >
                <Settings size={13} />
                <span>{t("app.settings")}</span>
              </button>

              {onSignOut && shell.mode !== "local" && (
                <button
                  onClick={() => {
                    setUserMenuOpen(false);
                    onSignOut();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                >
                  <LogOut size={13} />
                  <span>{t("app.signOut")}</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* 6-dot menu icon / Quick Command Palette Launcher */}
        <button
          onClick={onPaletteOpen}
          title="Command Palette (Ctrl+K)"
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors cursor-pointer"
        >
          <Grip size={15} />
        </button>

        {/* Window controls (Minimize, Maximize, Close) */}
        <div className="flex items-center ml-1 border-l border-slate-800/80 pl-1">
          <button
            onClick={handleMinimize}
            title="Minimize"
            className="w-8 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <Minus size={13} />
          </button>
          <button
            onClick={handleMaximize}
            title="Maximize"
            className="w-8 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <Square size={11} />
          </button>
          <button
            onClick={handleClose}
            title="Close"
            className="w-8 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-white hover:bg-rose-600 transition-colors cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    </header>
  );
};
