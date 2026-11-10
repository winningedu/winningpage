// [E-3] 자녀 연결코드 입력 — docs/login-signup-renewal-spec.md §3.3 E-3.
// 노드 3상태: 2393:10864(빈) / 2393-10969(코드 입력·자녀 인식) / 2393-11078(자녀 선택·활성).
// 6자 입력이 완성되면 lookupChild로 조회(→ found 상태, 입력 필드 border-primary + 미리보기
// 카드 노출), 카드를 클릭하면 selected 상태로 전환되며 그때만 "연결하기"가 활성화된다
// ("§3.3 미해결: 자녀 인식 후 카드 클릭이 선택 상호작용인지" — 별도 상호작용으로 채택).
// 버튼 빈 상태 라벨의 선행 공백(" 코드 6자리를 입력하세요")은 §6.3 이슈 목록에 원본 그대로
// 기록된 문구를 그대로 재현한 것.
// TODO(시안 확인): 2393-10969 프레임 실측 여백은 py200/gap80이나 다른 화면군 다수 규칙인
// py100/gap40과 불일치 — 이 페이지는 py100/gap40(다수 규칙)을 유지, 시안 쪽 확인 필요.
//
// 조회 한도가 있어서 디바운스가 필수다
//   서버가 시간당 조회 30회 / 실패 10회로 끊는다(api/_routes/lookup-child.js). 6자가 채워질
//   때마다 즉시 쏘면 오타 몇 번에 한도가 차버려서, 입력이 멎은 뒤에 한 번만 보낸다.
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import {
  AuthLayout,
  AuthTitle,
  ChildPreviewCard,
  PrimaryButton,
  TextField,
} from "@/components/auth";
import { useSignup } from "@/context/SignupContext";
import {
  CODE_LENGTH,
  findImpossibleChars,
  lookupChild,
  normalizeLinkCode,
  requestParentLink,
} from "@/lib/parentLink";

const LOOKUP_DEBOUNCE_MS = 400;

interface ChildPreview {
  name: string;
  school: string;
  schoolType: string;
  grade?: string;
}

export default function LinkCode() {
  const navigate = useNavigate();
  const { memberType, parentSignupCompleted } = useSignup();

  // memberType 단독 가드는 실제 가입 완료 없이도 URL 직접 진입으로 뚫릴 수 있어
  // parentSignupCompleted(ParentForm 가입 성공 시에만 true)를 함께 요구한다.
  useEffect(() => {
    if (memberType !== "parent" || !parentSignupCompleted) {
      navigate("/signup", { replace: true });
    }
  }, [memberType, parentSignupCompleted, navigate]);

  const [code, setCode] = useState("");
  const [child, setChild] = useState<ChildPreview | null>(null);
  const [alreadyLinked, setAlreadyLinked] = useState(false);
  const [selected, setSelected] = useState(false);
  const [looking, setLooking] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");

  // 같은 코드로 반복 조회하지 않기 위해 마지막으로 보낸 코드를 기억한다.
  const lastLookedUp = useRef("");

  const resetResult = useCallback(() => {
    setChild(null);
    setSelected(false);
    setAlreadyLinked(false);
  }, []);

  useEffect(() => {
    if (code.length !== CODE_LENGTH) {
      resetResult();
      setError("");
      lastLookedUp.current = "";
      return;
    }

    // 코드에 없는 글자가 섞였으면 조회를 보내지 않는다. 서버 한도만 축내고
    // "찾을 수 없다"는 답만 돌아와서 사용자가 무엇을 고쳐야 할지 모른다.
    const impossible = findImpossibleChars(code);
    if (impossible.length > 0) {
      resetResult();
      setError(
        `연결코드에 ${impossible.join("·")}는 쓰이지 않아요. 다시 확인해 주세요.`,
      );
      return;
    }

    if (lastLookedUp.current === code) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      lastLookedUp.current = code;
      setLooking(true);
      setError("");

      const result = await lookupChild(code);
      if (cancelled) return;

      setLooking(false);

      if (!result.ok) {
        resetResult();
        setError(result.message);

        // 세션이 끊긴 상태로는 이 화면에서 할 수 있는 게 없다.
        if (result.reason === "not_authenticated") {
          navigate("/signup", { replace: true });
        }
        return;
      }

      setChild(result.child);
      setSelected(false);
      setAlreadyLinked(result.alreadyLinked);

      // 이미 다른 보호자와 연결된 학생이면 여기서 끊는다. 연결하기까지 눌렀다가
      // student_already_linked로 거절당하는 것보다 먼저 알려주는 편이 낫다.
      if (result.alreadyLinked) {
        setError("이미 다른 보호자와 연결된 학생이에요.");
      }
    }, LOOKUP_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [code, navigate, resetResult]);

  function handleChange(value: string) {
    setCode(normalizeLinkCode(value));
  }

  async function handleConnect() {
    if (!selected || connecting || alreadyLinked) return;

    setConnecting(true);
    setError("");

    const result = await requestParentLink(code);

    setConnecting(false);

    if (!result.ok) {
      setError(result.message);
      if (result.reason === "not_authenticated")
        navigate("/signup", { replace: true });
      return;
    }

    // 코드 입력 시점에 연결이 확정된다(별도 승인 단계 없음).
    navigate("/signup/parent/link/done", {
      state: {
        child: { ...child, name: result.studentName || child?.name },
        status: result.status,
      },
    });
  }

  const buttonLabel =
    child || code.length === CODE_LENGTH
      ? "연결하기"
      : " 코드 6자리를 입력하세요";

  return (
    <AuthLayout>
      <div className="flex flex-col items-center gap-3 text-center">
        <AuthTitle
          line1={
            <span className="sm:whitespace-nowrap">
              자녀의 연결코드를 입력해 주세요
            </span>
          }
        />
        <p className="break-keep text-base font-medium text-ink sm:text-xl">
          {/* 시안 갱신: '마의페이지'는 오타로 확인되어 '마이페이지'로 수정(원문 오타 재현 대상 아님). */}
          자녀 마이페이지 &gt; 연결코드에서
          <br />
          6자리 코드를 확인할 수 있어요
        </p>
      </div>

      <div className="flex w-full flex-col gap-5">
        <TextField
          id="linkCode"
          name="linkCode"
          size="lg"
          value={code}
          onChange={handleChange}
          placeholder="6자리 연결코드를 입력해 주세요"
          active={!!child && !alreadyLinked}
          // helperText는 string(exactOptionalPropertyTypes, undefined 불가) —
          // TextField가 내부에서 truthy 체크만 하므로 ""는 undefined와 동일하게 렌더된다.
          helperText={error}
          status={error ? "error" : "default"}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
        />

        {child && (
          <ChildPreviewCard
            name={child.name}
            // ChildPreviewCardProps는 담당 파일이 아니라 수정할 수 없다 —
            // exactOptionalPropertyTypes 때문에 값이 undefined면 키 자체를 생략한다.
            {...(child.grade !== undefined && { grade: child.grade })}
            school={child.school}
            selected={selected}
            avatarSize={selected ? "lg" : "default"}
            onClick={() => {
              if (alreadyLinked) return;
              setSelected((prev) => !prev);
            }}
          />
        )}

        <PrimaryButton
          size="lg"
          radius="lg"
          onClick={handleConnect}
          disabled={!selected || connecting || looking || alreadyLinked}
          loading={connecting}
        >
          {buttonLabel}
        </PrimaryButton>
      </div>
    </AuthLayout>
  );
}
