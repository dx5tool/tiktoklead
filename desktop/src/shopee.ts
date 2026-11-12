// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Bogdan Shapovalov and the XChange authors

/** The Shopee-specific half of the Login button.
 *
 *  Kept out of App.tsx because it is all derivation: which profiles are Shopee,
 *  which shop (the Vietnamese one is the default), which login row belongs to
 *  the shop, and how the stored Cookie header becomes the CDP cookie objects
 *  the agent writes. The flow itself lives in the agent. */

import { cookieObjects } from "./accountImport";
import type { Credential, Profile } from "./api";
import { platformOf } from "./platform";

export const SHOPEE_PLATFORM = "shopee";

const COOKIE_TTL_SECONDS = 365 * 24 * 60 * 60;
const LOGIN_PATH = "/buyer/login";
const ACCOUNT_PATH = "/user/account/profile";

type ProfileHint = Pick<Profile, "tags" | "start_urls">;

function hostOf(raw: string): string | null {
  try {
    return new URL(raw.includes("://") ? raw : `https://${raw}`)
      .hostname.toLowerCase()
      .replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** A profile is Shopee when the import tagged it that way, or when its first
 *  start URL is a Shopee shop. The tag is what imported accounts carry. */
export function isShopeeProfile(profile: ProfileHint): boolean {
  if (profile.tags.some((tag) => tag.trim().toLowerCase() === "shopee")) return true;
  return platformOf(profile.start_urls)?.name === "Shopee";
}

/** `.shopee.vn`, `.shopee.co.id`, … — the domain the session cookies belong to.
 *
 *  A start URL like banhang.shopee.vn still resolves to the parent shop, which
 *  is where SPC_F/SPC_EC are set. No URL falls back to the Vietnamese shop,
 *  because that is what the import currently handles. */
export function shopeeCookieDomain(profile: ProfileHint): string {
  for (const raw of profile.start_urls ?? []) {
    const host = hostOf(raw);
    if (!host) continue;
    // Only the shops Shopee actually runs. A broad `shopee.*` would let a
    // lookalike host in a profile's start URL receive SPC_F, which is the
    // account's session.
    const match = /(?:^|\.)(shopee\.(?:vn|co\.id|co\.th|com\.my|sg|ph|tw|com\.br|com\.mx))$/i.exec(
      host,
    );
    if (match) return `.${match[1]}`;
  }
  return ".shopee.vn";
}

function shopeeHost(profile: ProfileHint): string {
  return shopeeCookieDomain(profile).replace(/^\./, "");
}

export function shopeeLoginUrl(profile: ProfileHint): string {
  return `https://${shopeeHost(profile)}${LOGIN_PATH}`;
}

/** Opening this while signed out redirects to the login page; while signed in
 *  it stays on the account page. That is the check the agent runs first. */
export function shopeeCheckUrl(profile: ProfileHint): string {
  return `https://${shopeeHost(profile)}${ACCOUNT_PATH}`;
}

/** The login row that belongs to the shop: a saved cookie first, then one whose
 *  label or site says Shopee, then one with a username or password. */
export function pickShopeeCredential(credentials: Credential[]): Credential | null {
  let best: Credential | null = null;
  let bestScore = 0;
  for (const credential of credentials) {
    if (credential.unreadable) continue;
    const label = `${credential.label} ${credential.site}`.toLowerCase();
    const score =
      (credential.cookie?.trim() ? 4 : 0) +
      (label.includes("shopee") ? 2 : 0) +
      (credential.username || credential.password ? 1 : 0);
    if (score > bestScore) {
      best = credential;
      bestScore = score;
    }
  }
  return best;
}

/** The stored Cookie header in the shape `Storage.setCookies` accepts.
 *
 *  SPC_F is httpOnly; the other cookies keep what the header had. A year is the
 *  same life the import used: a pasted session has no expiry of its own and
 *  would be dropped when the browser closes. */
export function shopeeLoginCookies(
  cookie: string | null,
  profile: ProfileHint,
): Record<string, unknown>[] {
  const text = cookie?.trim() ?? "";
  if (!text) return [];

  const domain = shopeeCookieDomain(profile);
  const cookies = cookieObjects(text, {
    domain,
    expiry: Math.floor(Date.now() / 1000) + COOKIE_TTL_SECONDS,
    secure: true,
  });

  const seen = new Set<string>();
  return cookies.filter((cookie) => {
    const name = typeof cookie.name === "string" ? cookie.name : "";
    if (!name) return false;
    // A stored Cookie header is for this login, so it goes to the shop and
    // nowhere else, even if a hand-edited JSON entry names another domain.
    cookie.domain = domain;
    delete cookie.url;
    if (name.toUpperCase() === "SPC_F") cookie.httpOnly = true;
    const path = typeof cookie.path === "string" ? cookie.path : "/";
    const key = `${name}|${domain}|${path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
