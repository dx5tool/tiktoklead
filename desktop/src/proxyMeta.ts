// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Bogdan Shapovalov and the XChange authors

/** Tags and notes for a proxy, kept on this machine.
 *
 *  The agent's proxy schema carries only what a connection needs, so an
 *  operator's labels have no column there. They are this machine's view of an
 *  exit, kept here beside the provider entries and joined to a proxy row by
 *  id — the same shape, for the same reason. */

export interface ProxyMeta {
  proxy_id: string;
  tags: string[];
  notes: string;
  saved_at?: string;
}

const STORAGE_KEY = "xchange.proxy_meta";

function read(): ProxyMeta[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ProxyMeta[]) : [];
  } catch {
    return [];
  }
}

function write(list: ProxyMeta[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {}
}

export function allProxyMeta(): ProxyMeta[] {
  return read();
}

/** The metadata behind one proxy row, or null when it has none yet. */
export function metaForProxy(proxyId: string | null | undefined): ProxyMeta | null {
  if (!proxyId) return null;
  return read().find((m) => m.proxy_id === proxyId) ?? null;
}

/** Store or replace one row's metadata; fields left out of the patch are kept. */
export function saveProxyMeta(
  proxyId: string,
  patch: Partial<Pick<ProxyMeta, "tags" | "notes">>,
): void {
  const list = read();
  const at = list.findIndex((m) => m.proxy_id === proxyId);
  const next: ProxyMeta = {
    ...(at >= 0 ? list[at] : { proxy_id: proxyId, tags: [], notes: "" }),
    ...patch,
    proxy_id: proxyId,
    saved_at: new Date().toISOString(),
  };
  if (at >= 0) list[at] = next;
  else list.push(next);
  write(list);
}

export function removeProxyMeta(proxyId: string): void {
  write(read().filter((m) => m.proxy_id !== proxyId));
}

/** One free-text field to a tag list: comma/semicolon/newline separated, `#`
 *  stripped, whitespace collapsed, duplicates dropped. The profile editor
 *  parses tags the same way, so a tag reads the same on both pages. */
export function parseTags(input: string): string[] {
  return Array.from(
    new Set(
      input
        .split(/[,;\n]+/)
        .map((tag) => tag.trim().replace(/^#/, "").trim().replace(/\s+/g, " "))
        .filter(Boolean),
    ),
  );
}
