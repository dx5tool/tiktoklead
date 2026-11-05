import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
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

/** 15:33:07, on the operator's own clock.
 *
 *  The column showed the date alone, so every profile opened today read as
 *  "today" and the question the column exists to answer — how recently was
 *  this one used — had no answer inside a day. Seconds rather than minutes
 *  because two launches a minute apart are a different thing here: one is
 *  the session still running, the other is a retry after it failed. */
function clockOf(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
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
  onQuickEdit?: (p: Profile, name: string, tags: string[]) => Promise<void>;
  /** Save just the note beside a profile. Present only where the caller may
   *  edit it; the pencil in that cell is hidden otherwise. */
  onNotes?: (p: Profile, notes: string) => Promise<void>;
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
  onQuickEdit,
  onNotes,
  personas,
  sharing,
  selected,
  onToggle,
  onToggleAll,
  showProject,
}) => {
  const { t, say } = useI18n();
  const hasServer = !local;

  const tableRef = useRef<HTMLTableElement>(null);
  const [rowHeight, setRowHeight] = useState(60);
  const [range, setRange] = useState({ start: 0, end: WINDOW_FROM });
  // The row menu is drawn in a portal at fixed coordinates. Inside the table
  // it was clipped by the two overflow boxes around it: opening it on the last
  // visible row hid most of the menu behind the pane's edge, and every action
  // added from here makes it taller (reported 04.11.2026). Fixed coordinates
  // escape both, and the closing rules below — outside press, scroll, resize,
  // Escape — keep it from outliving the row it belongs to.
  const [menu, setMenu] = useState<{
    id: string;
    right: number;
    top: number | null;
    bottom: number | null;
    maxHeight: number;
  } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // The note beside a row, edited on its own. A row is where the note is read,
  // so opening the whole profile to change a sentence was two screens for one
  // field — and saving the whole row from there risks carrying stale fields
  // back (see set_notes in the agent).
  const [notesFor, setNotesFor] = useState<Profile | null>(null);
  const [notesText, setNotesText] = useState("");
  const [notesBusy, setNotesBusy] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);
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
            .split(/[,\s]+/)
            .map((t) => t.replace(/^#/, "").trim())
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
  const windowed = profiles.length > WINDOW_FROM;

  const toggleMenu = (id: string, trigger: HTMLElement) => {
    if (menu?.id === id) {
      setMenu(null);
      return;
    }
    const r = trigger.getBoundingClientRect();
    const viewW = document.documentElement.clientWidth;
    const viewH = document.documentElement.clientHeight;
    const below = viewH - r.bottom - 8;
    const above = r.top - 8;
    // Taller than today's four actions, so it flips up before it is cut off
    // rather than after someone adds the fifth.
    const want = 320;
    const up = below < want && above > below;
    setMenu({
      id,
      right: viewW - r.right,
      top: up ? null : r.bottom + 4,
      bottom: up ? viewH - r.top + 4 : null,
      maxHeight: Math.max(120, up ? above : below),
    });
  };

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const away = (e: MouseEvent) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target)) return;
      // A trigger press is the toggle's own business; closing here as well
      // would reopen the menu on the click that follows.
      if (target instanceof Element && target.closest("[data-menu-trigger]")) return;
      setMenu(null);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(null);
    };
    window.addEventListener("mousedown", away);
    window.addEventListener("keydown", escape);
    window.addEventListener("resize", close);
    // The anchor is a rectangle measured once; any scroll makes it stale.
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("mousedown", away);
      window.removeEventListener("keydown", escape);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [menu]);

  const openNotes = (p: Profile) => {
    setMenu(null);
    setNotesFor(p);
    setNotesText(p.notes ?? "");
    setNotesError(null);
  };

  const saveNotes = async () => {
    if (!notesFor || !onNotes) return;
    setNotesBusy(true);
    setNotesError(null);
    try {
      await onNotes(notesFor, notesText);
      setNotesFor(null);
    } catch (e) {
      setNotesError(say(e));
    } finally {
      setNotesBusy(false);
    }
  };

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
  const columns = 7 + (showProject ? 1 : 0);
  // The row the open menu belongs to, resolved by id rather than kept as a
  // copy: a poll can replace the row while the menu is open, and the actions
  // must follow the freshest permissions and lock state.
  const menuProfile = menu ? (profiles.find((p) => p.id === menu.id) ?? null) : null;
  const menuIsOpen = menuProfile
    ? isOpenHere(menuProfile, { local, userId: me?.user_id, machine: thisMachine })
    : false;

  return (
    <div className="w-full overflow-x-auto bg-[var(--simprint-surface)] rounded-xl border border-[var(--simprint-border)] transition-colors duration-200">
      <table className="w-full text-left text-xs border-collapse select-none" ref={tableRef}>
        <thead>
          <tr className="border-b border-[var(--simprint-border)] bg-[var(--simprint-table-th)] text-slate-600 dark:text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
            <th className="py-3 px-4 w-10">
              <input
                type="checkbox"
                aria-label="select all"
                checked={selected.size > 0 && selected.size === profiles.length}
                ref={(el) => {
                  if (el) el.indeterminate = selected.size > 0 && selected.size < profiles.length;
                }}
                onChange={onToggleAll}
                className="rounded border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-cyan-600 dark:text-cyan-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
              />
            </th>
            <th className="py-3 px-4">{t("col.name")}</th>
            {showProject && <th className="py-3 px-4">{t("col.project")}</th>}
            <th className="py-3 px-4">{t("col.proxy")}</th>
            <th className="py-3 px-4">{t("col.status")}</th>
            <th className="py-3 px-4">{t("col.lastOpened")}</th>
            <th className="py-3 px-4">{t("col.notes")}</th>
            <th className="py-3 px-4 text-left">{t("ui.save") ? "Actions" : ""}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--simprint-border)]">
          {windowed && range.start > 0 && (
            <tr aria-hidden="true" style={{ height: range.start * rowHeight }}>
              <td colSpan={columns} className="p-0 border-0" />
            </tr>
          )}
          {visible.map((p) => {
            const canLaunch = p.permissions.includes("launch");
            const canForce = p.permissions.includes("manage_access");
            const canReveal = p.permissions.includes("reveal_secrets");
            const canEdit = p.permissions.includes("edit_profile");
            const locked = p.lock !== null;
            const open = isOpenHere(p, { local, userId: me?.user_id, machine: thisMachine });
            const starting = launching?.has(p.id) ?? false;
            const sharedExitCount = sharing?.get(p.id) ?? 0;
            const verdict = assess(p, personas ?? null, sharedExitCount);
            const verdictText = verdict.notes.map((n) => t(n.key, n.vars)).join(" · ");
            const isPicked = selected.has(p.id);

            return (
              <tr
                key={p.id}
                data-row
                className={`transition-colors group border-b border-[var(--simprint-border)] ${
                  isPicked
                    ? "bg-cyan-50/80 dark:bg-cyan-950/20"
                    : "bg-[var(--simprint-table-row)] hover:bg-[var(--simprint-table-row-hover)]"
                }`}
              >
                {/* Checkbox column */}
                <td className="py-3 px-4">
                  <input
                    type="checkbox"
                    aria-label={p.name}
                    checked={isPicked}
                    onChange={() => onToggle(p.id)}
                    className="rounded border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-cyan-600 dark:text-cyan-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                  />
                </td>

                {/* Profile Name & Badges */}
                <td className="py-3 px-4">
                  <div className="group/name flex items-center justify-between gap-2 max-w-full">
                    <div className="flex items-center gap-2 min-w-0 flex-wrap">
                      {/* Platform 2-letter badge */}
                      {(() => {
                        const pl = platformOf(p.start_urls);
                        return pl ? (
                          <span
                            className="px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase border shrink-0"
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
                      <span className="font-semibold text-slate-900 dark:text-slate-100 group-hover/name:text-cyan-600 dark:group-hover/name:text-cyan-300 transition-colors">
                        {p.name}
                      </span>

                      {/* Local only badge */}
                      {hasServer && p.origin === "local" && (
                        <span className="text-slate-400 shrink-0" title={t("col.onlyHereWhy")}>
                          <Laptop size={13} />
                        </span>
                      )}

                      {/* Shared with team count */}
                      {p.shared_with > 0 && (
                        <span
                          className="inline-flex items-center gap-0.5 text-slate-400 shrink-0"
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

                    {/* Quick Edit Name & Tags Button on Hover */}
                    {canEdit && onQuickEdit && (
                      <button
                        type="button"
                        title="Edit Name & Tags"
                        aria-label="Edit Name & Tags"
                        onClick={(e) => {
                          e.stopPropagation();
                          openQuickEdit(p);
                        }}
                        className="shrink-0 p-1 rounded-md text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-all opacity-0 group-hover/name:opacity-100 focus:opacity-100 !bg-transparent !border-0 cursor-pointer"
                      >
                        <Pencil size={12} />
                      </button>
                    )}
                  </div>

                  {/* Tags */}
                  {p.tags.length > 0 && (
                    <div className="flex items-center gap-1 mt-1 flex-wrap">
                      {p.tags.map((tg) => (
                        <span
                          key={tg}
                          className="px-1.5 py-0.2 rounded text-[10px] font-medium bg-cyan-50 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-400/90 border border-cyan-200 dark:border-cyan-800/40"
                        >
                          #{tg}
                        </span>
                      ))}
                    </div>
                  )}
                </td>

                {/* Project column */}
                {showProject && (
                  <td className="py-3 px-4 text-slate-500 dark:text-slate-400">
                    {p.project_name ?? <span className="text-slate-400 dark:text-slate-600 italic">{t("col.noProject")}</span>}
                  </td>
                )}

                {/* Proxy column */}
                <td
                  className={`py-3 px-4 ${p.proxy && onNetwork ? "cursor-pointer hover:text-cyan-600 dark:hover:text-cyan-300" : ""}`}
                  title={p.proxy && onNetwork ? t("net.current") : undefined}
                  onClick={() => p.proxy && onNetwork?.(p)}
                >
                  {p.proxy ? (
                    <div>
                      <div className="font-mono text-slate-800 dark:text-slate-200 text-xs flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-cyan-500" />
                        <span>{p.proxy.display}</span>
                        {!canReveal && <span className="text-[10px] text-slate-400 dark:text-slate-500 font-sans">({t("row.masked")})</span>}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1">
                        <span>{p.proxy.country ?? t("row.proxyUnchecked")}</span>
                        {sharedExitCount >= 2 && (
                          <span className={sharedExitCount >= 3 ? "text-amber-600 dark:text-amber-400 font-medium" : "text-slate-500 dark:text-slate-400"}>
                            · {t("row.sharedExit", { n: sharedExitCount })}
                          </span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <span className={p.allow_no_proxy ? "text-amber-600 dark:text-amber-400" : "text-rose-600 dark:text-rose-400"}>
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
                </td>

                {/* Last Opened */}
                <td className="py-3 px-4 text-slate-500 dark:text-slate-400 text-[11px]">
                  {p.last_opened_at ? (
                    <>
                      <div>{new Date(p.last_opened_at).toLocaleDateString()}</div>
                      <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 font-mono">{clockOf(p.last_opened_at)}</div>
                    </>
                  ) : (
                    <div>{t("row.never")}</div>
                  )}
                  {p.origin === "team" && p.bundle_bytes != null && (
                    <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5" title={t("row.onServerWhat")}>
                      {t("row.onServer", { size: formatSize(p.bundle_bytes) })}
                    </div>
                  )}
                </td>

                {/* Notes — the operator's own note on the account, beside the
                    row it is about rather than only inside the editor. The
                    pencil appears on hover and edits just this field. */}
                <td className="py-3 px-4 text-slate-600 dark:text-slate-400 text-[11px]">
                  <div className="group/notes inline-flex max-w-[220px] items-center gap-1 align-top">
                    <span
                      className={p.notes?.trim() ? "min-w-0 truncate text-slate-700 dark:text-slate-300" : "text-slate-400 dark:text-slate-600"}
                      title={p.notes || undefined}
                    >
                      {p.notes?.trim() ? p.notes : "—"}
                    </span>
                    {onNotes && canEdit && (
                      <button
                        type="button"
                        title={t("notes.editTitle")}
                        aria-label={t("notes.editTitle")}
                        onClick={() => openNotes(p)}
                        className="shrink-0 rounded p-0.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 dark:hover:bg-slate-800 dark:hover:text-white opacity-0 transition-opacity focus:opacity-100 group-hover/notes:opacity-100 !bg-transparent !border-0"
                      >
                        <Pencil size={12} />
                      </button>
                    )}
                  </div>
                </td>

                {/* Action Buttons */}
                <td className="py-3 px-4">
                  <div className="flex items-center justify-start gap-1.5">
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
                        className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200/60 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800 transition-colors cursor-pointer !bg-transparent !border-0 !p-1.5"
                      >
                        <Pencil size={13} />
                      </button>
                    )}


                    {/* More actions */}
                    <button
                      title="More options"
                      data-menu-trigger
                      aria-haspopup="menu"
                      aria-expanded={menu?.id === p.id}
                      onClick={(e) => toggleMenu(p.id, e.currentTarget)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200/60 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800 transition-colors cursor-pointer !bg-transparent !border-0 !p-1.5"
                    >
                      <MoreHorizontal size={14} />
                    </button>
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
      {menu && menuProfile &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            className="fixed z-50 w-max min-w-48 max-w-[20rem] py-1.5 bg-white border border-slate-200 text-slate-800 shadow-xl dark:bg-slate-900 dark:border-slate-700/80 dark:text-slate-300 dark:shadow-2xl rounded-xl text-xs text-left overflow-y-auto"
            style={{
              right: menu.right,
              maxHeight: menu.maxHeight,
              ...(menu.top !== null ? { top: menu.top } : { bottom: menu.bottom ?? undefined }),
            }}
          >
            {onCookies && (
              <button
                role="menuitem"
                onClick={() => {
                  setMenu(null);
                  onCookies(menuProfile);
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-slate-700 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white cursor-pointer !bg-transparent !border-0"
              >
                <Cookie size={13} />
                <span>{t("ck.cookies")}</span>
              </button>
            )}
            {onShare && (menuProfile.origin === "local" || menuProfile.permissions.includes("manage_access")) && (
              <button
                role="menuitem"
                onClick={() => {
                  setMenu(null);
                  onShare(menuProfile);
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-slate-700 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white cursor-pointer !bg-transparent !border-0"
              >
                <Share2 size={13} />
                <span>{t("row.shareShort")}</span>
              </button>
            )}
            {onExtensions && menuProfile.permissions.includes("edit_profile") && (
              <button
                role="menuitem"
                onClick={() => {
                  setMenu(null);
                  onExtensions(menuProfile);
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-slate-700 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white cursor-pointer !bg-transparent !border-0"
              >
                <Puzzle size={13} />
                <span>{t("ext.extensions")}</span>
              </button>
            )}
            {onClone && menuProfile.permissions.includes("edit_profile") && (
              <button
                role="menuitem"
                onClick={() => {
                  setMenu(null);
                  onClone(menuProfile);
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-slate-700 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white cursor-pointer !bg-transparent !border-0"
              >
                <Copy size={13} />
                <span>{t("bp.clone")}</span>
              </button>
            )}
            {onDelete && menuProfile.permissions.includes("delete_profile") && (
              <button
                role="menuitem"
                disabled={busy || menuIsOpen}
                onClick={() => {
                  setMenu(null);
                  onDelete(menuProfile);
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 cursor-pointer disabled:opacity-40 !bg-transparent !border-0"
              >
                <Trash2 size={13} />
                <span>{t("row.delete")}</span>
              </button>
            )}
          </div>,
          document.body,
        )}
      {notesFor &&
        createPortal(
          <div
            className="scrim"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget && !notesBusy) setNotesFor(null);
            }}
          >
            <div
              className="modal"
              style={{ width: 560, height: "auto", maxHeight: "88vh" }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="notes-title"
            >
              <div className="modalHead">
                <h2 id="notes-title">{t("notes.editTitle")}</h2>
                <span className="muted small">{notesFor.name}</span>
              </div>
              <div className="form" style={{ paddingTop: "var(--s-4)" }}>
                <div className="field">
                  <label htmlFor="notes-text">{t("pd.notes")}</label>
                  <div>
                    <textarea
                      id="notes-text"
                      rows={10}
                      autoFocus
                      value={notesText}
                      onChange={(e) => setNotesText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape" && !notesBusy) setNotesFor(null);
                      }}
                      style={{ width: "100%" }}
                    />
                    {notesError && <p className="error">{notesError}</p>}
                  </div>
                </div>
              </div>
              <div className="modalFoot">
                <div className="spacer" />
                <button className="ghost" disabled={notesBusy} onClick={() => setNotesFor(null)}>
                  {t("ui.cancel")}
                </button>
                <button className="primary" disabled={notesBusy} onClick={saveNotes}>
                  {notesBusy ? t("ui.saving") : t("ui.save")}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
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
              aria-labelledby="quick-edit-title"
            >
              <div className="modalHead">
                <h2 id="quick-edit-title">{t("row.edit")}</h2>
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
                  <label htmlFor="quick-edit-name">{t("col.name")}</label>
                  <div>
                    <input
                      id="quick-edit-name"
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
                  <label htmlFor="quick-edit-tags">{t("pd.tags")}</label>
                  <div>
                    <input
                      id="quick-edit-tags"
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
    </div>
  );
};
