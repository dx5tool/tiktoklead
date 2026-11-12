// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Bogdan Shapovalov and the XChange authors

import { useState } from "react";
import { api, type Project } from "../api";
import { useI18n } from "../i18n";

/** A project's name and its place in the list. The creator is a fact, not a
 *  field: it is written when the project is made and never edited. */
export function ProjectForm({
  editing,
  origins,
  defaultOrigin,
  defaultSort,
  onClose,
  onSaved,
}: {
  /** null = create, a row = edit it. */
  editing: Project | null;
  /** Which worlds a new project may go into. One entry means no choice. */
  origins: ("local" | "team")[];
  defaultOrigin: "local" | "team";
  /** Where a new project goes in the list: one past the highest weight. */
  defaultSort: number;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const { t, say } = useI18n();
  const [name, setName] = useState(editing?.name ?? "");
  const [sort, setSort] = useState(
    editing ? String(editing.sort_weight ?? 0) : String(defaultSort),
  );
  const [origin, setOrigin] = useState<"local" | "team">(defaultOrigin);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const weight = Math.min(Number(sort === "" ? "0" : sort), 2_147_483_647);
  const complete = name.trim() !== "" && Number.isInteger(weight) && weight >= 0;

  const submit = async () => {
    if (!complete) return;
    setBusy(true);
    setError(null);
    try {
      if (editing) {
        await api.renameProject(editing.id, name.trim(), editing.origin, weight);
      } else {
        await api.createProjectIn(name.trim(), origin, weight);
      }
      await onSaved();
    } catch (e) {
      setError(say(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="modal"
        style={{ width: 480, height: "auto", maxHeight: "88vh" }}
        role="dialog"
        aria-modal="true"
      >
        <div className="modalHead">
          <h2>{editing ? t("proj.edit") : t("proj.newOne")}</h2>
        </div>
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="field">
            <label htmlFor="project-name">{t("proj.newName")}</label>
            <div>
              <input
                id="project-name"
                type="text"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={{ width: "100%" }}
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="project-sort">{t("proj.colSort")}</label>
            <div>
              <input
                id="project-sort"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={sort}
                onChange={(e) => setSort(e.target.value.replace(/\D/g, ""))}
                style={{ width: "100%" }}
              />
              <p className="hint">{t("proj.sortHint")}</p>
            </div>
          </div>

          {!editing && origins.length > 1 && (
            <div className="field">
              <label>{t("proj.origin")}</label>
              <div className="segmented">
                {origins.map((o) => (
                  <button
                    key={o}
                    type="button"
                    aria-pressed={origin === o}
                    onClick={() => setOrigin(o)}
                  >
                    {o === "team" ? t("proj.originTeam") : t("proj.originLocal")}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="modalFoot">
            {error && <span className="error">{error}</span>}
            <div className="spacer" />
            <button type="button" className="ghost" onClick={onClose} disabled={busy}>
              {t("ui.cancel")}
            </button>
            <button type="submit" className="primary" disabled={busy || !complete}>
              {editing ? t("ui.save") : t("ui.create")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
