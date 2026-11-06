/** 영역별 오류 안내(W1 error). 다시 시도 버튼 없이 문구만 영역 가운데에 보여준다. */
export default function AreaNotice({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="rounded-lg bg-surface-danger px-4 py-3 text-[0.8125rem] leading-[1.4] text-ink-danger"
    >
      {message}
    </p>
  );
}
