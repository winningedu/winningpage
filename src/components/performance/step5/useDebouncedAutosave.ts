import { useEffect, useRef } from "react";

// QA 행280 — STEP5 제출폼의 수동 "중간 저장" 버튼을 디바운스 자동 저장으로 바꾼다.
// 예전 결정(`PerformanceChatPage.tsx`의 `handleSaveDraft` 주석)은 "§4 상태도가 명시적
// 저장 전이만 그린다"였지만, 디자이너 9/4 댓글과 사용자 확정으로 뒤집혔다 — 수동 버튼
// 제거, 자동 저장만 남긴다.

/** 입력이 멈춘 뒤 이 시간(ms)이 지나면 자동 저장한다. */
const AUTOSAVE_DEBOUNCE_MS = 1500;

type UseDebouncedAutosaveOptions<T> = {
  /** 지금 화면이 들고 있는 값. 참조가 바뀔 때마다 디바운스 타이머를 다시 건다. */
  value: T;
  /** 실제 저장 호출. 실패하면 반드시 reject해야 한다 — 그래야 "마지막 저장본" 갱신을
   * 건너뛰고, 실패 상태의 수동 재시도(`flush`)가 다시 저장을 시도할 수 있다. */
  onSave: (value: T) => Promise<unknown>;
  /** 지금 저장을 걸어도 되는 상태인지(예: 빈 폼이거나 제출 중이면 false). false면 값이
   * 바뀌어도 새 타이머를 걸지 않는다 — 이미 걸려 있던 타이머는 그대로 취소된다. */
  enabled: boolean;
  delayMs?: number;
  /** 두 값이 "저장할 필요가 없을 만큼 같다"의 기준. 기본은 JSON 문자열 비교 — 이 훅이
   * 다루는 값은 전부 필드 키 → 문자열 레코드라 충분하다. */
  isEqual?: (a: T, b: T) => boolean;
};

function defaultIsEqual<T>(a: T, b: T) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * 값이 바뀐 뒤 조용해지면 `onSave`를 한 번 부르는 디바운스 자동 저장 훅.
 *
 * - 저장이 이미 진행 중일 때 값이 또 바뀌면 요청을 쌓지 않고 "완료 후 최신 값으로 딱
 *   한 번 더"만 예약한다(트레일링) — 타이핑마다 요청이 겹쳐 쌓이는 걸 막는다.
 * - 마지막으로 저장(성공)한 값과 같으면 아무 것도 하지 않는다.
 * - 훅을 쓰는 컴포넌트가 언마운트되면(이 폼은 STEP 전환마다 통째로 unmount/remount된다)
 *   대기 중이던 변경분을 흘리지 않고 마지막으로 한 번 저장을 시도한다.
 */
