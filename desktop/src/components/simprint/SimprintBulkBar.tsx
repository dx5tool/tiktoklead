// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Bogdan Shapovalov and the XChange authors

import React, { useEffect, useRef, useState } from "react";
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
  Wrench,
  ChevronDown,
  Eraser,
  FileDown,
  FolderDown,
  Globe,
} from "lucide-react";
import { useI18n } from "../../i18n";
import type { LocalProxy, Profile, Project } from "../../api";
import { maskApiKey, providerForProxy } from "../../providerProxy";

interface SimprintBulkBarProps {
  chosen: Profile[];
  busy: boolean;
  local: boolean;
  raised?: boolean;
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
  onClearCache: () => void;
  onExportCookies: () => void;
  onExportProfiles: () => void;
  onChangeStartUrls: () => void;
}

export const SimprintBulkBar: React.FC<SimprintBulkBarProps> = ({
  chosen,
  busy,
  local,
  raised,
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
  onClearCache,
  onExportCookies,
  onExportProfiles,
  onChangeStartUrls,
}) => {
  const { t } = useI18n();
  const [toolsOpen, setToolsOpen] = useState(false);
  const toolsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!toolsOpen) return;
    const away = (e: MouseEvent) => {
      if (toolsRef.current?.contains(e.target as Node)) return;
      setToolsOpen(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setToolsOpen(false);
    };
    const onResize = () => setToolsOpen(false);
    window.addEventListener("mousedown", away);
    window.addEventListener("keydown", escape);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("mousedown", away);
      window.removeEventListener("keydown", escape);
      window.removeEventListener("resize", onResize);
    };
  }, [toolsOpen]);
  /** Warm-up is temporarily hidden from this bar; its action is still wired
   *  in App. Flip back to true to show the button again. */
  const SHOW_WARM = false;
  /** Mirror sync is temporarily hidden; its action is still wired in App. */
  const SHOW_MIRROR = false;

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
    <div
      className="absolute bottom-6 left-[var(--s-5)] right-[var(--s-5)] z-40 flex justify-start pointer-events-none animate-in fade-in slide-in-from-bottom-5 duration-200"
      style={raised ? { bottom: "calc(var(--s-5) + var(--simprint-pager-h) + 8px)" } : undefined}
    >
      <div className="simprint-bulk-bar pointer-events-auto flex flex-wrap items-center justify-start gap-2.5 px-5 py-3 text-xs max-w-full">
        {/* Clear selection — outermost on the left */}
        <button
          onClick={onClear}
          title={t("bar.clearSelection")}
          className="simprint-bulk-icon transition-all cursor-pointer shrink-0"
        >
          <X size={14} />
        </button>

        {/* Selected badge */}
        <div className="flex items-center gap-2 pr-3 border-r border-[var(--simprint-border)] shrink-0">
          <span className="flex h-2 w-2 rounded-full bg-cyan-500" />
          <span className="font-semibold text-[var(--simprint-text)] whitespace-nowrap">
            {t("bar.selected", { n: chosen.length })}
          </span>
        </div>

        {/* Launch Selected */}
        {openable.length > 0 && (
          <button
            disabled={busy}
            onClick={openMany}
            className="primary flex items-center gap-1.5 px-3 py-1.5 font-medium disabled:opacity-50 transition-all cursor-pointer shrink-0"
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
            className="simprint-bulk-danger flex items-center gap-1.5 font-medium disabled:opacity-50 transition-all cursor-pointer shrink-0"
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
              className="simprint-bulk-select text-xs focus:outline-none cursor-pointer appearance-none"
            >
              <option value="">{t("bar.moveTo")}</option>
              {filable.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
              {side === "local" && <option value={"\u0000none"}>{t("bar.moveOut")}</option>}
            </select>
            <FolderInput size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--simprint-text-dim)] pointer-events-none" />
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
              className="simprint-bulk-select text-xs focus:outline-none cursor-pointer appearance-none"
            >
              <option value="">{t("bar.proxyTo")}</option>
              <option value={"\u0000each"} disabled={freeProxies.length < chosen.length}>
                {t("bar.proxyEach", { n: freeProxies.length })}
              </option>
              {proxyList.map((x) => {
                const provider = providerForProxy(x.id);
                if (provider) {
                  // The label alone repeats across a provider's rows; the
                  // masked key is what tells two of them apart.
                  const label = x.name.trim() || provider.name.trim() || provider.provider;
                  const parts = [label, x.last_country, maskApiKey(provider.api_key)].filter(Boolean);
                  return (
                    <option key={x.id} value={x.id}>
                      {parts.join(" · ")}
                    </option>
                  );
                }
                return (
                  <option key={x.id} value={x.id}>
                    {x.name} · {x.last_country ?? x.host}
                  </option>
                );
              })}
              {local && <option value={"\u0000none"}>{t("bar.proxyNone")}</option>}
            </select>
            <Network size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--simprint-text-dim)] pointer-events-none" />
          </div>
        )}

        {/* Tools — the batch actions that would otherwise crowd the bar. */}
        <div ref={toolsRef} className="relative shrink-0">
          <button
            type="button"
            disabled={busy}
            aria-haspopup="menu"
            aria-expanded={toolsOpen}
            title={t("bar.tools")}
            onClick={() => setToolsOpen((v) => !v)}
            className={`${toolsOpen ? "simprint-bulk-info" : "simprint-bulk-btn"} flex items-center gap-1.5 transition-all cursor-pointer shrink-0 disabled:opacity-50`}
          >
            <Wrench size={13} />
            <span>{t("bar.tools")}</span>
            <ChevronDown size={12} className={`transition-transform ${toolsOpen ? "rotate-180" : ""}`} />
          </button>

          {toolsOpen && (
            <div
              role="menu"
              className="simprint-tool-menu absolute bottom-full right-0 mb-2 z-50 min-w-56 rounded-xl p-1.5 text-xs animate-in fade-in slide-in-from-bottom-2 duration-150"
            >
              <button
                role="menuitem"
                disabled={busy}
                onClick={() => {
                  setToolsOpen(false);
                  onClearCache();
                }}
                className="simprint-tool-item cursor-pointer disabled:cursor-not-allowed"
              >
                <Eraser size={13} />
                <span>{t("ext.trim")}</span>
              </button>
              <button
                role="menuitem"
                disabled={busy}
                onClick={() => {
                  setToolsOpen(false);
                  onExportCookies();
                }}
                className="simprint-tool-item cursor-pointer disabled:cursor-not-allowed"
              >
                <FileDown size={13} />
                <span>{t("bar.exportCookies")}</span>
              </button>
              <button
                role="menuitem"
                disabled={busy}
                onClick={() => {
                  setToolsOpen(false);
                  onExportProfiles();
                }}
                className="simprint-tool-item cursor-pointer disabled:cursor-not-allowed"
              >
                <FolderDown size={13} />
                <span>{t("bar.exportProfiles")}</span>
              </button>
              <button
                role="menuitem"
                disabled={busy}
                onClick={() => {
                  setToolsOpen(false);
                  onChangeStartUrls();
                }}
                className="simprint-tool-item cursor-pointer disabled:cursor-not-allowed"
              >
                <Globe size={13} />
                <span>{t("bar.changeStartUrls")}</span>
              </button>
            </div>
          )}
        </div>

        {/* Warm Profiles — temporarily hidden from the bar */}
        {SHOW_WARM && chosen.length >= 1 && local && (
          <button
            disabled={busy}
            onClick={onWarm}
            className="simprint-bulk-warn flex items-center gap-1.5 transition-all cursor-pointer shrink-0"
          >
            <Flame size={13} />
            <span>{t("warm.button", { n: chosen.length })}</span>
          </button>
        )}

        {/* Mirror Sync — temporarily hidden from the bar */}
        {SHOW_MIRROR && chosen.length >= 2 && local && (
          <button
            disabled={busy}
            onClick={onMirror}
            className="simprint-bulk-info flex items-center gap-1.5 transition-all cursor-pointer shrink-0"
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
            className="simprint-bulk-btn flex items-center gap-1.5 transition-all cursor-pointer shrink-0"
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
            className="simprint-bulk-btn flex items-center gap-1.5 transition-all cursor-pointer shrink-0"
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
              className="simprint-bulk-btn flex items-center gap-1.5 transition-all cursor-pointer shrink-0"
            >
              <Copy size={13} />
              <span>{t("bp.clone")}</span>
            </button>
            <button
              disabled={busy}
              onClick={() => onCookies(chosen[0])}
              className="simprint-bulk-btn flex items-center gap-1.5 transition-all cursor-pointer shrink-0"
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
          className="simprint-bulk-danger flex items-center gap-1.5 transition-all cursor-pointer shrink-0 disabled:opacity-40"
        >
          <Trash2 size={13} />
          <span>{t("bar.deleteSelected", { n: chosen.length })}</span>
        </button>
      </div>
    </div>
  );
};
