// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Bogdan Shapovalov and the XChange authors

import { parseCsv } from "./csv";

/** A field the Import Account screen can map a pasted column to. */
export type AccountField =
  | "username"
  | "password"
  | "totp"
  | "spcF"
  | "email"
  | "emailPassword"
  | "cookie"
  | "token"
  | "phone"
  | "uid"
  | "name"
  | "proxy"
  | "tags"
  | "notes"
  | "startUrls"
  | "timezone"
  | "languages";

export interface ImportField {
  id: AccountField;
  labelKey: string;
  group: "account" | "profile";
  /** Header spellings that mean this field, matched after normalisation. */
  aliases: string[];
}

/** The order here is the order of the dropdowns: account fields first, then
 *  the profile's own. SPC_F, Token and Cookie are session material — the import
 *  stores them in the login row's Cookie field, and only the Login button
 *  writes them into the profile's cookie jar. Platform is not a field: the
 *  import adds it as a tag. */
export const IMPORT_FIELDS: ImportField[] = [
  { id: "username", labelKey: "imp.f.username", group: "account", aliases: ["username", "user", "login", "account", "tendangnhap", "dangnhap", "taikhoan"] },
  { id: "password", labelKey: "imp.f.password", group: "account", aliases: ["password", "pass", "pwd", "passwd", "matkhau"] },
  { id: "totp", labelKey: "imp.f.totp", group: "account", aliases: ["2fa", "2fasecret", "totp", "otp", "otpsecret", "secret", "mahaiyeuto", "maotp"] },
  { id: "spcF", labelKey: "imp.f.spcF", group: "account", aliases: ["spcf"] },
  { id: "email", labelKey: "imp.f.email", group: "account", aliases: ["email", "mail", "emailaddress", "thudientu", "hopthu"] },
  { id: "emailPassword", labelKey: "imp.f.emailPassword", group: "account", aliases: ["emailpassword", "emailpass", "mailpassword", "matkhaumail", "matkhauthudientu"] },
  { id: "cookie", labelKey: "imp.f.cookie", group: "account", aliases: ["cookie", "cookies", "spcec"] },
  { id: "token", labelKey: "imp.f.token", group: "account", aliases: ["token", "accesstoken"] },
  { id: "phone", labelKey: "imp.f.phone", group: "account", aliases: ["phone", "mobile", "phonenumber", "sodienthoai", "dienthoai", "sdt"] },
  { id: "uid", labelKey: "imp.f.uid", group: "account", aliases: ["uid", "id", "userid", "manguoidung", "idnguoidung"] },
  { id: "name", labelKey: "imp.f.name", group: "profile", aliases: ["name", "profile", "profilename", "title", "ten", "tenprofile", "tieude"] },
  { id: "proxy", labelKey: "imp.f.proxy", group: "profile", aliases: ["proxy", "proxyurl", "proxyline"] },
  { id: "tags", labelKey: "imp.f.tags", group: "profile", aliases: ["tags", "tag", "group", "nhan", "the", "nhom"] },
  { id: "notes", labelKey: "imp.f.notes", group: "profile", aliases: ["notes", "note", "comment", "remark", "ghichu", "ghichep", "binhluan"] },
  { id: "startUrls", labelKey: "imp.f.startUrls", group: "profile", aliases: ["starturls", "starturl", "urls", "url", "site", "sites", "urlbatdau", "duongdan", "trangweb"] },
  { id: "timezone", labelKey: "imp.f.timezone", group: "profile", aliases: ["timezone", "tz", "timezoneid", "muigio"] },
  { id: "languages", labelKey: "imp.f.languages", group: "profile", aliases: ["languages", "language", "lang", "ngonngu"] },
];

/** Header cells arrive in the operator's language. Diacritics are stripped so
 *  "Tên đăng nhập" matches the alias "tendangnhap"; NFD leaves đ alone, which
 *  is why it is replaced by hand. */
const normalize = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[\s_-]+/g, "");

const BY_ALIAS = new Map<string, AccountField>();
for (const field of IMPORT_FIELDS) {
  for (const alias of field.aliases) BY_ALIAS.set(normalize(alias), field.id);
}

export interface ParsedAccounts {
  /** Data rows. A header row is not here when one was recognised. */
  rows: string[][];
  /** The original header cells, or empty when the first row was data. */
  headers: string[];
  /** Field id for each column, or "" to ignore it. */
  autoMap: string[];
  width: number;
}