export function useDebouncedAutosave<T>({
  value,
  onSave,
  enabled,
  delayMs = AUTOSAVE_DEBOUNCE_MS,
  isEqual = defaultIsEqual,
}: UseDebouncedAutosaveOptions<T>) {
  const valueRef = useRef(value);
  valueRef.current = value;
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  // 훅이 처음 값을 받은 시점(=마운트, 재개 복원분을 포함한 초기값)을 "이미 저장된 값"
  // 으로 본다 — 그래야 재개(이어서 하기)로 막 복원된 초안을 아무 입력 없이 곧장
  // 서버로 다시 쏘지 않는다.
  const lastSavedRef = useRef(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 저장 요청 자체가 in-flight인지(중복 호출 방지)와, 그 사이 값이 또 바뀌었는지
  // (완료 후 트레일링 1회 필요 여부)를 따로 추적한다.
  const savingRef = useRef(false);
  const pendingRef = useRef(false);
  // 트레일링 저장이 `force`로 예약됐는지. `pendingRef`만으로는 "완료 후 한 번 더"라는
  // 사실만 알 뿐 그 한 번이 `force` 계약을 지켜야 하는지는 잃어버린다 — in-flight 중에
  // 사용자가 "다시 시도"(`flush({force:true})`)를 눌렀는데 트레일링 호출이 일반
  // `attemptSave()`로 깎이면, 트레일링 실행 시점에 값이 우연히 `lastSavedRef`와 같아
  // 보이는 경우(예: 실패 후 재시도인데 가장 최근 성공분과 값이 같을 때) 동일값 스킵에
  // 걸려 재시도가 조용히 no-op된다.
  const pendingForceRef = useRef(false);
  // 지금 진행 중인 저장 요청의 promise. `savingRef`는 "지금 저장 중인가"만 말하고,
  // 이건 그 요청이 **끝나는 시점을 기다릴 수 있게** 한다 — 언마운트 cleanup이
  // in-flight 저장을 끊지 않고 이어서 최신값을 저장하는 데 쓴다(아래 언마운트 effect).
  const inFlightRef = useRef<Promise<void> | null>(null);
  // 제출(submit)이 이 값을 이미 "넘겨받았다"고 표시하는 스위치. `SubmissionForm.handleSubmit`
  // 이 제출 직전 `suspendUnmountFlush()`로 세운다 — 제출 성공 후 이 폼이 언마운트될 때
  // (§ 아래 언마운트 effect) 방금 넘긴 값을 draft로 다시 저장해 `409 SESSION_FINALIZED`를
  // 유발하지 않기 위해서다. 사용자가 그 뒤 실제로 값을 더 고치면(재시도 편집) 아래 값-변경
  // effect가 이 스위치를 다시 내려 정상적인 디바운스 저장으로 돌아간다 — 그래서 "제출
  // 실패 → 편집 → 저장"까지는 막지 않는다. `flush()`(재시도 버튼)도 명시적 저장 의도이므로
  // 같은 이유로 내린다.
  const suspendUnmountFlushRef = useRef(false);

  function clearTimer() {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  /**
   * @param options.force `true`면 "마지막 저장본과 같다"는 이유로 건너뛰지 않는다.
   * 사용자가 명시적으로 누른 재시도(`flush({ force: true })`)에서만 쓴다 — 재시도는
   * "값이 안 바뀌었어도 다시 시도"가 계약이라, 내부 북키핑(`lastSavedRef`)이 어떤
   * 경로로든 먼저 갱신돼 있어도 무시하고 실제로 `onSave`를 불러야 한다.
   */
  async function attemptSave(options?: { force?: boolean }) {
    const force = options?.force ?? false;
    if (savingRef.current) {
      pendingRef.current = true;
      // force 계약은 "이번 호출 하나"가 아니라 "다음에 실제로 실행될 시도"에 실려야
      // 한다 — 이미 pending이 force였다면 이번 호출이 force가 아니어도 낮추지 않는다.
      if (force) pendingForceRef.current = true;
      return;
    }
    const target = valueRef.current;
    if (!force && isEqual(target, lastSavedRef.current)) return;

    savingRef.current = true;
    const savePromise = onSaveRef
      .current(target)
      .then(() => {
        lastSavedRef.current = target;
      })
      .catch(() => {
        // 실패 — `lastSavedRef`를 건드리지 않는다. 자동 재시도는 걸지 않는다(사용자가
        // 값을 더 안 바꾸면 아래 effect가 다시 돌지 않는다) — 실패 상태 UI의 수동
        // "다시 시도"가 `flush()`로 이 함수를 다시 부르는 것이 유일한 재시도 경로다.
        // 실패 자체의 사용자 안내(토스트·에러 문구)는 `onSave` 호출부(페이지)의 몫이다.
      })
      .finally(() => {
        savingRef.current = false;
        inFlightRef.current = null;
        if (pendingRef.current) {
          pendingRef.current = false;
          const trailingForce = pendingForceRef.current;
          pendingForceRef.current = false;
          attemptSave(trailingForce ? { force: true } : undefined);
        }
      });
    inFlightRef.current = savePromise;
    return savePromise;
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: onSave/enabled는 ref로 최신값을 읽는다 — 의존성에 넣으면 호출부가 매 렌더 새 함수를 넘길 때마다 타이머가 리셋된다.
  useEffect(() => {
    clearTimer();
    if (!enabled) return undefined;
    if (isEqual(value, lastSavedRef.current)) return undefined;

    // 실제로 값이 저장본과 달라져 새 타이머를 거는 시점 = "진짜 편집"이다. 제출 직후
    // `suspendUnmountFlush()`로 세워둔 스위치를 여기서 내린다 — 제출이 실패해 폼이
    // 남았고 사용자가 다시 고쳐 쓰기 시작하면, 그 편집분은 다시 정상적인 언마운트
    // flush 대상이어야 한다(제출 성공 케이스와 구분된다 — 성공은 값이 그대로인 채
    // 언마운트되므로 이 effect가 다시 돌지 않는다).
    suspendUnmountFlushRef.current = false;

    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      attemptSave();
    }, delayMs);

    return clearTimer;
  }, [value, enabled, delayMs]);

  // 언마운트(=이 폼의 STEP 전환) 시 대기 중이던 변경분을 흘리지 않는다. deps를 비워
  // cleanup이 "매 렌더"가 아니라 "언마운트 순간"에만 돌게 한다 — 그 순간의 최신값은
  // ref로 읽는다(그래서 clearTimer/isEqual/enabledRef 등을 deps에 넣지 않는다).
  // biome-ignore lint/correctness/useExhaustiveDependencies: 의도적으로 빈 배열이다 — cleanup은 마운트당 한 번(언마운트 시)만 돌아야 하고, 그 안에서 읽는 값은 전부 ref다(위 주석).
  useEffect(() => {
    return () => {
      clearTimer();

      // 제출이 이 값을 이미 넘겨받았다고 표시해 둔 경우(`suspendUnmountFlush`, 아래
      // 반환 API) — 폼이 곧 언마운트되는 이유가 "제출 성공"이라 서버가 이미 같은 값을
      // 최종본으로 갖고 있다. 여기서 또 draft로 저장하면 `409 SESSION_FINALIZED`만
      // 돌아온다. 실패로 폼이 남았다가 편집되면(값-변경 effect) 이 스위치가 다시
      // 내려가므로 그 경로는 막지 않는다.
      if (suspendUnmountFlushRef.current) return;

      const flushLatest = () => {
        if (
          enabledRef.current &&
          !isEqual(valueRef.current, lastSavedRef.current)
        ) {
          onSaveRef.current(valueRef.current).catch(() => {
            // 언마운트 이후라 화면에 실패를 알릴 수단이 없다 — 콘솔에만 남긴다.
            console.error("[performance] 언마운트 시 자동 저장 flush 실패");
          });
        }
      };

      // 언마운트 순간 이미 저장 요청이 in-flight일 수 있다(디바운스 타이머가 막
      // 발화한 직후). 그때 곧장 `flushLatest()`를 부르면 페이지의 `onSaveDraft`가
      // "이미 저장 중"이라 아무 것도 안 하고 성공한 것처럼 resolve해 버려(가드가
      // `savingDraft`일 때 `undefined`를 반환) 방금 친 최신 글자가 조용히 유실된다.
      // 그래서 in-flight 요청이 끝날 때까지 기다렸다가, 그 사이에도 값이 더 바뀌어
      // 여전히 `lastSavedRef`와 다르면 그때 최신값으로 한 번 더 저장한다.
      //
      // in-flight 요청의 `.finally()`는 `pendingRef`가 서 있으면 **트레일링 저장을 새로
      // 건다**(`attemptSave` 안, `inFlightRef.current`를 새 promise로 갈아 끼운다). 이
      // cleanup이 처음 붙잡은 promise 하나에만 `.then()`을 걸면, 그 promise가 끝나는
      // 순간 트레일링 저장은 아직 진행 중인데 `flushLatest()`가 동시에 발화해 같은
      // 값을 두 번 저장 시도하게 된다 — 그래서 매번 `inFlightRef.current`를 다시 읽어
      // 재귀적으로 "더 이상 진행 중인 요청이 없을 때까지" 기다린다.
      const waitForInFlightToSettle = (): Promise<void> => {
        const current = inFlightRef.current;
        if (!current) return Promise.resolve();
        return current.then(waitForInFlightToSettle);
      };

      if (inFlightRef.current) {
        waitForInFlightToSettle().then(flushLatest);
      } else {
        flushLatest();
      }
    };
  }, []);

  return {
    /**
     * 제출 직전에 부른다. 대기 중이던 디바운스 타이머만 취소한다 — 값을 "저장된
     * 것"으로 표시하지는 않는다(예전엔 표시했는데, 그 표시 때문에 제출이 실패해
     * 폼이 그대로 남아도 이후의 `flush()`가 "이미 저장됨"으로 오판해 아무 것도 하지
     * 않는 버그가 있었다 — 아래 `flush` 참고). 타이머만 지워도 목적(제출 처리 도중
     * 중복 draft 저장 요청과 경합하지 않는 것)은 그대로 달성된다 — 경합의 원인은
     * "대기 중이던 타이머가 나중에 발화하는 것"뿐이었고, 그 타이머 자체를 지우면
     * 그걸로 충분하다.
     */
    cancel() {
      clearTimer();
    },
    /**
     * 대기 중인 타이머와 무관하게 지금 즉시 저장을 시도한다. 실패 상태 UI의 "다시
     * 시도" 클릭에 쓴다. `force: true`를 넘기면 `lastSavedRef`와 값이 같아도 건너뛰지
     * 않는다 — 사용자가 누른 "다시 시도"는 내부 북키핑과 무관하게 항상 실제로
     * `onSave`를 불러야 한다는 것이 계약이다(§ 위 `attemptSave` 주석).
     */
    flush(options?: { force?: boolean }) {
      // 명시적 저장 의도(수동 "다시 시도")다 — `suspendUnmountFlush()`가 걸려 있었어도
      // 이 호출은 항상 실제로 시도해야 한다(아래 `suspendUnmountFlush` 주석의 재시도
      // 경로).
      suspendUnmountFlushRef.current = false;
      clearTimer();
      attemptSave(options);
    },
    /**
     * 지금 값을 "이미 다른 경로(제출)로 넘겼다"고 표시한다. 언마운트 cleanup이 이
     * 스위치가 서 있는 동안은 draft flush를 건너뛴다 — 제출 성공 직후 언마운트되면서
     * 방금 제출한 값을 또 draft로 저장해 `409 SESSION_FINALIZED`를 유발하는 것을
     * 막는다(`SubmissionForm.handleSubmit`이 제출 직전에 부른다). 제출이 실패해 폼이
     * 그대로 남으면, 사용자가 값을 고치는 순간(위 값-변경 effect) 또는 "다시 시도"를
     * 누르는 순간(`flush`) 자동으로 다시 내려가므로 재시도 경로를 막지 않는다.
     */
    suspendUnmountFlush() {
      suspendUnmountFlushRef.current = true;
    },
  };
}
