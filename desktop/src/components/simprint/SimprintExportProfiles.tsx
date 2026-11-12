// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Bogdan Shapovalov and the XChange authors

import { useState } from "react";
import { FolderDown } from "lucide-react";
import {
  api,
  type Profile,
  type ProfilesExportFormat,
  type ProfilesExportResult,
} from "../../api";
import { useI18n } from "../../i18n";

/** What one export is called: `exported_profiles_2026-11-11 16-56-04`.
 *
 *  The same shape every anti-detect tool uses — the point is that a folder
 *  dropped into a shared drive says what it is and when it was taken without
 *  being opened. Local time, because the operator reads it. */
export function exportProfilesName(): string {
  const at = new Date();
  const two = (n: number) => String(n).padStart(2, "0");
  const stamp =
    `${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())} ` +
    `${two(at.getHours())}-${two(at.getMinutes())}-${two(at.getSeconds())}`;
  return `exported_profiles_${stamp}`;
}

/** Profiles out as a directory or a zip, to be imported on another machine.
 *
 *  The folder is chosen before anything is read: an export is a copy of
 *  gigabytes, and starting one somebody then cancels is work this dialog must
 *  not do. Nothing here opens a browser — the agent reads the profile
 *  directories and the saved logins where they lie. */
export function SimprintExportProfiles({
  profiles,
  onClose,
  onDone,
}: {
  profiles: Profile[];
  onClose: () => void;
  onDone: (result: ProfilesExportResult) => void;
}) {
  const { t, say } = useI18n();
  const [dir, setDir] = useState("");
  const [format, setFormat] = useState<ProfilesExportFormat>("directory");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const choose = async () => {
    setError(null);
    try {
      const picked = await api.pickFolder(t("ep.pick"));
      if (picked !== null) setDir(picked);
    } catch (e) {
      setError(say(e));
    }
  };

  const run = async () => {
    if (!dir.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.exportProfiles(
        dir.trim(),
        exportProfilesName(),
        format,
        profiles.map((p) => ({ id: p.id, name: p.name, origin: p.origin })),
      );
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
        style={{ width: 520, height: "auto", maxHeight: "88vh" }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-profiles-title"
      >
        <div className="modalHead">
          <h2
            id="export-profiles-title"
            style={{ display: "flex", alignItems: "center", gap: "var(--s-2)" }}
          >
            <FolderDown size={17} aria-hidden="true" />
            {t("ep.title")}
          </h2>
          <span className="muted small">{t("bar.selected", { n: profiles.length })}</span>
        </div>
        <form
          className="form"
          style={{ paddingTop: "var(--s-4)" }}
          onSubmit={(e) => {
            e.preventDefault();
            void run();
          }}
        >
          <div className="field">
            <label htmlFor="export-profiles-dir">{t("ep.outputDir")}</label>
            <div>
              <div className="row">
                <input
                  id="export-profiles-dir"
                  value={dir}
                  spellCheck={false}
                  autoComplete="off"
                  placeholder={t("ep.selectPath")}
                  onChange={(e) => setDir(e.target.value)}
                  disabled={busy}
                  style={{ flex: 1, minWidth: 0, fontFamily: "var(--mono)", fontSize: 12 }}
                />
                <button
                  type="button"
                  className="ghost"
                  disabled={busy}
                  title={t("ep.browse")}
                  onClick={() => void choose()}
                >
                  …
                </button>
              </div>
            </div>
          </div>

          <div className="field">
            <label>{t("ep.format")}</label>
            <div>
              <div className="segmented">
                <button
                  type="button"
                  aria-pressed={format === "directory"}
                  disabled={busy}
                  onClick={() => setFormat("directory")}
                >
                  {t("ep.directory")}
                </button>
                <button
                  type="button"
                  aria-pressed={format === "zip"}
                  disabled={busy}
                  onClick={() => setFormat("zip")}
                >
                  {t("ep.zip")}
                </button>
              </div>
              <p className="hint">{t("ep.hint", { n: profiles.length })}</p>
              {/* Not a decoration: the file really does carry the passwords. */}
              <p className="hint" style={{ color: "var(--warn)" }}>
                {t("ep.loginsHint")}
              </p>
            </div>
          </div>

          {error && <p className="error">{error}</p>}

          <div className="modalFoot flex items-center gap-2">
            {busy && <span className="muted small">{t("ep.working")}</span>}
            <div className="flex-1" />
            <button type="button" className="ghost" disabled={busy} onClick={onClose}>
              {t("ui.cancel")}
            </button>
            <button type="submit" className="primary" disabled={busy || !dir.trim()}>
              {t("ep.export")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
