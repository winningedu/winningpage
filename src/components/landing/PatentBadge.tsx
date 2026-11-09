import { site } from "@/config/site";

const CERTIFICATE_PDF_URL = "/images/landing/위닝에듀 학습코칭 특허증.pdf";
const BADGE_ALT = "지식재산처 학습코칭 장치 및 방법 특허 제10-3038224호";

// 헤더 로고와 같은 컨테이너 폭/좌우 패딩으로 왼쪽 끝을 맞춘다(사이트별 헤더 기준).
// lg 이상은 히어로 상단 빈 패딩에 겹쳐 놓아 히어로를 밀어내지 않고,
// lg 미만은 일반 흐름으로 히어로 위에 둬 캐러셀을 가리지 않는다.
export default function PatentBadge() {
  const horizontal = site.features.b2bMenu
    ? "px-8 desktop:px-[clamp(2rem,6.25vw,7.5rem)]"
    : "mx-auto max-w-[120rem] px-8 2xl:px-30";
  return (
    <div
      className={`${horizontal} pt-4 lg:pointer-events-none lg:absolute lg:inset-x-0 lg:top-20 lg:z-10 lg:pt-0`}
    >
      <a
        href={CERTIFICATE_PDF_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${BADGE_ALT}, 특허증 새 창 열기`}
        className="pointer-events-auto inline-block"
      >
        <img
          src="/images/landing/patent-badge.png"
          alt={BADGE_ALT}
          width={819}
          height={357}
          className="h-auto w-[6.5rem] lg:w-32"
        />
      </a>
    </div>
  );
}
