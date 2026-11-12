// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Bogdan Shapovalov and the XChange authors

import { useState } from "react";
import { FileArchive, FolderInput, FolderOpen } from "lucide-react";
import { api, type ProfilesImportResult } from "../../api";
import { useI18n } from "../../i18n";

/** Profiles in from a folder or a zip made by Export profiles.
 *
 *  Three shapes are accepted and detected by the agent: the exported folder
 *  with its manifest, one profile folder on its own, or a parent folder holding
 *  several profiles. A folder and a zip need two choosers because the operating
 *  system has no dialog that picks either. */
export function SimprintImportProfiles({
  projectId,
  projectName,
  onClose,
  onDone,
}: {
  projectId: string | null;
  projectName: string | null;
  onClose: () => void;
  onDone: (result: ProfilesImportResult) => void;
}) {
  const { t, say } = useI18n();
  const [path, setPath] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const choose = async (zip: boolean) => {
    setError(null);
    try {
      const picked = zip
        ? await api.pickZip(t("ip.pickZip"))
        : await api.pickFolder(t("ip.pickFolder"));
      if (picked !== null) setPath(picked);
    } catch (e) {
      setError(say(e));
    }
  };

  const run = async () => {
    if (!path.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.importProfiles(path.trim(), projectId);
      onDone(result);
    } catch (e) {
      setError(say(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="scrim"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        className="modal"
        style={{ width: 560, height: "auto", maxHeight: "88vh" }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-profiles-title"
      >
        <div className="modalHead">
          <h2
            id="import-profiles-title"
            style={{ display: "flex", alignItems: "center", gap: "var(--s-2)" }}
          >
            <FolderInput size={17} aria-hidden="true" />
            {t("ip.title")}
          </h2>
        </div>
        <form
          className="form"
          style={{ paddingTop: "var(--s-4)" }}
          onSubmit={(e) => {
            e.preventDefault();
            void run();
          }}
        >
          <p className="hint" style={{ marginTop: 0 }}>
            {t("ip.hint")}
          </p>

          <div className="field">
            <label htmlFor="import-profiles-path">{t("ip.source")}</label>
            <div>
              <input
                id="import-profiles-path"
                value={path}
                spellCheck={false}
                autoComplete="off"
                placeholder={t("ip.selectPath")}
                onChange={(e) => setPath(e.target.value)}
                disabled={busy}
                style={{ width: "100%", fontFamily: "var(--mono)", fontSize: 12 }}
              />
              <div className="row" style={{ marginTop: "var(--s-2)", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="ghost"
                  disabled={busy}
                  onClick={() => void choose(false)}
                  style={{ display: "flex", alignItems: "center", gap: 6 }}
                >
                  <FolderOpen size={13} />
                  {t("ip.folder")}
                </button>
                <button
                  type="button"
                  className="ghost"
                  disabled={busy}
                  onClick={() => void choose(true)}
                  style={{ display: "flex", alignItems: "center", gap: 6 }}
                >
                  <FileArchive size={13} />
                  {t("ip.zip")}
                </button>
              </div>
              <p className="hint">
                {projectName
                  ? t("ip.intoProject", { name: projectName })
                  : t("ip.noProject")}
              </p>
            </div>
          </div>

          {error && <p className="error">{error}</p>}

          <div className="modalFoot flex items-center gap-2">
            {busy && <span className="muted small">{t("ip.working")}</span>}
            <div className="flex-1" />
            <button type="button" className="ghost" disabled={busy} onClick={onClose}>
              {t("ui.cancel")}
            </button>
            <button type="submit" className="primary" disabled={busy || !path.trim()}>
              {t("ip.import")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
