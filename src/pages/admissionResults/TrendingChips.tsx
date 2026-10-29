import { TRENDING_HEADING } from "./constants";

// 섹션 헤딩 옆 상향 삼각형 (Figma 2029:784 Polygon 2, 20×20).
// 원본은 SVG 에셋이지만 단색 삼각형이라 인라인으로 그린다(에셋 추가 불필요).
function TrendingMark() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="h-5 w-5 shrink-0">
      <path d="M10 1 L17.93 15 H2.07 Z" fill="#e5484d" />
    </svg>
  );
}

/**
 * "지금 뜨고 있는 학과" pill 그리드 (Figma 2029:781).
 *
 * 데이터 소스는 운영자 큐레이션 테이블 trending_departments(sql/40) 하나뿐이다.
 * 파생 랭킹(경쟁률 상승률 등)은 최소 2개년 데이터가 필요한데 원본이 0행이라 산출 불가 —
 * 없는 랭킹을 지어내지 않는다.
 * 빈 배열이면 섹션 전체를 렌더하지 않는다(빈 pill 그리드는 고장으로 보인다).
 * 로고(logo_url)도 값이 있을 때만 그린다 — 대학 CI는 저작권 확인 전이라 저장소에 에셋이 없다.
 */
type TrendingItem = {
  key: string;
  label: string;
  universityKey?: string;
  departmentKey?: string;
  logoUrl?: string;
};

type TrendingChipsProps = {
  items?: TrendingItem[];
  onSelect?: (item: TrendingItem) => void;
};

export default function TrendingChips({
  items = [],
  onSelect,
}: TrendingChipsProps) {
  if (!items.length) return null;

  return (
    <section aria-labelledby="admission-results-trending-heading">
      <div className="flex items-center gap-1.5">
        <h2
          id="admission-results-trending-heading"
          className="break-keep text-2xl font-semibold leading-[1.3] tracking-[-0.02em] text-ink sm:text-[1.75rem] lg:text-[2rem]"
        >
          {TRENDING_HEADING}
        </h2>
        <TrendingMark />
      </div>

      <ul className="mt-6 flex flex-wrap gap-3 sm:gap-3.5">
        {items.map((item) => {
          const linkable = Boolean(item.universityKey && item.departmentKey);
          return (
            <li key={item.key}>
              <button
                type="button"
                disabled={!linkable}
                onClick={() => onSelect?.(item)}
                title={linkable ? undefined : "상세 연결 정보가 아직 없습니다."}
                // 375에서 시안 치수(h 62 / px 24 / 16px)를 그대로 쓰면 칩이 한 줄에 하나씩만
                // 들어가 세로로 8줄이 된다. 모바일만 한 단계 줄여 2열이 되게 한다.
                className={`flex h-13 items-center gap-2.5 rounded-full px-4 text-[0.875rem] font-semiboldleading-[1.3] tracking-[-0.02em] transition-colors duration-200 ease-(--ease-out-quart) focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent sm:h-15.5 sm:px-6 sm:text-base ${
                  linkable
                    ? "cursor-pointer bg-surface-footer text-ink hover:bg-primary hover:text-white"
                    : "cursor-not-allowed bg-surface-footer text-ink"
                }`}
              >
                {item.logoUrl ? (
                  <img
                    src={item.logoUrl}
                    alt=""
                    aria-hidden="true"
                    loading="lazy"
                    className="h-8 w-8 shrink-0 object-contain"
                  />
                ) : null}
                <span className="break-keep">{item.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
