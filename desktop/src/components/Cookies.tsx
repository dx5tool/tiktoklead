// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Bogdan Shapovalov and the XChange authors

import { useRef, useState } from "react";
import { cookieObjects } from "../accountImport";
import { api, type Profile } from "../api";
import { useI18n } from "../i18n";
import { isShopeeProfile, shopeeCookieDomain } from "../shopee";
import { Icon } from "./Icon";

/** A pasted session cookie has no expiry and would be gone the moment the
 *  exchange closes the profile. One year is long enough to be useful and short
 *  enough to expire like a session eventually should. */
const COOKIE_TTL_SECONDS = 365 * 24 * 60 * 60;

/** Where a raw Cookie header goes when the string does not name a domain.
 *
 *  The profile's first start URL is the best answer; a Shopee profile without
 *  one falls back to the Vietnamese shop, which is where the import's cookie
 *  material comes from. Anything else leaves the field empty and asks. */
function cookieDomainFor(profile: Profile): string {
  // A Shopee profile gets the shop's real domain, never whatever a lookalike
  // start URL happens to contain. Everything else is the first host.
  if (isShopeeProfile(profile)) return shopeeCookieDomain(profile);
  const first = profile.start_urls?.find((url) => url.trim() !== "");
  if (first) {
    try {
      const host = new URL(first.includes("://") ? first : `https://${first}`)
        .hostname.toLowerCase()
        .replace(/^www\./, "");
      if (host) return `.${host}`;
    } catch {
      // A malformed URL leaves the field empty and asks.
    }
  }
  return "";
}

/** What an exported cookie file is called.
 *
 *  `Profile 3584_cookies_11112026 051210.json` — the profile's name, then the
 *  moment it was taken as day, month, year and the clock, so a folder of these
 *  sorts by name into the order they were captured. Local time rather than UTC:
 *  the operator reading the file is in the same zone the profile ran in, and
 *  "05:12" beside an export they remember taking at five past five is the point
 *  of writing it down at all.
 *
 *  Anything a file name cannot hold — a path separator, a colon, the characters
 *  Windows refuses — becomes a dash. The profile's name is an operator's to
 *  choose, so it is the one part of this that cannot be assumed to be tame. */
export function exportFileName(profileName: string): string {
  const at = new Date();
  const two = (n: number) => String(n).padStart(2, "0");
  const stamp =
    `${two(at.getDate())}${two(at.getMonth() + 1)}${at.getFullYear()}` +
    ` ${two(at.getHours())}${two(at.getMinutes())}${two(at.getSeconds())}`;
  const safe = profileName.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "-").trim() || "profile";
  return `${safe}_cookies_${stamp}.json`;
}

/** Cookies in and out of one profile.
 *
 *  This is how a warmed account arrives from somewhere else, and how it leaves.
 *
 *  Two formats arrive from the field. A JSON array (a cookie-editor export, or
 *  another XChange profile) carries its own domain and expiry. A raw Cookie header
 *  — `SPC_F=…; SPC_EC=…` — is what the Import Account screen stores in a login,
 *  and what people paste from developer tools; it needs a domain, which the
 *  profile supplies or the form asks for.
 *
 *  Two things are said on the screen rather than discovered afterwards. The
 *  profile is opened and closed to do the exchange — the browser holds the
 *  encryption key, so nothing else can read or write the jar, and a person who
 *  sees a window appear should know why. And a cookie with no expiry is a
 *  session cookie, which Chromium never writes to disk, so it does not survive
 *  the profile closing again: importing forty and finding eleven is a bad
 *  surprise, and the count is reported instead. */