/** The paste box splits on these only: a comma or semicolon inside a cookie
 *  value is data, not a column boundary. */
const SEPARATORS = ["|", "\t"] as const;

/** A chosen file is usually a spreadsheet export, where a comma or semicolon
 *  IS the column boundary — the signature of a file is not the signature of
 *  what people paste. */
const FILE_SEPARATORS = ["|", "\t", ",", ";"] as const;

/** The first separator that splits at least half the sampled lines into
 *  columns. The order is a priority, not a score: a cookie cell carries many
 *  semicolons, and counting them made the inside of one cell look like the
 *  widest table in the file. A real field boundary appears on every line; the
 *  punctuation inside a value does not have to. */
function detectSeparator(text: string, separators: readonly string[]): string {
  const lines = text
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "")
    .slice(0, 10);
  for (const separator of separators) {
    const splits = lines.filter((line) => line.includes(separator)).length;
    if (splits >= Math.max(1, Math.ceil(lines.length / 2))) return separator;
  }
  return separators[0] ?? "|";
}

/** `a=b; c=d` — a cookie string, not a bare value. */
function looksLikeCookieCell(cell: string): boolean {
  return /^[A-Za-z_][\w.-]*\s*=\s*[^=]*?(;\s*[A-Za-z_][\w.-]*\s*=[^=]*?)*;?$/.test(cell);
}

/** A Shopee SPC_F token pasted without its name: one long run of letters and
 *  digits. Ordinary passwords, emails, URLs and proxy lines are all shorter or
 *  carry punctuation, so they do not match. */
function looksLikeBareSpcF(cell: string): boolean {
  return /^[A-Za-z0-9]{20,}$/.test(cell);
}

/** Split pasted accounts into columns. A paste is split on pipe and tab only;
 *  a file may also use the comma or semicolon of a spreadsheet export. A first
 *  row whose cells read like field names is taken as the header and mapped.
 *  Without a header the first two columns are the login, which is the shape
 *  these lists are pasted in. */
export function parseAccounts(text: string, fromFile = false): ParsedAccounts {
  const clean = text.trim();
  const rows = parseCsv(clean, [
    detectSeparator(clean, fromFile ? FILE_SEPARATORS : SEPARATORS),
  ]);
  return parseAccountRows(rows);
}

/** The same mapping for rows that did not come from text. The shell reads a
 *  spreadsheet and hands over the cells already separated, so there is no
 *  quoting left to undo. The header rules and the SPC_F heuristics are
 *  deliberately unchanged: a list in .xlsx and the same list in .csv must map
 *  to the same columns.
 *
 *  A list pasted into Excel is often one column whose cells each carry the
 *  whole line, `user|pass|cookie`. Those cells are split with the same
 *  separator rules as a text file — but only when the sheet really has one
 *  column: a `|` inside a value of a multi-column sheet is data, not a column
 *  boundary. */
export function parseAccountRows(rows: string[][]): ParsedAccounts {
  const oneColumn = rows.reduce((max, row) => Math.max(max, row.length), 0) <= 1;
  const cells =
    oneColumn && rows.length > 0
      ? parseCsv(rows.map((row) => row[0] ?? "").join("\n"), FILE_SEPARATORS)
      : rows;

  const width = cells.reduce((max, row) => Math.max(max, row.length), 0);
  const first = cells[0] ?? [];
  const matches = first.map((cell) => BY_ALIAS.get(normalize(cell)) ?? "");
  const matched = matches.filter(Boolean).length;
  const hasHeader =
    matched >= Math.max(2, Math.ceil(first.length / 2)) ||
    (first.length === 1 && matched === 1);
  const data = hasHeader ? cells.slice(1) : cells;
  const autoMap = new Array<string>(width).fill("");

  if (hasHeader) {
    matches.forEach((field, i) => {
      if (field) autoMap[i] = field;
    });
  } else {
    if (width > 0) autoMap[0] = "username";
    if (width > 1) autoMap[1] = "password";
  }

  // Shopee's cookies name themselves. A field carrying both SPC_F and SPC_EC
  // is ordinary cookie material; SPC_F on its own keeps its mapping so the
  // import can name the cookie when the value is only the value. A column the
  // header or the position already claimed keeps it: that is what tells a
  // bare-value SPC_F column apart from the Cookie column beside it.
  for (let i = 0; i < width; i++) {
    if (autoMap[i]) continue;
    const cells = [first[i] ?? "", ...data.slice(0, 5).map((row) => row[i] ?? "")]
      .map((cell) => cell.trim())
      .filter(Boolean);
    const sample = cells.join(" ").toLowerCase();
    const hasF = sample.includes("spc_f");
    const hasEc = sample.includes("spc_ec");
    if (hasF && hasEc) autoMap[i] = "cookie";
    else if (hasF) autoMap[i] = "spcF";
    else if (hasEc) autoMap[i] = "cookie";
    else if (i >= 2 && cells.length > 0 && cells.every(looksLikeCookieCell)) {
      autoMap[i] = "cookie";
    }
    // `user|pass|vJXCtjNll13Mt6QoHYlKtIapx6UZxuUl` — the SPC_F value pasted
    // without its name. A column after the login whose every cell is one long
    // run of letters and digits is that value, not an email, URL or proxy.
    // The last column of a mixed paste is a Cookie and is claimed above, so
    // this only ever names the bare-value column beside it.
    else if (i >= 2 && cells.length > 0 && cells.every(looksLikeBareSpcF)) {
      autoMap[i] = "spcF";
    }
  }

  return {
    rows: data,
    headers: hasHeader ? first : [],
    autoMap,
    width,
  };
}

