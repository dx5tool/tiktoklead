// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Bogdan Shapovalov and the XChange authors

import { useEffect, useState } from "react";
import { api, type Profile, type Usage } from "../api";
import { useI18n } from "../i18n";

/** How much disk one profile takes, and the button that takes the cache back.
 *
 *  A dialog of its own rather than the second half of the extensions one: what
 *  an operator comes here for is "why is this profile X hundred megabytes", and
 *  that question has nothing to do with what is installed inside it.
 *
 *  Clearing runs `usage::trim` in the agent, which removes the directories named
 *  by `bundle::SKIP_CACHES` -- the same list the sync skips, so a profile that
 *  arrives over the wire is the same size as one trimmed here. Cookies, logins,
 *  history, local storage and the extension directory are not on that list and
 *  are not touched; the sentence under the numbers says so, because a button
 *  called "clear cache" sitting next to an account's data has to. */
export function DiskUsage({
  profile,
  running,
  onClose,
}: {
  profile: Profile;
  /** Trimming is refused while the browser holds its caches open; saying so
   *  before the click beats saying so after it. */
  running: boolean;
  onClose: () => void;
}) {
  const { t, say } = useI18n();
  const [usage, setUsage] = useState<Usage | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  // Two clicks, not one: the first shows what is about to go, the second does
  // it. A confirmation dialog on top of a dialog reads as an error.
  const [armed, setArmed] = useState(false);

  const reload = async () => {
    try {
      setUsage(await api.profileUsage(profile.id));
    } catch (e) {
      setError(say(e));
    }
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.id]);

  const trim = async () => {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const r = await api.trimProfile(profile.id);
      setNote(t("ext.trimmed", { mb: mb(r.bytes), n: r.removed.length }));
      setArmed(false);
      await reload();
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
        style={{ width: 520, height: "auto", maxHeight: "88vh" }}
        role="dialog"
        aria-modal="true"
      >
        <div className="modalHead">
          <h2>{t("ext.storageTitle", { name: profile.name })}</h2>
        </div>

        <div className="form" style={{ paddingTop: "var(--s-5)", overflowY: "auto" }}>
          {usage === null ? (
            <p className="hint">{t("ext.loading")}</p>
          ) : (
            <>
              <p>
                {t("ext.disk", {
                  total: mb(usage.total),
                  cache: mb(usage.cache),
                  keep: mb(usage.keep),
                })}
              </p>
              <p className="hint">{t("ext.diskHint")}</p>
              {armed ? (
                <div className="verdict bad">
                  <div>{t("ext.trimConfirm")}</div>
                  <div className="row" style={{ marginTop: "var(--s-2)" }}>
                    <button className="danger" disabled={busy} onClick={() => void trim()}>
                      {busy ? t("ck.working") : t("ext.trim")}
                    </button>
                    <button className="ghost" disabled={busy} onClick={() => setArmed(false)}>
                      {t("ui.cancel")}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  disabled={busy || running || usage.cache === 0}
                  title={running ? t("ext.trimWhileOpen") : undefined}
                  onClick={() => setArmed(true)}
                >
                  {running ? t("ext.trimWhileOpen") : t("ext.trim")}
                </button>
              )}
            </>
          )}

          {note && <p>{note}</p>}
          {error && <p className="error">{error}</p>}
        </div>

        <div className="modalFoot">
          <div className="spacer" />
          <button onClick={onClose}>{t("ui.close")}</button>
        </div>
      </div>
    </div>
  );
}

/** One decimal above 10 MB is noise; below it, the decimal is the number. */
function mb(bytes: number): string {
  const m = bytes / (1024 * 1024);
  return m >= 10 ? Math.round(m).toString() : m.toFixed(1);
}
