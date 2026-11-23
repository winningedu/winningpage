import kakaoChatPhone from "@/assets/inquiry/kakao-chat-phone.png";
import kakaoLogo from "@/assets/inquiry/kakao-logo.png";
import { COMPANY } from "@/data/company";
import { trackEvent } from "@/lib/analytics";

// 온라인 문의 — 카카오톡 채널 상담 유도 랜딩 (Figma 4275:2588).
// 러프 구현 방침: 구조·위계·컬러·카피는 시안대로, 세부 수치는 재량.
const FEATURE_CARDS = [
  {
    emoji: "💬",
    title: "실시간 1:1 상담",
    description: "채팅으로 바로 질문하고 답변을 받을 수 있습니다.",
  },
  {
    emoji: "⌚️",
    title: "상담 시간",
    description: "평일 10:00~19:00외 시간에 남겨주시면 답변드립니다.",
  },
  {
    emoji: "🎞️",
    title: "사진 파일 전송",
    description: "교재 사진이나 성적표를 첨부해 정확하게 문의할 수 있습니다.",
  },
  {
    emoji: "📂",
    title: "상담 내역 보관",
    description: "대화가 채팅방에 남아 언제든 다시 확인할 수 있습니다.",
  },
] as const;

export default function OnlineInquiry() {
  const kakaoChannelUrl = COMPANY.kakaoChannelUrl;

  return (
    <main className="min-h-screen bg-white pt-16 text-[#0D1B2A]">
      <div className="mx-auto w-full max-w-content px-5 pb-20 pt-14 sm:px-8 sm:pb-28 sm:pt-20">
        <h1 className="mx-auto max-w-[46rem] break-keep text-center text-[1.75rem] font-semibold leading-tight tracking-[-0.02em] text-[#525252] sm:text-[2.25rem] lg:text-[2.75rem]">
          쉽고 빠르게
          <br className="sm:hidden" />{" "}
          <span className="text-[#013262]">카카오톡으로 문의 할 수 있어요</span>
        </h1>

        <div className="mx-auto mt-14 flex max-w-[54rem] flex-col items-center gap-8 lg:max-w-none lg:flex-row lg:justify-center">
          <img
            src={kakaoChatPhone}
            alt="위닝에듀 카카오톡 채널 상담 화면 예시"
            className="w-[15rem] shrink-0 sm:w-[18rem] lg:w-[21.8125rem]"
          />

          <div className="flex w-full max-w-[28rem] flex-col items-center gap-8 lg:max-w-[45.5rem] lg:items-start">
            <div className="grid w-full grid-cols-1 gap-8 sm:grid-cols-2">
              {FEATURE_CARDS.map((card) => (
                <div
                  key={card.title}
                  className="rounded-2xl bg-[#F9FAFB] px-6 py-5 shadow-[0_2px_2px_rgba(213,213,213,0.25)] lg:px-10"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[2rem] leading-none">
                      {card.emoji}
                    </span>
                    <span className="whitespace-nowrap text-xl font-semibold text-[#525252]">
                      {card.title}
                    </span>
                  </div>
                  <p className="mt-2 break-keep text-base font-medium leading-snug text-[#525252]">
                    {card.description}
                  </p>
                </div>
              ))}
            </div>

            {kakaoChannelUrl ? (
              <div className="flex flex-col items-center gap-2 lg:items-start">
                <a
                  href={kakaoChannelUrl}
                  onClick={() =>
                    trackEvent("kakao_inquiry_click", {
                      location: "online_inquiry",
                    })
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded-xl bg-[#fbe300] px-5 py-3 shadow-[0_8px_24px_rgba(13,27,42,0.16)] transition hover:brightness-95"
                >
                  <img
                    src={kakaoLogo}
                    alt=""
                    className="h-[1.625rem] w-[1.75rem]"
                  />
                  <span className="text-base font-semibold text-[#191d23]">
                    카카오톡 문의하기
                  </span>
                </a>
                <p className="text-xs font-medium text-[#2f2f2f]">
                  버튼을 누르면 위닝에듀 카카오톡 채널 채팅창이 새 창으로
                  열립니다.
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  );
}
