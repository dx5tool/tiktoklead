// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Bogdan Shapovalov and the XChange authors

/** Provider-backed proxies, kept on this machine.
 *
 *  A provider proxy is a normal proxy row in the agent's store with `kind`
 *  "provider" and no address yet; the real host and port are fetched from the
 *  provider when a profile that uses it is opened. The provider name and API
 *  key live here, in localStorage, because the proxy schema has no field for
 *  them (and because this was built frontend-first). The launch path reads
 *  this table, asks the provider for an exit, writes the address onto the
 *  proxy row, and only then starts the browser. KiotProxy and NestProxy are
 *  connected; the rest keep their key until their API is wired too. */

import { api, isDesktop } from "./api";

export const PROVIDERS = [
  "KiotProxy", "Proxyno1", "TinProxy", "TM Proxy", "SuiProxy",
  "NestProxy", "Mproxy", "2proxy", "1ip.vn",
] as const;

export const PROVIDER_MODE = "provider";
export const PROVIDER_STORAGE_KEY = "xchange.provider_proxies";

export interface ProviderProxyEntry {
  provider: string;
  /** What the proxy was labelled in the form. */
  name: string;
  api_key: string;
  /** The agent's proxy row this entry belongs to. Absent for the first
   *  UI-only entries, which never created a row. */
  proxy_id?: string;
  rotate_url: string | null;
  checker_url: string | null;
  /** When the provider will allow the next exit request (ms). */
  next_request_at?: number;
  /** When the fetched exit stops working (ms), as the provider reported it. */
  expires_at?: number;
  last_ip?: string | null;
  saved_at?: string;
}

function read(): ProviderProxyEntry[] {
  try {
    const raw = localStorage.getItem(PROVIDER_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ProviderProxyEntry[]) : [];
  } catch {
    return [];
  }
}

function write(list: ProviderProxyEntry[]): void {
  try {
    localStorage.setItem(PROVIDER_STORAGE_KEY, JSON.stringify(list));
  } catch {}
}

export function allProviderProxies(): ProviderProxyEntry[] {
  return read();
}

/** The entry behind an agent proxy row, or null for an ordinary proxy. */
export function providerForProxy(proxyId: string | null | undefined): ProviderProxyEntry | null {
  if (!proxyId) return null;
  return read().find((e) => e.proxy_id === proxyId) ?? null;
}

/** Whether a profile's proxy comes from a provider.
 *
 *  The stored entry is the link once a key exists, but rows created outside
 *  the provider form (an import, a bulk paste) keep `kind: "provider"` and
 *  have no entry at all. Either one is enough: both mean the exit belongs to
 *  a provider that hands the same address to many of its customers, so the
 *  shared-exit heuristics have nothing to say about it. */
export function isProviderProxy(
  proxy: { id: string; kind: string } | null | undefined,
): boolean {
  if (!proxy) return false;
  return proxy.kind === PROVIDER_MODE || providerForProxy(proxy.id) !== null;
}

/** A key shown just far enough to recognise it: first four and last four.
 *  Anything short enough that the two ends would meet is hidden completely. */
export function maskApiKey(key: string | null | undefined): string {
  const k = (key ?? "").trim();
  if (!k) return "";
  return k.length > 8 ? `${k.slice(0, 4)}…${k.slice(-4)}` : "••••";
}

export interface ProxyOptionLike {
  id: string;
  name: string;
  kind: string;
  host: string;
  port: number;
  last_country?: string | null;
}

/** One line in a proxy picker. A provider row reads as label · country ·
 *  masked key, because its address is fetched later and says nothing. An
 *  ordinary row keeps its scheme/address. */
export function proxyOptionLabel(proxy: ProxyOptionLike): string {
  const provider = providerForProxy(proxy.id);
  if (provider || proxy.kind === PROVIDER_MODE) {
    return [
      proxy.name.trim() || provider?.name.trim() || provider?.provider,
      proxy.last_country,
      maskApiKey(provider?.api_key),
    ]
      .filter(Boolean)
      .join(" · ");
  }
  return `${proxy.name.trim() || `${proxy.host}:${proxy.port}`} · ${proxy.kind}://${proxy.host}:${proxy.port}`;
}

/** Store or replace one entry. Matching is by proxy row first, then by
 *  provider for the older key-only entries. */
export function upsertProviderProxy(entry: ProviderProxyEntry): void {
  const list = read();
  const at = entry.proxy_id
    ? list.findIndex((e) => e.proxy_id === entry.proxy_id)
    : list.findIndex((e) => !e.proxy_id && e.provider === entry.provider);
  if (at >= 0) list[at] = { ...list[at], ...entry };
  else list.push(entry);
  write(list);
}

