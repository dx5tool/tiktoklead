import React, { useEffect, useRef, useState } from "react";
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
  Languages,
  Palette,
  Sun,
  Moon,
  Monitor,
  Check,
  Building,
  HardDrive,
  Wifi,
  Fingerprint,
  User,
} from "lucide-react";
import { useI18n } from "../../i18n";
import { useTheme } from "../../theme";
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
  const { t, language, setLanguage } = useI18n();
  const [theme, setTheme] = useTheme();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [activeSubmenu, setActiveSubmenu] = useState<"theme" | "language" | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

  // Auto-close menu when clicking outside
  useEffect(() => {
    if (!userMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
        setActiveSubmenu(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [userMenuOpen]);

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

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.buttons === 1) {
      const target = e.target as HTMLElement;
      if (!target.closest("button") && !target.closest("input") && !target.closest("select")) {
        if (isTauri) {
          try {
            void getCurrentWindow().startDragging();
          } catch {
            /* ignore */
          }
        }
      }
    }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (!target.closest("button") && !target.closest("input") && !target.closest("select")) {
      if (isTauri) {
        try {
          void getCurrentWindow().toggleMaximize();
        } catch {
          /* ignore */
        }
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

  const displayName = me?.email ?? (shell.mode === "local" ? "Local User" : "User");

  return (
    <header
      data-tauri-drag-region
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
      className="h-10 w-full min-h-[40px] flex items-center justify-between pl-3 pr-0 bg-[var(--simprint-header-bg)] border-b border-[var(--simprint-border)] select-none z-50 text-xs backdrop-blur-2xl shrink-0 transition-colors duration-200"
    >
      {/* Left side: Sidebar Toggle + Brand Logo + Breadcrumbs */}
      <div className="flex items-center gap-2">
        {/* Sidebar Expand / Collapse Toggle Button */}
        <button
          onClick={onToggleSidebar}
          title={sidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
          className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200/60 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800/80 transition-colors cursor-pointer !bg-transparent !border-0"
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
          <span className="font-extrabold text-sm tracking-wider text-slate-900 dark:bg-gradient-to-r dark:from-white dark:to-slate-200 dark:bg-clip-text dark:text-transparent">
            Fury
          </span>
        </div>

        <div className="h-4 w-px bg-slate-200 dark:bg-slate-800 mx-1" />

        {/* Breadcrumb Navigation */}
        <nav className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400" aria-label="Breadcrumb">
          <button
            onClick={() => {
              onSelectProject(null);
              onView("profiles");
            }}
            title="Home / All Profiles"
            className="p-1 rounded text-slate-500 hover:text-slate-900 hover:bg-slate-200/60 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800/60 transition-colors cursor-pointer !bg-transparent !border-0"
          >
            <Home size={13} />
          </button>

          <ChevronRight size={12} className="text-slate-400 dark:text-slate-600 shrink-0" />

          {/* Current Section */}
          <button
            onClick={() => onView(view)}
            className="flex items-center gap-1.5 px-1.5 py-0.5 rounded text-slate-700 hover:text-slate-900 hover:bg-slate-200/60 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800/60 transition-colors font-medium cursor-pointer !bg-transparent !border-0"
          >
            <CurrentIcon size={13} className="text-cyan-600 dark:text-cyan-400" />
            <span>{sectionTitle}</span>
          </button>

          {/* Active Folder / Project if chosen */}
          {activeProject && view === "profiles" && (
            <>
              <ChevronRight size={12} className="text-slate-400 dark:text-slate-600 shrink-0" />
              <div className="flex items-center gap-1 px-1.5 py-0.5 rounded text-cyan-700 dark:text-cyan-300 font-semibold bg-cyan-50 dark:bg-cyan-500/10 border border-cyan-200 dark:border-cyan-500/30">
                <Folder size={12} className="text-cyan-600 dark:text-cyan-400" />
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
            className="p-1.5 rounded-lg text-cyan-600 dark:text-cyan-400 hover:bg-cyan-500/15 transition-colors cursor-pointer !bg-transparent !border-0"
          >
            <Download size={14} className={coreDownloadRunning ? "animate-bounce" : ""} />
          </button>
        )}

        {/* Agent status / Notification Bell */}
        <div
          title={shell.agent_ready ? "Agent Online" : "Agent Disconnected"}
          className="relative p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200/60 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800/60 transition-colors cursor-pointer !bg-transparent !border-0"
        >
          <Bell size={14} />
          <span
            className={`absolute top-1 right-1 h-2 w-2 rounded-full ${
              shell.agent_ready ? "bg-emerald-500" : "bg-rose-500"
            }`}
          />
        </div>

        {/* User Profile Dropdown Pill */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => {
              setUserMenuOpen(!userMenuOpen);
              setActiveSubmenu(null);
            }}
            className="flex items-center gap-2 px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-slate-200/80 border border-slate-200 text-slate-800 dark:bg-slate-900/80 dark:hover:bg-slate-800 dark:border-slate-800 dark:text-slate-200 transition-colors cursor-pointer"
          >
            <div className="w-4 h-4 rounded-full bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-[10px] font-bold text-white shadow-sm">
              😊
            </div>
            <span className="max-w-[120px] truncate text-xs font-medium">
              {displayName}
            </span>
            <ChevronDown size={12} className="text-slate-400 dark:text-slate-500" />
          </button>

          {/* User Menu Popup */}
          {userMenuOpen && (
            <div className="absolute right-0 top-10 w-60 py-1.5 bg-white border border-slate-200 text-slate-800 shadow-xl dark:bg-[#171b26]/98 dark:border-slate-800 dark:text-slate-200 dark:shadow-2xl rounded-2xl backdrop-blur-2xl z-50 text-xs">
              {/* Menu Header */}
              <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-800/80">
                <div className="font-semibold text-slate-900 dark:text-slate-100 truncate">{displayName}</div>
                <div className="text-base mt-0.5 select-none">😊</div>
              </div>

              {/* Menu Items */}
              <div className="py-1">
                {/* 1. Account & Security */}
                <button
                  onClick={() => {
                    setUserMenuOpen(false);
                    onSettings();
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2 text-slate-700 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800/70 transition-colors cursor-pointer text-left !bg-transparent !border-0"
                >
                  <User size={15} className="text-slate-400" />
                  <span>Account & Security</span>
                </button>

                {/* 2. General */}
                <button
                  onClick={() => {
                    setUserMenuOpen(false);
                    onSettings();
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2 text-slate-700 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800/70 transition-colors cursor-pointer text-left !bg-transparent !border-0"
                >
                  <Settings size={15} className="text-slate-400" />
                  <span>General</span>
                </button>

                {/* 3. Browser & Automation */}
                <button
                  onClick={() => {
                    setUserMenuOpen(false);
                    onView("assistants");
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2 text-slate-700 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800/70 transition-colors cursor-pointer text-left !bg-transparent !border-0"
                >
                  <Fingerprint size={15} className="text-slate-400" />
                  <span>Browser & Automation</span>
                </button>

                {/* 4. Network & Sync */}
                <button
                  onClick={() => {
                    setUserMenuOpen(false);
                    onView("proxies");
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2 text-slate-700 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800/70 transition-colors cursor-pointer text-left !bg-transparent !border-0"
                >
                  <Wifi size={15} className="text-slate-400" />
                  <span>Network & Sync</span>
                </button>

                {/* 5. Storage & Update */}
                <button
                  onClick={() => {
                    setUserMenuOpen(false);
                    onDownloadCore?.();
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2 text-slate-700 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800/70 transition-colors cursor-pointer text-left !bg-transparent !border-0"
                >
                  <HardDrive size={15} className="text-slate-400" />
                  <span>Storage & Update</span>
                </button>

                {/* 6. Workspace */}
                <button
                  onClick={() => {
                    setUserMenuOpen(false);
                    onSelectProject(null);
                    onView("profiles");
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2 text-slate-700 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800/70 transition-colors cursor-pointer text-left !bg-transparent !border-0"
                >
                  <Building size={15} className="text-slate-400" />
                  <span>Workspace</span>
                </button>

                {/* 7. Team */}
                <button
                  onClick={() => {
                    setUserMenuOpen(false);
                    onView("users");
                  }}
                  className="w-full flex items-center justify-between px-4 py-2 text-slate-700 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800/70 transition-colors cursor-pointer text-left !bg-transparent !border-0"
                >
                  <div className="flex items-center gap-3">
                    <Users size={15} className="text-slate-400" />
                    <span>Team</span>
                  </div>
                  <ChevronRight size={13} className="text-slate-400 dark:text-slate-500" />
                </button>

                {/* 8. Language Submenu */}
                <div
                  className="relative"
                  onMouseEnter={() => setActiveSubmenu("language")}
                >
                  <button
                    onClick={() => setActiveSubmenu(activeSubmenu === "language" ? null : "language")}
                    className={`w-full flex items-center justify-between px-4 py-2 transition-colors cursor-pointer text-left !bg-transparent !border-0 ${
                      activeSubmenu === "language"
                        ? "bg-slate-100 dark:bg-slate-800 text-cyan-600 dark:text-cyan-400 font-medium"
                        : "text-slate-700 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800/70"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Languages size={15} className={activeSubmenu === "language" ? "text-cyan-600 dark:text-cyan-400" : "text-slate-400"} />
                      <span>Language</span>
                    </div>
                    <ChevronRight size={13} className="text-slate-400 dark:text-slate-500" />
                  </button>

                  {activeSubmenu === "language" && (
                    <div className="absolute right-full top-0 mr-1.5 w-36 py-1.5 bg-white border border-slate-200 text-slate-800 shadow-xl dark:bg-[#171b26]/98 dark:border-slate-800 dark:text-slate-200 dark:shadow-2xl rounded-xl backdrop-blur-2xl z-50">
                      <button
                        onClick={() => {
                          setLanguage("en");
                          setUserMenuOpen(false);
                          setActiveSubmenu(null);
                        }}
                        className={`w-full flex items-center justify-between px-3.5 py-2 text-xs text-left hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer !bg-transparent !border-0 ${
                          language === "en" ? "text-cyan-600 dark:text-cyan-400 font-semibold" : "text-slate-700 dark:text-slate-300"
                        }`}
                      >
                        <span>English</span>
                        {language === "en" && <Check size={13} />}
                      </button>
                      <button
                        onClick={() => {
                          setLanguage("ru");
                          setUserMenuOpen(false);
                          setActiveSubmenu(null);
                        }}
                        className={`w-full flex items-center justify-between px-3.5 py-2 text-xs text-left hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer !bg-transparent !border-0 ${
                          language === "ru" ? "text-cyan-600 dark:text-cyan-400 font-semibold" : "text-slate-700 dark:text-slate-300"
                        }`}
                      >
                        <span>Русский</span>
                        {language === "ru" && <Check size={13} />}
                      </button>
                      <button
                        onClick={() => {
                          setLanguage("system");
                          setUserMenuOpen(false);
                          setActiveSubmenu(null);
                        }}
                        className={`w-full flex items-center justify-between px-3.5 py-2 text-xs text-left hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer !bg-transparent !border-0 ${
                          language === "system" ? "text-cyan-600 dark:text-cyan-400 font-semibold" : "text-slate-700 dark:text-slate-300"
                        }`}
                      >
                        <span>System</span>
                        {language === "system" && <Check size={13} />}
                      </button>
                    </div>
                  )}
                </div>

                {/* 9. Theme Submenu */}
                <div
                  className="relative"
                  onMouseEnter={() => setActiveSubmenu("theme")}
                >
                  <button
                    onClick={() => setActiveSubmenu(activeSubmenu === "theme" ? null : "theme")}
                    className={`w-full flex items-center justify-between px-4 py-2 transition-colors cursor-pointer text-left !bg-transparent !border-0 ${
                      activeSubmenu === "theme"
                        ? "bg-blue-50 text-blue-700 dark:bg-blue-600/35 dark:text-blue-300 font-medium"
                        : "text-slate-700 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800/70"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Palette size={15} className={activeSubmenu === "theme" ? "text-blue-600 dark:text-blue-400" : "text-slate-400"} />
                      <span>Theme</span>
                    </div>
                    <ChevronRight size={13} className="text-slate-400 dark:text-slate-500" />
                  </button>

                  {activeSubmenu === "theme" && (
                    <div className="absolute right-full top-0 mr-1.5 w-36 py-1.5 bg-white border border-slate-200 text-slate-800 shadow-xl dark:bg-[#171b26]/98 dark:border-slate-800 dark:text-slate-200 dark:shadow-2xl rounded-xl backdrop-blur-2xl z-50">
                      <button
                        onClick={() => {
                          setTheme("light");
                          setUserMenuOpen(false);
                          setActiveSubmenu(null);
                        }}
                        className={`w-full flex items-center justify-between px-3.5 py-2 text-xs text-left hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer !bg-transparent !border-0 ${
                          theme === "light" ? "text-cyan-600 dark:text-cyan-400 font-semibold" : "text-slate-700 dark:text-slate-300"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Sun size={14} />
                          <span>Light</span>
                        </div>
                        {theme === "light" && <Check size={13} />}
                      </button>
                      <button
                        onClick={() => {
                          setTheme("dark");
                          setUserMenuOpen(false);
                          setActiveSubmenu(null);
                        }}
                        className={`w-full flex items-center justify-between px-3.5 py-2 text-xs text-left hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer !bg-transparent !border-0 ${
                          theme === "dark" ? "text-cyan-600 dark:text-cyan-400 font-semibold" : "text-slate-700 dark:text-slate-300"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Moon size={14} className={theme === "dark" ? "text-cyan-600 dark:text-cyan-400" : ""} />
                          <span>Dark</span>
                        </div>
                        {theme === "dark" && <Check size={13} />}
                      </button>
                      <button
                        onClick={() => {
                          setTheme("system");
                          setUserMenuOpen(false);
                          setActiveSubmenu(null);
                        }}
                        className={`w-full flex items-center justify-between px-3.5 py-2 text-xs text-left hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer !bg-transparent !border-0 ${
                          theme === "system" ? "text-cyan-600 dark:text-cyan-400 font-semibold" : "text-slate-700 dark:text-slate-300"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Monitor size={14} />
                          <span>System</span>
                        </div>
                        {theme === "system" && <Check size={13} />}
                      </button>
                    </div>
                  )}
                </div>

                {/* Divider */}
                <div className="my-1.5 border-t border-slate-100 dark:border-slate-800/80" />

                {/* 10. Switch User / Sign Out */}
                <button
                  onClick={() => {
                    setUserMenuOpen(false);
                    if (onSignOut && shell.mode !== "local") {
                      onSignOut();
                    } else {
                      onSettings();
                    }
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors text-xs text-left cursor-pointer !bg-transparent !border-0"
                >
                  <LogOut size={15} />
                  <span>Switch User</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 6-dot menu icon / Quick Command Palette Launcher */}
        <button
          onClick={onPaletteOpen}
          title="Command Palette (Ctrl+K)"
          className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200/60 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800/60 transition-colors cursor-pointer !bg-transparent !border-0"
        >
          <Grip size={15} />
        </button>

        {/* Window controls (Minimize, Maximize, Close) */}
        <div className="flex items-center h-10 ml-2 border-l border-slate-200 dark:border-slate-800/80">
          <button
            onClick={handleMinimize}
            title="Minimize"
            className="w-12 h-10 flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-200/70 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800 transition-colors cursor-pointer !bg-transparent !border-0"
          >
            <Minus size={15} />
          </button>
          <button
            onClick={handleMaximize}
            title="Maximize"
            className="w-12 h-10 flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-200/70 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800 transition-colors cursor-pointer !bg-transparent !border-0"
          >
            <Square size={13} />
          </button>
          <button
            onClick={handleClose}
            title="Close"
            className="w-12 h-10 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-white hover:bg-rose-600 active:bg-rose-700 transition-colors cursor-pointer !bg-transparent !border-0"
          >
            <X size={15} />
          </button>
        </div>
      </div>
    </header>
  );
};
