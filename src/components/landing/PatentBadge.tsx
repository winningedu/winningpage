const CERTIFICATE_PDF_URL = "/images/landing/patent-certificate-10-3038224.pdf";
const BADGE_ALT = "특허청 '학습코칭 장치 및 방법' 특허 등록 103038224";

// 헤더 로고와 같은 컨테이너 폭/좌우 패딩으로 왼쪽 끝을 맞춘다.
// lg 이상은 히어로 상단 빈 패딩에 겹쳐 놓아 히어로를 밀어내지 않고,
// lg 미만은 일반 흐름으로 히어로 위에 둬 캐러셀을 가리지 않는다.
export default function PatentBadge() {
  return (
    <div className="mx-auto max-w-[120rem] px-8 pt-4 lg:pointer-events-none lg:absolute lg:inset-x-0 lg:top-20 lg:z-10 lg:pt-0 2xl:px-30">
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
          width={800}
          height={400}
          className="h-auto w-[6.5rem] lg:w-32"
        />
      </a>
    </div>
  );
}