/** SPC_F is often pasted as the bare value. A cookie needs a name, so `abc`
 *  becomes `SPC_F=abc`; anything that is already a cookie string is left as
 *  it came. */
export function normalizeSpcF(value: string): string {
  const raw = value
    .trim()
    .replace(/;\s*$/, "")
    .replace(/^"(.*)"$/, "$1")
    .trim();
  if (!raw) return "";
  if (/^spc_f\s*=/i.test(raw)) return `SPC_F=${raw.replace(/^spc_f\s*=/i, "")}`;
  if (raw.includes(";")) return raw;
  return `SPC_F=${raw}`;
}

/** A Token is a session cookie. A bare value gets the name the cookie jar
 *  needs; a full cookie string is left alone. */
export function normalizeToken(value: string): string {
  const raw = value.trim().replace(/;\s*$/, "").trim();
  if (!raw) return "";
  if (/^(token|access_token|sessionid|session_id)\s*=/i.test(raw)) return raw;
  if (raw.includes(";")) return raw;
  return `token=${raw}`;
}

export interface CookieImportOptions {
  /** Used when the cookie string itself names no domain. */
  domain: string;
  /** Seconds since the epoch. A pasted session cookie would otherwise be lost
   *  the moment the import closes the profile again. */
  expiry: number;
  secure?: boolean;
  httpOnly?: boolean;
}

function normalizeSameSite(value: string): string {
  const v = value.toLowerCase();
  if (v === "none" || v === "no_restriction") return "None";
  if (v === "strict") return "Strict";
  return "Lax";
}

/** Cookie strings and cookie-editor JSON into the CDP shape the agent takes.
 *  `a=b; c=d` is two cookies, `path`/`domain`/`expires` are attributes of the
 *  cookie before them, and a JSON array passes through with missing domain and
 *  expiry filled in. */