export function Cookies({
  profile,
  onClose,
}: {
  profile: Profile;
  onClose: () => void;
}) {
  const { t, say } = useI18n();
  const [text, setText] = useState("");
  const [domain, setDomain] = useState(() => cookieDomainFor(profile));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  // A file too large to be a cookie dump would freeze the dialog while it is
  // parsed, and nobody could see why.
  const FILE_LIMIT = 5 * 1024 * 1024;

  // A bare array is the native shape, but DevTools and a few exporters wrap it
  // as `{"cookies":[…]}` — which is also exactly what our own export looks like
  // before `JSON.stringify(cookies)` unwraps it. Accept both so a file someone
  // pasted whole imports as-is instead of failing with "not a JSON array".
  const jsonCookies = (): unknown[] | null => {
    try {
      const value = JSON.parse(text);
      if (Array.isArray(value)) return value;
      if (value && typeof value === "object" && Array.isArray((value as { cookies?: unknown }).cookies)) {
        return (value as { cookies: unknown[] }).cookies;
      }
      return null;
    } catch {
      return null;
    }
  };

  const trimmed = text.trim();
  const looksJson = trimmed.startsWith("[") || trimmed.startsWith("{");

  // `null` means "not something this dialog can write". The caller shows the
  // reason: invalid JSON, or a raw header without a domain.
  const parsed = (): unknown[] | null => {
    if (!trimmed) return null;
    if (looksJson) return jsonCookies();
    if (!domain.trim()) return null;
    const cookies = cookieObjects(trimmed, {
      domain: domain.trim(),
      expiry: Math.floor(Date.now() / 1000) + COOKIE_TTL_SECONDS,
      secure: true,
    });
    for (const cookie of cookies) {
      // SPC_F is the httpOnly half of a Shopee session. The import set it the
      // same way; a raw header carries no attributes of its own.
      if (typeof cookie.name === "string" && cookie.name.toUpperCase() === "SPC_F") {
        cookie.httpOnly = true;
      }
    }
    return cookies.length > 0 ? cookies : null;
  };
  const ready = trimmed !== "" && parsed() !== null;

  /** A file into the box, not into the profile.
   *
   *  Importing straight to the browser from a file would write cookies nobody
   *  had read: the format check lives in `parsed()`, and the count and the
   *  session-cookie warning only appear after the box is filled. So the file
   *  replaces the text and the ordinary Write to profile button does the write,
   *  which keeps one path into the profile and one place that says what it did.
   *
   *  `.txt` is accepted because a Cookie header pasted into Notepad is the shape
   *  most of these arrive in. */
  const importFile = async (chosen: File) => {
    setError(null);
    setNote(null);
    if (chosen.size >= FILE_LIMIT) {
      setError(t("imp.fileTooBig", { mb: Math.round(FILE_LIMIT / (1024 * 1024)) }));
      return;
    }
    try {
      const content = await chosen.text();
      // The same parser the Write button uses, with the same defaults, so what
      // this accepts is exactly what that button will take.
      if (
        cookieObjects(content, {
          domain: domain.trim(),
          expiry: Math.floor(Date.now() / 1000) + COOKIE_TTL_SECONDS,
        }).length === 0
      ) {
        setError(t("ck.importFileBad"));
        return;
      }
      setText(content);
    } catch (e) {
      setError(say(e));
    }
  };

  /** Read the profile's cookies and write them to a file the operator names.
   *
   *  The folder chooser comes first. Reading opens and closes the profile —
   *  in team mode it takes the lock and pushes the bundle afterwards — and
   *  spending that on an export someone then cancels is the kind of cost that
   *  teaches people not to press the button. Browsing first means a cancelled
   *  export touches nothing at all.
   *
   *  The file name is fixed before the read so both the note and the file agree
   *  on one moment, and the read is the last thing that can fail on its own. */
  const exportFile = async () => {
    setError(null);
    setNote(null);

    let dir: string | null;
    try {
      dir = await api.pickFolder(t("ck.exportFilePick"));
    } catch (e) {
      setError(t("ck.exportFileFailed", { reason: say(e) }));
      return;
    }
    if (dir === null) return;

    setBusy(true);
    try {
      const { cookies } = await api.exportCookies(profile.id);
      const { path } = await api.writeCookiesFile(
        dir,
        exportFileName(profile.name),
        JSON.stringify(cookies, null, 2),
      );
      setNote(t("ck.exportFileDone", { n: cookies.length, path }));
    } catch (e) {
      setError(t("ck.exportFileFailed", { reason: say(e) }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ height: "auto", maxHeight: "88vh" }} role="dialog" aria-modal="true">
        <div className="modalHead">
          <h2>{t("ck.title", { name: profile.name })}</h2>
        </div>

        <div className="form" style={{ paddingTop: "var(--s-5)", overflowY: "auto" }}>
          <p className="hint">{t("ck.opens")}</p>

          <div className="field">
            <label htmlFor="ck-text">{t("ck.json")}</label>
            <div>
              <textarea
                id="ck-text"
                value={text}
                spellCheck={false}
                rows={12}
                style={{ width: "100%", fontFamily: "var(--mono)", fontSize: 12 }}
                placeholder={'SPC_F=…; SPC_EC=…\n\n[{"name":"sid","value":"…","domain":".example.com","path":"/"}]'}
                onChange={(e) => {
                  setText(e.target.value);
                  setNote(null);
                }}
              />
              <p className="hint">{t("ck.formats")}</p>

              {!looksJson && (
                <>
                  <label htmlFor="ck-domain" style={{ display: "block", marginTop: "var(--s-2)" }}>
                    {t("ck.domain")}
                  </label>
                  <input
                    id="ck-domain"
                    value={domain}
                    spellCheck={false}
                    placeholder=".example.com"
                    style={{ width: "100%", fontFamily: "var(--mono)", fontSize: 12 }}
                    onChange={(e) => {
                      setDomain(e.target.value);
                      setNote(null);
                    }}
                  />
                  <p className="hint">{t("ck.domainHint")}</p>
                </>
              )}

              {trimmed !== "" && parsed() === null && (
                <p className="error">
                  {!looksJson && !domain.trim() ? t("ck.domainNeeded") : t("ck.invalid")}
                </p>
              )}
            </div>
          </div>

          {note && <p>{note}</p>}
          {error && <p className="error">{error}</p>}
        </div>

        <div className="modalFoot" style={{ flexWrap: "wrap" }}>
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              setNote(null);
              try {
                const { cookies } = await api.exportCookies(profile.id);
                setText(JSON.stringify(cookies, null, 2));
                setNote(t("ck.exported", { n: cookies.length }));
              } catch (e) {
                setError(say(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? t("ck.working") : t("ck.export")}
          </button>

          {/* Both file actions live on this bottom row with the rest of the
              dialog's transport: the pair reads as "in from a file" and "out to
              a file", which is what they are. Import fills the box above rather
              than writing straight to the profile, so the format check and the
              session-cookie warning still happen before anything is changed. */}
          <input
            ref={fileInput}
            type="file"
            accept=".txt,.json,text/plain,application/json"
            style={{ display: "none" }}
            onChange={(e) => {
              const chosen = e.target.files?.[0];
              // Cleared before the read, so picking the same file twice fires.
              e.target.value = "";
              if (chosen) void importFile(chosen);
            }}
          />
          <button
            type="button"
            className="ck-file ck-file-import"
            disabled={busy}
            title={t("ck.importFileHint")}
            onClick={() => fileInput.current?.click()}
          >
            <Icon name="download" size={14} />
            {t("ck.importFile")}
          </button>
          <button
            type="button"
            className="ck-file ck-file-export"
            disabled={busy}
            title={t("ck.exportFile")}
            onClick={() => void exportFile()}
          >
            <Icon name="upload" size={14} />
            {t("ck.exportFile")}
          </button>

          <div className="spacer" />
          <button onClick={onClose}>{t("ui.close")}</button>
          <button
            className="primary"
            disabled={busy || !ready}
            onClick={async () => {
              setBusy(true);
              setError(null);
              setNote(null);
              try {
                const r = await api.importCookies(profile.id, parsed() ?? []);
                setNote(
                  [
                    t("ck.imported", { n: r.imported }),
                    r.session_only > 0 ? t("ck.sessionExtended", { n: r.session_only }) : "",
                    r.skipped > 0 ? t("ck.skipped", { n: r.skipped }) : "",
                  ]
                    .filter(Boolean)
                    .join(" "),
                );
              } catch (e) {
                setError(say(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? t("ck.working") : t("ck.import")}
          </button>
        </div>
      </div>
    </div>
  );
}