export function removeProviderProxy(proxyId: string): void {
  write(read().filter((e) => e.proxy_id !== proxyId));
}

/** Remember when this key may hand out its next exit. Every proxy using the
 *  same provider key hears it: the interval belongs to the key, not the row. */
export function recordProviderFetch(
  provider: string,
  apiKey: string,
  patch: Partial<Pick<ProviderProxyEntry, "next_request_at" | "expires_at" | "last_ip">>,
): void {
  write(
    read().map((e) =>
      e.provider === provider && e.api_key === apiKey ? { ...e, ...patch } : e,
    ),
  );
}

/** Browser development only. A packaged window asks Rust, and Vite proxies
 *  this path so the page is not subject to the provider's CORS policy. */
const KIOT_NEW_PROXY = "/kiotproxy/api/v1/proxies/new";
const KIOT_REGION = "random";

interface KiotProxyData {
  realIpAddress?: string;
  http?: string;
  socks5?: string;
  httpPort?: number;
  socks5Port?: number;
  host?: string;
  hostname?: string;
  ip?: string;
  location?: string;
  nextRequestAt?: number;
  expirationAt?: number;
  ttc?: number;
}

export interface ProviderExit {
  host: string;
  port: number;
  /** SOCKS5 when the provider gave one, HTTP otherwise. */
  kind: "socks5" | "http";
  lastIp: string | null;
  /** When the key may ask for another exit (ms); 0 when asking is free. */
  nextRequestAt: number;
  expiresAt: number | null;
}

/** A provider's own refusal. `nextRequestAt` carries the wait it named, so the
 *  launch path can remember it rather than ask again and hear the same thing. */
export class ProviderFetchError extends Error {
  constructor(
    message: string,
    readonly nextRequestAt = 0,
  ) {
    super(message);
    this.name = "ProviderFetchError";
  }
}

/** The providers this build can ask for an address. The rest accept a key and
 *  stop there, and the launch path says so instead of failing at the fetch. */
export function providerFetches(provider: string): boolean {
  return provider === "KiotProxy" || provider === "NestProxy";
}

/** What the one credential field is called for this provider. NestProxy sells
 *  proxy keys separately from the account: `/proxy/available` takes the Proxy
 *  Key, and the account's API Key buys nothing there. */
export function providerKeyLabel(provider: string): "px.apiKey" | "px.proxyKey" {
  return provider === "NestProxy" ? "px.proxyKey" : "px.apiKey";
}

/** The sentence under that field, by provider. */
export function providerKeyHint(
  provider: string,
): "px.apiKeyHint" | "px.apiKeyHintKiot" | "px.apiKeyHintNest" {
  if (provider === "KiotProxy") return "px.apiKeyHintKiot";
  if (provider === "NestProxy") return "px.apiKeyHintNest";
  return "px.apiKeyHint";
}

/** One exit from whichever provider the entry names. */
export async function fetchProviderExit(entry: ProviderProxyEntry): Promise<ProviderExit> {
  if (entry.provider === "NestProxy") return fetchNestProxy(entry.api_key);
  if (entry.provider === "KiotProxy") return fetchKiotProxy(entry.api_key);
  throw new ProviderFetchError(`${entry.provider} proxies cannot fetch an IP yet.`);
}

interface KiotProxyAnswer {
  ok: boolean;
  status: number;
  body: { success?: boolean; message?: string; error?: string; data?: KiotProxyData } | null;
}

/** Ask the provider for one exit.
 *
 *  In the packaged window the request is made in Rust: `connect-src` allows
 *  `ipc:` and nothing else, so a fetch here never leaves the webview and
 *  surfaces as a bare "Failed to fetch". Browser development goes through
 *  Vite for the same reason — a page cannot rely on the provider's CORS.
 *  Either way the provider's own JSON comes back, so what it means is decided
 *  once below. */
async function requestKiotProxy(key: string): Promise<KiotProxyAnswer> {
  if (isDesktop) {
    const answer = await api.fetchKiotProxy(key);
    return {
      ok: answer.status >= 200 && answer.status < 300,
      status: answer.status,
      body: (answer.body ?? null) as KiotProxyAnswer["body"],
    };
  }

  const query = new URLSearchParams({ key, region: KIOT_REGION });
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 20_000);
  try {
    const res = await fetch(`${KIOT_NEW_PROXY}?${query}`, {
      signal: ctl.signal,
      headers: { Accept: "application/json" },
    });
    return {
      ok: res.ok,
      status: res.status,
      body: (await res.json().catch(() => null)) as KiotProxyAnswer["body"],
    };
  } finally {
    clearTimeout(timer);
  }
}

