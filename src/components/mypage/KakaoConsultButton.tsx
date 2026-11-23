import { COMPANY } from "@/data/company";
import { trackEvent } from "@/lib/analytics";

// 카카오톡 상담 플로팅 버튼 (Figma 3679:1230 버튼 / 3679:1233 말풍선).
//
// 시안 주석이 배치를 직접 지시한다 — "카카오톡 상담하기 버튼은 마이페이지에서
// 오른쪽 하단에 항상 뜨게 해주세요!"(3656:362). 그래서 스크롤과 무관하게 고정한다.
//
// 실측
//   말풍선  272×44, radius 16, 흰 배경, drop shadow, 14px Medium, #191d23
//   버튼    191×50, radius 24, #fbe300(카카오 옐로), drop shadow, 16px SemiBold
//   아이콘  28×26, 버튼 좌측 20px 지점
//
// ⚠ 아이콘 — 시안은 카카오 공식 로고 이미지(image 407)를 쓴다. 그 자산이 레포에
// 없어 말풍선 SVG 로 대체했다. 공식 로고는 카카오 브랜드 가이드 적용 대상이라
// 임의로 비슷하게 그리지 않았다 — 자산을 받으면 이 자리를 교체하면 된다.
//
// ⚠ 링크 대상 — 카카오 채널 URL(pf.kakao.com/_xxxx) 정본이 없다. COMPANY.kakao 는
// 채널 **아이디**(winningedu_official)일 뿐 URL 이 아니고, 채널 키를 모르면 URL 을
// 만들 수 없다. 그래서 COMPANY.kakaoChannelUrl 이 비어 있으면 렌더하지 않는다 —
// 눌러도 아무 데도 가지 않는 버튼을 만들지 않는다는 이 레포의 원칙(PaymentSuccess.jsx
// CTA 주석)을 따른다. URL 이 채워지면 그 즉시 뜬다.
export default function KakaoConsultButton() {
  const url = COMPANY.kakaoChannelUrl;
  if (!url) return null;

  return (
    <div className="fixed bottom-perf-inset right-25 z-40 hidden flex-col items-end gap-3 lg:flex">
      <div className="rounded-2xl bg-white px-5 py-3 text-[0.875rem] font-medium leading-5 text-ink-title shadow-[0_8px_24px_rgba(13,27,42,0.16)]">
        궁금한 점은 카카오톡으로 바로 물어보세요
      </div>

      <a
        href={url}
        onClick={() =>
          trackEvent("kakao_inquiry_click", { location: "mypage" })
        }
        target="_blank"
        rel="noopener noreferrer"
        className="flex h-12.5 items-center gap-2 rounded-3xl bg-[#fbe300] pl-5 pr-6 text-base font-semibold text-ink-title shadow-[0_8px_24px_rgba(13,27,42,0.16)] transition hover:brightness-95"
      >
        <svg
          width="28"
          height="26"
          viewBox="0 0 28 26"
          aria-hidden="true"
          fill="currentColor"
        >
          {/* 카카오톡 말풍선 형태의 일반 아이콘 — 공식 로고 자산으로 교체 예정(상단 주석). */}
          <path d="M14 1C6.82 1 1 5.63 1 11.34c0 3.62 2.4 6.8 6.02 8.63-.2.72-1.28 4.4-1.32 4.7 0 0-.03.22.11.3.14.09.3.02.3.02.4-.06 4.66-3.05 5.4-3.57.82.12 1.65.18 2.49.18 7.18 0 13-4.63 13-10.34C27 5.63 21.18 1 14 1z" />
        </svg>
        카카오톡 상담하기
      </a>
    </div>
  );
}
