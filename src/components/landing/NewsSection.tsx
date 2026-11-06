import { ChevronRight } from "lucide-react";
import { Link } from "react-router";

import Chip from "@/components/Chip";
import { site } from "@/config/site";
import AreaNotice from "./AreaNotice";

/**
 * 뉴스 섹션 (QA 행109, 2026-09-07 시안 Figma node 4885:19030 재구현) — 독립 풀폭 섹션
 * - 중앙 타이틀 + 2컬럼(좌 회사소식 / 우 공지사항) 각 최대 5행 리스트. 필터 탭 없음 —
 *   상위 쿼리(Home.tsx)가 is_pinned desc, sort_order asc, created_at desc 순으로 이미
 *   정렬해 넘기므로 컴포넌트는 받은 순서 그대로 앞 5개만 자른다.
 * - 각 행 = 카테고리 배지 pill(is_pinned 행만) + 제목(ellipsis) + 우측 날짜. 썸네일 없음.
 * - 헤더 chevron → 더보기 (회사소식 /company-news/list, 공지사항 /events)
 * - 행 클릭 → 상세 (?id= 쿼리 파라미터 기반 기존 상세 라우트)
 *
 * 컨테이너 폭: 프로젝트 공통 max-w-content(72.75rem, lg 내부 1100px) 토큰 사용.
 * 치수는 0729 시안 문자값(px) ÷16 rem 환산을 그대로 사용(반올림 없이 시안 실측 소수점 유지).
 *
 * 수직 리듬: 상단(멘토→뉴스) 120px→md:pt-[7.5rem], 하단(뉴스→푸터) 120px→md:pb-[7.5rem]
 * (이 섹션이 다음 푸터와의 갭을 소유하는 예외 케이스). 모바일은 서비스 섹션 선례 비율
 * 0.4(=40/100, ServicesSection pt-10/lg:pt-[6.25rem] 참고)로 축소한 pt-12/pb-12(3rem/48px).
 * 타이틀→그리드 61px→md:mt-[3.8125rem], 컬럼 헤더→리스트 24px(0803 재스펙 3015:14378)→md:mt-[1.5rem]
 * (모바일 gap은 기존 유지, 시안에 모바일 분기 값 없음).
 *
 * 인터랙션: 행/헤더 레이아웃 치수(행 26px·pitch 50px·시안 색값)는 불변, hover/focus는
 * absolute 오버레이 레이어(sm+에서 -12px 확장 라운드 면)로만 표현 — --ease-out-quart
 * 150ms(Header.jsx 관례), prefers-reduced-motion은 motion-reduce:transition-none으로 가드.
 *
 */

type NewsItem = {
  id: string;
  title: string;
  created_at: string;
  category?: string | null;
  sort_order?: number;
  is_pinned?: boolean | null;
};

// 시안(Figma 1907:14893) 배지 3색 → 공통 Chip 의 tone 토큰 매핑.
// 색 hex 는 전부 src/components/Chip.jsx 가 소유한다(TONE_STYLES).
//
// 중요 배지의 coral(#FFC4C4/#FF7373)은 대비 1.75:1로 WCAG 미달이나 0803 재스펙
// (3015:14378)에서 디자이너가 원값을 유지했고 사용자 지시로 원값 적용
// (이전 보정 팔레트 #FFE9E9/#8F1616 폐기). ⚠ 게시판 중요 칩(Chip tone="red",
// #FFD9D9/#991E1E)과는 별개 물건이다 — 한쪽 값을 다른 쪽에 복사하지 말 것.
//
// ★ 배지는 is_pinned 단일 상태만 노출한다 — DB category(보도자료/공지 등 자유 텍스트)는
//   랜딩에서 미노출(사용자 확정 2026-08-20). 게시판 "중요" 칩(BoardTable)과 같은 축.

