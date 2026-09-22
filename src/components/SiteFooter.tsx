import { Link } from "react-router";
import { site } from "@/config/site";
import { useNavGroups } from "@/hooks/useNavGroups";

// 결제/랜딩 공용 푸터. 사업자 정보 + 이용약관/개인정보처리방침 링크 포함.
// 메뉴 컬럼은 헤더 메가메뉴와 동일한 useNavGroups()(DB → 캐시 → fallback)를 공유한다.
// lg+ 데스크톱: 로고와 메뉴 격자 모두 컨텐츠 영역(max-w-content) 안에서 한 flex 컨테이너로
// 배치한다. 메뉴 컬럼은 시안 2207:13215(1920x592, 0805 개정) 기준 — 컬럼은 hug가 아닌
// 고정폭, gap 3.125rem(50px), 블록은 컨텐츠 영역 우측 정렬. 컬럼폭은 navGroups 배열 순서가
// 아니라 group.title로 매핑한다(DB가 그룹 순서를 바꿔도 깨지지 않도록) — 서비스 5.5625rem
// (89px), 프리미엄 8.25rem(132px, 긴 서브아이템 라벨 "국제・해외고 국내대입학컨설팅" 2줄
// 래핑 근거 유지), 입시정보/이용신청/고객안내 7.5rem(120px), 미매핑 시 기본값 7.5rem.
// 검산: 89+50+132+50+120+50+120+50+120 = 781px.

const FOOTER_COLUMN_WIDTH_CLASS: Record<string, string> = {
  서비스: "w-22.25",
  프리미엄: "w-33",
  입시정보: "w-30",
  이용신청: "w-30",
  고객안내: "w-30",
};
const FOOTER_COLUMN_WIDTH_DEFAULT = "w-30";

// 사업자 문구는 site.company의 선택 필드(특허출원·통신판매업·고객센터)가 없으면
// 해당 조각 자체를 생략한다(값 없이 렌더하지 않는다는 원칙 — 스쿨멘토는 이 필드가
// 아예 없다). 구분자 " | "가 빈 조각 자리에 남지 않도록 join 전에 필터링한다.
function buildBizInfoLine(company: typeof site.company) {
  return [
    `상호명: ${company.name}`,
    `대표: ${company.ceo}`,
    `법인등록번호: ${company.corpRegNo}`,
    company.patentNo ? `특허출원: ${company.patentNo}` : null,
    `사업자 등록번호: ${company.bizRegNo}`,
    company.mailOrderNo
      ? `통신판매업 신고번호: ${company.mailOrderNo}`
      : null,
  ]
    .filter(Boolean)
    .join(" | ");
}

function buildAddressLine(company: typeof site.company) {
  return [
    `주소: ${company.address}`,
    company.supportChannelLabel
      ? `온라인고객센터 : ${company.supportChannelLabel}`
      : null,
  ]
    .filter(Boolean)
    .join(" | ");
}

export default function SiteFooter() {
  const navGroups = useNavGroups();

  return (
    <footer className="bg-surface-footer">
      <div className="relative py-25">
        {/* 모바일/태블릿(<lg): 로고 + 메뉴 흐름 배치 (현행 유지) */}
        <div className="mx-auto flex max-w-content flex-col gap-10 px-6 lg:hidden">
          <Link
            to="/company-news"
            className="inline-flex shrink-0 items-center"
          >
            <img
              src={site.logo.stacked}
              alt={site.brandName}
              className="h-25 w-auto object-contain"
            />
          </Link>

          <div className="grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-3">
            {navGroups.map((group) => (
              <nav key={group.title} className="min-w-0">
                <p className="mb-5 text-sm font-medium text-[#808080]">
                  {group.title}
                </p>
                <ul className="space-y-3">
                  {group.items.map((item) => (
                    <li key={`${group.title}-${item.label}`}>
                      <Link
                        to={item.to}
                        className="inline-block break-keep py-1 text-sm font-medium text-ink transition hover:text-primary"
                      >
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
        </div>

        {/* 데스크톱(lg+): 로고 + 메뉴 격자를 하나의 flex 컨테이너에서 좌/우로 배치.
            로고와 메뉴는 같은 컨테이너에 있어 서로 겹치지 않는다(격자 최소폭 764px +
            로고 185px = 949px < 컨텐츠 내부폭 1136px). */}
        <div className="mx-auto hidden w-full max-w-content items-start justify-between px-8 lg:flex">
          <Link
            to="/company-news"
            className="inline-flex shrink-0 items-center"
          >
            <img
              src={site.logo.stacked}
              alt={site.brandName}
              className="h-auto w-46.25"
            />
          </Link>

          <div className="flex gap-12.5">
            {navGroups.map((group) => (
              <nav
                key={group.title}
                className={`shrink-0 ${FOOTER_COLUMN_WIDTH_CLASS[group.title] ?? FOOTER_COLUMN_WIDTH_DEFAULT}`}
              >
                {/* 시안 2207:13215은 "고객안내" 컬럼만 타이틀↔리스트 gap이 10px(나머지는
                    20px)인데, 5컬럼 중 1개만 다른 것은 시안 결함으로 판단해 전 컬럼
                    20px(1.25rem)로 통일한다. */}
                <p className="mb-5 text-sm font-medium text-[#808080]">
                  {group.title}
                </p>
                <ul className="space-y-3">
                  {group.items.map((item) => (
                    <li key={`${group.title}-${item.label}`}>
                      <Link
                        to={item.to}
                        className="inline-block break-keep text-sm font-medium text-ink transition hover:text-primary"
                      >
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
        </div>
      </div>

      {/* 사업자 정보: 시안 2207:13215 기준 콘텐츠 폭 1565px(97.8125rem)로 제한.
          border-t는 뷰포트 풀폭이 아닌 이 컨테이너 폭에만 그린다(시안 stroke는 사업자
          텍스트 블록과 정확히 같은 폭). border 스타일 자체(1px 20% 검정)는 시안의
          weight 0.2 검정 100%와 시각적으로 동등하고 서브픽셀 렌더가 더 안정적이라 유지. */}
      <div className="mx-auto max-w-[97.8125rem] border-t border-black/20 px-8">
        <div className="flex flex-col gap-6 py-10 lg:flex-row lg:items-start lg:justify-between">
          {/* 시안 2207:13215의 사업자 문구 텍스트에는 "10-2024-0048889| 사업자"(파이프 앞
              공백 누락), "신고번호:  제2026"(이중 공백) 오타가 있다. COMPANY 데이터가
              정상이므로 시안 텍스트를 따르지 않고 현행 그대로 유지한다. */}
          <div className="space-y-1 break-keep py-3 text-sm leading-[1.4] text-ink">
            <p>{buildBizInfoLine(site.company)}</p>
            <p>{buildAddressLine(site.company)}</p>
          </div>

          <div className="flex flex-col items-start gap-2 py-3 lg:items-end">
            <div className="flex items-center gap-8 text-sm font-semibold text-ink">
              <Link
                to="/terms"
                className="whitespace-nowrap py-1 transition hover:text-primary lg:py-0"
              >
                이용약관
              </Link>
              <Link
                to="/privacy"
                className="whitespace-nowrap py-1 transition hover:text-primary lg:py-0"
              >
                개인정보처리방침
              </Link>
            </div>
            {/* 시안 2207:13215 텍스트는 "@ All rights reserved."인데 "©"의 오타로
                판단해 현행 저작권 기호를 유지한다. */}
            <p className="text-sm text-ink">© All rights reserved.</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
