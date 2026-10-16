import { NOTICES } from "@/lib/inquiry/labels";

// 심화탐구 전 화면 하단 고지 "꼭 알아 두세요" 3줄(No.134). 문구는 labels.ts NOTICES(서버 상수와 같음).
// InquiryAppLayout 이 모든 화면 하단에 한 번 그린다. 페이지가 따로 그리지 않는다.
export default function InquiryNotice() {
  return (
    <section
      aria-labelledby="inquiry-notice-heading"
      className="rounded-xl bg-surface-04 px-5 py-4"
    >
      <h2
        id="inquiry-notice-heading"
        className="text-app-label font-semibold text-ink-strong"
      >
        꼭 알아 두세요
      </h2>
      <ul className="mt-2 flex flex-col gap-1 text-app-caption text-ink-sub">
        {NOTICES.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </section>
  );
}
