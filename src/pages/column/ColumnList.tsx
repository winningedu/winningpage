import { ChevronDown, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import CategoryChips from "@/components/column/CategoryChips";
import ColumnCard from "@/components/column/ColumnCard";
import { site } from "@/config/site";
import {
  ALL_CATEGORY,
  type ColumnRow,
  fetchActiveColumns,
  getCategoryLabel,
  getDisplayDate,
  getViewCount,
} from "./columnData";
import { COLUMN_KINDS, type ColumnKind, getColumnKind } from "./kind";
import { useColumnCategories } from "./useColumnCategories";

const SORT_LATEST = "최신순";
const SORT_VIEWS = "조회순";

export default function ColumnList() {
  const [rows, setRows] = useState<ColumnRow[]>([]);
  const categories = useColumnCategories();
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState(ALL_CATEGORY);
  const [kind, setKind] = useState<ColumnKind | typeof ALL_CATEGORY>(
    ALL_CATEGORY,
  );
  const [sortKey, setSortKey] = useState(SORT_LATEST);
  const [keyword, setKeyword] = useState("");

  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);
      const data = await fetchActiveColumns();
      if (!alive) return;
      setRows(data);
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, []);

  const hasViewCounts = useMemo(
    () => rows.some((row) => getViewCount(row) !== null),
    [rows],
  );

  const visibleRows = useMemo(() => {
    let result = rows;

    if (kind !== ALL_CATEGORY) {
      result = result.filter((row) => getColumnKind(row) === kind);
    }

    if (category !== ALL_CATEGORY) {
      result = result.filter(
        (row) => getCategoryLabel(row, categories) === category,
      );
    }

    const q = keyword.trim().toLowerCase();
    if (q) {
      result = result.filter((row) =>
        String(row.title || "")
          .toLowerCase()
          .includes(q),
      );
    }

    const sorted = [...result];
    if (sortKey === SORT_VIEWS && hasViewCounts) {
      sorted.sort((a, b) => (getViewCount(b) ?? 0) - (getViewCount(a) ?? 0));
    } else {
      sorted.sort(
        (a, b) =>
          new Date(getDisplayDate(b) || 0).getTime() -
          new Date(getDisplayDate(a) || 0).getTime(),
      );
    }

    return sorted;
  }, [rows, kind, category, categories, keyword, sortKey, hasViewCounts]);

  return (
    <main className="bg-white pt-16">
      <section className="pb-20 pt-16 sm:pb-24 sm:pt-20 md:pt-40">
        <div className="mx-auto w-full max-w-content px-5 sm:px-8">
          <h1 className="break-keep text-center text-2xl sm:text-[2.25rem] font-semibold leading-[1.3] tracking-[-0.02em] text-ink">
            {site.columnTitle}
          </h1>

          <div className="mt-8">
            <CategoryChips
              categories={categories}
              active={category}
              onChange={setCategory}
              align="center"
            />
          </div>

          <div className="mt-16 flex flex-col gap-6 sm:mt-18 sm:flex-row sm:items-center sm:justify-between">
            {site.features.columnVideo && (
              <CategoryChips
                categories={[...COLUMN_KINDS]}
                active={kind}
                onChange={(value) =>
                  setKind(value as ColumnKind | typeof ALL_CATEGORY)
                }
                align="left"
              />
            )}
            {hasViewCounts ? (
              <div className="relative inline-flex w-fit shrink-0 items-center">
                <select
                  value={sortKey}
                  onChange={(e) => setSortKey(e.target.value)}
                  className="appearance-none bg-transparent pr-10 text-2xl font-semibold leading-[1.3] text-ink outline-hidden"
                >
                  <option value={SORT_LATEST}>최신순</option>
                  <option value={SORT_VIEWS}>조회순</option>
                </select>
                <ChevronDown
                  size={22}
                  className="pointer-events-none absolute right-0 text-ink"
                />
              </div>
            ) : (
              <div className="text-2xl font-semibold leading-[1.3] text-ink">
                최신순
              </div>
            )}

            <div className="relative h-14 w-full rounded-2xl border border-line bg-white sm:w-84">
              <input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="키워드를 입력해 검색해보세요"
                className="h-full w-full bg-transparent px-5 pr-12 text-base font-semibold text-ink outline-hidden placeholder:text-line"
              />
              <Search
                size={22}
                className="pointer-events-none absolute right-8 top-1/2 -translate-y-1/2 text-line"
              />
            </div>
          </div>

          <div className="mt-9">
            {loading ? (
              <div className="py-24 text-center text-sm font-bold text-gray-400">
                불러오는 중입니다.
              </div>
            ) : visibleRows.length === 0 ? (
              <div className="py-24 text-center text-sm font-bold text-gray-400">
                {site.boardEmpty ?? `등록된 ${site.columnTitle}이 없습니다.`}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-x-5 gap-y-9 sm:grid-cols-2 wide:grid-cols-4">
                {visibleRows.map((row) => (
                  <ColumnCard
                    key={row.id}
                    column={row}
                    categories={categories}
                    variant="grid"
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