// KST(UTC+9) 기준 날짜 표기 — Home.jsx todayKstYmd와 동일한 +9h 시프트 방식.
// toISOString() 단독 사용 시 KST 00:00~08:59 생성 글이 전날로 표시되는 문제 방지.
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function formatDate(value: string | number | Date | null | undefined) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value).slice(0, 10).replace(/-/g, ".");
  }

  return new Date(date.getTime() + KST_OFFSET_MS)
    .toISOString()
    .slice(0, 10)
    .replace(/-/g, ".");
}

// 배지 폭은 0803 시안(3015:14378) 기준 min 4rem — '중요'(2자) 64px 고정.
// 2026-09-07 시안(4885:19030)은 미고정 행에 배지 자리를 남기지 않는다 — 제목이
// 열 좌측 끝에서 바로 시작(스페이서 제거, QA 행109).
type ChipTone = "blue" | "green" | "coral" | "red" | "gray";

function PinnedBadge({ pinned }: { pinned: boolean }) {
  if (!pinned) return null;

  return (
    <Chip
      tone={"coral" as ChipTone}
      size="md"
      className="relative min-w-16 shrink-0"
    >
      중요
    </Chip>
  );
}

function ColumnHeader({
  title,
  moreLink,
  moreLabel,
}: {
  title: string;
  moreLink: string;
  moreLabel: string;
}) {
  return (
    <h3 className="text-[1.174rem] font-semibold leading-[1.4] tracking-[-0.0235rem]">
      <Link
        to={moreLink}
        aria-label={moreLabel}
        className="group relative inline-flex items-center gap-[0.489rem] rounded-lg text-ink transition-colors duration-150 ease-(--ease-out-quart) hover:text-primary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#0B84FD] focus-visible:ring-offset-4 motion-reduce:transition-none max-lg:after:absolute max-lg:after:-inset-2.5 max-lg:after:content-['']"
      >
        {title}
        <ChevronRight
          size={19}
          aria-hidden="true"
          className="transition-transform duration-150 ease-(--ease-out-quart) group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:transform-none"
        />
      </Link>
    </h3>
  );
}

function EmptyRows({
  message,
  className,
}: {
  message: string;
  className?: string;
}) {
  return (
    <p
      className={`flex items-center justify-center text-center text-[0.9375rem] text-[#8b95a1] ${className}`}
    >
      {message}
    </p>
  );
}

function NewsRow({ item, basePath }: { item: NewsItem; basePath: string }) {
  return (
    <li>
      {/* 모바일(<sm): 뱃지+제목 한 줄 + 날짜 둘째 줄로 분리 — shrink-0 뱃지·날짜가 제목을
          100~120px까지 압착하던 문제 해결. sm+에서는 안쪽 div를 sm:contents로 평탄화해
          뱃지·제목·날짜가 다시 Link의 직계 flex 형제로 합쳐지므로 시안의 한 줄 레이아웃과
          간격이 그대로 복원된다(데스크톱 렌더 불변). */}
      <Link
        to={`${basePath}?id=${item.id}`}
        className="group relative flex flex-col gap-1 rounded-xl px-[0.489rem] py-4 focus-visible:outline-hidden sm:h-6.5 sm:flex-row sm:items-center sm:justify-between sm:gap-10 sm:px-0 sm:py-0"
      >
        <span
          aria-hidden="true"
          className="absolute inset-0 rounded-xl bg-[#F1F5F9] opacity-0 transition-opacity duration-150 ease-(--ease-out-quart) group-hover:opacity-100 group-focus-visible:opacity-100 group-focus-visible:ring-2 group-focus-visible:ring-[#0B84FD] motion-reduce:transition-none sm:-inset-x-3 sm:-inset-y-3"
        />
        <div className="flex min-w-0 items-center gap-[1.956rem] sm:contents">
          <PinnedBadge pinned={Boolean(item.is_pinned)} />
          <p className="relative min-w-0 flex-1 truncate text-[1rem] font-medium leading-[1.4] tracking-[-0.02rem] text-ink transition-colors duration-150 ease-(--ease-out-quart) group-hover:text-primary motion-reduce:transition-none">
            {item.title}
          </p>
        </div>
        {item.created_at ? (
          <time
            dateTime={String(item.created_at).slice(0, 10)}
            className="relative shrink-0 text-[0.7825rem] leading-[1.4] tracking-[-0.0157rem] text-line transition-colors duration-150 ease-(--ease-out-quart) group-hover:text-[#808080] motion-reduce:transition-none"
          >
            {formatDate(item.created_at)}
          </time>
        ) : (
          <span className="relative shrink-0 text-[0.7825rem] leading-[1.4] tracking-[-0.0157rem] text-line transition-colors duration-150 ease-(--ease-out-quart) group-hover:text-[#808080] motion-reduce:transition-none">
            {formatDate(item.created_at)}
          </span>
        )}
      </Link>
    </li>
  );
}

