// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Bogdan Shapovalov and the XChange authors

import { useState } from "react";
import type { Profile } from "../../api";
import { useI18n } from "../../i18n";

/** One list of start pages to write to every selected profile.
 *
 *  A dialog of its own rather than a prompt: the field holds a list, and a
 *  one-line input cannot show the two or three URLs a profile opens with. The
 *  list is deliberately blank when several profiles are selected — prefilling
 *  it from the first row would copy one account's sites onto all the others,
 *  and that is a change nobody asked for. */
export function SimprintStartUrls({
  profiles,
  onClose,
  onApply,
}: {
  profiles: Profile[];
  onClose: () => void;
  /** Writes to every profile that allows editing; throws when none did. */
  onApply: (urls: string[]) => Promise<void>;
}) {
  const { t, say } = useI18n();
  const applicable = profiles.filter((p) => p.permissions.includes("edit_profile"));
  const [text, setText] = useState(
    profiles.length === 1 ? (profiles[0].start_urls ?? []).join("\n") : "",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const urls = text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await onApply(urls);
      onClose();
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
        aria-labelledby="bulk-start-urls-title"
      >
        <div className="modalHead">
          <h2 id="bulk-start-urls-title">{t("bar.changeStartUrls")}</h2>
          <span className="muted small">{t("bar.selected", { n: profiles.length })}</span>
        </div>
        <form
          className="form"
          style={{ paddingTop: "var(--s-4)" }}
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="field">
            <label htmlFor="bulk-start-urls">{t("pd.startUrls")}</label>
            <div>
              <textarea
                id="bulk-start-urls"
                rows={8}
                autoFocus
                value={text}
                spellCheck={false}
                placeholder={"https://example.com\nhttps://another.example"}
                onChange={(e) => setText(e.target.value)}
                style={{ width: "100%", fontFamily: "var(--mono)", fontSize: 12 }}
              />
              <p className="hint">{t("bar.startUrlsManyHint", { n: applicable.length })}</p>
            </div>
          </div>

          {error && <p className="error">{error}</p>}

          <div className="modalFoot flex items-center justify-end gap-2">
            <button type="button" className="ghost" disabled={busy} onClick={onClose}>
              {t("ui.cancel")}
            </button>
            <button type="submit" className="primary" disabled={busy || applicable.length === 0}>
              {busy ? t("ck.working") : t("ui.save")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