export function cookieObjects(
  value: string,
  options: CookieImportOptions,
): Record<string, unknown>[] {
  const text = value.trim();
  if (!text) return [];

  if (text.startsWith("[") || text.startsWith("{")) {
    try {
      const parsed: unknown = JSON.parse(text);
      const list = Array.isArray(parsed)
        ? parsed
        : parsed && typeof parsed === "object" && Array.isArray((parsed as { cookies?: unknown }).cookies)
          ? (parsed as { cookies: unknown[] }).cookies
          : null;
      if (list) {
        const out: Record<string, unknown>[] = [];
        for (const item of list) {
          if (!item || typeof item !== "object") continue;
          const cookie = { ...(item as Record<string, unknown>) };
          if (!cookie.domain && !cookie.url && options.domain) cookie.domain = options.domain;
          if (!cookie.path && !cookie.url) cookie.path = "/";
          if (
            cookie.expires === undefined &&
            cookie.expirationDate === undefined &&
            cookie.expiry === undefined
          ) {
            cookie.expires = options.expiry;
          }
          if (options.secure && cookie.secure === undefined) cookie.secure = true;
          if (options.httpOnly && cookie.httpOnly === undefined) cookie.httpOnly = true;
          if (typeof cookie.sameSite === "string") cookie.sameSite = normalizeSameSite(cookie.sameSite);
          out.push(cookie);
        }
        return out;
      }
    } catch {
      // Not JSON; it is a Cookie header below.
    }
  }

  const out: Record<string, unknown>[] = [];
  let current: Record<string, unknown> | null = null;
  for (const rawPart of text.split(";")) {
    const part = rawPart.trim();
    if (!part) continue;
    const eq = part.indexOf("=");
    if (eq < 0) {
      const key = part.toLowerCase();
      if (current && key === "secure") current.secure = true;
      if (current && key === "httponly") current.httpOnly = true;
      continue;
    }
    const name = part.slice(0, eq).trim();
    const val = part.slice(eq + 1).trim();
    const key = name.toLowerCase();
    const attribute = [
      "path",
      "domain",
      "expires",
      "max-age",
      "samesite",
      "secure",
      "httponly",
      "priority",
    ].includes(key);
    if (attribute && current) {
      if (key === "path") current.path = val;
      else if (key === "domain") current.domain = val;
      else if (key === "expires") {
        const at = Date.parse(val);
        if (Number.isFinite(at)) current.expires = Math.floor(at / 1000);
      } else if (key === "max-age") {
        const seconds = Number(val);
        if (Number.isFinite(seconds)) current.expires = Math.floor(Date.now() / 1000) + seconds;
      } else if (key === "samesite") current.sameSite = normalizeSameSite(val);
      else if (key === "secure") current.secure = true;
      else if (key === "httponly") current.httpOnly = true;
      continue;
    }
    if (!name) continue;
    const cookie: Record<string, unknown> = {
      name,
      value: val,
      path: "/",
      expires: options.expiry,
    };
    if (options.domain) cookie.domain = options.domain;
    if (options.secure) cookie.secure = true;
    if (options.httpOnly) cookie.httpOnly = true;
    out.push(cookie);
    current = cookie;
  }
  return out;
}

const SHOPEE_COOKIE = /spc[_-]?(f|ec)\b/i;

/** A login written into the Cookie cell: `user|pass|cookie` or `user|cookie`.
 *
 *  Some exporters put the session in the same cell as the account, with `|`
 *  between them. The segments before the cookie are the login; a segment that
 *  carries `=` or `;` is the cookie itself, not a password. A Cookie cell with
 *  no `|` is left whole, because a cookie value may legitimately contain one
 *  of those characters. */
export function splitCookieLogin(value: string): {
  username: string;
  password: string;
  cookie: string;
} {
  const text = value.trim();
  const parts = text.split("|");
  if (parts.length < 2) return { username: "", password: "", cookie: text };

  const username = parts[0].trim();
  if (!username || /[=;]/.test(username)) {
    return { username: "", password: "", cookie: text };
  }

  let rest = parts.slice(1);
  let password = "";
  if (rest.length >= 2 && !/[=;]/.test(rest[0])) {
    password = rest[0].trim();
    rest = rest.slice(1);
  }
  return { username, password, cookie: rest.join("|").trim() };
}

/** SPC_F or SPC_EC anywhere in the pasted data means a Shopee account. */
export function looksLikeShopee(text: string): boolean {
  return SHOPEE_COOKIE.test(text);
}

/** The same for a spreadsheet: any cell naming the cookie is enough. */
export function rowsLookLikeShopee(rows: string[][]): boolean {
  return rows.some((row) => row.some((cell) => SHOPEE_COOKIE.test(cell)));
}

const COOKIE_ATTRIBUTES = new Set([
  "path",
  "domain",
  "expires",
  "max-age",
  "samesite",
  "secure",
  "httponly",
  "priority",
]);

function pairValue(value: unknown): string {
  return typeof value === "string"
    ? value
    : typeof value === "number" || typeof value === "boolean"
      ? String(value)
      : "";
}

/** Session material from several cells as one Cookie header.
 *
 *  The login row keeps a cookie string, not a cookie jar: `SPC_F=…; SPC_EC=…`.
 *  Attributes are dropped because the browser side applies its own domain,
 *  path and expiry when the Login button writes the header. JSON arrays and
 *  `{"cookies":[…]}` are accepted for rows exported from a cookie editor.
 *  The first occurrence of a name wins, so a dedicated SPC_F column is not
 *  overwritten by a duplicate inside a full Cookie cell. */
