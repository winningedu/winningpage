import { useEffect, useMemo, useState } from "react";
import AcceptanceRateHero from "@/components/admission/AcceptanceRateHero";
import SpecialHighschoolCaseCard from "@/components/special/SpecialHighschoolCaseCard";
import {
  fetchSpecialHighschoolCases,
  filterByType,
  SPECIAL_HS_DESCRIPTION,
  SPECIAL_HS_TABS,
} from "./specialHighschoolData";

const TABPANEL_ID = "special-hs-tabpanel";

// special_highschool_cases 행 — 이 화면이 실제로 읽는 필드만 좁혀서 둔다.
// specialHighschoolData.ts의 filterByType은 { school_type? } 만 아는 더 느슨한 타입을
// 쓰므로(그 파일은 이번 배치 대상이 아니라 수정하지 않는다), 그 반환값을 이 타입으로
// 다시 좁혀 SpecialHighschoolCaseCard가 기대하는 필드(id 포함)를 되살린다.
type SpecialHighschoolCaseRow = {
  id: string | number;
  school_type?: string;
  year?: number | string;
  result_label?: string;
  student_name?: string;
  middle_school?: string;
  school_name?: string;
  sort_order?: number;
  created_at?: string;
  [key: string]: unknown;
};

export default function SpecialHighschoolCases() {
  const [rows, setRows] = useState<SpecialHighschoolCaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("all");

  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);
      const data = await fetchSpecialHighschoolCases();
      if (!alive) return;
      setRows(data as SpecialHighschoolCaseRow[]);
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, []);

  // 로딩 중에는 '전체' 탭만 노출한다(다른 탭이 잠깐 나타났다가 사라지는
  // 깜빡임을 막기 위함). 데이터가 도착하면 사례가 1건이라도 있는 탭만
  // 한 번에 확정된 목록으로 전환된다.
  const visibleTabs = useMemo(() => {
    if (loading) {
      return SPECIAL_HS_TABS.filter((item) => item.key === "all");
    }
    const availableTypes = new Set(rows.map((row) => row.school_type));
    return SPECIAL_HS_TABS.filter(
      (item) => item.key === "all" || availableTypes.has(item.key),
    );
  }, [rows, loading]);

  // 선택된 탭이 더 이상 존재하지 않게 되면(예: 마지막 사례가 비활성화됨)
  // '전체'로 되돌린다.
  useEffect(() => {
    if (loading) return;
    if (!visibleTabs.some((item) => item.key === tab)) {
      setTab("all");
    }
  }, [loading, visibleTabs, tab]);

  const visible = filterByType(rows, tab) as SpecialHighschoolCaseRow[];

  return (
    <main className="bg-white pt-16">
      <AcceptanceRateHero
        scope="special-highschool"
        showRates={false}
        showLogos={false}
      />

      <section className="pb-20 pt-16 sm:pb-24 sm:pt-20">
        <div className="mx-auto w-full max-w-content px-5 sm:px-8">
          <h1 className="break-keep text-2xl font-semibold leading-[1.3] tracking-[-0.02em] text-ink sm:text-[2.25rem]">
            특목고 합격 학생
          </h1>

          {/* QA 리뷰(2026-08-21) — 문단 폭은 풀폭 그대로 유지(고객 요청)하고, 긴 줄 보상으로
              leading만 1.4→1.6으로 늘린다. AdmissionCases.tsx도 같은 클래스를 쓰는 별도
              문단(공유 상수 아님)이라 그쪽도 동일하게 맞췄다. */}
          <p className="mt-5 break-keep text-base font-medium leading-[1.6] text-[#7A7A7A]">
            {SPECIAL_HS_DESCRIPTION}
          </p>

          <div
            className="mt-9 flex items-center gap-3 overflow-x-auto [scrollbar-width:none] sm:mt-11 sm:gap-4 [&::-webkit-scrollbar]:hidden"
            role="tablist"
          >
            {visibleTabs.map((item, index) => (
              <div
                key={item.key}
                className="flex shrink-0 items-center gap-3 sm:gap-4"
              >
                {index > 0 && (
                  <span className="h-6 w-px bg-line" aria-hidden="true" />
                )}
                <button
                  type="button"
                  id={`special-hs-tab-${item.key}`}
                  role="tab"
                  aria-selected={tab === item.key}
                  aria-controls={TABPANEL_ID}
                  onClick={() => setTab(item.key)}
                  className={`whitespace-nowrap text-lg font-semibold leading-[1.3] sm:text-2xl tracking-[-0.02em] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${
                    tab === item.key ? "text-ink" : "text-line"
                  }`}
                >
                  {item.label}
                </button>
              </div>
            ))}
          </div>

          <div
            className="mt-9"
            id={TABPANEL_ID}
            role="tabpanel"
            aria-labelledby={`special-hs-tab-${tab}`}
          >
            {loading ? (
              <div className="py-24 text-center text-sm font-bold text-gray-400">
                불러오는 중입니다.
              </div>
            ) : visible.length === 0 ? (
              <div className="py-24 text-center text-sm font-bold text-gray-400">
                등록된 합격 사례가 없습니다.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-x-4.25 gap-y-[1.4625rem] sm:grid-cols-2 wide:grid-cols-4">
                {visible.map((row) => (
                  <SpecialHighschoolCaseCard key={row.id} row={row} />
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
