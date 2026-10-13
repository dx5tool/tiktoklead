import React from "react";
import {
  Play,
  Square,
  Share2,
  Upload,
  Trash2,
  FolderInput,
  Network,
  Flame,
  Copy,
  Cookie,
  X,
  Layers,
} from "lucide-react";
import { useI18n } from "../../i18n";
import type { LocalProxy, Profile, Project } from "../../api";

interface SimprintBulkBarProps {
  chosen: Profile[];
  busy: boolean;
  local: boolean;
  projects: Project[];
  proxyList: LocalProxy[] | null;
  profiles: Profile[];
  openMany: () => void;
  onCloseMany: () => void;
  onShare: () => void;
  onUpload: () => void;
  onDeleteMany: () => void;
  onMoveTo: (projectId: string) => void;
  onAssignProxy: (val: string) => void;
  onWarm: () => void;
  onMirror: () => void;
  onClone: (p: Profile) => void;
  onCookies: (p: Profile) => void;
  onClear: () => void;
}

export const SimprintBulkBar: React.FC<SimprintBulkBarProps> = ({
  chosen,
  busy,
  local,
  projects,
  proxyList,
  profiles,
  openMany,
  onCloseMany,
  onShare,
  onUpload,
  onDeleteMany,
  onMoveTo,
  onAssignProxy,
  onWarm,
  onMirror,
  onClone,
  onCookies,
  onClear,
}) => {
  const { t } = useI18n();

  if (chosen.length === 0) return null;

  const openable = chosen.filter((p) => !p.running && p.lock === null && p.permissions.includes("launch"));
  const closable = chosen.filter((p) => p.running);

  const side = chosen.every((p) => p.origin === "local")
    ? "local"
    : chosen.every((p) => p.origin === "team")
      ? "team"
      : null;
  const filable = side ? projects.filter((p) => p.origin === side) : [];

  const proxySide = local ? "local" : "team";
  const canAssignProxy = proxyList && proxyList.length > 0 && chosen.every((p) => p.origin === proxySide);
  const usedProxyIds = new Set(profiles.map((p) => p.proxy?.id).filter(Boolean));
  const freeProxies = proxyList ? proxyList.filter((x) => !usedProxyIds.has(x.id)) : [];

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 max-w-[95vw] animate-in fade-in slide-in-from-bottom-5 duration-200">
      <div className="flex items-center gap-2.5 px-5 py-3 rounded-2xl bg-slate-900/95 border border-slate-700/90 backdrop-blur-2xl shadow-2xl shadow-black/60 text-xs text-slate-200 overflow-x-auto">
        {/* Selected badge */}
        <div className="flex items-center gap-2 pr-3 border-r border-slate-700/80 shrink-0">
          <span className="flex h-2 w-2 rounded-full bg-cyan-400" />
          <span className="font-semibold text-white whitespace-nowrap">
            {t("bar.selected", { n: chosen.length })}
          </span>
        </div>

        {/* Launch Selected */}
        {openable.length > 0 && (
          <button
            disabled={busy}
            onClick={openMany}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-medium text-white bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 shadow-md shadow-cyan-500/20 disabled:opacity-50 transition-all cursor-pointer shrink-0"
          >
            <Play size={13} fill="currentColor" />
            <span>{t("bar.openSelected", { n: openable.length })}</span>
          </button>
        )}

        {/* Close Selected */}
        {closable.length > 0 && (
          <button
            disabled={busy}
            onClick={onCloseMany}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-medium text-rose-300 bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 disabled:opacity-50 transition-all cursor-pointer shrink-0"
          >
            <Square size={13} />
            <span>{t("bar.closeSelected", { n: closable.length })}</span>
          </button>
        )}

        {/* Move to Folder */}
        {filable.length > 0 && (
          <div className="relative shrink-0">
            <select
              value=""
              disabled={busy}
              onChange={(e) => {
                if (e.target.value) onMoveTo(e.target.value);
              }}
              className="pl-7 pr-6 py-1.5 bg-slate-800/90 border border-slate-700 rounded-xl text-slate-200 text-xs focus:outline-none focus:border-cyan-500 cursor-pointer appearance-none"
            >
              <option value="">{t("bar.moveTo")}</option>
              {filable.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
              {side === "local" && <option value={"\u0000none"}>{t("bar.moveOut")}</option>}
            </select>
            <FolderInput size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
        )}

        {/* Assign Proxy */}
        {canAssignProxy && (
          <div className="relative shrink-0">
            <select
              value=""
              disabled={busy}
              onChange={(e) => {
                if (e.target.value) onAssignProxy(e.target.value);
              }}
              className="pl-7 pr-6 py-1.5 bg-slate-800/90 border border-slate-700 rounded-xl text-slate-200 text-xs focus:outline-none focus:border-cyan-500 cursor-pointer appearance-none"
            >
              <option value="">{t("bar.proxyTo")}</option>
              <option value={"\u0000each"} disabled={freeProxies.length < chosen.length}>
                {t("bar.proxyEach", { n: freeProxies.length })}
              </option>
              {proxyList.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name} · {x.last_country ?? x.host}
                </option>
              ))}
              {local && <option value={"\u0000none"}>{t("bar.proxyNone")}</option>}
            </select>
            <Network size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
        )}

        {/* Warm Profiles */}
        {chosen.length >= 1 && local && (
          <button
            disabled={busy}
            onClick={onWarm}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700/80 border border-slate-700 text-amber-300 transition-all cursor-pointer shrink-0"
          >
            <Flame size={13} />
            <span>{t("warm.button", { n: chosen.length })}</span>
          </button>
        )}

        {/* Mirror Sync */}
        {chosen.length >= 2 && local && (
          <button
            disabled={busy}
            onClick={onMirror}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700/80 border border-slate-700 text-cyan-300 transition-all cursor-pointer shrink-0"
          >
            <Layers size={13} />
            <span>{t("mir.start", { n: chosen.length })}</span>
          </button>
        )}

        {/* Share */}
        {!local && chosen.length > 0 && (
          <button
            disabled={busy}
            onClick={onShare}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700/80 border border-slate-700 text-slate-300 hover:text-white transition-all cursor-pointer shrink-0"
          >
            <Share2 size={13} />
            <span>{t("row.share")}</span>
          </button>
        )}

        {/* Send to Team */}
        {!local && chosen.length > 0 && chosen.every((p) => p.origin === "local") && (
          <button
            disabled={busy}
            onClick={onUpload}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700/80 border border-slate-700 text-slate-300 hover:text-white transition-all cursor-pointer shrink-0"
          >
            <Upload size={13} />
            <span>{t("up.send")}</span>
          </button>
        )}

        {/* Single actions: Clone & Cookies */}
        {chosen.length === 1 && (
          <>
            <button
              disabled={busy}
              onClick={() => onClone(chosen[0])}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700/80 border border-slate-700 text-slate-300 hover:text-white transition-all cursor-pointer shrink-0"
            >
              <Copy size={13} />
              <span>{t("bp.clone")}</span>
            </button>
            <button
              disabled={busy}
              onClick={() => onCookies(chosen[0])}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700/80 border border-slate-700 text-slate-300 hover:text-white transition-all cursor-pointer shrink-0"
            >
              <Cookie size={13} />
              <span>{t("ck.cookies")}</span>
            </button>
          </>
        )}

        {/* Delete */}
        <button
          disabled={busy || closable.length > 0}
          onClick={onDeleteMany}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 text-rose-400 transition-all cursor-pointer shrink-0 disabled:opacity-40"
        >
          <Trash2 size={13} />
          <span>{t("bar.deleteSelected", { n: chosen.length })}</span>
        </button>

        {/* Clear selection */}
        <button
          onClick={onClear}
          title={t("bar.clearSelection")}
          className="p-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition-all cursor-pointer shrink-0"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
};
