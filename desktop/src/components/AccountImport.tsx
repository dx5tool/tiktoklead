// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Bogdan Shapovalov and the XChange authors

import { useEffect, useMemo, useRef, useState } from "react";
import {
  IMPORT_FIELDS,
  credentialKey,
  looksLikeShopee,
  normalizeSpcF,
  parseAccounts,
  parseAccountRows,
  rowsLookLikeShopee,
  sessionCookieHeader,
  splitCookieLogin,
} from "../accountImport";
import {
  api,
  isDesktop,
  type AccountFile,
  type Credential,
  type CredentialIdentity,
  type LocalProxy,
  type Persona,
} from "../api";
import { splitMulti } from "../csv";
import { proxyOptionLabel } from "../providerProxy";
import { useI18n } from "../i18n";
import { IconButton } from "./Icon";
import { Select } from "./Select";

/** What a paste does when the account is already here. See `dupeMode` below:
 *  in one paste the earlier row always wins, because a list that repeats a
 *  login is a list that was assembled twice, not two accounts. */
type DupeMode = "skip" | "update" | "add";

type ImportResult = {
  created: number;
  /** Logins whose password, 2FA or session were replaced on an existing row. */
  updated: number;
  updates: { row: number; name: string }[];
  /** Rows that named an account already in the paste or already imported. */
  skipped: number;
  failed: { row: number; error: string }[];
  warnings: { row: number; error: string }[];
};

/** The machine's logins, keyed by what recognises an account. Built once when
 *  the dialog opens — to count duplicates before the import runs — and again
 *  when it does, so a profile imported from another window is still seen.
 *  Empty when the lookup fails: the check is an aid, and an import that cannot
 *  look must not refuse to run. */
async function loadCredentialIndex(): Promise<Map<string, CredentialIdentity>> {
  const index = new Map<string, CredentialIdentity>();
  try {
    for (const row of await api.credentialIndex()) {
      const key = credentialKey(row.site, row.username, row.cookie);
      if (key && !index.has(key)) index.set(key, row);
    }
  } catch {
    // See above.
  }
  return index;
}

const PLATFORM_LABELS: Record<string, string> = {
  shopee: "Shopee",
  tiktok: "TikTok",
  lazada: "Lazada",
  facebook: "Facebook",
};

/** Shopee's cookie domain when the row carries no Start URL. A row with a URL
 *  uses that host instead, which is how the other Shopee countries and any
 *  Other platform get the right domain. */
const PLATFORM_DOMAINS: Record<string, string> = {
  shopee: ".shopee.vn",
  tiktok: ".tiktok.com",
  lazada: ".lazada.vn",
  facebook: ".facebook.com",
};

/** The site a profile opens the first time it launches, when the row carries
 *  no Start URL of its own. Derived from the same domains the credential's
 *  site uses so the two cannot drift. "other" has none: an unknown platform
 *  must not move the profile anywhere. */
const PLATFORM_START_URLS: Record<string, string> = Object.fromEntries(
  Object.entries(PLATFORM_DOMAINS).map(([id, domain]) => [
    id,
    `https://${domain.replace(/^\./, "")}`,
  ]),
);

/** Past this a parse would freeze the dialog before anyone could see why. */
const FILE_LIMIT = 5 * 1024 * 1024;

/** Spreadsheets are read by the shell. A browser development build has no
 *  Rust side, so a file picked there has to be text. */
const SPREADSHEET = /\.(xlsx|xlsm|xls|xlsb|ods)$/i;

/** Accounts pasted as lines, with a column map.
 *
 *  Local only: profiles and logins are written through the agent on this
 *  machine. The platform is a tag, and the fallback Open on start for a row
 *  with no Start URL — not a profile field. SPC_F, Token and Cookie are
 *  session material and go into the login row's Cookie field; nothing is
 *  written into a browser jar during the import. Email and its password
 *  become a second login row beside the platform account. */
