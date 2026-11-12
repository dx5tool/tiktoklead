// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Bogdan Shapovalov and the XChange authors

import { useEffect, useRef, useState } from "react";
import { api, type Extension, type Profile } from "../api";
import { useI18n } from "../i18n";

/** Extensions in one profile.
 *
 *  A dialog of its own, beside "Storage & cache": what is installed inside a
 *  profile and how much room that profile takes are two questions, and the one
 *  this file answers is the extension list.
 *
 *  The code behind it has existed since 07.08.2026: ext.rs parses CRX3 and pins
 *  the extension's id so a clone keeps its logins. To an operator an agent
 *  feature with no button is indistinguishable from one that does not exist,
 *  and the market review of 12.09.2026 (docs/12) listed "extensions" as a gap
 *  in a product that had them.
 *
 *  The file is read here, in the webview. The shell has no native file dialog,
 *  so what a chosen .crx is to this side is bytes, and bytes are what the
 *  agent is handed. */
export function Extensions({
  profile,
  running,
  onClose,
}: {
  profile: Profile;
  /** Installing or removing takes effect on the next launch, so say so while
   *  the profile is open. */
  running: boolean;
  onClose: () => void;
}) {
  const { t, say } = useI18n();
  const [list, setList] = useState<Extension[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const reload = async () => {
    try {
      setList(await api.extensions(profile.id));
    } catch (e) {
      setError(say(e));
    }
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.id]);

  const install = async (f: File) => {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const b64 = await toBase64(f);
      const installed = await api.installExtension(profile.id, b64);
      setNote(t("ext.installed", { name: installed.name, version: installed.version }));
      await reload();
    } catch (e) {
      setError(say(e));
    } finally {
      setBusy(false);
      if (file.current) file.current.value = "";
    }
  };

  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ height: "auto", maxHeight: "88vh" }} role="dialog" aria-modal="true">
        <div className="modalHead">
          <h2>{t("ext.title", { name: profile.name })}</h2>
        </div>

        <div className="form" style={{ paddingTop: "var(--s-5)", overflowY: "auto" }}>
          <div className="field">
            <label>{t("ext.installedHeading")}</label>
            <div>
              {list === null ? (
                <p className="hint">{t("ext.loading")}</p>
              ) : list.length === 0 ? (
                <p className="hint">{t("ext.none")}</p>
              ) : (
                <table className="plain">
                  <tbody>
                    {list.map((x) => (
                      <tr key={x.id}>
                        <td>
                          <strong>{x.name}</strong>{" "}
                          <span className="muted">{x.version}</span>
                          <div className="muted mono" style={{ fontSize: 11 }}>
                            {x.id}
                          </div>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <button
                            className="ghost danger"
                            disabled={busy}
                            onClick={async () => {
                              setBusy(true);
                              setError(null);
                              try {
                                await api.removeExtension(profile.id, x.id);
                                await reload();
                              } catch (e) {
                                setError(say(e));
                              } finally {
                                setBusy(false);
                              }
                            }}
                          >
                            {t("ext.remove")}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <p className="hint">{t("ext.hint")}</p>
              {running && <p className="hint">{t("ext.restartHint")}</p>}
              <input
                ref={file}
                type="file"
                accept=".crx"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void install(f);
                }}
              />
              <button disabled={busy} onClick={() => file.current?.click()}>
                {busy ? t("ck.working") : t("ext.add")}
              </button>
            </div>
          </div>

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

function toBase64(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(r.error);
    // A data: URL is "data:<type>;base64,<payload>"; the payload is what the
    // agent wants.
    r.onload = () => resolve(String(r.result).split(",", 2)[1] ?? "");
    r.readAsDataURL(f);
  });
}
