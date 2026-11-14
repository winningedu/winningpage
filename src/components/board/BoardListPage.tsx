import { useEffect, useMemo, useRef, useState } from "react";
import BoardBannerImage from "@/components/BoardBannerImage";
import type { BoardBanner } from "@/config/sites";
import {
  BOARD_PAGE_SIZE,
  type BoardRow,
  fetchBoardRows,
  filterBoardRows,
  formatBoardDate,
  getDisplayNumber,
  getViewCount,
  paginate,
} from "@/pages/board/boardData";
import BoardPagination from "./BoardPagination";
import BoardSearchBar from "./BoardSearchBar";
import BoardTable from "./BoardTable";

/**
 * 게시판(회사소식·공지사항) 목록 페이지 셸.
 *
 * 조립만 한다 — supabase 를 직접 부르지 않고, 표/검색/페이지네이션의 마크업도 갖지 않는다.
 * 데이터는 `src/pages/board/boardData.ts`, 표시는 `BoardTable` / `BoardSearchBar` /
 * `BoardPagination` 이 각각 소유하고 여기서는 상태(로딩·에러·빈·무결과)와 배선만 맡는다.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ★ 소비 페이지 계약
 *
 *   이 컴포넌트가 `<main>` 과 `<h1>` 을 렌더한다.
 *   따라서 소비 페이지(`CompanyNewsList.jsx`, `Events.jsx` 목록 분기)는
 *   **자신의 `<main>` / `<h1>` 을 또 만들면 안 된다** — 이 컴포넌트를 그 분기의 최상위로 둔다.
 *   (`Events.jsx:128,231` 처럼 이미 `<main className="min-h-screen bg-white pt-16">` 이 있는
 *    파일은 목록 분기의 main 을 통째로 이 컴포넌트로 교체한다. 중첩하면 main 2개 / h1 2개가 된다.)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 세로 리듬 — 시안 실측 재검산 (Figma 1920 기준 ×0.766)
 *
 *   시안 y 좌표: 제목 297 / 검색바 366 / 표 474.
 *     제목 하단(354) → 검색바 상단(366) = 12px  → ×0.766 = 9.19 → `gap-2.25`
 *     검색바 하단(434) → 표 상단(474)   = 40px  → ×0.766 = 30.6 → `mt-7.75`
 *     헤더 하단(148) → 제목 상단(297)   = 149px → ×0.766 = 114  → `sm:pt-28.5`
 *
 *   앞의 두 값 중 제목→검색바 9px 는 `Faq.jsx:127` 의 `sm:gap-2.25` 과, 헤더→제목 114px 는
 *   `Faq.jsx:120-122` 의 `sm:pt-28.5` 과 **정확히 같다**(같은 시안 계열이므로 당연한 결과).
 *   Faq 에 대응 값이 없는 검색바→표 31px 와 표→페이지네이션 49px 만 게시판 시안 값을 새로 쓴다.
 *   모바일은 Faq 와 동일하게 `pt-16` 을 유지해 데스크톱보다 좁게 둔다.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 상태 3종
 *
 *   표는 **어떤 상태에서도 항상 렌더한다.** 로딩→도착 사이에 표 골격이 사라졌다 나타나면
 *   컨테이너 높이가 두 번 튄다. `BoardTable` 은 `rows=[]` 에서 헤더만 그리도록 설계돼 있고
 *   (BoardTable.jsx:10-11), 문구는 그 아래 상태 블록이 담당한다.
 *
 *   에러 상태에 대한 주의: `fetchBoardRows` 는 **어떤 supabase 실패도 삼키고**
 *   `{ rows: [], total: 0 }` 을 돌려준다(boardData.js:72-75). 즉 조회 실패는 여기서
 *   '데이터 0건'과 구분되지 않는다 — 의도된 계약이다(목록이 죽는 것보다 빈 목록이 낫다).
 *   아래 error 상태는 그 위층, 즉 모듈 로드/네트워크 계층에서 예외가 튄 경우만 잡는다.
 */

