// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Bogdan Shapovalov and the XChange authors

import React, { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  Home,
  ChevronRight,
  Bell,
  Download,
  Minus,
  Square,
  X,
  PanelLeftClose,
  PanelLeft,
  Layers,
  Network,
  Puzzle,
  Bookmark,
  FolderKanban,
  Bot,
  Users,
  Trash2,
  Folder,
  ShieldCheck,
  Sun,
  Moon,
  Check,
} from "lucide-react";
import { languageNames, useI18n, type Resolved } from "../../i18n";
import { flag } from "../../flag";
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
  bookmarks: Bookmark,
  projects: FolderKanban,
  assistants: Bot,
  users: Users,
  trash: Trash2,
};

/** The country whose flag stands for each language: English by the flag it is
 *  written with here, Portuguese by Brazil, Arabic by Saudi Arabia. */
const LANGUAGE_FLAG: Record<Resolved, string> = {
  en: "GB",
  ru: "RU",
  zh: "CN",
  es: "ES",
  pt: "BR",
  fr: "FR",
  de: "DE",
  tr: "TR",
  ar: "SA",
  hi: "IN",
  ja: "JP",
  ko: "KR",
  id: "ID",
  vi: "VN",
  uk: "UA",
};

/** Vietnamese leads the menu; the rest follow as the interface has always
 *  listed them. */
const LANGUAGES: { code: Resolved; name: string }[] = (
  ["vi", "en", "ru", "zh", "es", "pt", "fr", "de", "tr", "ar", "hi", "ja", "ko", "id", "uk"] as Resolved[]
).map((code) => ({ code, name: languageNames[code].name }));

/** Flags come from the font shipped with the app (theme/flags.css): Windows
 *  ships no flag glyphs, and the window's CSP allows images only from itself. */
const Flag: React.FC<{ code: Resolved }> = ({ code }) => (
  <span className="flag shrink-0" aria-hidden="true">
    {flag(LANGUAGE_FLAG[code])}
  </span>
);

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
  const { t, setLanguage, resolved } = useI18n();
  const [theme, setTheme] = useTheme();
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const langMenuRef = useRef<HTMLDivElement>(null);

  const effectiveTheme =
    theme === "system"
      ? window.matchMedia("(prefers-color-scheme: light)").matches
        ? "light"
        : "dark"
      : theme;

  const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

  // Auto-close the language menu when clicking outside, or on Escape
  useEffect(() => {
    if (!langMenuOpen) return;
    const away = (e: MouseEvent) => {
      if (langMenuRef.current && !langMenuRef.current.contains(e.target as Node)) {
        setLangMenuOpen(false);
      }
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLangMenuOpen(false);
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", escape);
    };
  }, [langMenuOpen]);

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
        : view === "bookmarks"
        ? t("nav.bookmarks")
        : view === "projects"
        ? t("nav.projects")
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
            XChange
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

        {/* Theme toggle: repaints immediately, icon shows the palette in use */}
        <button
          onClick={() => setTheme(effectiveTheme === "dark" ? "light" : "dark")}
          title={effectiveTheme === "dark" ? t("bar.themeToLight") : t("bar.themeToDark")}
          aria-label={effectiveTheme === "dark" ? t("bar.themeToLight") : t("bar.themeToDark")}
          className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200/60 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800/60 transition-colors cursor-pointer !bg-transparent !border-0"
        >
          {effectiveTheme === "dark" ? <Moon size={15} /> : <Sun size={15} />}
        </button>

        {/* Language: the flag of the language in use; the menu picks another */}
        <div className="relative" ref={langMenuRef}>
          <button
            onClick={() => setLangMenuOpen((open) => !open)}
            title={t("set.language")}
            aria-label={t("set.language")}
            aria-haspopup="menu"
            aria-expanded={langMenuOpen}
            className="p-1 rounded-lg flex items-center hover:bg-slate-200/60 dark:hover:bg-slate-800/60 transition-colors cursor-pointer !bg-transparent !border-0"
          >
            <Flag code={resolved} />
          </button>

          {langMenuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-9 w-60 max-h-80 overflow-auto py-1.5 bg-white border border-slate-200 text-slate-800 shadow-xl dark:bg-[#171b26]/98 dark:border-slate-800 dark:text-slate-200 dark:shadow-2xl rounded-xl backdrop-blur-2xl z-50 text-xs"
            >
              {LANGUAGES.map(({ code, name }) => (
                <button
                  key={code}
                  role="menuitem"
                  onClick={() => {
                    setLanguage(code);
                    setLangMenuOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3.5 py-2 text-xs text-left hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer !bg-transparent !border-0 ${
                    resolved === code
                      ? "text-cyan-600 dark:text-cyan-400 font-semibold"
                      : "text-slate-700 dark:text-slate-300"
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <Flag code={code} />
                    <span>{name}</span>
                  </span>
                  {resolved === code && <Check size={13} />}
                </button>
              ))}
            </div>
          )}
        </div>

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
