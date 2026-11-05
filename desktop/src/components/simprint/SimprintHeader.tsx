import React, { useEffect, useRef, useState } from "react";
import {
  Search,
  List,
  LayoutGrid,
  RotateCw,
  FileSpreadsheet,
  Download,
  Layers,
  Filter,
} from "lucide-react";
import { useI18n } from "../../i18n";
import { SimprintBadge } from "./SimprintBadge";
import { isSuggested } from "../../status";

interface SimprintHeaderProps {
  title: string;
  totalCount: number;
  runningCount: number;
  viewMode: "table" | "grid";
  onViewModeChange: (mode: "table" | "grid") => void;
  query: string;
  onQueryChange: (query: string) => void;
  tags: string[];
  selectedTag: string;
  onTagChange: (tag: string) => void;
  stages: string[];
  selectedStage: string;
  onStageChange: (stage: string) => void;
  openOnly: boolean;
  onOpenOnlyChange: (openOnly: boolean) => void;
  importsHere: boolean;
  onOpenBulk: () => void;
  onOpenCsv: () => void;
  onOpenGologin: () => void;
  onRefresh: () => void;
  stageCounts?: Record<string, number>;
}

export const SimprintHeader: React.FC<SimprintHeaderProps> = ({
  title,
  totalCount,
  runningCount,
  viewMode,
  onViewModeChange,
  query,
  onQueryChange,
  tags,
  selectedTag,
  onTagChange,
  stages,
  selectedStage,
  onStageChange,
  openOnly,
  onOpenOnlyChange,
  importsHere,
  onOpenBulk,
  onOpenCsv,
  onOpenGologin,
  onRefresh,
  stageCounts = {},
}) => {
  const { t } = useI18n();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

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
            Total: {totalCount}
          </SimprintBadge>
          {runningCount > 0 && (
            <SimprintBadge variant="emerald" dot pulse>
              Running: {runningCount}
            </SimprintBadge>
          )}
        </div>

        {/* View switcher: Segmented Table / Grid */}
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
      </div>

      {/* Bottom row: Search input, Filters, Actions */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2.5 flex-1 min-w-[280px] max-w-md">
          {/* Quick Search with Ctrl+K */}
          <div className="relative flex-1">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none"
            />
            <input
              ref={searchInputRef}
              type="text"
              placeholder={t("bar.search")}
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              className="w-full pl-9 pr-14 py-1.5 bg-white border border-slate-300 text-slate-900 placeholder-slate-400 focus:border-cyan-600 dark:bg-slate-900/80 dark:border-slate-800 dark:text-slate-200 dark:placeholder-slate-500 dark:focus:border-cyan-500 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-cyan-500/40 transition-colors"
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center">
              <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-slate-100 text-slate-500 border border-slate-200 dark:bg-slate-800/80 dark:text-slate-400 dark:border-slate-700/60 rounded">
                Ctrl K
              </kbd>
            </div>
          </div>
        </div>

        {/* Filters and Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Tag Filter */}
          {tags.length > 0 && (
            <div className="relative">
              <select
                value={selectedTag}
                onChange={(e) => onTagChange(e.target.value)}
                className="pl-2.5 pr-7 py-1.5 bg-white border border-slate-300 text-slate-800 dark:bg-slate-900/80 dark:border-slate-800 dark:text-slate-300 rounded-xl text-xs focus:outline-none focus:border-cyan-500 transition-colors cursor-pointer appearance-none shadow-xs"
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

          {/* Stage Filter */}
          {stages.length > 0 && (
            <div className="relative">
              <select
                value={selectedStage}
                onChange={(e) => onStageChange(e.target.value)}
                className="pl-2.5 pr-7 py-1.5 bg-white border border-slate-300 text-slate-800 dark:bg-slate-900/80 dark:border-slate-800 dark:text-slate-300 rounded-xl text-xs focus:outline-none focus:border-cyan-500 transition-colors cursor-pointer appearance-none shadow-xs"
              >
                <option value="">{t("bar.allStages")}</option>
                <option value={"\u0000none"}>{t("bar.noStage")}</option>
                {stages.map((st) => (
                  <option key={st} value={st}>
                    {isSuggested(st) ? t(`status.${st}` as never) : st} ({stageCounts[st] ?? 0})
                  </option>
                ))}
              </select>
              <Filter
                size={12}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none"
              />
            </div>
          )}

          {/* Open Only checkbox */}
          <label className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-100 border border-slate-300 text-slate-700 dark:bg-slate-900/60 dark:border-slate-800 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white cursor-pointer select-none text-xs">
            <input
              type="checkbox"
              checked={openOnly}
              onChange={(e) => onOpenOnlyChange(e.target.checked)}
              className="rounded border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-cyan-600 dark:text-cyan-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
            />
            <span>{t("bar.openOnly", { n: runningCount })}</span>
          </label>

          {/* Bulk Creator button */}
          <button
            onClick={onOpenBulk}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 hover:text-slate-900 dark:bg-slate-900/90 dark:hover:bg-slate-800 dark:border-slate-700/80 dark:text-slate-200 dark:hover:text-white text-xs font-medium transition-all cursor-pointer shadow-xs"
          >
            <Layers size={14} className="text-cyan-600 dark:text-cyan-400" />
            <span>{t("bp.button")}</span>
          </button>

          {/* CSV Import */}
          {importsHere && (
            <button
              onClick={onOpenCsv}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 hover:text-slate-900 dark:bg-slate-900/90 dark:hover:bg-slate-800 dark:border-slate-700/80 dark:text-slate-200 dark:hover:text-white text-xs font-medium transition-all cursor-pointer shadow-xs"
            >
              <FileSpreadsheet size={14} className="text-emerald-600 dark:text-emerald-400" />
              <span>{t("csv.button")}</span>
            </button>
          )}

          {/* GoLogin Import */}
          {importsHere && (
            <button
              onClick={onOpenGologin}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 hover:text-slate-900 dark:bg-slate-900/90 dark:hover:bg-slate-800 dark:border-slate-700/80 dark:text-slate-200 dark:hover:text-white text-xs font-medium transition-all cursor-pointer shadow-xs"
            >
              <Download size={14} className="text-sky-600 dark:text-sky-400" />
              <span>{t("gl.button")}</span>
            </button>
          )}

          {/* Refresh button */}
          <button
            onClick={handleRefresh}
            title={t("bar.refresh")}
            className="p-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-300 text-slate-600 hover:text-slate-900 dark:bg-slate-900/90 dark:hover:bg-slate-800 dark:border-slate-800 dark:text-slate-400 dark:hover:text-white transition-all cursor-pointer shadow-xs"
          >
            <RotateCw size={14} className={isRefreshing ? "animate-spin text-cyan-600 dark:text-cyan-400" : ""} />
          </button>
        </div>
      </div>
    </header>
  );
};
