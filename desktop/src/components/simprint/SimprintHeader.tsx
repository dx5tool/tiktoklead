// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Bogdan Shapovalov and the XChange authors

import React, { useEffect, useRef, useState } from "react";
import {
  Search,
  List,
  LayoutGrid,
  RotateCw,
  Users,
  CopyPlus,
  Filter,
  Folder,
  Plus,
  X,
  ArrowUpDown,
  ChevronDown,
  UserPlus,
  FolderInput,
  MousePointerClick,
  Paintbrush,
} from "lucide-react";
import type { Project } from "../../api";
import { useI18n } from "../../i18n";
import { SimprintBadge } from "./SimprintBadge";
import { SHOW_VIEW_TOGGLE, type ProfileSort } from "./utils";

interface SimprintHeaderProps {
  title: string;
  totalCount: number;
  runningCount: number;
  viewMode: "table" | "grid";
  onViewModeChange: (mode: "table" | "grid") => void;
  /** How a row is picked: a click, or a press-and-drag across rows. The switch
   *  is drawn only where a caller can change it. */
  selectMode?: "click" | "drag";
  onSelectModeChange?: (mode: "click" | "drag") => void;
  query: string;
  onQueryChange: (query: string) => void;
  tags: string[];
  selectedTag: string;
  onTagChange: (tag: string) => void;
  projects?: Project[];
  selectedProject?: string;
  onProjectChange?: (projectId: string) => void;
  projectCounts?: Record<string, number>;
  noProjectCount?: number;
  sort: ProfileSort;
  onSortChange: (sort: ProfileSort) => void;
  openOnly: boolean;
  onOpenOnlyChange: (openOnly: boolean) => void;
  onNewProfile?: () => void;
  onOpenBulk: () => void;
  onImportProfiles: () => void;
  onImportAccounts: () => void;
  onRefresh: () => void;
}

