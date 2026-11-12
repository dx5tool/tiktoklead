// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Bogdan Shapovalov and the XChange authors

import { useEffect, useMemo, useRef, useState } from "react";
import { IconButton } from "./Icon";
import { api, type Project } from "../api";
import { useI18n } from "../i18n";
import { useAsk } from "./Ask";
import { ProjectForm } from "./ProjectForm";

/** Every project, on this machine and on the server.
 *
 *  One table rather than the sidebar's per-world sections: this is where the
 *  list is ordered, renamed and cleaned up. The order it shows is the order
 *  `api.projects()` answers with — weight first, then name. */
export function Projects({
  projects,
  local,
  onChanged,
}: {
  projects: Project[];
  local: boolean;
  onChanged: () => Promise<void>;
}) {
  const { t, say } = useI18n();
  const { ask, dialog } = useAsk();
  const [editing, setEditing] = useState<Project | null | undefined>(undefined);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // The stores already answer in this order; sorting the merged list keeps the
  // two worlds in one sequence instead of team-then-local by accident.
  const shown = useMemo(
    () =>
      [...projects].sort(
        (a, b) => a.sort_weight - b.sort_weight || a.name.localeCompare(b.name),
      ),
    [projects],
  );

  // A new project goes after everything already in the list. The stores allow
  // equal weights, so this is a suggestion, not a uniqueness rule.
  const nextSort = useMemo(() => {
    const highest = projects.reduce(
      (max, p) => (Number.isFinite(p.sort_weight) ? Math.max(max, p.sort_weight) : max),
      -1,
    );
    return Math.min(highest + 1, 2_147_483_647);
  }, [projects]);

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

  const chosen = shown.filter((p) => selected.has(p.id));

  const deleteOne = async (p: Project) => {
    const go = await ask({
      title: t("row.delete"),
      // Naming the number is the difference between a warning someone reads
      // and one they click through.
      detail:
        p.profile_count > 0
          ? t("proj.confirmDelete", { name: p.name, n: p.profile_count })
          : t("proj.confirmDeleteEmpty", { name: p.name }),
      confirmLabel: t("ui.delete"),
      danger: true,
    });
    if (go === null) return;
    setBusy(true);
    setError(null);
    try {
      await api.deleteProject(p.id, p.origin);
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(p.id);
        return next;
      });
      await onChanged();
    } catch (e) {
      setError(say(e));
    } finally {
      setBusy(false);
    }
  };

  const deleteSelected = async () => {
    if (chosen.length === 0) return;
    const go = await ask({
      title: t("proj.deleteSelected", { n: chosen.length }),
      detail: t("proj.confirmDeleteMany", { n: chosen.length }),
      confirmLabel: t("ui.delete"),
      danger: true,
    });
    if (go === null) return;
    setBusy(true);
    setError(null);
    let done = 0;
    let failure: string | null = null;
    for (const p of chosen) {
      try {
        await api.deleteProject(p.id, p.origin);
        done++;
      } catch (e) {
        failure ??= `${p.name}: ${say(e)}`;
      }
    }
    setSelected(new Set());
    setBusy(false);
    await onChanged();
    if (failure) {
      setError(t("proj.deletePartly", { done, n: chosen.length, why: failure }));
    }
  };

  const origins: ("local" | "team")[] = local ? ["local"] : ["team", "local"];
  const defaultOrigin: "local" | "team" = local ? "local" : "team";

  return (
    <>
      {dialog}
      <div className="projectsPage">
        <div className="toolbar">
          <button className="primary" onClick={() => setEditing(null)}>
            {t("proj.newOne")}
          </button>
          <button
            className="ghost"
            disabled={busy || chosen.length === 0}
            onClick={() => void deleteSelected()}
          >
            {t("proj.deleteSelected", { n: chosen.length })}
          </button>
          <div className="spacer" />
          <IconButton icon="refresh" label={t("bar.refresh")} onClick={() => void onChanged()} />
        </div>

        {error && <div className="notice warnBar">{error}</div>}

        <div className="tableWrap">
          {shown.length === 0 ? (
            <p className="empty pad">{t("proj.none")}</p>
          ) : (
            <table className="grid projectGrid">
              <colgroup>
                <col style={{ width: "6%" }} />
                <col style={{ width: "5%" }} />
                <col style={{ width: "30%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "20%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "19%" }} />
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
                  <th>{t("col.project")}</th>
                  <th>{t("proj.colSort")}</th>
                  <th>{t("proj.colCreator")}</th>
                  <th>{t("proj.colProfiles")}</th>
                  <th style={{ textAlign: "right", paddingRight: "var(--s-2)" }}>
                    {t("proj.colAction")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((p, i) => (
                  <tr key={p.id} className={selected.has(p.id) ? "picked" : undefined}>
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
                      <div className="name ellipsis" title={p.name}>
                        {p.name}
                      </div>
                      {!local && (
                        <div className="muted small ellipsis">
                          {p.origin === "team" ? t("proj.originTeam") : t("proj.originLocal")}
                        </div>
                      )}
                    </td>
                    <td className="mono">
                      {Number.isFinite(p.sort_weight) ? p.sort_weight : "—"}
                    </td>
                    <td>
                      <div className="muted small ellipsis" title={p.creator || undefined}>
                        {p.creator || "—"}
                      </div>
                    </td>
                    <td className="mono">
                      {Number.isFinite(p.profile_count) ? p.profile_count : 0}
                    </td>
                    <td className="actions">
                      <div>
                        <IconButton
                          icon="pencil"
                          label={t("row.edit")}
                          onClick={() => setEditing(p)}
                        />
                        <IconButton
                          icon="trash"
                          danger
                          label={t("row.delete")}
                          disabled={busy}
                          onClick={() => void deleteOne(p)}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {editing !== undefined && (
        <ProjectForm
          editing={editing}
          origins={origins}
          defaultOrigin={defaultOrigin}
          defaultSort={nextSort}
          onClose={() => setEditing(undefined)}
          onSaved={async () => {
            setEditing(undefined);
            await onChanged();
          }}
        />
      )}
    </>
  );
}
