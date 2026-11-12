// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Bogdan Shapovalov and the XChange authors

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Profile } from "../../api";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** The Table/Grid switcher is temporarily hidden; its rendering paths are
 *  still wired. Flip back to true to show the control again. */
export const SHOW_VIEW_TOGGLE = false;

/** The order the profile list is shown in. */
export type ProfileSort =
  | "created_desc"
  | "created_asc"
  | "name_asc"
  | "name_desc"
  | "recent";

/** When a profile was made, read off its id.
 *
 *  Profile ids are UUID v7 — made with `Uuid::now_v7` in the agent and on the
 *  server — and a v7 id begins with its creation time in milliseconds. The API
 *  does not carry a created-at field, so the id is the one place that time is
 *  available; ids that are not v7 (a fixture, an import that kept somebody
 *  else's id) answer 0 and sort after the ones that are real. */
export function createdMs(id: string): number {
  const hex = id.replace(/-/g, "");
  if (hex.length !== 32 || hex[12] !== "7") return 0;
  const ms = Number.parseInt(hex.slice(0, 12), 16);
  return Number.isFinite(ms) ? ms : 0;
}

function openedMs(iso: string | null): number {
  if (!iso) return 0;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : 0;
}

function byName(a: Profile, b: Profile): number {
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true });
}

function sorted(profiles: Profile[], sort: ProfileSort): Profile[] {
  const out = [...profiles];
  switch (sort) {
    case "created_desc":
    case "created_asc": {
      const dir = sort === "created_desc" ? -1 : 1;
      return out.sort((a, b) => {
        const at = createdMs(a.id);
        const bt = createdMs(b.id);
        if (!at && !bt) return byName(a, b);
        // An unknown date goes last in either direction rather than pretending
        // to be the oldest thing in the list.
        if (!at) return 1;
        if (!bt) return -1;
        return dir * (at - bt) || byName(a, b);
      });
    }
    case "name_desc":
      return out.sort((a, b) => byName(b, a));
    case "recent":
      return out.sort((a, b) => {
        const at = openedMs(a.last_opened_at);
        const bt = openedMs(b.last_opened_at);
        if (!at && !bt) return byName(a, b);
        if (!at) return 1;
        if (!bt) return -1;
        return bt - at || byName(a, b);
      });
    case "name_asc":
    default:
      return out.sort(byName);
  }
}

/** A sorted copy — the list itself is React state and must not be reordered.
 *
 *  Pinned rows come first and keep the order the chosen sort gave them; the
 *  pin moves a row, it does not re-rank the rest. */
export function sortProfiles(
  profiles: Profile[],
  sort: ProfileSort,
  pinned?: ReadonlySet<string>,
): Profile[] {
  const out = sorted(profiles, sort);
  if (!pinned || pinned.size === 0) return out;
  const top: Profile[] = [];
  const rest: Profile[] = [];
  for (const p of out) (pinned.has(p.id) ? top : rest).push(p);
  return [...top, ...rest];
}
