// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Bogdan Shapovalov and the XChange authors

import React, { useState } from "react";
import { createPortal } from "react-dom";
import {
  Play,
  Square,
  Share2,
  Puzzle,
  Pencil,
  Copy,
  Trash2,
  Laptop,
  Users,
  AlertTriangle,
  Cookie,
  FolderOpen,
  MoreVertical,
  Network,
  Globe,
  Cpu,
  HardDrive,
} from "lucide-react";
import { useI18n } from "../../i18n";
import type { Me, Profile } from "../../api";
import { platformOf } from "../../platform";
import { assess } from "../../consistency";
import { isSuggested, statusHue } from "../../status";
import { SimprintBadge } from "./SimprintBadge";
import { isOpenHere } from "../ProfileTable";
import { isProviderProxy } from "../../providerProxy";
import { flag } from "../../flag";

interface SimprintProfileGridProps {
  profiles: Profile[];
  me: Me | null;
  thisMachine: string;
  local: boolean;
  busy: boolean;
  launching?: Set<string>;
  onLaunch: (p: Profile, force?: boolean) => void;
  onStop: (p: Profile) => void;
  onEdit?: (p: Profile) => void;
  onDelete?: (p: Profile) => void;
  onExtensions?: (p: Profile) => void;
  onDisk?: (p: Profile) => void;
  onShare?: (p: Profile) => void;
  onNetwork?: (p: Profile) => void;
  onClone?: (p: Profile) => void;
  onCookies?: (p: Profile) => void;
  /** Opens the profile's folder in the file manager, and says where it is when
   *  it is not there. Absent where the caller has no shell behind it. */
  onOpenFolder?: (p: Profile) => void;
  onQuickEdit?: (p: Profile, name: string, tags: string[]) => Promise<void>;
  personas?: Set<string> | null;
  sharing?: Map<string, number>;
  selected: Set<string>;
  onToggle: (id: string) => void;
}