/** 상태 문구 공통 클래스 — CompanyNews.jsx:776-782(같은 게시판 도메인)에서 가져왔다.
 *  Faq.jsx:13 의 `text-gray-400`(#9CA3AF, 흰 배경 대비 2.85:1 → AA 미달) 대신
 *  #767676(4.66:1, AA 통과)을 쓰는 CompanyNews 쪽을 정본으로 택했다. */
const STATE_BLOCK_CLASS =
  "py-16 text-center text-sm font-medium text-[#767676]";

const DEFAULT_EMPTY_MESSAGE = "등록된 게시글이 없습니다.";
const LOADING_MESSAGE = "불러오는 중입니다.";
const ERROR_MESSAGE =
  "게시글을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";

/** 무결과 문구 기본값 — 검색어를 따옴표로 감싸 노출하는 Faq.jsx:159 형식 그대로. */
function defaultNoResultMessage(keyword: string) {
  return `'${keyword}'에 대한 검색 결과가 없습니다.`;
}

type BoardListPageProps = {
  /** 페이지 제목이자 `<h1>` 텍스트. 예: '회사소식' */
  title: string;
  /** `BOARD_SOURCES` 의 값('company_news') 또는 키('companyNews') */
  source: string;
  /** 페이지당 행 수(설계 결정 D5) */
  pageSize?: number;
  /** 검색 입력 라벨. 생략 시 `'{title} 검색'` */
  searchAriaLabel?: string;
  /** 상세 링크 경로. null 이면 제목이 클릭 불가 텍스트가 된다(BoardTable 계약). */
  getDetailHref?: (row: BoardRow) => string | null;
  /** 데이터 0건 문구 */
  emptyMessage?: string;
  /** 검색 결과 0건 문구. 함수면 trim 된 검색어를 인자로 받는다. */
  noResultMessage?: string | ((keyword: string) => string);
  /** 제목 위에 보일 배너. 생략하면 배너 없이 기존 간격 그대로다. */
  banner?: BoardBanner;
};

