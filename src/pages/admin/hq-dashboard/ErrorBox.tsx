// 본사 대시보드 구역 공통 오류 띠. 조회 실패 문구를 그대로 보인다.

export default function ErrorBox({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive"
    >
      {message}
    </div>
  );
}
