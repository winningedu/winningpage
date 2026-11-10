import type { ClipboardEvent, KeyboardEvent } from "react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import MyPageModalShell from "@/components/mypage/MyPageModalShell";
import type { RequestParentLinkRpcResult } from "@/lib/parentLink";
import { QA_ACCOUNT_MESSAGE } from "@/lib/qaAccount";
import { supabase } from "@/lib/supabase";

// 자녀 연결 모달 (Figma 3709:2579 입력 / 3709:2599 완료).
// 두 화면이 같은 흐름의 앞뒤라 한 컴포넌트에서 단계로 전환한다.
//
// ⚠ 시안과 백엔드 불일치 — 시안은 "6자리 **숫자** 코드"라고 안내하고 입력칸도
// 숫자로 그려져 있지만, 실제 연결코드는 숫자가 아니다. 발급기
// (generate_link_code_string, sql/40)와 api/_routes/lookup-child.js 의 CODE_PATTERN 이
// 모두 [23456789ABCDEFGHJKMNPQRSTUVWXYZ] 6자리다 — 헷갈리는 글자(0/O/1/I/L)를
// 뺀 영숫자다. 숫자만 받게 만들면 실제 코드를 아예 입력할 수 없으므로 영숫자로
// 받고 안내 문구도 "6자리 코드"로 고쳤다. 디자이너 확인 필요.
const CODE_LENGTH = 6;
const CODE_ALPHABET = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]$/;

// request_parent_link(sql/40)는 errcode 없이 메시지로만 사유를 던진다.
// PostgREST 는 그 문구를 error.message 에 그대로 실어 준다.
const LINK_ERROR_TEXT = {
  not_a_parent: "학부모 회원만 자녀를 연결할 수 있습니다.",
  invalid_code_format: "연결코드 형식이 올바르지 않습니다.",
  link_code_not_found:
    "일치하는 연결코드가 없습니다. 코드를 다시 확인해 주세요.",
  cannot_link_self: "본인 계정은 자녀로 연결할 수 없습니다.",
  student_already_linked: "이미 다른 학부모와 연결된 학생입니다.",
  link_already_requested: "이미 연결을 요청한 학생입니다.",
  // QA 계정 보호(WC103): 메시지 자체가 안내 문구다.
  [QA_ACCOUNT_MESSAGE]: QA_ACCOUNT_MESSAGE,
};
const LINK_UNKNOWN_ERROR_TEXT =
  "연결 요청에 실패했습니다. 잠시 후 다시 시도해 주세요.";

function resolveLinkError(error: { message?: string } | null | undefined) {
  const raw = String(error?.message || "");
  const hit = Object.keys(LINK_ERROR_TEXT).find((key) => raw.includes(key));
  return hit ? LINK_ERROR_TEXT[hit] : LINK_UNKNOWN_ERROR_TEXT;
}

type LinkChildModalProps = {
  open: boolean;
  onClose: () => void;
  onLinked?: () => void;
};

