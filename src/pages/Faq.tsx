import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import BoardBannerImage from "@/components/BoardBannerImage";
import FaqAccordionRow from "@/components/faq/FaqAccordionRow";
import FaqCategoryTabs from "@/components/faq/FaqCategoryTabs";
import { FAQ_TABPANEL_ID, getFaqTabId } from "@/components/faq/faqTabId";
import { site } from "@/config/site";
import { FAQ_CATEGORIES } from "@/data/faqCategories";
import { supabase } from "@/lib/supabase";

// '전체'는 DB category 값이 아니라 UI 전용 키다 — faqs.category 에는 절대
// 저장하지 않는다(계약 §1).
const ALL_TAB = "전체";

const EMPTY_STATE_CLASS = "py-24 text-center text-sm font-bold text-gray-400";

type FaqRow = {
  id: string | number;
  question: string;
  answer?: string;
  category?: string;
  content_json?: unknown;
  sort_order?: number;
  created_at?: string;
  is_active?: boolean;
};

export default function Faq() {
  const [faqs, setFaqs] = useState<FaqRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(ALL_TAB);
  const [keyword, setKeyword] = useState("");
  const [openId, setOpenId] = useState<string | number | null>(null);

  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);

      // select('*') 유지 — 마이그레이션 미적용 환경에서도(category/content_json
      // 컬럼이 없더라도) 조회 자체는 죽지 않는다.
      const { data, error } = await supabase
        .from("faqs")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false });

      if (!alive) return;

      if (error) {
        console.error("FAQ 조회 오류:", error);
        setFaqs([]);
      } else {
        setFaqs((data || []) as FaqRow[]);
      }

      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, []);

  // 로딩 중에는 '전체' 탭만 노출한다(SpecialHighschoolCases.jsx 선례 복제) —
  // 데이터 도착 전에 다른 탭이 잠깐 나타났다 사라지는 깜빡임을 막는다.
  const visibleTabs = useMemo(() => {
    if (loading) return [ALL_TAB];

    // category 가 빈 문자열(마이그레이션 전 기존 행)이면 어떤 카테고리 탭에도
    // 안 잡히고 '전체'에만 노출된다.
    const available = new Set(faqs.map((faq) => faq.category || ""));
    return [
      ALL_TAB,
      ...FAQ_CATEGORIES.filter((category) => available.has(category)),
    ];
  }, [faqs, loading]);

  // 선택된 탭이 사라지면(예: 마지막 항목이 비활성화됨) '전체'로 폴백한다.
  useEffect(() => {
    if (loading) return;
    if (!visibleTabs.includes(activeTab)) setActiveTab(ALL_TAB);
  }, [loading, visibleTabs, activeTab]);

  const isSearching = keyword.trim().length > 0;

  const categoryFiltered = useMemo(() => {
    if (activeTab === ALL_TAB) return faqs;
    return faqs.filter((faq) => (faq.category || "") === activeTab);
  }, [faqs, activeTab]);

  const searchFiltered = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    if (!q) return [];
    return faqs.filter((faq) =>
      `${faq.question} ${faq.answer || ""}`.toLowerCase().includes(q),
    );
  }, [faqs, keyword]);

  const visibleFaqs = isSearching ? searchFiltered : categoryFiltered;

  function handleTabChange(tab: string) {
    setActiveTab(tab);
    setOpenId(null);
  }

  function handleKeywordChange(event: React.ChangeEvent<HTMLInputElement>) {
    setKeyword(event.target.value);
    setOpenId(null);
  }

  function toggleFaq(id: string | number) {
    setOpenId((prev) => (prev === id ? null : id));
  }

  function renderList(emptyMessage: string) {
    if (loading) {
      return <div className={EMPTY_STATE_CLASS}>불러오는 중입니다.</div>;
    }

    if (visibleFaqs.length === 0) {
      return <div className={EMPTY_STATE_CLASS}>{emptyMessage}</div>;
    }

    return (
      <div>
        {visibleFaqs.map((faq) => (
          <FaqAccordionRow
            key={faq.id}
            faq={faq}
            isOpen={openId === faq.id}
            onToggle={() => toggleFaq(faq.id)}
          />
        ))}
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-white pt-16">
      {/* 헤더 하단 → 제목 상단 여백: 시안 149px × 0.766(스케일 팩터) ≈ 114px = 7.125rem.
          모바일은 pt-16(64px)을 유지해 데스크톱보다 좁게 둔다. */}
      <section
        className={
          site.boardBanners
            ? "pb-20 pt-10 sm:pb-24"
            : "pb-20 pt-16 sm:pb-24 sm:pt-28.5"
        }
      >
        <div className="mx-auto w-full max-w-content px-5 sm:px-8">
          {site.boardBanners ? (
            <BoardBannerImage banner={site.boardBanners.faq} />
          ) : null}
          {/* 시안 실측: 제목과 검색창은 같은 행이 아니라 제목 아래에 검색창이
              우측 정렬로 놓인다(제목 하단→검색창 상단 12px × 0.766 ≈ 9px).
              모바일은 세로 스택 + 검색창 w-full 을 그대로 유지한다. */}
          <div className="flex flex-col gap-6 sm:gap-2.25">
            <h1 className="break-keep text-2xl font-semibold leading-[1.3] tracking-[-0.02em] text-ink sm:text-[2.75rem]">
              FAQ
            </h1>

            <div className="relative h-11 w-full rounded-[0.625rem] border border-line bg-white sm:w-94.5 sm:self-end">
              <input
                value={keyword}
                onChange={handleKeywordChange}
                placeholder="키워드 검색"
                aria-label="FAQ 키워드 검색"
                className="h-full w-full bg-transparent pl-5 pr-12 text-base font-semibold text-ink outline-hidden placeholder:text-line"
              />
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute right-5 top-1/2 h-5 w-5 -translate-y-1/2 text-[#1F1F1F]"
              />
            </div>
          </div>

          {isSearching ? (
            // 검색 모드에서는 탭 바가 DOM에서 사라진다. tab/tabpanel 롤을 유지한 채
            // 탭 버튼만 없애면 aria-controls/aria-labelledby가 죽은 id를 가리키게 되므로
            // (ServiceFaq.jsx:41-43 이 경고하는 것과 동일한 axe aria-valid-attr-value
            // 위반) 검색 모드는 tab/tabpanel 롤을 아예 벗기고 aria-live 영역으로 분기한다.
            // aria-live는 "검색 결과 N건" 문구에만 건다 — section 전체에 걸면 검색은
            // 디바운스가 없어 키 입력마다 스크린리더가 결과 목록 전체를 재낭독한다.
            <section className="mt-8 lg:mt-21.5">
              <p
                aria-live="polite"
                className="text-base font-semibold leading-5 tracking-[-0.02em] text-ink"
              >
                검색 결과{" "}
                <span className="text-primary">{visibleFaqs.length}건</span>
              </p>
              <div className="mt-3 border-t border-line">
                {renderList(`'${keyword.trim()}'에 대한 검색 결과가 없습니다.`)}
              </div>
            </section>
          ) : (
            <>
              <div className="mt-8 lg:mt-21.5">
                <FaqCategoryTabs
                  tabs={visibleTabs}
                  active={activeTab}
                  onChange={handleTabChange}
                />
              </div>

              <div
                id={FAQ_TABPANEL_ID}
                role="tabpanel"
                aria-labelledby={getFaqTabId(activeTab)}
              >
                {renderList(site.boardEmpty ?? "등록된 질문이 없습니다.")}
              </div>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
