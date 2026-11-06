import { useState } from "react";
import { copyTextWithToast } from "@/lib/clipboard";

const ROW_BOX_CLASS =
  "flex h-13 items-center rounded-xl border border-line px-5 text-base text-ink";

const ACTION_CLASS =
  "shrink-0 whitespace-nowrap text-sm font-semibold text-accent underline underline-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

type LinkCodeRowProps = {
  label: string;
  code: string;
  /** 복사 버튼을 둘지. 학부모 매칭에 쓰는 스쿨멘토 학생 고유코드에서 켠다(사 #111). */
  copyable: boolean;
  reissuing: boolean;
  onReissue: () => void;
};

// 마이페이지 학생 전용 코드 행. 코드는 학생이 발급하고 학부모가 입력한다(sql/40 issue_student_link_code).
export default function LinkCodeRow({
  label,
  code,
  copyable,
  reissuing,
  onReissue,
}: LinkCodeRowProps) {
  const [copyMsg, setCopyMsg] = useState("");

  return (
    <div className="mb-6">
      <p className="mb-2 text-sm text-ink">{label}</p>
      <div className="flex items-center gap-2">
        <div
          className={`${ROW_BOX_CLASS} flex-1 tracking-[0.2em] bg-surface-footer text-ink-sub`}
        >
          {code || "-"}
        </div>
        {copyable && (
          <button
            type="button"
            onClick={() =>
              copyTextWithToast(code, {
                success: setCopyMsg,
                error: setCopyMsg,
              })
            }
            disabled={!code}
            className={ACTION_CLASS}
          >
            복사
          </button>
        )}
        <button
          type="button"
          onClick={onReissue}
          disabled={!code || reissuing}
          className={ACTION_CLASS}
        >
          {reissuing ? "재발급 중..." : "재발급"}
        </button>
      </div>
      {copyMsg && <p className="mt-2 text-xs text-ink-sub">{copyMsg}</p>}
    </div>
  );
}