type ListStatus = "loading" | "ready" | "error";

type NewsSectionProps = {
  companyNews?: NewsItem[];
  notices?: NewsItem[];
  /** 목록별 조회 상태(스쿨멘토 홈). 없으면 위닝처럼 받은 행만 그린다. 있으면 빈, 오류, 로딩 박스를 11rem 높이로 맞춘다. */
  statuses?: { company: ListStatus; notices: ListStatus };
};

function NewsRowSkeleton() {
  return (
    <li
      data-testid="news-row-skeleton"
      className="flex h-6.5 items-center justify-between"
    >
      <span className="h-4 w-65 rounded-sm bg-surface-muted" />
      <span className="h-3 w-[3.8125rem] rounded-sm bg-surface-muted" />
    </li>
  );
}

function NewsList({
  title,
  moreLink,
  items,
  basePath,
  empty,
  status,
}: {
  title: string;
  moreLink: string;
  items: NewsItem[];
  basePath: string;
  empty: string;
  status: ListStatus | undefined;
}) {
  // status가 있으면(스쿨멘토) 상태 박스를 시안 높이 11rem으로 맞춘다.
  const boxClass = status ? "mt-6 h-16 md:h-44" : "mt-6 h-16 md:h-31.5";
  return (
    <div>
      <ColumnHeader
        title={title}
        moreLink={moreLink}
        moreLabel={`${title} 더보기`}
      />
      {status === "loading" ? (
        <ul className="mt-6 space-y-6">
          {[0, 1, 2, 3].map((index) => (
            <NewsRowSkeleton key={index} />
          ))}
        </ul>
      ) : status === "error" ? (
        <div className={`${boxClass} flex items-center justify-center`}>
          <AreaNotice message="소식을 불러오지 못했어요. 잠시 뒤 새로고침해 주세요" />
        </div>
      ) : items.length > 0 ? (
        <ul className="mt-6 space-y-6">
          {items.map((item) => (
            <NewsRow key={item.id} item={item} basePath={basePath} />
          ))}
        </ul>
      ) : (
        <EmptyRows message={empty} className={boxClass} />
      )}
    </div>
  );
}

export default function NewsSection({
  companyNews = [],
  notices = [],
  statuses,
}: NewsSectionProps) {
  const { maxRows, companyTitle, noticeTitle, companyEmpty, noticeEmpty } =
    site.news;

  return (
    <section
      aria-label={`${site.brandName} 소식`}
      className="w-full bg-white pt-8 pb-8 md:pt-20 md:pb-20"
    >
      <div className="mx-auto w-full max-w-content px-5 sm:px-8">
        <h2 className="text-center text-[1.75rem] font-semibold leading-[1.4] tracking-[-0.04rem] text-ink sm:text-[2rem]">
          {site.brandName}의 새로운 소식
        </h2>

        <div className="mt-perf-inset grid grid-cols-1 gap-perf-inset md:mt-15.25 md:grid-cols-2 md:gap-16">
          <NewsList
            title={companyTitle}
            moreLink="/company-news/list"
            items={companyNews.slice(0, maxRows)}
            basePath="/company-news"
            empty={companyEmpty}
            status={statuses?.company}
          />
          <NewsList
            title={noticeTitle}
            moreLink="/events"
            items={notices.slice(0, maxRows)}
            basePath="/events"
            empty={noticeEmpty}
            status={statuses?.notices}
          />
        </div>
      </div>
    </section>
  );
}