export function AccountImport({
  projectId,
  onDone,
  onClose,
}: {
  projectId: string | null;
  onDone: () => void;
  onClose: () => void;
}) {
  const { t, say } = useI18n();
  const [text, setText] = useState("");
  const [file, setFile] = useState<AccountFile | null>(null);
  const [platform, setPlatform] = useState("other");
  const [mapping, setMapping] = useState<string[]>([]);
  const [savedProxies, setSavedProxies] = useState<LocalProxy[]>([]);
  const [proxyChoice, setProxyChoice] = useState<"column" | "none" | string>("column");
  const [dupeMode, setDupeMode] = useState<DupeMode>("skip");
  const [index, setIndex] = useState<Map<string, CredentialIdentity>>(() => new Map());
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const sourceText = file ? (file.text ?? "") : text;
  const parsed = useMemo(
    () => (file?.rows ? parseAccountRows(file.rows) : parseAccounts(sourceText, file !== null)),
    [sourceText, file],
  );
  const detectedShopee = useMemo(
    () => (file?.rows ? rowsLookLikeShopee(file.rows) : looksLikeShopee(sourceText)),
    [sourceText, file],
  );
  // A manual choice wins for the current paste. The next paste is a new data
  // set and gets the automatic answer again.
  const platformTouched = useRef(false);

  useEffect(() => {
    void api.proxies("local").then(setSavedProxies).catch(() => {});
    void loadCredentialIndex().then(setIndex);
  }, []);

  // The paste is the source of truth: a new paste gets the automatic map and
  // the automatic platform. Changing either by hand is kept until the text
  // changes again.
  useEffect(() => {
    platformTouched.current = false;
    setMapping(
      Array.from({ length: parsed.width }, (_, i) => parsed.autoMap[i] ?? ""),
    );
    if (detectedShopee) setPlatform("shopee");
  }, [parsed, detectedShopee]);

  useEffect(() => {
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [busy, onClose]);

  const fieldLabel = (id: string) => {
    const field = IMPORT_FIELDS.find((f) => f.id === id);
    return field ? t(field.labelKey as never) : "";
  };
  const platformLabel = PLATFORM_LABELS[platform] ?? t("imp.platformOther");
  const visibleRows = parsed.rows.slice(0, 200);
  /** 1-based row as the operator sees it, header included. */
  const rowNumber = (i: number) => i + (parsed.headers.length > 0 ? 2 : 1);

  // The file replaces the paste rather than joining it: one source, so the
  // preview cannot show rows that Import would not take.
  const chooseFile = async (chosen: File) => {
    if (SPREADSHEET.test(chosen.name)) {
      setError(t("imp.xlsxDesktopOnly"));
      return;
    }
    if (chosen.size >= FILE_LIMIT) {
      setError(t("imp.fileTooBig", { mb: Math.round(FILE_LIMIT / (1024 * 1024)) }));
      return;
    }
    try {
      const content = await chosen.text();
      if (parseAccounts(content, true).rows.length === 0) {
        setError(t("imp.fileEmpty"));
        return;
      }
      setError(null);
      setFile({ name: chosen.name, text: content });
      setText("");
    } catch (e) {
      setError(say(e));
    }
  };

  /** The shell's chooser takes text and spreadsheets in one dialog. A browser
   *  development build has no Rust side, so it falls back to the page's own
   *  input and stays text-only. */
  const openAccountFile = async () => {
    if (!isDesktop) {
      fileInput.current?.click();
      return;
    }
    try {
      const picked = await api.pickAccountFile(t("imp.fileChoose"));
      if (!picked) return;
      const next = picked.rows
        ? parseAccountRows(picked.rows)
        : parseAccounts(picked.text ?? "", true);
      if (next.rows.length === 0) {
        setError(t("imp.fileEmpty"));
        return;
      }
      setError(null);
      setFile(picked);
      setText("");
    } catch (e) {
      setError(say(e));
    }
  };

  const clearFile = () => {
    setFile(null);
    if (fileInput.current) fileInput.current.value = "";
  };

  const valuesFor = (row: string[], field: string) =>
    mapping
      .flatMap((mapped, i) => (mapped === field ? [row[i]?.trim() ?? ""] : []))
      .filter(Boolean);
  const firstFor = (row: string[], field: string) => valuesFor(row, field)[0] ?? "";

  const pickPersona = (personas: Persona[]): string => {
    const total = personas.reduce((sum, p) => sum + p.weight, 0);
    if (total <= 0) return "";
    let r = Math.random() * total;
    for (const p of personas) {
      r -= p.weight;
      if (r <= 0) return p.id;
    }
    return personas[personas.length - 1]?.id ?? "";
  };

  /** The login some exporters write inside a Cookie cell (`user|pass|cookie`).
   *  The first mapped Cookie column carrying one wins; an explicit Username or
   *  Password column is preferred to it at the call sites. */
  const cookieLoginForRow = (row: string[]): { username: string; password: string } => {
    for (let i = 0; i < mapping.length; i++) {
      if (mapping[i] !== "cookie") continue;
      const split = splitCookieLogin(row[i] ?? "");
      if (split.username) return { username: split.username, password: split.password };
    }
    return { username: "", password: "" };
  };

  // A Cookie column whose header names the shopee cookie still knows its name
  // even when the cell is only the value. That is the two-column SPC_F/SPC_EC
  // shape, where both columns are mapped to Cookie. A cell that also carries
  // the account login keeps only its cookie part here.
  const cookieValuesForRow = (row: string[]): string[] =>
    mapping.flatMap((mapped, i) => {
      if (mapped !== "cookie") return [];
      const raw = splitCookieLogin(row[i] ?? "").cookie;
      if (!raw) return [];
      const header = (parsed.headers[i] ?? "").toLowerCase();
      if (!raw.includes("=") && header.includes("spc_f")) return [`SPC_F=${raw}`];
      if (!raw.includes("=") && header.includes("spc_ec")) return [`SPC_EC=${raw}`];
      return [raw];
    });

  const hasCookieMaterial = (row: string[]): boolean =>
    valuesFor(row, "spcF").length > 0 ||
    valuesFor(row, "token").length > 0 ||
    cookieValuesForRow(row).length > 0;

  // Stored with the login, not written into a browser during the import.
  const cookieTextForRow = (row: string[]): string =>
    sessionCookieHeader(
      valuesFor(row, "spcF"),
      valuesFor(row, "token"),
      cookieValuesForRow(row),
    );

  // The account credential's site. Written into the login below and used for
  // its key, so the two cannot disagree about where an account lives.
  const accountSite = PLATFORM_DOMAINS[platform]?.replace(/^\./, "") || platformLabel;

  /** What the machine would have to match to call this row already imported.
   *  Two keys at most: the account login and the mail login beside it. A row
   *  with no username is keyed by its session, which is why the cookie is only
   *  built when there is no username to key on. */
  const rowKeys = (row: string[]): string[] => {
    const username = firstFor(row, "username") || cookieLoginForRow(row).username;
    const email = firstFor(row, "email");
    return [
      credentialKey(accountSite, username, username ? "" : cookieTextForRow(row)),
      email ? credentialKey("", email, "") : "",
    ].filter(Boolean);
  };

  // Counted before the import runs, so a paste that repeats itself says so in
  // the preview rather than in the result. `repeated` is a row that repeats one
  // above it in this paste; `present` is one already imported here. A row that
  // repeats an earlier row is reported as the repeat even when that earlier row
  // is itself already here — the paste's own duplication is the thing the
  // operator can fix.
  const duplicates = useMemo(() => {
    const repeated = new Map<number, number>();
    const present = new Map<number, CredentialIdentity>();
    if (dupeMode === "add") return { repeated, present };
    const seen = new Map<string, number>();
    parsed.rows.forEach((row, i) => {
      const keys = rowKeys(row);
      const first = keys.map((key) => seen.get(key)).find((value) => value !== undefined);
      if (first !== undefined) {
        repeated.set(i, first);
      } else {
        const hit = keys.map((key) => index.get(key)).find(Boolean);
        if (hit) present.set(i, hit);
      }
      for (const key of keys) if (!seen.has(key)) seen.set(key, i);
    });
    return { repeated, present };
    // `rowKeys` closes over the mapping, the platform and the platform's
    // label; all three are listed so a remap recounts.
  }, [parsed.rows, mapping, platform, platformLabel, index, dupeMode]);

  // A row with cookies and no proxy will later open through this machine's own
  // address. Say so before the import, not after — but do not block it.
  const cookiesWithoutProxy = parsed.rows.some((row) => {
    if (!hasCookieMaterial(row)) return false;
    if (proxyChoice === "none") return true;
    if (proxyChoice !== "column") return false;
    return firstFor(row, "proxy") === "";
  });

  const run = async () => {
    if (busy || parsed.rows.length === 0) return;
    setBusy(true);
    setError(null);
    setResult(null);
    setProgress({ done: 0, total: parsed.rows.length });
    try {
      const [proxies, personas, stored] = await Promise.all([
        api.proxies("local"),
        api.personas(),
        loadCredentialIndex(),
      ]);
      // The dialog counted against what existed when it opened; the import is
      // checked against what exists now, and the preview's count follows.
      setIndex(stored);
      const byName = new Map<string, LocalProxy>(proxies.map((p) => [p.name.trim().toLowerCase(), p]));
      const byAddr = new Map<string, LocalProxy>(proxies.map((p) => [`${p.host}:${p.port}`, p]));

      // A batch choice replaces the per-row column entirely; only the column
      // mode needs the lines that the paste carried.
      const wanted =
        proxyChoice === "column"
          ? [...new Set(parsed.rows.map((row) => firstFor(row, "proxy")).filter(Boolean))]
          : [];
      const unknown = wanted.filter((line) => !byName.has(line.toLowerCase()));
      const lineToId = new Map<string, string>();
      const lineError = new Map<string, string>();
      if (unknown.length > 0) {
        const imported = await api.importProxies(unknown.join("\n"), t("imp.proxyPrefix"), "local");
        for (const saved of imported.saved) {
          const line = unknown[saved.line - 1];
          const existing = byAddr.get(`${saved.host}:${saved.port}`);
          if (existing) await api.deleteProxy(saved.id, "local").catch(() => {});
          lineToId.set(line, existing?.id ?? saved.id);
        }
        for (const rejected of imported.rejected) {
          lineError.set(unknown[rejected.line - 1], rejected.error);
        }
      }
      const proxyIdFor = (cell: string): { id: string | null; error?: string } => {
        if (!cell) return { id: null };
        const named = byName.get(cell.toLowerCase());
        if (named) return { id: named.id };
        if (lineToId.has(cell)) return { id: lineToId.get(cell)! };
        return { id: null, error: lineError.get(cell) ?? t("csv.badProxy") };
      };
      const batchProxy =
        proxyChoice !== "column" && proxyChoice !== "none"
          ? proxies.find((p) => p.id === proxyChoice)
          : null;
      if (proxyChoice !== "column" && proxyChoice !== "none" && !batchProxy) {
        throw new Error(t("imp.proxyGone"));
      }

      let created = 0;
      let updated = 0;
      let skipped = 0;
      const failed: { row: number; error: string }[] = [];
      const warnings: { row: number; error: string }[] = [];
      const updates: { row: number; name: string }[] = [];
      // The row that already took each key in this paste. An account listed
      // twice is one account, and the first row is the one that carries it.
      const taken = new Map<string, number>();
      for (let i = 0; i < parsed.rows.length; i++) {
        const row = parsed.rows[i];
        const rowNo = rowNumber(i);
        try {
          // Some exporters put `user|pass|cookie` in the Cookie cell: the login
          // it names belongs in the login row, not inside the cookie header.
          const embedded = cookieLoginForRow(row);
          const username = firstFor(row, "username") || embedded.username;
          const password = firstFor(row, "password") || embedded.password;
          const totp = firstFor(row, "totp");
          const email = firstFor(row, "email");
          const emailPassword = firstFor(row, "emailPassword");

          const keys = rowKeys(row);
          const earlier = keys
            .map((key) => taken.get(key))
            .find((value) => value !== undefined);
          const here = keys.map((key) => stored.get(key)).find(Boolean);

          // The duplicate check comes before the proxy is resolved: a row
          // that is not going to be written should not fail because of a
          // proxy it would never have used.
          if (dupeMode !== "add" && earlier !== undefined) {
            skipped++;
            warnings.push({
              row: rowNo,
              error: t("imp.dupeBatch", { first: rowNumber(earlier) }),
            });
          } else if (dupeMode === "skip" && here) {
            skipped++;
            warnings.push({
              row: rowNo,
              error: t("imp.dupeStore", { name: here.profile_name }),
            });
          } else if (dupeMode === "update" && here) {
            // The login is what a re-import refreshes. The profile keeps its
            // name, proxy, tags and fingerprint: those are what the operator
            // arranged around this account, and a row in a paste knows none
            // of them. A field the row does not carry is left as stored.
            const cookie = cookieTextForRow(row);
            if (hasCookieMaterial(row) && !cookie) {
              warnings.push({ row: rowNo, error: t("imp.cookieUnreadable") });
            }
            const rows = await api.credentials(here.profile_id, "local");
            const existing = rows.find((c) => c.id === here.id);
            if (!existing) {
              skipped++;
              warnings.push({ row: rowNo, error: t("imp.dupeGone") });
            } else {
              await api.saveCredential(
                {
                  ...existing,
                  label: existing.label || platformLabel,
                  site: existing.site || accountSite,
                  username: existing.username || username || null,
                  password: password || existing.password,
                  totp: totp || existing.totp,
                  cookie: cookie || existing.cookie,
                },
                "local",
              );
              updated++;
              updates.push({ row: rowNo, name: here.profile_name });
            }
          } else {
            let proxyId: string | null = batchProxy?.id ?? null;
            if (proxyChoice === "column") {
              const proxy = proxyIdFor(firstFor(row, "proxy"));
              if (proxy.error) throw new Error(proxy.error);
              proxyId = proxy.id;
            }

            const languages = splitMulti(firstFor(row, "languages"));
            const tags = [
              ...splitMulti(firstFor(row, "tags")),
              platform,
            ].filter((tag, index, all) => {
              if (!tag) return false;
              const key = tag.toLowerCase();
              return all.findIndex((other) => other.toLowerCase() === key) === index;
            });
            const notes = [
              firstFor(row, "notes"),
              firstFor(row, "uid") ? `UID: ${firstFor(row, "uid")}` : "",
              firstFor(row, "phone") ? `Phone: ${firstFor(row, "phone")}` : "",
            ]
              .filter(Boolean)
              .join("\n");
            const name =
              firstFor(row, "name") ||
              username ||
              `${platformLabel} ${rowNo}`;

            const rowStartUrls = splitMulti(firstFor(row, "startUrls"));
            const platformStartUrl = PLATFORM_START_URLS[platform] ?? "";
            // The row's own URLs win; the platform only fills a row that has
            // none. "Other" has no site, so it leaves the field as it was.
            const startUrls =
              rowStartUrls.length > 0
                ? rowStartUrls
                : platformStartUrl
                  ? [platformStartUrl]
                  : [];

            const saved = await api.saveProfile(
              {
                id: "",
                project_id: projectId,
                name,
                notes,
                status: "",
                tags,
                persona_id: pickPersona(personas),
                fp_seed: 0,
                proxy_id: proxyId,
                allow_no_proxy: !proxyId,
                timezone: firstFor(row, "timezone") || null,
                languages: languages.length > 0 ? languages : null,
                start_urls: startUrls,
                blocklists: [],
              },
              "local",
            );
            created++;

            const cookie = cookieTextForRow(row);
            if (hasCookieMaterial(row) && !cookie) {
              warnings.push({ row: rowNo, error: t("imp.cookieUnreadable") });
            }

            try {
              if (username || password || totp || cookie) {
                const account: Credential = {
                  id: "",
                  profile_id: saved.id,
                  label: platformLabel,
                  site: accountSite,
                  username: username || null,
                  password: password || null,
                  totp: totp || null,
                  cookie: cookie || null,
                  notes: "",
                };
                await api.saveCredential(account, "local");
              }
              if (email || emailPassword) {
                const mail: Credential = {
                  id: "",
                  profile_id: saved.id,
                  label: "Email",
                  site: "",
                  username: email || null,
                  password: emailPassword || null,
                  totp: null,
                  cookie: null,
                  notes: "",
                };
                await api.saveCredential(mail, "local");
              }
            } catch (e) {
              warnings.push({ row: rowNo, error: say(e) });
            }
          }

          for (const key of keys) if (!taken.has(key)) taken.set(key, i);
        } catch (e) {
          failed.push({ row: rowNo, error: say(e) });
        }
        setProgress({ done: i + 1, total: parsed.rows.length });
      }
      setResult({ created, updated, skipped, failed, warnings, updates });
      onDone();
    } catch (e) {
      setError(say(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="scrim"
      onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}
    >
      <div
        className="modal"
        style={{ width: "min(920px, 94vw)", height: "min(760px, 90vh)" }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="imp-title"
      >
        <div className="modalHead">
          <h2 id="imp-title">{t("bar.importAccount")}</h2>
        </div>

        <div
          className="form"
          style={{
            display: "flex",
            flex: 1,
            flexDirection: "column",
            gap: 8,
            minHeight: 0,
            overflow: "hidden",
            padding: "var(--s-4)",
          }}
        >
          {!result && (
            <>
              <p className="hint" style={{ margin: 0 }}>{t("imp.why")}</p>

              <textarea
                autoFocus
                rows={4}
                value={text}
                spellCheck={false}
                disabled={busy || file !== null}
                placeholder={t("imp.placeholder")}
                style={{
                  minHeight: 80,
                  maxHeight: 180,
                  resize: "vertical",
                  fontFamily: "var(--mono)",
                  fontSize: 12,
                }}
                onChange={(e) => setText(e.target.value)}
              />
              <p className="hint" style={{ margin: 0 }}>{t("imp.delims")}</p>

              <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <span className="hint" style={{ margin: 0 }}>{t("imp.file")}</span>
                <input
                  ref={fileInput}
                  type="file"
                  accept=".txt,.csv,text/plain,text/csv"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const chosen = e.target.files?.[0];
                    // Cleared before the async read, so a rejected file (too
                    // large, unreadable) can be picked again and still fire.
                    e.target.value = "";
                    if (chosen) void chooseFile(chosen);
                  }}
                />
                <button
                  type="button"
                  className="ghost"
                  disabled={busy}
                  onClick={() => void openAccountFile()}
                >
                  {t("imp.fileChoose")}
                </button>
                {file && (
                  <>
                    <input
                      readOnly
                      value={file.name}
                      title={file.name}
                      aria-label={t("imp.filePath")}
                      style={{
                        flex: 1,
                        minWidth: 220,
                        fontFamily: "var(--mono)",
                        fontSize: 12,
                      }}
                    />
                    <IconButton
                      icon="trash"
                      label={t("imp.fileRemove")}
                      onClick={clearFile}
                      disabled={busy}
                    />
                  </>
                )}
              </div>
              <p className="hint" style={{ margin: 0 }}>
                {file
                  ? t("imp.fileRows", { rows: parsed.rows.length })
                  : t("imp.fileHint")}
              </p>

              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                <span className="hint" style={{ margin: 0 }}>{t("imp.platform")}</span>
                <Select
                  value={platform}
                  onChange={(e) => {
                    platformTouched.current = true;
                    setPlatform(e.target.value);
                  }}
                  disabled={busy}
                  aria-label={t("imp.platform")}
                  style={{ width: 150 }}
                >
                  <option value="shopee">Shopee</option>
                  <option value="tiktok">TikTok</option>
                  <option value="lazada">Lazada</option>
                  <option value="facebook">Facebook</option>
                  <option value="other">{t("imp.platformOther")}</option>
                </Select>
                <span className="hint" style={{ margin: "0 0 0 8px" }}>{t("imp.proxy")}</span>
                <Select
                  value={proxyChoice}
                  onChange={(e) => setProxyChoice(e.target.value)}
                  disabled={busy}
                  aria-label={t("imp.proxy")}
                  style={{ width: 290 }}
                >
                  <option value="column">{t("imp.proxyColumn")}</option>
                  <option value="none">{t("imp.proxyNone")}</option>
                  {savedProxies.map((p) => (
                    <option key={p.id} value={p.id}>
                      {proxyOptionLabel(p)}
                    </option>
                  ))}
                </Select>
                {proxyChoice !== "column" && (
                  <span className="hint" style={{ margin: 0 }}>{t("imp.proxyOverride")}</span>
                )}
                <span className="hint" style={{ margin: "0 0 0 8px" }}>{t("imp.dupe")}</span>
                <Select
                  value={dupeMode}
                  onChange={(e) => setDupeMode(e.target.value as DupeMode)}
                  disabled={busy}
                  aria-label={t("imp.dupe")}
                  style={{ width: 190 }}
                >
                  <option value="skip">{t("imp.dupeSkip")}</option>
                  <option value="update">{t("imp.dupeUpdate")}</option>
                  <option value="add">{t("imp.dupeAdd")}</option>
                </Select>
              </div>

              {dupeMode === "update" && (
                <p className="hint" style={{ margin: 0 }}>{t("imp.dupeUpdateHint")}</p>
              )}

              {cookiesWithoutProxy && (
                <div
                  className="notice warnBar"
                  style={{ display: "block", margin: 0 }}
                  role="status"
                >
                  {t("imp.cookieNoProxy")}
                </div>
              )}
            </>
          )}

          {parsed.width > 0 && !result && (
            <>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span className="hint" style={{ margin: 0 }}>{t("imp.map")}</span>
                <span className="hint" style={{ margin: 0 }}>
                  {t("imp.summary", { rows: parsed.rows.length, cols: parsed.width })}
                </span>
              </div>

              {(duplicates.repeated.size > 0 || duplicates.present.size > 0) && (
                <p className="hint" style={{ margin: 0 }}>
                  {t("imp.dupeFound", {
                    batch: duplicates.repeated.size,
                    store: duplicates.present.size,
                  })}
                </p>
              )}

              <div className="impMap">
                {Array.from({ length: parsed.width }, (_, i) => {
                  const column = parsed.headers[i]?.trim() || t("imp.column", { n: i + 1 });
                  return (
                    <label key={i} className="impCol">
                      <span title={column}>{column}</span>
                      <Select
                        value={mapping[i] ?? ""}
                        disabled={busy}
                        aria-label={t("imp.column", { n: i + 1 })}
                        onChange={(e) =>
                          setMapping((prev) => {
                            const next = Array.from(
                              { length: Math.max(prev.length, i + 1) },
                              (_, index) => prev[index] ?? "",
                            );
                            next[i] = e.target.value;
                            return next;
                          })
                        }
                      >
                        <option value="">{t("imp.ignore")}</option>
                        <optgroup label={t("imp.groupAccount")}>
                          {IMPORT_FIELDS.filter((f) => f.group === "account").map((f) => (
                            <option key={f.id} value={f.id}>
                              {t(f.labelKey as never)}
                            </option>
                          ))}
                        </optgroup>
                        <optgroup label={t("imp.groupProfile")}>
                          {IMPORT_FIELDS.filter((f) => f.group === "profile").map((f) => (
                            <option key={f.id} value={f.id}>
                              {t(f.labelKey as never)}
                            </option>
                          ))}
                        </optgroup>
                      </Select>
                    </label>
                  );
                })}
              </div>
            </>
          )}

          {parsed.width > 0 && (
            <div className="tableWrap impPreview" style={{ flex: 1, minHeight: 120 }}>
                <table className="grid">
                  <thead>
                    <tr>
                      {Array.from({ length: parsed.width }, (_, i) => {
                        const label = mapping[i] ? fieldLabel(mapping[i]) : "";
                        return (
                          <th key={i} className={label ? undefined : "dim"}>
                            {label || t("imp.column", { n: i + 1 })}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map((row, r) => (
                      <tr key={r}>
                        {Array.from({ length: parsed.width }, (_, c) => {
                          const mapped = mapping[c] ?? "";
                          const raw = row[c] ?? "";
                          const shown = mapped === "spcF" ? normalizeSpcF(raw) : raw;
                          return (
                            <td
                              key={c}
                              className="small"
                              title={shown !== raw ? raw : undefined}
                            >
                              {shown}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
          )}

          {busy && progress && (
            <p className="hint" style={{ margin: 0 }}>
              {t("imp.progress", { done: progress.done, total: progress.total })}
            </p>
          )}

          {result && (
            <div
              className="notice"
              style={{ display: "block", maxHeight: 160, overflowY: "auto" }}
            >
              <p style={{ margin: 0 }}>{t("imp.done", { n: result.created })}</p>
              {result.updated > 0 && (
                <p className="small" style={{ margin: "var(--s-2) 0 0" }}>
                  {t("imp.updated", { n: result.updated })}
                </p>
              )}
              {result.updates.length > 0 && (
                <ul className="small" style={{ margin: "var(--s-2) 0 0", paddingLeft: 18 }}>
                  {result.updates.slice(0, 20).map((u) => (
                    <li key={u.row}>{t("imp.rowUpdated", u)}</li>
                  ))}
                  {result.updates.length > 20 && <li>…{result.updates.length - 20}</li>}
                </ul>
              )}
              {result.skipped > 0 && (
                <p className="small" style={{ margin: "var(--s-2) 0 0" }}>
                  {t("imp.skipped", { n: result.skipped })}
                </p>
              )}
              {result.failed.length > 0 && (
                <>
                  <p className="small" style={{ margin: "var(--s-2) 0 0" }}>
                    {t("imp.failed", { n: result.failed.length })}
                  </p>
                  <ul className="small" style={{ margin: "var(--s-2) 0 0", paddingLeft: 18 }}>
                    {result.failed.slice(0, 20).map((f) => (
                      <li key={f.row}>{t("imp.rowFailed", f)}</li>
                    ))}
                    {result.failed.length > 20 && <li>…{result.failed.length - 20}</li>}
                  </ul>
                </>
              )}
              {result.warnings.length > 0 && (
                <>
                  <p className="small" style={{ margin: "var(--s-2) 0 0" }}>
                    {t("imp.warnings", { n: result.warnings.length })}
                  </p>
                  <ul className="small" style={{ margin: "var(--s-2) 0 0", paddingLeft: 18 }}>
                    {result.warnings.slice(0, 20).map((w, i) => (
                      <li key={`${w.row}-${i}`}>{t("imp.rowWarning", w)}</li>
                    ))}
                    {result.warnings.length > 20 && <li>…{result.warnings.length - 20}</li>}
                  </ul>
                </>
              )}
            </div>
          )}

          {error && <p className="error">{error}</p>}
        </div>

        <div className="modalFoot">
          <span className="muted small">{t("imp.localOnly")}</span>
          <div className="spacer" />
          <button type="button" className="ghost" disabled={busy} onClick={onClose}>
            {result ? t("ui.close") : t("ui.cancel")}
          </button>
          {!result && (
            <button
              type="button"
              className="primary"
              disabled={busy || parsed.rows.length === 0}
              onClick={() => void run()}
            >
              {busy ? t("bp.working") : t("imp.go")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