export const SimprintHeader: React.FC<SimprintHeaderProps> = ({
  title,
  totalCount,
  runningCount,
  viewMode,
  onViewModeChange,
  selectMode = "click",
  onSelectModeChange,
  query,
  onQueryChange,
  tags,
  selectedTag,
  onTagChange,
  projects,
  selectedProject,
  onProjectChange,
  projectCounts = {},
  noProjectCount,
  sort,
  onSortChange,
  openOnly,
  onOpenOnlyChange,
  onNewProfile,
  onOpenBulk,
  onImportProfiles,
  onImportAccounts,
  onRefresh,
}) => {
  const { t } = useI18n();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [bulkMenu, setBulkMenu] = useState(false);
  const bulkMenuRef = useRef<HTMLDivElement>(null);
  const bulkButtonRef = useRef<HTMLButtonElement>(null);

  // Global Ctrl+K / Cmd+K shortcut listener to focus search input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // The Bulk create menu is anchored to its button; anything that moves the
  // anchor or takes the press elsewhere closes it.
  useEffect(() => {
    if (!bulkMenu) return;
    const away = (e: MouseEvent) => {
      const target = e.target as Node;
      if (bulkMenuRef.current?.contains(target)) return;
      if (bulkButtonRef.current?.contains(target)) return;
      setBulkMenu(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setBulkMenu(false);
    };
    const close = () => setBulkMenu(false);
    window.addEventListener("mousedown", away);
    window.addEventListener("keydown", escape);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("mousedown", away);
      window.removeEventListener("keydown", escape);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [bulkMenu]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  return (
    <header className="flex flex-col gap-3 px-6 py-3.5 border-b border-[var(--simprint-border)] bg-[var(--simprint-header-bg)] backdrop-blur-xl select-none z-10 transition-colors duration-200">
      {/* Top row: Title, Badges, View Toggle */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">{title}</h1>
          <SimprintBadge variant="slate" title={t("app.profileCount", { n: totalCount })}>
            {t("pager.total")}: {totalCount}
          </SimprintBadge>
          {runningCount > 0 && (
            <SimprintBadge variant="emerald" dot pulse>
              Running: {runningCount}
            </SimprintBadge>
          )}
        </div>

        {/* View switcher: Segmented Table / Grid */}
        {SHOW_VIEW_TOGGLE && (
          <div className="flex items-center bg-slate-100 border border-slate-200 dark:bg-slate-900/80 dark:border-slate-800 rounded-xl p-0.5">
            <button
              onClick={() => onViewModeChange("table")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                viewMode === "table"
                  ? "bg-white text-cyan-700 border border-slate-300 shadow-xs dark:bg-cyan-500/20 dark:text-cyan-300 dark:border-cyan-500/40"
                  : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white !bg-transparent !border-0"
              }`}
              title="Table View"
            >
              <List size={15} />
              <span>Table</span>
            </button>
            <button
              onClick={() => onViewModeChange("grid")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                viewMode === "grid"
                  ? "bg-white text-cyan-700 border border-slate-300 shadow-xs dark:bg-cyan-500/20 dark:text-cyan-300 dark:border-cyan-500/40"
                  : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white !bg-transparent !border-0"
              }`}
              title="Grid Cards View"
            >
              <LayoutGrid size={15} />
              <span>Grid</span>
            </button>
          </div>
        )}
      </div>

      {/* Bottom row: actions and filters on the left, search and refresh on the right */}
      <div className="flex items-center justify-between flex-wrap gap-2.5">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          {/* New profile */}
          {onNewProfile && (
            <button
              onClick={onNewProfile}
              className="primary flex items-center justify-center gap-2 text-xs font-semibold cursor-pointer"
              style={{ padding: "8px 20px", minWidth: 152 }}
            >
              <Plus size={16} className="stroke-[2.5]" />
              <span>{t("bar.newProfile")}</span>
            </button>
          )}

          {/* Bulk create: several profiles at once, or a pasted account list. */}
          <div className="relative">
            <button
              ref={bulkButtonRef}
              type="button"
              onClick={() => setBulkMenu((open) => !open)}
              aria-haspopup="menu"
              aria-expanded={bulkMenu}
              data-menu-trigger
              className="simprint-toolbar-btn flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer shadow-xs"
            >
              <Users size={14} style={{ color: "var(--simprint-cyan)" }} />
              <span>{t("bar.bulkCreate")}</span>
              <ChevronDown
                size={12}
                style={{
                  color: "var(--simprint-text-dim)",
                  transform: bulkMenu ? "rotate(180deg)" : undefined,
                  transition: "transform 150ms",
                }}
              />
            </button>

            {bulkMenu && (
              <div ref={bulkMenuRef} className="simprint-menu" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setBulkMenu(false);
                    onOpenBulk();
                  }}
                >
                  <CopyPlus size={13} style={{ color: "var(--simprint-cyan)" }} />
                  <span>{t("bp.title")}</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setBulkMenu(false);
                    onImportProfiles();
                  }}
                >
                  <FolderInput size={13} style={{ color: "var(--simprint-cyan)" }} />
                  <span>{t("bar.importProfiles")}</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setBulkMenu(false);
                    onImportAccounts();
                  }}
                >
                  <UserPlus size={13} style={{ color: "var(--simprint-cyan)" }} />
                  <span>{t("bar.importAccount")}</span>
                </button>
              </div>
            )}
          </div>

          {/* Filters: kept apart from the create actions */}
          <div className="flex items-center gap-2 flex-wrap ml-2 pl-3 border-l border-slate-200 dark:border-slate-800">
          {/* Project Filter */}
          {projects && projects.length > 0 && onProjectChange && (
            <div className="relative">
              <select
                value={selectedProject || ""}
                onChange={(e) => onProjectChange(e.target.value)}
                className="pl-2.5 pr-7 bg-white border border-slate-300 text-slate-800 dark:bg-slate-900/80 dark:border-slate-800 dark:text-slate-300 rounded-xl text-xs focus:outline-none focus:border-cyan-500 transition-colors cursor-pointer appearance-none shadow-xs"
                style={{ height: 32, paddingTop: 0, paddingBottom: 0, paddingRight: 28 }}
              >
                <option value="">{t("bar.allProjects")}</option>
                <option value={"\u0000none"}>
                  {t("col.noProject")} {noProjectCount !== undefined ? `(${noProjectCount})` : ""}
                </option>
                {projects.map((proj) => (
                  <option key={proj.id} value={proj.id}>
                    {proj.name} {projectCounts[proj.id] !== undefined ? `(${projectCounts[proj.id]})` : `(${proj.profile_count})`}
                  </option>
                ))}
              </select>
              <Folder
                size={12}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none"
              />
            </div>
          )}

          {/* Tag Filter */}
          {tags.length > 0 && (
            <div className="relative">
              <select
                value={selectedTag}
                onChange={(e) => onTagChange(e.target.value)}
                className="pl-2.5 pr-7 bg-white border border-slate-300 text-slate-800 dark:bg-slate-900/80 dark:border-slate-800 dark:text-slate-300 rounded-xl text-xs focus:outline-none focus:border-cyan-500 transition-colors cursor-pointer appearance-none shadow-xs"
                style={{ height: 32, paddingTop: 0, paddingBottom: 0, paddingRight: 28 }}
              >
                <option value="">{t("bar.allTags")}</option>
                <option value={"\u0000none"}>{t("bar.untagged")}</option>
                {tags.map((tg) => (
                  <option key={tg} value={tg}>
                    #{tg}
                  </option>
                ))}
              </select>
              <Filter
                size={12}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none"
              />
            </div>
          )}

          {/* Sort */}
          <div className="relative">
            <select
              value={sort}
              onChange={(e) => onSortChange(e.target.value as ProfileSort)}
              aria-label={t("sort.label")}
              className="pl-2.5 pr-7 bg-white border border-slate-300 text-slate-800 dark:bg-slate-900/80 dark:border-slate-800 dark:text-slate-300 rounded-xl text-xs focus:outline-none focus:border-cyan-500 transition-colors cursor-pointer appearance-none shadow-xs"
              style={{ height: 32, paddingTop: 0, paddingBottom: 0, paddingRight: 28 }}
            >
              <option value="created_desc">{t("sort.createdDesc")}</option>
              <option value="created_asc">{t("sort.createdAsc")}</option>
              <option value="name_asc">{t("sort.nameAsc")}</option>
              <option value="name_desc">{t("sort.nameDesc")}</option>
              <option value="recent">{t("sort.recent")}</option>
            </select>
            <ArrowUpDown
              size={12}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none"
            />
          </div>

          {/* Open Only checkbox */}
          <label className="flex items-center gap-1.5 px-3 h-8 rounded-xl bg-slate-100 border border-slate-300 text-slate-700 dark:bg-slate-900/60 dark:border-slate-800 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white cursor-pointer select-none text-xs shrink-0 whitespace-nowrap">
            <input
              type="checkbox"
              checked={openOnly}
              onChange={(e) => onOpenOnlyChange(e.target.checked)}
              className="shrink-0 rounded border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-cyan-600 dark:text-cyan-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
              style={{ width: 14, height: 14, padding: 0 }}
            />
            <span>{t("bar.openOnly", { n: runningCount })}</span>
          </label>

          {/* Clear all filters */}
          <button
            type="button"
            onClick={() => {
              onQueryChange("");
              onTagChange("");
              onProjectChange?.("");
              onOpenOnlyChange(false);
            }}
            title={t("bar.clearFilters")}
            aria-label={t("bar.clearFilters")}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-rose-50 dark:hover:bg-rose-500/10 cursor-pointer transition-colors shadow-xs"
            style={{ padding: 0, color: "var(--simprint-rose)" }}
          >
            <X size={18} />
          </button>
          </div>
        </div>

        <div className="flex items-center gap-2 ml-auto shrink-0">
          {/* How rows are picked: one click, or a press-and-drag paint */}
          {onSelectModeChange && (
            <button
              type="button"
              onClick={() => onSelectModeChange(selectMode === "drag" ? "click" : "drag")}
              aria-pressed={selectMode === "drag"}
              title={selectMode === "drag" ? t("sel.dragHint") : t("sel.clickHint")}
              className={`flex items-center gap-1.5 px-3 h-8 rounded-xl border text-xs font-medium cursor-pointer select-none whitespace-nowrap transition-all shadow-xs ${
                selectMode === "drag"
                  ? "bg-cyan-50 border-cyan-300 text-cyan-700 dark:bg-cyan-500/15 dark:border-cyan-500/40 dark:text-cyan-300"
                  : "bg-white border-slate-300 text-slate-600 hover:text-slate-900 dark:bg-slate-900/80 dark:border-slate-800 dark:text-slate-300 dark:hover:text-white"
              }`}
            >
              {selectMode === "drag" ? <Paintbrush size={14} /> : <MousePointerClick size={14} />}
              <span>{selectMode === "drag" ? t("sel.drag") : t("sel.click")}</span>
            </button>
          )}

          {/* Quick Search with Ctrl+K */}
          <div className="relative w-44">
            <Search
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none"
            />
            <input
              ref={searchInputRef}
              type="text"
              placeholder={t("bar.searchShort")}
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              className="w-full bg-white border border-slate-300 text-slate-900 placeholder-slate-400 focus:border-cyan-600 dark:bg-slate-900/80 dark:border-slate-800 dark:text-slate-200 dark:placeholder-slate-500 dark:focus:border-cyan-500 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-cyan-500/40 transition-colors"
              style={{ paddingLeft: 34, paddingRight: 10 }}
            />
          </div>

          {/* Refresh button */}
          <button
            onClick={handleRefresh}
            title={t("bar.refresh")}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-white hover:bg-slate-50 border border-slate-300 text-slate-600 hover:text-slate-900 dark:bg-slate-900/90 dark:hover:bg-slate-800 dark:border-slate-800 dark:text-slate-400 dark:hover:text-white transition-all cursor-pointer shadow-xs"
            style={{ padding: 0, borderRadius: "9999px" }}
          >
            <RotateCw size={18} className={isRefreshing ? "animate-spin text-cyan-600 dark:text-cyan-400" : ""} />
          </button>
        </div>
      </div>
    </header>
  );
};