/** One new KiotProxy exit for this key. */
export async function fetchKiotProxy(key: string): Promise<ProviderExit> {
  const answer = await requestKiotProxy(key);
  const body = answer.body;
  if (!answer.ok || !body?.success || !body.data) {
    throw new Error(body?.message || body?.error || `KiotProxy HTTP ${answer.status}`);
  }
  const d = body.data;
  const host = d.host || d.ip || d.realIpAddress || "";
  const socksPort = Number(
    d.socks5Port || (d.socks5 ? d.socks5.slice(d.socks5.lastIndexOf(":") + 1) : 0),
  );
  const httpPort = Number(
    d.httpPort || (d.http ? d.http.slice(d.http.lastIndexOf(":") + 1) : 0),
  );
  // The user's default: SOCKS5, and HTTP only when the provider has no
  // SOCKS5 port for this exit.
  const kind: "socks5" | "http" = socksPort > 0 ? "socks5" : "http";
  const port = kind === "socks5" ? socksPort : httpPort;
  if (!host || !Number.isFinite(port) || port <= 0) {
    throw new Error("KiotProxy did not return a proxy address.");
  }
  // KiotProxy does not always say when; one minute is its documented interval,
  // and a key believed free that is not would only fail the next launch.
  const nextRequestAt =
    Number(d.nextRequestAt) ||
    (d.ttc ? Date.now() + Number(d.ttc) * 1000 : Date.now() + 60_000);
  return {
    host,
    port,
    kind,
    lastIp: d.realIpAddress || d.ip || null,
    nextRequestAt,
    expiresAt: Number(d.expirationAt) || null,
  };
}

/** Browser development only, proxied by Vite for the same CSP reason as the
 *  KiotProxy endpoint. */
const NEST_AVAILABLE = "/nestproxy/api/client/proxy/available";

interface NestProxyData {
  /** `IP:port` — the only thing a connection needs. */
  proxy?: string;
  vip?: boolean;
  /** The earliest moment NestProxy will release this IP. Not a gate on
   *  asking: until the old one is released, `available` returns the same
   *  address, so a launch costs nothing and changes nothing. */
  canChangeAt?: string;
  message?: string;
  error?: string;
  retryAfter?: number;
}

interface NestProxyAnswer {
  ok: boolean;
  status: number;
  body: NestProxyData | null;
}

async function requestNestProxy(key: string): Promise<NestProxyAnswer> {
  if (isDesktop) {
    const answer = await api.fetchNestProxy(key);
    return {
      ok: answer.status >= 200 && answer.status < 300,
      status: answer.status,
      body: (answer.body ?? null) as NestProxyData | null,
    };
  }

  const query = new URLSearchParams({ proxy_key: key });
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 20_000);
  try {
    const res = await fetch(`${NEST_AVAILABLE}?${query}`, {
      signal: ctl.signal,
      headers: { Accept: "application/json" },
    });
    return {
      ok: res.ok,
      status: res.status,
      body: (await res.json().catch(() => null)) as NestProxyData | null,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** One NestProxy exit for this proxy key.
 *
 *  The provider answers with `IP:port` and no protocol, and sells HTTP only,
 *  so the row is `http`. Asking again returns the same address until the old
 *  one is released with `POST /proxy/remove` — which is why nothing waits on
 *  `canChangeAt`: that is the next time a *change* is allowed, not the next
 *  time an exit can be used. The key is the Proxy Key from the dashboard, not
 *  the account's API Key. */
export async function fetchNestProxy(key: string): Promise<ProviderExit> {
  const answer = await requestNestProxy(key);
  const body = answer.body;
  const message = body?.message || body?.error || `NestProxy HTTP ${answer.status}`;
  if (!answer.ok || !body?.proxy) {
    // The 429 body names the wait ("Vui lòng đợi thêm 57 giây nữa…"), in
    // seconds or as the moment it ends; carry it so the launch path can store
    // it against the key and stop asking until then.
    if (answer.status === 429) {
      const retry = Number(body?.retryAfter) * 1000;
      const until = body?.canChangeAt ? Date.parse(body.canChangeAt) - Date.now() : 0;
      throw new ProviderFetchError(message, Date.now() + Math.max(retry || until, 0));
    }
    throw new ProviderFetchError(message);
  }

  const at = body.proxy.lastIndexOf(":");
  const host = at > 0 ? body.proxy.slice(0, at) : "";
  const port = at > 0 ? Number(body.proxy.slice(at + 1)) : 0;
  if (!host || !Number.isFinite(port) || port <= 0) {
    throw new ProviderFetchError("NestProxy did not return a proxy address.");
  }
  return {
    host,
    port,
    kind: "http",
    lastIp: host,
    nextRequestAt: 0,
    expiresAt: null,
  };
}