export default function LinkChildModal({
  open,
  onClose,
  onLinked,
}: LinkChildModalProps) {
  const titleId = useId();
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  const [chars, setChars] = useState(() => Array(CODE_LENGTH).fill(""));
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  // null = 입력 단계, 문자열 = 완료 단계(요청이 전달된 학생 이름).
  const [sentTo, setSentTo] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setChars(Array(CODE_LENGTH).fill(""));
    setSaving(false);
    setErrorMsg("");
    setSentTo(null);
  }, [open]);

  const code = useMemo(() => chars.join(""), [chars]);
  const filled = code.length === CODE_LENGTH && chars.every(Boolean);

  function writeChar(index: number, raw: string) {
    const ch = String(raw || "")
      .toUpperCase()
      .slice(-1);
    if (ch && !CODE_ALPHABET.test(ch)) return;

    setChars((prev) => {
      const next = [...prev];
      next[index] = ch;
      return next;
    });
    setErrorMsg("");
    if (ch && index < CODE_LENGTH - 1) inputsRef.current[index + 1]?.focus();
  }

  function handleKeyDown(
    index: number,
    event: KeyboardEvent<HTMLInputElement>,
  ) {
    if (event.key === "Backspace" && !chars[index] && index > 0) {
      event.preventDefault();
      inputsRef.current[index - 1]?.focus();
      setChars((prev) => {
        const next = [...prev];
        next[index - 1] = "";
        return next;
      });
    }
  }

  // 코드를 통째로 붙여넣는 경우(문자메시지에서 복사 등)를 흘리지 않는다.
  function handlePaste(event: ClipboardEvent<HTMLDivElement>) {
    const text = String(event.clipboardData?.getData("text") || "")
      .toUpperCase()
      .replace(/[^23456789ABCDEFGHJKMNPQRSTUVWXYZ]/g, "")
      .slice(0, CODE_LENGTH);
    if (!text) return;
    event.preventDefault();
    const next = Array(CODE_LENGTH).fill("");
    for (let i = 0; i < text.length; i += 1) next[i] = text[i];
    setChars(next);
    setErrorMsg("");
    inputsRef.current[Math.min(text.length, CODE_LENGTH - 1)]?.focus();
  }

  const handleSubmit = useCallback(async () => {
    if (!filled || saving) return;
    setSaving(true);
    setErrorMsg("");

    const { data, error } = await supabase.rpc("request_parent_link", {
      p_code: code,
    });
    setSaving(false);

    if (error) {
      console.error("자녀 연결 요청 실패:", error);
      setErrorMsg(resolveLinkError(error));
      return;
    }

    // { ok, link_id, status, student_name } — 완료 모달 문구에 이름이 필요하다.
    // 생성 타입은 RPC 반환을 Json으로만 표현해 캐스트가 필요하다(parentLink.ts 참고).
    const result = data as unknown as RequestParentLinkRpcResult;
    setSentTo(result?.student_name || "");
    onLinked?.();
  }, [filled, saving, code, onLinked]);

  if (!open) return null;

  // ── 완료 단계 (3709:2599) ───────────────────────────────────────────
  if (sentTo !== null) {
    return (
      <MyPageModalShell
        open={open}
        onClose={onClose}
        labelledBy={titleId}
        className="w-104"
      >
        <div className="flex flex-col items-center px-6 py-10 text-center">
          <h2
            id={titleId}
            className="text-[1.25rem] font-bold leading-[1.4] text-ink-title"
          >
            자녀와 연결됐어요
          </h2>
          <p className="mt-4 break-keep text-[0.875rem] leading-[1.6] text-ink-sub">
            {sentTo
              ? `${sentTo} 학생과 연결이 완료됐어요.`
              : "연결이 완료됐어요."}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="mt-7 h-10 w-37.5 rounded-lg bg-primary text-[0.875rem] font-semibold text-white transition-colors hover:opacity-90"
          >
            확인
          </button>
        </div>
      </MyPageModalShell>
    );
  }

  // ── 입력 단계 (3709:2579) ───────────────────────────────────────────
  return (
    <MyPageModalShell
      open={open}
      onClose={onClose}
      labelledBy={titleId}
      className="w-104"
    >
      <div className="flex flex-col items-center px-6 py-8 text-center">
        <h2
          id={titleId}
          className="text-[1.25rem] font-bold leading-[1.4] text-ink-title"
        >
          연결코드를 입력해주세요
        </h2>
        <p className="mt-3 break-keep text-[0.8125rem] leading-[1.6] text-ink-sub">
          자녀 계정 마이페이지 → 학부모 연결에서
          <br />
          6자리 코드를 확인할 수 있어요.
        </p>

        <div className="mt-6 flex justify-center gap-2" onPaste={handlePaste}>
          {chars.map((ch, index) => (
            <input
              // biome-ignore lint/suspicious/noArrayIndexKey: 고정 6자리 코드 입력칸 — index 자체가 "몇 번째 자리"라는 의미이고 재정렬되지 않는다.
              key={index}
              ref={(el) => {
                inputsRef.current[index] = el;
              }}
              type="text"
              inputMode="text"
              autoComplete="one-time-code"
              maxLength={1}
              value={ch}
              aria-label={`연결코드 ${index + 1}번째 자리`}
              onChange={(e) => writeChar(index, e.target.value)}
              onKeyDown={(e) => handleKeyDown(index, e)}
              className="h-12 w-10 rounded-lg border border-line text-center text-[1rem] font-semibold uppercase text-ink outline-hidden focus:border-accent"
            />
          ))}
        </div>

        {errorMsg && (
          <p className="mt-4 text-[0.8125rem] text-error">{errorMsg}</p>
        )}

        <div className="mt-7 grid w-full grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-12 rounded-xl bg-surface-footer text-[0.875rem] font-semibold text-ink-sub transition hover:bg-line/30"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!filled || saving}
            className={`h-12 rounded-xl text-[0.875rem] font-semibold text-white transition ${
              filled && !saving
                ? "bg-primary hover:opacity-90"
                : "cursor-not-allowed bg-line"
            }`}
          >
            {saving ? "연결 중..." : "연결하기"}
          </button>
        </div>
      </div>
    </MyPageModalShell>
  );
}
