// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Bogdan Shapovalov and the XChange authors

import { useCallback, useState } from "react";

const KEY = "xchange.pinned_profiles";

function read(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return new Set(
      Array.isArray(list) ? list.filter((v): v is string => typeof v === "string") : [],
    );
  } catch {
    return new Set();
  }
}

/** Profiles the operator keeps at the top, on this machine.
 *
 *  A pin is a viewing preference, not a property of the profile: two people
 *  looking at the same team profile keep their own order, and a pin must not
 *  ride along in an export or a bundle. */
export function usePinnedProfiles(): {
  pinned: Set<string>;
  togglePin: (id: string) => void;
} {
  const [pinned, setPinned] = useState<Set<string>>(read);
  const togglePin = useCallback((id: string) => {
    setPinned((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(KEY, JSON.stringify([...next]));
      } catch {
        /* storage denied: the pin holds for this session */
      }
      return next;
    });
  }, []);
  return { pinned, togglePin };
}
