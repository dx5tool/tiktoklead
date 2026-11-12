// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Bogdan Shapovalov and the XChange authors

import React, { useEffect, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useI18n } from "../../i18n";

export const PAGE_SIZES = [10, 20, 30, 50, 100, 200, 300, 500, 1000, 2000, 3000, 5000] as const;

interface SimprintPagerProps {
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
}

export const SimprintPager: React.FC<SimprintPagerProps> = ({
  page,
  pageCount,
  pageSize,
  total,
  onPage,
  onPageSize,
}) => {
  const { t } = useI18n();
  const [draft, setDraft] = useState(String(page));

  useEffect(() => {
    setDraft(String(page));
  }, [page]);

  const commit = () => {
    const parsed = Number.parseInt(draft, 10);
    if (!Number.isFinite(parsed)) {
      setDraft(String(page));
      return;
    }
    const next = Math.min(pageCount, Math.max(1, parsed));
    setDraft(String(next));
    if (next !== page) onPage(next);
  };

  return (
    <div className="simprint-pager h-11 shrink-0 flex items-center justify-between gap-4 px-4 border-t border-[var(--simprint-border)] text-xs select-none">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          aria-label={t("pager.prev")}
          title={t("pager.prev")}
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          className="simprint-pager-btn"
        >
          <ChevronLeft size={15} />
        </button>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value.replace(/[^\d]/g, ""))}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              commit();
              e.currentTarget.blur();
            }
            if (e.key === "Escape") {
              setDraft(String(page));
              e.currentTarget.blur();
            }
          }}
          inputMode="numeric"
          aria-label={t("pager.page")}
          className="simprint-pager-input w-12 h-7 rounded-lg text-center text-xs tabular-nums focus:outline-none"
        />
        <span className="opacity-70 tabular-nums whitespace-nowrap">/ {pageCount}</span>
        <button
          type="button"
          aria-label={t("pager.next")}
          title={t("pager.next")}
          disabled={page >= pageCount}
          onClick={() => onPage(page + 1)}
          className="simprint-pager-btn"
        >
          <ChevronRight size={15} />
        </button>
      </div>

      <div className="flex items-center gap-2">
        <label htmlFor="simprint-page-size" className="opacity-70 whitespace-nowrap">
          {t("pager.recordsPerPage")}
        </label>
        <div className="relative">
          <select
            id="simprint-page-size"
            value={pageSize}
            onChange={(e) => onPageSize(Number(e.target.value))}
            className="simprint-pager-select text-xs"
          >
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <ChevronDown
            size={12}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 opacity-60 pointer-events-none"
          />
        </div>
        <span className="ml-3 opacity-80 whitespace-nowrap">
          {t("pager.total")} <span className="font-semibold tabular-nums">{total}</span>
        </span>
      </div>
    </div>
  );
};