export function cookieHeaderText(values: string[]): string {
  const pairs = new Map<string, string>();
  const add = (name: string, value: string) => {
    const key = name.trim();
    if (!key || COOKIE_ATTRIBUTES.has(key.toLowerCase()) || pairs.has(key)) return;
    pairs.set(key, value);
  };

  for (const value of values) {
    const text = value.trim();
    if (!text) continue;

    if (text.startsWith("[") || text.startsWith("{")) {
      try {
        const parsed: unknown = JSON.parse(text);
        const list = Array.isArray(parsed)
          ? parsed
          : parsed && typeof parsed === "object" && Array.isArray((parsed as { cookies?: unknown }).cookies)
            ? (parsed as { cookies: unknown[] }).cookies
            : null;
        if (list) {
          for (const item of list) {
            if (!item || typeof item !== "object") continue;
            const name = pairValue((item as { name?: unknown }).name);
            if (name) add(name, pairValue((item as { value?: unknown }).value));
          }
          continue;
        }
      } catch {
        // Not JSON; it is a Cookie header below.
      }
    }

    for (const rawPart of text.split(";")) {
      const part = rawPart.trim();
      const eq = part.indexOf("=");
      if (eq < 0) continue;
      let name = part.slice(0, eq).trim();
      let cookieValue = part.slice(eq + 1).trim();
      // Some exporters print `domain=name=value` per cookie. The first segment
      // is the cookie's domain, not its name; the login stores a header the
      // Login button applies to the profile's own site, so the domain is
      // dropped. A real cookie name carrying a dot of its own is rare enough
      // to accept the ambiguity.
      const innerEq = cookieValue.indexOf("=");
      if (innerEq >= 0 && name.includes(".")) {
        const innerName = cookieValue.slice(0, innerEq).trim();
        if (innerName && !COOKIE_ATTRIBUTES.has(innerName.toLowerCase())) {
          name = innerName;
          cookieValue = cookieValue.slice(innerEq + 1).trim();
        }
      }
      if (name) add(name, cookieValue);
    }
  }

  return Array.from(pairs, ([name, value]) => `${name}=${value}`).join("; ");
}

/** Session material for one row, in the order the columns were mapped.
 *
 *  A Cookie cell that already names SPC_F is the row's real session, so the
 *  separate SPC_F column beside it is a copy and is dropped. A Cookie cell
 *  without it gets SPC_F added — that is what makes the
 *  `user|pass|SPC_F|Cookie` shape work in both directions, and the
 *  `user|pass|bare-spc-f` shape end up as `SPC_F=…` in the login's Cookie. */
export function sessionCookieHeader(
  spcFValues: string[],
  tokenValues: string[],
  cookieValues: string[],
): string {
  const cookies = cookieHeaderText(cookieValues);
  const hasSpcF = /(^|;)\s*spc_f\s*=/i.test(cookies);
  return cookieHeaderText([
    ...(hasSpcF ? [] : spcFValues.map(normalizeSpcF)),
    ...tokenValues.map(normalizeToken),
    cookies,
  ]);
}

/** What makes two rows the same account, for the import's duplicate check.
 *
 *  A row is recognised by the login it names on a site: site is part of the
 *  key because the same address on two platforms is two accounts, and it is
 *  normalised the way the import writes it so a second import of the same
 *  list produces the same keys. A row with no username falls back to its
 *  session — SPC_F first, that being the value Shopee's lists carry, then a
 *  token — and a row with neither has nothing to recognise and always
 *  imports. */
export function credentialKey(
  site: string,
  username: string | null,
  cookie: string | null,
): string {
  const where = normalizeSite(site);
  const who = (username ?? "").trim().toLowerCase();
  if (who) return `${where}|${who}`;
  const session = sessionIdentity(cookie ?? "");
  return session ? `${where}|${session}` : "";
}

function normalizeSite(site: string): string {
  return site
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^\./, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
}

/** The part of a Cookie header that identifies the session: the SPC_F value,
 *  else a token, else the header itself. Values are case-sensitive, so nothing
 *  here is lowercased. */
function sessionIdentity(cookie: string): string {
  const text = cookie.trim();
  if (!text) return "";
  for (const name of ["spc_f", "token", "access_token"]) {
    const match = new RegExp(`(?:^|;)\\s*${name}\\s*=([^;]*)`, "i").exec(text);
    const value = match?.[1]?.trim();
    if (value) return `${name}=${value}`;
  }
  return text;
}
