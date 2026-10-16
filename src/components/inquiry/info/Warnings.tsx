// 자산 선택 경고(교과 활동 없음, 연계 재료 부족). 진행은 막지 않는 안내다(No.41, 42).
export default function Warnings({ messages }: { messages: string[] }) {
  if (messages.length === 0) return null;
  return (
    <ul
      aria-label="선택한 활동 안내"
      className="flex flex-col gap-1.5 rounded-lg bg-amber-50 px-4 py-3 text-app-label text-ink"
    >
      {messages.map((message) => (
        <li key={message}>{message}</li>
      ))}
    </ul>
  );
}
