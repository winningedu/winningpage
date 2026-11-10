import BoardListPage from "@/components/board/BoardListPage";
import { site } from "@/config/site";
import { BOARD_SOURCES } from "./board/boardData";

/**
 * 회사소식 목록 페이지 (`/company-news/list`).
 *
 * 이 파일은 배선만 한다 — 레이아웃·상태·표·검색·페이지네이션은 전부 `BoardListPage` 가 소유한다.
 * `BoardListPage` 가 `<main>` 과 `<h1>` 을 직접 렌더하므로 여기서 다시 감싸면 main/h1 이
 * 2개가 된다. 따라서 이 컴포넌트의 반환값은 `<BoardListPage />` 단독이어야 한다.
 *
 * 상세는 별도 라우트를 만들지 않고 기존 `/company-news` 의 `?id=` 상세뷰를 그대로 재사용한다
 * (CompanyNews.jsx:797-798 의 useSearchParams 기반 분기).
 */
export default function CompanyNewsList() {
  return (
    <BoardListPage
      title={site.news.companyTitle}
      source={BOARD_SOURCES.companyNews}
      // BoardRow.id는 옵셔널 타입이지만(boardData.ts), String(undefined) === "undefined"라
      // encodeURIComponent(undefined)와 동일한 문자열이 나와 기존 동작을 그대로 보존한다.
      getDetailHref={(row) =>
        `/company-news?id=${encodeURIComponent(String(row.id))}`
      }
      emptyMessage={site.news.companyEmpty}
    />
  );
}
