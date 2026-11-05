// 표 안에 보이는 빈 상태 안내(스펙 0.4).

export default function EmptyMessage({ body }: { body: string }) {
  return (
    <p className="px-6 py-24 text-center text-app-body text-ink-sub">{body}</p>
  );
}
