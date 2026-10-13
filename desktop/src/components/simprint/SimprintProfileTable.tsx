import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
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
  Loader2,
  Cookie,
  MoreHorizontal,
} from "lucide-react";
import { useI18n } from "../../i18n";
import type { Me, Profile } from "../../api";
import { platformOf } from "../../platform";
import { assess } from "../../consistency";
import { isSuggested, statusHue } from "../../status";
import { SimprintBadge } from "./SimprintBadge";
import { isOpenHere } from "../ProfileTable";

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  const mb = bytes / (1024 * 1024);
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

interface SimprintProfileTableProps {
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
  onShare?: (p: Profile) => void;
  onNetwork?: (p: Profile) => void;
  onClone?: (p: Profile) => void;
  onCookies?: (p: Profile) => void;
  personas?: Set<string> | null;
  sharing?: Map<string, number>;
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  showProject: boolean;
}

const WINDOW_FROM = 150;
const BUFFER = 20;

export const SimprintProfileTable: React.FC<SimprintProfileTableProps> = ({
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
  onShare,
  onNetwork,
  onClone,
  onCookies,
  personas,
  sharing,
  selected,
  onToggle,
  onToggleAll,
  showProject,
}) => {
  const { t } = useI18n();
  const hasServer = !local;

  const tableRef = useRef<HTMLTableElement>(null);
  const [rowHeight, setRowHeight] = useState(60);
  const [range, setRange] = useState({ start: 0, end: WINDOW_FROM });
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const windowed = profiles.length > WINDOW_FROM;

  useEffect(() => {
    if (!windowed) return;
    const scroller = tableRef.current?.parentElement;
    if (!scroller) return;
    const update = () => {
      const top = scroller.scrollTop;
      const view = scroller.clientHeight || 600;
      const start = Math.max(0, Math.floor(top / rowHeight) - BUFFER);
      const end = Math.min(profiles.length, Math.ceil((top + view) / rowHeight) + BUFFER);
      setRange((r) => (r.start === start && r.end === end ? r : { start, end }));
    };
    update();
    scroller.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(scroller);
    return () => {
      scroller.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [windowed, rowHeight, profiles.length]);

  useLayoutEffect(() => {
    if (!windowed) return;
    const rows = tableRef.current?.querySelectorAll<HTMLTableRowElement>("tbody tr[data-row]");
    if (!rows || rows.length === 0) return;
    let sum = 0;
    rows.forEach((r) => (sum += r.getBoundingClientRect().height));
    const avg = sum / rows.length;
    if (avg > 20 && Math.abs(avg - rowHeight) > 2) setRowHeight(avg);
  });

  if (profiles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-500">
        <p className="text-sm font-medium">{t("row.emptyProject")}</p>
      </div>
    );
  }

  const visible = windowed ? profiles.slice(range.start, range.end) : profiles;
  const columns = 6 + (showProject ? 1 : 0);

  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full text-left text-xs border-collapse select-none" ref={tableRef}>
        <thead>
          <tr className="border-b border-slate-800/80 bg-slate-950/60 text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
            <th className="py-3 px-4 w-10">
              <input
                type="checkbox"
                aria-label="select all"
                checked={selected.size > 0 && selected.size === profiles.length}
                ref={(el) => {
                  if (el) el.indeterminate = selected.size > 0 && selected.size < profiles.length;
                }}
                onChange={onToggleAll}
                className="rounded border-slate-700 bg-slate-800 text-cyan-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
              />
            </th>
            <th className="py-3 px-4">{t("col.name")}</th>
            {showProject && <th className="py-3 px-4">{t("col.project")}</th>}
            <th className="py-3 px-4">{t("col.proxy")}</th>
            <th className="py-3 px-4">{t("col.status")}</th>
            <th className="py-3 px-4">{t("col.lastOpened")}</th>
            <th className="py-3 px-4 text-right pr-6">{t("ui.save") ? "Actions" : ""}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/50">
          {windowed && range.start > 0 && (
            <tr aria-hidden="true" style={{ height: range.start * rowHeight }}>
              <td colSpan={columns} className="p-0 border-0" />
            </tr>
          )}
          {visible.map((p) => {
            const canLaunch = p.permissions.includes("launch");
            const canForce = p.permissions.includes("manage_access");
            const canReveal = p.permissions.includes("reveal_secrets");
            const canDelete = p.permissions.includes("delete_profile");
            const canEdit = p.permissions.includes("edit_profile");
            const locked = p.lock !== null;
            const open = isOpenHere(p, { local, userId: me?.user_id, machine: thisMachine });
            const starting = launching?.has(p.id) ?? false;
            const sharedExitCount = sharing?.get(p.id) ?? 0;
            const verdict = assess(p, personas ?? null, sharedExitCount);
            const verdictText = verdict.notes.map((n) => t(n.key, n.vars)).join(" · ");
            const isPicked = selected.has(p.id);
            const isMenuOpen = openDropdownId === p.id;

            return (
              <tr
                key={p.id}
                data-row
                className={`transition-colors group hover:bg-slate-800/30 ${
                  isPicked ? "bg-cyan-950/20" : ""
                }`}
              >
                {/* Checkbox column */}
                <td className="py-3 px-4">
                  <input
                    type="checkbox"
                    aria-label={p.name}
                    checked={isPicked}
                    onChange={() => onToggle(p.id)}
                    className="rounded border-slate-700 bg-slate-800 text-cyan-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                  />
                </td>

                {/* Profile Name & Badges */}
                <td className="py-3 px-4">
                  <div className="flex items-center gap-2">
                    {/* Platform 2-letter badge */}
                    {(() => {
                      const pl = platformOf(p.start_urls);
                      return pl ? (
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
                      ) : null;
                    })()}

                    {/* Profile Name */}
                    <span className="font-semibold text-slate-100 group-hover:text-cyan-300 transition-colors">
                      {p.name}
                    </span>

                    {/* Local only badge */}
                    {hasServer && p.origin === "local" && (
                      <span className="text-slate-400" title={t("col.onlyHereWhy")}>
                        <Laptop size={13} />
                      </span>
                    )}

                    {/* Shared with team count */}
                    {p.shared_with > 0 && (
                      <span
                        className="inline-flex items-center gap-0.5 text-slate-400"
                        title={t("col.sharedWith", { n: String(p.shared_with) })}
                      >
                        <Users size={13} />
                        <span className="text-[10px] font-medium">{p.shared_with}</span>
                      </span>
                    )}

                    {/* Verdict alert */}
                    {verdict.level !== "ok" && (
                      <span
                        className={verdict.level === "block" ? "text-rose-400" : "text-amber-400"}
                        title={verdictText}
                      >
                        <AlertTriangle size={13} />
                      </span>
                    )}
                  </div>

                  {/* Tags */}
                  {p.tags.length > 0 && (
                    <div className="flex items-center gap-1 mt-1 flex-wrap">
                      {p.tags.map((tg) => (
                        <span
                          key={tg}
                          className="px-1.5 py-0.2 rounded text-[10px] font-medium bg-cyan-950/40 text-cyan-400/90 border border-cyan-800/40"
                        >
                          #{tg}
                        </span>
                      ))}
                    </div>
                  )}
                </td>

                {/* Project column */}
                {showProject && (
                  <td className="py-3 px-4 text-slate-400">
                    {p.project_name ?? <span className="text-slate-600 italic">{t("col.noProject")}</span>}
                  </td>
                )}

                {/* Proxy column */}
                <td
                  className={`py-3 px-4 ${p.proxy && onNetwork ? "cursor-pointer hover:text-cyan-300" : ""}`}
                  title={p.proxy && onNetwork ? t("net.current") : undefined}
                  onClick={() => p.proxy && onNetwork?.(p)}
                >
                  {p.proxy ? (
                    <div>
                      <div className="font-mono text-slate-200 text-xs flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
                        <span>{p.proxy.display}</span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1">
                        <span>{p.proxy.country ?? t("row.proxyUnchecked")}</span>
                        {!canReveal && <span className="text-slate-600">· {t("row.masked")}</span>}
                        {sharedExitCount >= 2 && (
                          <span className={sharedExitCount >= 3 ? "text-amber-400" : "text-slate-400"}>
                            · {t("row.sharedExit", { n: sharedExitCount })}
                          </span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <span className={p.allow_no_proxy ? "text-amber-400" : "text-rose-400"}>
                      {p.allow_no_proxy ? t("row.noProxyAllowed") : t("row.noProxy")}
                    </span>
                  )}
                </td>

                {/* Status / Stage column */}
                <td className="py-3 px-4">
                  <div className="flex flex-col gap-1 items-start">
                    {open && (
                      <SimprintBadge variant="emerald" dot pulse>
                        {t("row.openHere")}
                      </SimprintBadge>
                    )}
                    {!open && locked && (
                      <SimprintBadge
                        variant="amber"
                        dot
                        title={t("row.inUse", { who: p.lock!.user_email, machine: p.lock!.machine_name })}
                      >
                        In Use
                      </SimprintBadge>
                    )}
                    {!open && !locked && (
                      <SimprintBadge variant="slate" dot>
                        {t("row.idle")}
                      </SimprintBadge>
                    )}

                    {p.status && (() => {
                      const hue = statusHue(p.status);
                      return (
                        <div
                          className="px-2 py-0.5 rounded text-[10px] font-medium border"
                          style={
                            hue === null
                              ? { backgroundColor: "#1e293b", borderColor: "#334155", color: "#94a3b8" }
                              : {
                                  background: `hsl(${hue} 45% 18%)`,
                                  borderColor: `hsl(${hue} 60% 30%)`,
                                  color: `hsl(${hue} 70% 85%)`,
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
                </td>

                {/* Last Opened */}
                <td className="py-3 px-4 text-slate-400 text-[11px]">
                  <div>{p.last_opened_at ? new Date(p.last_opened_at).toLocaleDateString() : t("row.never")}</div>
                  {p.origin === "team" && p.bundle_bytes != null && (
                    <div className="text-[10px] text-slate-500 mt-0.5" title={t("row.onServerWhat")}>
                      {t("row.onServer", { size: formatSize(p.bundle_bytes) })}
                    </div>
                  )}
                </td>

                {/* Action Buttons */}
                <td className="py-3 px-4 text-right pr-6">
                  <div className="flex items-center justify-end gap-1.5 relative">
                    {/* Launch button */}
                    {!open && !locked && canLaunch && (
                      <button
                        disabled={busy || starting || verdict.level === "block"}
                        title={verdict.level === "block" ? `${t("row.fixFirst")}: ${verdictText}` : undefined}
                        onClick={() => onLaunch(p)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-medium text-xs text-white bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 shadow-md shadow-cyan-500/20 disabled:opacity-40 transition-all cursor-pointer"
                      >
                        {starting ? (
                          <>
                            <Loader2 size={13} className="animate-spin" />
                            <span>{t("row.opening")}</span>
                          </>
                        ) : (
                          <>
                            <Play size={12} fill="currentColor" />
                            <span>{t("row.open")}</span>
                          </>
                        )}
                      </button>
                    )}

                    {/* Stop button */}
                    {open && (
                      <button
                        disabled={busy}
                        onClick={() => onStop(p)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-medium text-xs text-rose-300 bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 transition-all cursor-pointer shadow-sm"
                      >
                        <Square size={12} fill="currentColor" />
                        <span>{t("row.close")}</span>
                      </button>
                    )}

                    {/* Take Over button */}
                    {!open && locked && canForce && (
                      <button
                        disabled={busy || starting}
                        onClick={() => onLaunch(p, true)}
                        className="px-2.5 py-1.5 rounded-xl font-medium text-xs text-amber-300 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 cursor-pointer"
                      >
                        {t("row.takeOver")}
                      </button>
                    )}

                    {!open && locked && !canForce && (
                      <span className="text-[11px] text-slate-500">{t("row.askThem")}</span>
                    )}

                    {/* Quick Edit */}
                    {onEdit && canEdit && (
                      <button
                        title={t("row.edit")}
                        disabled={busy}
                        onClick={() => onEdit(p)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                      >
                        <Pencil size={13} />
                      </button>
                    )}

                    {/* Quick Cookies */}
                    {onCookies && (
                      <button
                        title={t("ck.cookies")}
                        disabled={busy}
                        onClick={() => onCookies(p)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                      >
                        <Cookie size={13} />
                      </button>
                    )}

                    {/* More actions dropdown */}
                    <button
                      title="More options"
                      onClick={() => setOpenDropdownId(isMenuOpen ? null : p.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                    >
                      <MoreHorizontal size={14} />
                    </button>

                    {/* Dropdown Menu */}
                    {isMenuOpen && (
                      <div className="absolute right-0 top-10 w-40 py-1.5 bg-slate-900 border border-slate-700/80 rounded-xl shadow-xl z-50 text-xs text-left">
                        {onShare && (p.origin === "local" || p.permissions.includes("manage_access")) && (
                          <button
                            onClick={() => {
                              setOpenDropdownId(null);
                              onShare(p);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-slate-300 hover:bg-slate-800 hover:text-white cursor-pointer"
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
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-slate-300 hover:bg-slate-800 hover:text-white cursor-pointer"
                          >
                            <Puzzle size={13} />
                            <span>{t("ext.extensions")}</span>
                          </button>
                        )}
                        {onClone && canEdit && (
                          <button
                            onClick={() => {
                              setOpenDropdownId(null);
                              onClone(p);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-slate-300 hover:bg-slate-800 hover:text-white cursor-pointer"
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
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-rose-400 hover:bg-rose-500/10 cursor-pointer disabled:opacity-40"
                          >
                            <Trash2 size={13} />
                            <span>{t("row.delete")}</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
          {windowed && range.end < profiles.length && (
            <tr aria-hidden="true" style={{ height: (profiles.length - range.end) * rowHeight }}>
              <td colSpan={columns} className="p-0 border-0" />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};
