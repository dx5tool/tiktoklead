// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Bogdan Shapovalov and the XChange authors

import { IconButton } from "./Icon";
import { Pencil, Search, Filter, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, type LocalProxy, type Profile } from "../api";
import { useI18n } from "../i18n";
import { flag } from "../flag";
import { useAsk } from "./Ask";
import { ProxyForm, addedByMe, proxyLock } from "./ProxyForm";
import { ProxyPaste } from "./ProxyPaste";
import { proxyUrl } from "../proxyUrl";
import { maskApiKey, providerForProxy, removeProviderProxy } from "../providerProxy";
import {
  allProxyMeta,
  metaForProxy,
  parseTags,
  removeProxyMeta,
  saveProxyMeta,
  type ProxyMeta,
} from "../proxyMeta";

/** The proxies this machine knows about.
 *
 *  A section rather than a list buried in the profile editor, because an exit
 *  outlives the profile that first needed it: the same residential IP carries
 *  three accounts, and the place to see that is here — the "used by" column is
 *  the one number that matters, since several accounts behind one address is
 *  the oldest farm signal there is. */
export function Proxies({ profiles, local, myEmail = null }: { profiles: Profile[]; local: boolean; myEmail?: string | null }) {
  const { t, say } = useI18n();
  const { ask, dialog } = useAsk();
  const [rows, setRows] = useState<LocalProxy[]>([]);
  const [editing, setEditing] = useState<LocalProxy | null | undefined>(undefined);
  const [pasting, setPasting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Checking every proxy at once (5.7): per-row outcome, and how far along.
  const [checks, setChecks] = useState<Map<string, { ok: boolean; ms?: number; error?: string }>>(new Map());
  const [checking, setChecking] = useState<{ done: number; total: number } | null>(null);
  // Tags and notes are this machine's labels for an exit, not part of the
  // connection: they live in localStorage, joined to the row by id.
  const [meta, setMeta] = useState<Map<string, ProxyMeta>>(new Map());
  const [query, setQuery] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [tagEdit, setTagEdit] = useState<LocalProxy | null>(null);
  const [tagDraft, setTagDraft] = useState("");
  const [noteEdit, setNoteEdit] = useState<LocalProxy | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  /** The URL the single-proxy form would build. In team mode the password is
   *  not here, and check_proxy fetches it by id instead. */
  const urlOf = (p: LocalProxy) => proxyUrl(p.kind, p.host, p.port, p.username, p.password);

  /** Provider rows with no address yet have nothing to check. Fetched ones do. */
  const checkableRows = rows.filter(
    (p) => !(providerForProxy(p.id) && p.kind === "provider"),
  );

  const checkableSelected = checkableRows.filter((p) => selected.has(p.id));

  const checkSelected = async () => {
    const list = checkableSelected;
    setChecks(new Map());
    setChecking({ done: 0, total: list.length });
    let done = 0;
    // Three at a time: the checker is a third party, and forty simultaneous
    // requests from one address is how a checker starts refusing.
    const queue = [...list];
    const worker = async () => {
      for (;;) {
        const p = queue.shift();
        if (!p) return;
        try {
          const r = await api.checkProxy(urlOf(p), p.checker_url, p.id);
          setChecks((m) => new Map(m).set(p.id, { ok: r.ok, ms: r.ms, error: r.ok ? undefined : r.error }));
        } catch (e) {
          setChecks((m) => new Map(m).set(p.id, { ok: false, error: say(e) }));
        }
        done++;
        setChecking({ done, total: list.length });
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    setChecking(null);
    await load();
  };

  /** Local proxies whose password the keychain will not open now. They read
   *  back blank, and nothing used to say so: a tester re-typed every one after
   *  an update (15.10.2026). */
  const [unreadable, setUnreadable] = useState<string[]>([]);
  const [stillLocked, setStillLocked] = useState(false);

  const load = useCallback(async () => {
    try {
      setRows(await api.proxies());
      setMeta(new Map(allProxyMeta().map((m) => [m.proxy_id, m])));
      setError(null);
    } catch (e) {
      setError(say(e));
    }
    if (local) {
      void api.vaultStatus().then((v) => setUnreadable(v.unreadable), () => {});
    }
  }, [local]);

  useEffect(() => {
    void load();
  }, [load]);

  const usedBy = (id: string) => profiles.filter((p) => p.proxy?.id === id).length;

  const refreshMeta = () => setMeta(new Map(allProxyMeta().map((m) => [m.proxy_id, m])));

  const openTags = (p: LocalProxy) => {
    setTagEdit(p);
    setTagDraft((metaForProxy(p.id)?.tags ?? []).join(", "));
  };

  const saveTags = () => {
    if (!tagEdit) return;
    saveProxyMeta(tagEdit.id, { tags: parseTags(tagDraft) });
    setTagEdit(null);
    refreshMeta();
  };

  const openNotes = (p: LocalProxy) => {
    setNoteEdit(p);
    setNoteDraft(metaForProxy(p.id)?.notes ?? "");
  };

  const saveNotes = () => {
    if (!noteEdit) return;
    saveProxyMeta(noteEdit.id, { notes: noteDraft.trim() });
    setNoteEdit(null);
    refreshMeta();
  };

  // The tags the filter offers: every tag any row carries.
  const tags = Array.from(new Set(rows.flatMap((p) => meta.get(p.id)?.tags ?? []))).sort();

  // The Profile page's search and tag filter, over what a proxy row shows.
  const q = query.trim().toLowerCase();
  const shown = rows.filter((p) => {
    const m = meta.get(p.id);
    if (tagFilter) {
      const own = m?.tags ?? [];
      if (tagFilter === "\u0000none" ? own.length > 0 : !own.includes(tagFilter)) return false;
    }
    if (!q) return true;
    const provider = providerForProxy(p.id);
    return [
      p.name,
      `${p.host}:${p.port}`,
      p.kind,
      provider?.provider ?? "",
      m?.notes ?? "",
      ...(m?.tags ?? []),
      p.last_ip ?? "",
      p.last_country ?? "",
    ]
      .join(" ")
      .toLowerCase()
      .includes(q);
  });

  // Select-all follows what is on screen: a filter narrows what it can add.
  const shownIds = shown.map((p) => p.id);
  const allShownSelected = shownIds.length > 0 && shownIds.every((id) => selected.has(id));
  const someShownSelected = shownIds.some((id) => selected.has(id));
  const selectAllRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someShownSelected && !allShownSelected;
    }
  }, [someShownSelected, allShownSelected]);

  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllShown = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of shownIds) {
        if (allShownSelected) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  };

  return (
    <>
      {dialog}
      <div className="toolbar">
        <button className="primary" onClick={() => setEditing(null)}>
          {t("px.newOne")}
        </button>
        <button onClick={() => setPasting(true)}>{t("pp.paste")}</button>
        {checkableRows.length > 0 && (
          <button
            className="ghost"
            disabled={checking !== null || checkableSelected.length === 0}
            onClick={() => void checkSelected()}
          >
            {checking ? t("px.checkingN", { done: checking.done, total: checking.total }) : t("px.checkSelected", { n: checkableSelected.length })}
          </button>
        )}
        {!checking && checks.size > 0 && (
          <span className="muted small">
            {t("px.checkSummary", { ok: [...checks.values()].filter((c) => c.ok).length, bad: [...checks.values()].filter((c) => !c.ok).length })}
          </span>
        )}
        <div className="spacer" />
        {tags.length > 0 && (
          <div className="relative">
            <select
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              aria-label={t("bar.allTags")}
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
        <button
          type="button"
          onClick={() => {
            setQuery("");
            setTagFilter("");
          }}
          title={t("bar.clearFilters")}
          aria-label={t("bar.clearFilters")}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-rose-50 dark:hover:bg-rose-500/10 cursor-pointer transition-colors shadow-xs !bg-transparent !border-0"
          style={{ padding: 0, color: "var(--simprint-rose)" }}
        >
          <X size={18} />
        </button>
        <div className="relative w-44">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none"
          />
          <input
            type="text"
            placeholder={t("bar.searchShort")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-white border border-slate-300 text-slate-900 placeholder-slate-400 focus:border-cyan-600 dark:bg-slate-900/80 dark:border-slate-800 dark:text-slate-200 dark:placeholder-slate-500 dark:focus:border-cyan-500 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-cyan-500/40 transition-colors"
            style={{ paddingLeft: 34, paddingRight: 10 }}
          />
        </div>
        <IconButton icon="refresh" label={t("bar.refresh")} onClick={() => void load()} />
      </div>

      {error && <div className="notice warnBar">{error}</div>}
      {unreadable.length > 0 && (
        <div className="notice warnBar">
          {t("px.vaultUnreadable", { n: unreadable.length, list: unreadable.join(", ") })}
          {stillLocked && <> {t("px.vaultStillLocked")}</>}{" "}
          <button
            className="linky"
            onClick={async () => {
              const v = await api.vaultStatus(true).catch(() => null);
              setStillLocked(v !== null && v.unreadable.length > 0);
              await load();
            }}
          >
            {t("px.vaultRetry")}
          </button>
        </div>
      )}

      <div className="tableWrap">
        {rows.length === 0 ? (
          <p className="empty pad">{t("px.none")}</p>
        ) : shown.length === 0 ? (
          <p className="empty pad">{t("px.noMatch")}</p>
        ) : (
          <table className="grid proxyGrid">
            <colgroup>
              <col style={{ width: "4%" }} />
              <col style={{ width: "4%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "11%" }} />
              <col style={{ width: "17%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "11%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "8%" }} />
            </colgroup>
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    aria-label="Select all"
                    ref={selectAllRef}
                    checked={allShownSelected}
                    onChange={toggleAllShown}
                    className="rounded border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-cyan-600 dark:text-cyan-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                  />
                </th>
                <th className="colNum">#</th>
                <th>{t("px.label")}</th>
                <th>{t("px.provider")}</th>
                <th>{t("pd.tags")}</th>
                <th>{t("col.notes")}</th>
                <th>{t("px.address")}</th>
                <th>{t("px.apiKey")}</th>
                <th>{t("px.lastSeen")}</th>
                <th>{t("px.usedBy")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((p, i) => {
                const provider = providerForProxy(p.id);
                const noIp = !!provider && p.kind === "provider";
                const apiKey = maskApiKey(provider?.api_key);
                const own = meta.get(p.id);
                const rowTags = own?.tags ?? [];
                const notes = own?.notes ?? "";
                return (
                <tr key={p.id}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={p.name}
                      checked={selected.has(p.id)}
                      onChange={() => toggleSelected(p.id)}
                      className="rounded border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-cyan-600 dark:text-cyan-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                    />
                  </td>
                  <td className="colNum">{i + 1}</td>
                  <td>
                    <div className="name ellipsis" title={p.name}>{p.name}</div>
                    <div className="muted small ellipsis">
                      {noIp ? null : p.kind}
                      {p.added_by && <> · {addedByMe(p, myEmail) ? t("px.addedByYou") : t("px.addedBy", { who: p.added_by })}</>}
                    </div>
                  </td>
                  <td title={provider?.provider ?? undefined}>
                    <div className="ellipsis">{provider?.provider ?? "—"}</div>
                  </td>
                  <td>
                    <div className="group/tags flex items-start gap-1 min-w-0">
                      <div className="flex items-center gap-1 flex-wrap min-w-0">
                        {rowTags.length ? (
                          rowTags.map((tg) => (
                            <span
                              key={tg}
                              className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-cyan-50 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-400/90 border border-cyan-200 dark:border-cyan-800/40"
                            >
                              #{tg}
                            </span>
                          ))
                        ) : (
                          <span>—</span>
                        )}
                      </div>
                      <button
                        type="button"
                        title={t("row.edit")}
                        aria-label={t("row.edit")}
                        onClick={() => openTags(p)}
                        className="shrink-0 p-1 rounded-md text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-all opacity-0 group-hover/tags:opacity-100 focus:opacity-100 !bg-transparent !border-0 cursor-pointer"
                      >
                        <Pencil size={12} />
                      </button>
                    </div>
                  </td>
                  <td>
                    <div className="group/notes flex items-start gap-1 min-w-0">
                      <span className="clamp2 min-w-0" title={notes || undefined}>
                        {notes || "—"}
                      </span>
                      <button
                        type="button"
                        title={t("row.edit")}
                        aria-label={t("row.edit")}
                        onClick={() => openNotes(p)}
                        className="shrink-0 p-1 rounded-md text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-all opacity-0 group-hover/notes:opacity-100 focus:opacity-100 !bg-transparent !border-0 cursor-pointer"
                      >
                        <Pencil size={12} />
                      </button>
                    </div>
                  </td>
                  <td className="mono" title={provider ? undefined : `${p.host}:${p.port}`}>
                    {provider ? (
                      "—"
                    ) : (
                      <>
                        <div className="ellipsis">{p.host}:{p.port}</div>
                        {p.username && <div className="muted small ellipsis">{p.username}</div>}
                      </>
                    )}
                  </td>
                  <td className="mono">
                    <div className="ellipsis">{apiKey || "—"}</div>
                  </td>
                  <td className="muted small">
                    {p.last_ip ?? "—"}
                    {p.last_country && (
                      <>
                        {" · "}
                        <span className="flag">{flag(p.last_country)}</span> {p.last_country}
                      </>
                    )}
                    {(() => {
                      const c = checks.get(p.id);
                      if (!c) return null;
                      return c.ok ? (
                        <div className="ok">{t("px.checkOk", { ms: c.ms ?? 0 })}</div>
                      ) : (
                        <div className="warn" title={c.error}>{t("px.checkBad")}</div>
                      );
                    })()}
                  </td>
                  <td className="muted small">
                    {usedBy(p.id) === 0 ? "—" : t("px.usedByN", { n: usedBy(p.id) })}
                  </td>
                  <td className="actions">
                    <div>
                      {/* The same two icons a profile row has, in the same
                          places: one table's pencil is every table's pencil. */}
                      <IconButton icon="pencil" label={t("row.edit")} onClick={() => setEditing(p)} />
                      <IconButton
                        icon="trash"
                        danger
                        label={t("row.delete")}
                        title={proxyLock(p, myEmail, t) ?? undefined}
                        disabled={proxyLock(p, myEmail, t) !== null}
                        onClick={async () => {
                          const go = await ask({
                            title: t("row.delete"),
                            detail: t("px.confirmDelete", { name: p.name }),
                            confirmLabel: t("ui.delete"),
                            danger: true,
                          });
                          if (go === null) return;
                          try {
                            await api.deleteProxy(p.id);
                            removeProviderProxy(p.id);
                            removeProxyMeta(p.id);
                          } catch (e) {
                            setError(say(e));
                          }
                          await load();
                        }}
                      />
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {editing !== undefined && (
        <ProxyForm
          editing={editing}
          myEmail={myEmail}
          onClose={() => setEditing(undefined)}
          onSaved={async () => {
            setEditing(undefined);
            await load();
          }}
        />
      )}

      {pasting && (
        <ProxyPaste onClose={() => setPasting(false)} onSaved={() => void load()} />
      )}

      {tagEdit && (
        <div
          className="scrim"
          onMouseDown={(e) => e.target === e.currentTarget && setTagEdit(null)}
        >
          <div
            className="modal"
            style={{ width: 480, height: "auto", maxHeight: "88vh" }}
            role="dialog"
            aria-modal="true"
          >
            <div className="modalHead">
              <h2>{t("pd.tags")}</h2>
              <span className="muted small">{tagEdit.name}</span>
            </div>
            <form
              className="form"
              onSubmit={(e) => {
                e.preventDefault();
                saveTags();
              }}
            >
              <div className="field">
                <label htmlFor="proxy-tags">{t("pd.tags")}</label>
                <div>
                  <input
                    id="proxy-tags"
                    type="text"
                    autoFocus
                    value={tagDraft}
                    onChange={(e) => setTagDraft(e.target.value)}
                    style={{ width: "100%" }}
                    placeholder="de, marketplace, amazon"
                  />
                  <p className="hint">{t("pd.tagsHint")}</p>
                </div>
              </div>
              <div className="modalFoot">
                <div className="spacer" />
                <button type="button" className="ghost" onClick={() => setTagEdit(null)}>
                  {t("ui.cancel")}
                </button>
                <button type="submit" className="primary">
                  {t("ui.save")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {noteEdit && (
        <div
          className="scrim"
          onMouseDown={(e) => e.target === e.currentTarget && setNoteEdit(null)}
        >
          <div
            className="modal"
            style={{ width: 480, height: "auto", maxHeight: "88vh" }}
            role="dialog"
            aria-modal="true"
          >
            <div className="modalHead">
              <h2>{t("col.notes")}</h2>
              <span className="muted small">{noteEdit.name}</span>
            </div>
            <form
              className="form"
              onSubmit={(e) => {
                e.preventDefault();
                saveNotes();
              }}
            >
              <div className="field">
                <label htmlFor="proxy-notes">{t("col.notes")}</label>
                <div>
                  <textarea
                    id="proxy-notes"
                    rows={5}
                    autoFocus
                    value={noteDraft}
                    onChange={(e) => setNoteDraft(e.target.value)}
                    style={{ width: "100%", resize: "vertical" }}
                  />
                </div>
              </div>
              <div className="modalFoot">
                <div className="spacer" />
                <button type="button" className="ghost" onClick={() => setNoteEdit(null)}>
                  {t("ui.cancel")}
                </button>
                <button type="submit" className="primary">
                  {t("ui.save")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