export const SimprintProfileGrid: React.FC<SimprintProfileGridProps> = ({
  profiles,
  me,
  thisMachine,
  local,
  busy,
  launching,
  onLaunch,
  onStop,
  onEdit,
  onDelete,
  onExtensions,
  onDisk,
  onShare,
  onNetwork,
  onClone,
  onCookies,
  onOpenFolder,
  onQuickEdit,
  personas,
  sharing,
  selected,
  onToggle,
}) => {
  const { t, say } = useI18n();
  const hasServer = !local;
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);

  const [quickEditFor, setQuickEditFor] = useState<Profile | null>(null);
  const [quickName, setQuickName] = useState("");
  const [quickTags, setQuickTags] = useState("");
  const [quickBusy, setQuickBusy] = useState(false);
  const [quickError, setQuickError] = useState<string | null>(null);

  const openQuickEdit = (p: Profile) => {
    setQuickEditFor(p);
    setQuickName(p.name);
    setQuickTags((p.tags ?? []).join(", "));
    setQuickError(null);
  };

  const saveQuickEdit = async () => {
    if (!quickEditFor || !onQuickEdit) return;
    const trimmedName = quickName.trim();
    if (!trimmedName) return;
    setQuickBusy(true);
    setQuickError(null);
    try {
      const parsedTags = Array.from(
        new Set(
          quickTags
            .split(/[,;\n]+/)
            .map((t) => t.trim().replace(/^#/, "").trim().replace(/\s+/g, " "))
            .filter(Boolean),
        ),
      );
      await onQuickEdit(quickEditFor, trimmedName, parsedTags);
      setQuickEditFor(null);
    } catch (e) {
      setQuickError(say(e));
    } finally {
      setQuickBusy(false);
    }
  };

  if (profiles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-500">
        <p className="text-sm font-medium">{t("row.emptyProject")}</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4 p-6 select-none">
        {profiles.map((p) => {
          const canLaunch = p.permissions.includes("launch");
          const canForce = p.permissions.includes("manage_access");
          const canReveal = p.permissions.includes("reveal_secrets");
          const canDelete = p.permissions.includes("delete_profile");
          const canEdit = p.permissions.includes("edit_profile");
          const locked = p.lock !== null;
          const open = isOpenHere(p, { local, userId: me?.user_id, machine: thisMachine });
          const starting = launching?.has(p.id) ?? false;
          const sharedExitCount = sharing?.get(p.id) ?? 0;
          // A provider hands the same exit to many of its customers, so a
          // shared address is expected there and not a farm signature.
          const providerBacked = isProviderProxy(p.proxy);
          const verdict = assess(p, personas ?? null, sharedExitCount, providerBacked);
          const verdictText = verdict.notes.map((n) => t(n.key, n.vars)).join(" · ");
          const isPicked = selected.has(p.id);
          const isMenuOpen = openDropdownId === p.id;
          const pl = platformOf(p.start_urls);

          return (
            <div
              key={p.id}
              className={`flex flex-col justify-between rounded-2xl p-4 transition-all duration-200 relative group border ${
                isPicked
                  ? "border-cyan-500 bg-cyan-50/70 dark:bg-[#162136] shadow-sm dark:shadow-cyan-500/10"
                  : "bg-white dark:bg-[#111827]/90 border-slate-200 dark:border-slate-800 hover:border-cyan-500/50 hover:shadow-md dark:hover:shadow-cyan-500/10 hover:bg-slate-50 dark:hover:bg-[#141d2e]/90"
              }`}
            >
              {/* Card Top: Checkbox, Badges, Dropdown */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      aria-label={p.name}
                      checked={isPicked}
                      onChange={() => onToggle(p.id)}
                      className="rounded border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-cyan-600 dark:text-cyan-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                    />
                    {open ? (
                      <SimprintBadge variant="emerald" dot pulse>
                        RUNNING
                      </SimprintBadge>
                    ) : locked ? (
                      <SimprintBadge variant="amber" dot>
                        IN USE
                      </SimprintBadge>
                    ) : (
                      <SimprintBadge variant="slate" dot>
                        IDLE
                      </SimprintBadge>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 relative">
                    {pl && (
                      <span
                        className="px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase border"
                        title={pl.name}
                        style={{
                          background: `hsl(${pl.hue} 45% 20%)`,
                          color: `hsl(${pl.hue} 80% 85%)`,
                          borderColor: `hsl(${pl.hue} 60% 35%)`,
                        }}
                      >
                        {pl.mark}
                      </span>
                    )}

                    {/* 3-dot dropdown button */}
                    <button
                      onClick={() => setOpenDropdownId(isMenuOpen ? null : p.id)}
                      className="p-1 rounded text-slate-500 hover:text-slate-900 hover:bg-slate-200/60 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800 cursor-pointer !bg-transparent !border-0"
                    >
                      <MoreVertical size={14} />
                    </button>

                    {/* Dropdown Menu (Open folder, Cookies, Share, Extensions, Storage & cache, Clone, Delete).
                        `w-max` rather than a fixed width, as the table's menu does:
                        "Open profile folder" — and its Russian translation, longer
                        still — wraps to two lines inside the 10rem this used to be. */}
                    {isMenuOpen && (
                      <div className="absolute right-0 top-7 w-max min-w-40 py-1.5 bg-white border border-slate-200 text-slate-800 shadow-xl dark:bg-slate-900 dark:border-slate-700/80 dark:text-slate-300 dark:shadow-2xl rounded-xl z-50 text-xs">
                        {onOpenFolder && (
                          <button
                            onClick={() => {
                              setOpenDropdownId(null);
                              onOpenFolder(p);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-slate-700 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white cursor-pointer text-left !bg-transparent !border-0"
                          >
                            <FolderOpen size={13} />
                            <span>{t("row.openFolder")}</span>
                          </button>
                        )}
                        {onCookies && (
                          <button
                            onClick={() => {
                              setOpenDropdownId(null);
                              onCookies(p);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-slate-700 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white cursor-pointer text-left !bg-transparent !border-0"
                          >
                            <Cookie size={13} />
                            <span>{t("ck.cookies")}</span>
                          </button>
                        )}
                        {onShare && (p.origin === "local" || p.permissions.includes("manage_access")) && (
                          <button
                            onClick={() => {
                              setOpenDropdownId(null);
                              onShare(p);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-slate-700 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white cursor-pointer text-left !bg-transparent !border-0"
                          >
                            <Share2 size={13} />
                            <span>{t("row.shareShort")}</span>
                          </button>
                        )}
                        {onExtensions && canEdit && (
                          <button
                            onClick={() => {
                              setOpenDropdownId(null);
                              onExtensions(p);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-slate-700 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white cursor-pointer text-left !bg-transparent !border-0"
                          >
                            <Puzzle size={13} />
                            <span>{t("ext.extensions")}</span>
                          </button>
                        )}
                        {onDisk && canEdit && (
                          <button
                            onClick={() => {
                              setOpenDropdownId(null);
                              onDisk(p);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-slate-700 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white cursor-pointer text-left !bg-transparent !border-0"
                          >
                            <HardDrive size={13} />
                            <span>{t("ext.storageLabel")}</span>
                          </button>
                        )}
                        {onClone && canEdit && (
                          <button
                            onClick={() => {
                              setOpenDropdownId(null);
                              onClone(p);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-slate-700 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white cursor-pointer text-left !bg-transparent !border-0"
                          >
                            <Copy size={13} />
                            <span>{t("bp.clone")}</span>
                          </button>
                        )}
                        {onDelete && canDelete && (
                          <button
                            disabled={busy || open}
                            onClick={() => {
                              setOpenDropdownId(null);
                              onDelete(p);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 cursor-pointer text-left disabled:opacity-40 !bg-transparent !border-0"
                          >
                            <Trash2 size={13} />
                            <span>{t("row.delete")}</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Profile Title & Metadata */}
                <div className="mb-3">
                  <div className="group/name flex items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <h3 className="font-bold text-sm text-slate-900 dark:text-white group-hover/name:text-cyan-600 dark:group-hover/name:text-cyan-300 transition-colors truncate">
                        {p.name}
                      </h3>
                      {hasServer && p.origin === "local" && (
                        <span className="text-slate-400 shrink-0" title={t("col.onlyHereWhy")}>
                          <Laptop size={12} />
                        </span>
                      )}
                      {p.shared_with > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-slate-400 shrink-0">
                          <Users size={12} />
                          <span className="text-[10px]">{p.shared_with}</span>
                        </span>
                      )}
                      {verdict.level !== "ok" && (
                        <span
                          className={verdict.level === "block" ? "text-rose-500 shrink-0" : "text-amber-500 shrink-0"}
                          title={verdictText}
                        >
                          <AlertTriangle size={12} />
                        </span>
                      )}
                    </div>

                    {/* Quick Edit Name & Tags Button on Hover */}
                    {canEdit && onQuickEdit && (
                      <button
                        type="button"
                        title="Edit Name & Tags"
                        aria-label="Edit Name & Tags"
                        onClick={() => openQuickEdit(p)}
                        className="shrink-0 p-1 rounded-md text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-all opacity-0 group-hover/name:opacity-100 focus:opacity-100 !bg-transparent !border-0 cursor-pointer"
                      >
                        <Pencil size={12} />
                      </button>
                    )}
                  </div>

                  {/* Fingerprint spoof info */}
                  <div className="flex items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    <div className="flex items-center gap-1">
                      <Globe size={11} className="text-cyan-600 dark:text-cyan-400/80" />
                      <span>Chrome 131</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Cpu size={11} className="text-slate-400 dark:text-slate-500" />
                      <span>XChange Core</span>
                    </div>
                  </div>
                </div>

                {/* Proxy snippet */}
                <div
                  className={`p-2 rounded-xl bg-slate-100 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/80 text-[11px] mb-3 ${
                    p.proxy && onNetwork ? "cursor-pointer hover:border-cyan-500/40" : ""
                  }`}
                  onClick={() => p.proxy && onNetwork?.(p)}
                >
                  <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-0.5">
                    <span className="font-semibold uppercase tracking-wider text-[10px] text-slate-500 flex items-center gap-1">
                      <Network size={11} />
                      <span>Proxy</span>
                    </span>
                    <span>
                      {p.proxy?.country ? (
                        <>
                          <span className="flag">{flag(p.proxy.country)}</span> {p.proxy.country}
                        </>
                      ) : p.proxy ? (
                        t("row.proxyUnchecked")
                      ) : (
                        "Direct"
                      )}
                    </span>
                  </div>
                  {p.proxy ? (
                    <div className="font-mono text-slate-800 dark:text-slate-200 truncate flex items-center justify-between">
                      <span>{p.proxy.display}</span>
                      {!canReveal && <span className="text-[10px] text-slate-500 font-sans">({t("row.masked")})</span>}
                    </div>
                  ) : (
                    <div className={p.allow_no_proxy ? "text-amber-600 dark:text-amber-400 font-medium" : "text-rose-600 dark:text-rose-400 font-medium"}>
                      {p.allow_no_proxy ? t("row.noProxyAllowed") : t("row.noProxy")}
                    </div>
                  )}
                </div>

                {/* Tags & Stage */}
                <div className="flex items-center gap-1.5 flex-wrap mb-4">
                  {p.tags.map((tg) => (
                    <span
                      key={tg}
                      className="px-1.5 py-0.2 rounded text-[10px] font-medium bg-cyan-50 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-400/90 border border-cyan-200 dark:border-cyan-800/40"
                    >
                      #{tg}
                    </span>
                  ))}
                  {p.status && (() => {
                    const hue = statusHue(p.status);
                    return (
                      <div
                        className="px-2 py-0.2 rounded text-[10px] font-medium border"
                        style={
                          hue === null
                            ? { backgroundColor: "var(--stage-null-bg)", borderColor: "var(--stage-null-border)", color: "var(--stage-null-text)" }
                            : {
                                background: `hsl(${hue} var(--stage-sat) var(--stage-bg-lightness))`,
                                borderColor: `hsl(${hue} 60% var(--stage-border-lightness))`,
                                color: `hsl(${hue} 70% var(--stage-text-lightness))`,
                              }
                        }
                      >
                        {isSuggested(p.status)
                          ? t(`status.${p.status.trim().toLowerCase()}` as never)
                          : p.status}
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Card Footer: Action button & Quick tools */}
              <div className="pt-3 border-t border-slate-200 dark:border-slate-800/80 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1">
                  {onEdit && canEdit && (
                    <button
                      title={t("row.edit")}
                      disabled={busy}
                      onClick={() => onEdit(p)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200/60 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800 transition-colors cursor-pointer !bg-transparent !border-0"
                    >
                      <Pencil size={13} />
                    </button>
                  )}
                </div>

                {/* Launch / Stop Primary button */}
                <div className="shrink-0">
                  {!open && !locked && canLaunch && (
                    <button
                      disabled={busy || starting || verdict.level === "block"}
                      title={verdict.level === "block" ? `${t("row.fixFirst")}: ${verdictText}` : undefined}
                      onClick={() => onLaunch(p)}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl font-medium text-xs text-white bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 shadow-md shadow-cyan-500/20 disabled:opacity-40 transition-all cursor-pointer !border-0"
                    >
                      <Play size={12} fill="currentColor" />
                      <span>{t("row.open")}</span>
                    </button>
                  )}

                  {open && (
                    <button
                      disabled={busy}
                      onClick={() => onStop(p)}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl font-medium text-xs text-rose-600 dark:text-rose-300 bg-rose-50 dark:bg-rose-500/15 hover:bg-rose-100 dark:hover:bg-rose-500/25 border border-rose-200 dark:border-rose-500/30 transition-all cursor-pointer shadow-xs"
                    >
                      <Square size={12} fill="currentColor" />
                      <span>{t("row.close")}</span>
                    </button>
                  )}

                  {!open && locked && canForce && (
                    <button
                      disabled={busy || starting}
                      onClick={() => onLaunch(p, true)}
                      className="px-2.5 py-1.5 rounded-xl font-medium text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/15 hover:bg-amber-100 dark:hover:bg-amber-500/25 border border-amber-200 dark:border-amber-500/30 cursor-pointer shadow-xs"
                    >
                      {t("row.takeOver")}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Quick Edit Name & Tags Modal Portal */}
      {quickEditFor &&
        createPortal(
          <div
            className="scrim"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget && !quickBusy) setQuickEditFor(null);
            }}
          >
            <div
              className="modal"
              style={{ width: 480, height: "auto", maxHeight: "88vh" }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="grid-quick-edit-title"
            >
              <div className="modalHead">
                <h2 id="grid-quick-edit-title">{t("row.edit")}</h2>
                <span className="muted small font-mono">{quickEditFor.name}</span>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void saveQuickEdit();
                }}
                className="form space-y-4"
                style={{ paddingTop: "var(--s-4)" }}
              >
                <div className="field">
                  <label htmlFor="grid-quick-edit-name">{t("col.name")}</label>
                  <div>
                    <input
                      id="grid-quick-edit-name"
                      type="text"
                      autoFocus
                      required
                      value={quickName}
                      onChange={(e) => setQuickName(e.target.value)}
                      style={{ width: "100%" }}
                      placeholder="Profile name"
                    />
                  </div>
                </div>

                <div className="field">
                  <label htmlFor="grid-quick-edit-tags">{t("pd.tags")}</label>
                  <div>
                    <input
                      id="grid-quick-edit-tags"
                      type="text"
                      value={quickTags}
                      onChange={(e) => setQuickTags(e.target.value)}
                      style={{ width: "100%" }}
                      placeholder="de, marketplace, amazon"
                    />
                    <p className="hint">{t("pd.tagsHint")}</p>
                  </div>
                </div>

                {quickError && <p className="error">{quickError}</p>}

                <div className="modalFoot flex items-center justify-end gap-2">
                  <button
                    type="button"
                    className="ghost"
                    disabled={quickBusy}
                    onClick={() => setQuickEditFor(null)}
                  >
                    {t("ui.cancel")}
                  </button>
                  <button
                    type="submit"
                    className="primary"
                    disabled={quickBusy || !quickName.trim()}
                  >
                    {quickBusy ? t("ui.saving") : t("ui.save")}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
};