export default function BoardListPage({
  title,
  source,
  pageSize = BOARD_PAGE_SIZE,
  searchAriaLabel,
  getDetailHref,
  emptyMessage = DEFAULT_EMPTY_MESSAGE,
  noResultMessage = defaultNoResultMessage,
  banner,
}: BoardListPageProps) {
  const [rows, setRows] = useState<BoardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);

  const listRef = useRef<HTMLDivElement>(null);

  // paginate 내부의 보정 규칙(boardData.js:133)을 그대로 복제한다.
  // 번호 채번 어댑터가 paginate 와 **같은 크기**를 써야 페이지 경계에서 번호가 어긋나지 않는다.
  const safePageSize =
    Number.isFinite(pageSize) && pageSize > 0
      ? Math.floor(pageSize)
      : BOARD_PAGE_SIZE;

  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);
      setHasError(false);
      setKeyword("");
      setPage(1);

      try {
        // fetchBoardRows 는 supabase 오류를 삼키고 빈 결과를 준다 — 여기 catch 로 오는 것은
        // 그 위층(모듈/네트워크)에서 튄 예외뿐이다.
        const { rows: fetched } = await fetchBoardRows(source);

        if (!alive) return;

        setRows(fetched);
      } catch (error) {
        if (!alive) return;

        console.error("게시판 목록 로드 실패:", error);
        setRows([]);
        setHasError(true);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [source]);

  const filtered = useMemo(
    () => filterBoardRows(rows, keyword),
    [rows, keyword],
  );

  // ※ 한때 여기에 `showViewCount` 판정(전 행의 view_count 가 null 이면 조회수 컬럼을 숨김)이
  //    있었으나 제거했다. 시안(Figma 2235:3618)에 조회수 컬럼이 항상 존재하고, 조건부 렌더가
  //    "검색 0건에서 헤더가 3↔4컬럼으로 튐" / "로딩→도착 사이 컬럼 점프" 두 결함의 원인이었다.
  //    이제 BoardTable 이 컬럼을 무조건 그리고, 값 없는 행은 셀에 '-' 만 찍는다.

  const { pageRows, totalPages, safePage } = paginate(
    filtered,
    page,
    safePageSize,
  );

  const trimmedKeyword = keyword.trim();
  const isSearching = trimmedKeyword.length > 0;

  // 검색 결과가 줄어 현재 페이지가 사라져도 paginate 가 safePage 로 클램프하므로 화면은 안 깨진다.
  // 다만 검색 변경 시 페이지 리셋은 소비자(=여기) 의무다 — BoardSearchBar.jsx:10-14 계약.
  // 이 리셋이 빠지면 3페이지에서 검색했을 때 결과가 1페이지뿐인데 빈 화면이 뜬다.
  function handleKeywordChange(next: string) {
    setKeyword(next);
    setPage(1);
  }

  // AdmissionGuidelines.jsx:1286-1289 goToPage 선례 그대로 — 페이지 이동 후 목록 상단으로 스크롤.
  // 대상 요소에는 같은 선례의 scroll-mt-24 를 붙여 fixed 헤더(h-16)에 가리지 않게 한다.
  function handlePageChange(nextPage: number) {
    setPage(nextPage);
    listRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  function renderStateMessage() {
    if (loading) return LOADING_MESSAGE;
    if (hasError) return ERROR_MESSAGE;
    if (filtered.length > 0) return null;

    // 빈 상태 2종 구분: 데이터 자체가 0건 vs 검색 결과만 0건.
    if (isSearching) {
      return typeof noResultMessage === "function"
        ? noResultMessage(trimmedKeyword)
        : noResultMessage;
    }

    return emptyMessage;
  }

  const stateMessage = renderStateMessage();

  return (
    <main className="min-h-screen bg-white pt-16">
      <section
        className={
          banner
            ? "pb-20 pt-10 sm:pb-29.75"
            : "pb-20 pt-16 sm:pb-29.75 sm:pt-28.5"
        }
      >
        <div className="mx-auto w-full max-w-content px-5 sm:px-8">
          {banner ? <BoardBannerImage banner={banner} /> : null}
          <div className="flex flex-col gap-6 sm:gap-2.25">
            <h1 className="break-keep text-2xl font-semibold leading-[1.3] tracking-[-0.02em] text-ink sm:text-[2.75rem]">
              {title}
            </h1>

            <BoardSearchBar
              value={keyword}
              onChange={handleKeywordChange}
              ariaLabel={searchAriaLabel || `${title} 검색`}
            />
          </div>

          <div ref={listRef} className="mt-7.75 scroll-mt-24">
            <BoardTable
              rows={pageRows}
              // exactOptionalPropertyTypes: BoardTableProps.getDetailHref는 명시적 undefined를
              // 허용하지 않으므로, 값이 있을 때만 프롭 자체를 스프레드한다(동작은 동일).
              {...(getDetailHref ? { getDetailHref } : {})}
              getDisplayNumber={(row, indexInPage) =>
                getDisplayNumber(
                  row,
                  (safePage - 1) * safePageSize + indexInPage,
                  filtered.length,
                )
              }
              formatDate={formatBoardDate}
              getViewCount={getViewCount}
              caption={`${title} 목록`}
            />

            {/* role="status" 는 admissionResults/StateBlocks.jsx:9 선례. 검색 중에는 키 입력마다
                문구가 바뀔 수 있으나, 검색 결과 문구에 aria-live 를 거는 것은 Faq.jsx:155 정본과
                같은 수준의 낭독량이다(목록 전체가 아니라 한 줄만 재낭독된다). */}
            {stateMessage ? (
              <div role="status" className={STATE_BLOCK_CLASS}>
                {stateMessage}
              </div>
            ) : null}
          </div>

          {/* 표 하단 → 페이지네이션 49px(시안 64 × 0.766). BoardPagination 이 자체적으로 mt-8 을
              갖고 있어(BoardPagination.jsx:55) 같은 유틸리티 그룹끼리는 클래스 나열 순서로
              이길 수 없다 — `!` 로 명시 오버라이드한다. */}
          <BoardPagination
            currentPage={safePage}
            totalPages={totalPages}
            onPageChange={handlePageChange}
            className="mt-12.25!"
          />
        </div>
      </section>
    </main>
  );
}
