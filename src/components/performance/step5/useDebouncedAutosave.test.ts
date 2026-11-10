// @vitest-environment jsdom
// QA 행280 — STEP5 제출폼 자동 저장 훅 회귀 검증.
//
// 무엇을 막는가
// -------------
// ① **타이핑마다 요청이 나가는 것.** 디바운스가 없으면 한 글자마다 `PUT`이 나가 다중 탭
//    revision 규칙과 얽힌다(파일 상단 주석) — 여기서 "입력이 멈춘 뒤에만" 저장됨을 잰다.
// ② **저장 중 값이 또 바뀌면 요청이 겹쳐 쌓이는 것.** 트레일링 1회만 예약돼야 한다.
// ③ **실패를 성공으로 착각하는 것.** `onSave`가 reject하면 "마지막 저장본"을 갱신하지
//    않아야 수동 재시도(`flush`)가 다시 시도할 수 있다.
// ④ **제출 직전 경합.** `cancel()`은 대기 중인 디바운스 타이머만 지운다 — 값을 "저장된
//    것"으로 표시하지는 않는다(예전엔 표시했는데, 그래서 제출이 실패해 폼이 남아도
//    이후의 `flush()`가 "이미 저장됨"으로 오판해 재시도가 no-op이 되는 버그가 있었다).
// ⑤ **언마운트 시 유실.** 대기 중이던 변경분은 unmount cleanup에서 한 번 더 저장을
//    시도해야 한다(이 폼은 STEP 전환마다 통째로 unmount/remount된다). 그 순간 이미
//    저장 요청이 in-flight였다면 끊지 않고 기다렸다가, 그래도 값이 남아 있으면 그때
//    저장한다(끊으면 페이지의 "저장 중이면 무시" 가드가 최신 글자를 조용히 흘린다).

import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { useDebouncedAutosave } from "./useDebouncedAutosave";

const DELAY = 1500;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

test("입력이 멈춘 뒤 delayMs가 지나야 저장을 부른다", async () => {
  const onSave = vi.fn().mockResolvedValue(undefined);
  const { rerender } = renderHook(
    ({ value }) =>
      useDebouncedAutosave({ value, onSave, enabled: true, delayMs: DELAY }),
    { initialProps: { value: { a: "1" } } },
  );

  rerender({ value: { a: "12" } });
  await vi.advanceTimersByTimeAsync(DELAY - 1);
  expect(onSave).not.toHaveBeenCalled();

  await vi.advanceTimersByTimeAsync(1);
  expect(onSave).toHaveBeenCalledTimes(1);
  expect(onSave).toHaveBeenCalledWith({ a: "12" });
});

test("값이 계속 바뀌면 매번이 아니라 마지막에 조용해졌을 때만 저장한다", async () => {
  const onSave = vi.fn().mockResolvedValue(undefined);
  const { rerender } = renderHook(
    ({ value }) =>
      useDebouncedAutosave({ value, onSave, enabled: true, delayMs: DELAY }),
    { initialProps: { value: { a: "1" } } },
  );

  rerender({ value: { a: "12" } });
  await vi.advanceTimersByTimeAsync(DELAY - 200);
  rerender({ value: { a: "123" } }); // 타이머가 여기서 다시 걸린다(리셋)
  await vi.advanceTimersByTimeAsync(DELAY - 200);
  expect(onSave).not.toHaveBeenCalled();

  await vi.advanceTimersByTimeAsync(200);
  expect(onSave).toHaveBeenCalledTimes(1);
  expect(onSave).toHaveBeenCalledWith({ a: "123" });
});

test("마지막 저장본과 값이 같으면 호출하지 않는다", async () => {
  const onSave = vi.fn().mockResolvedValue(undefined);
  const { rerender } = renderHook(
    ({ value }) =>
      useDebouncedAutosave({ value, onSave, enabled: true, delayMs: DELAY }),
    { initialProps: { value: { a: "1" } } },
  );

  // 참조는 다르지만 내용이 마운트 시점 값과 같다 — 저장할 필요가 없다.
  rerender({ value: { a: "1" } });
  await vi.advanceTimersByTimeAsync(DELAY);
  expect(onSave).not.toHaveBeenCalled();
});

test("저장이 진행 중일 때 값이 또 바뀌면 완료 후 최신 값으로 트레일링 1회만 저장한다", async () => {
  let resolveFirst!: () => void;
  const onSave = vi.fn().mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        resolveFirst = resolve;
      }),
  );
  const { rerender } = renderHook(
    ({ value }) =>
      useDebouncedAutosave({ value, onSave, enabled: true, delayMs: DELAY }),
    { initialProps: { value: { a: "1" } } },
  );

  rerender({ value: { a: "12" } });
  await vi.advanceTimersByTimeAsync(DELAY); // 첫 저장 시작(아직 in-flight)
  expect(onSave).toHaveBeenCalledTimes(1);

  // in-flight인 동안 값이 두 번 더 바뀐다 — 매번 새 요청을 걸지 않는다.
  rerender({ value: { a: "123" } });
  await vi.advanceTimersByTimeAsync(DELAY);
  rerender({ value: { a: "1234" } });
  await vi.advanceTimersByTimeAsync(DELAY);
  expect(onSave).toHaveBeenCalledTimes(1); // 아직 첫 저장이 안 끝났다

  // 참고: `vi.waitFor`는 폴링에 실타이머를 쓰므로 fake timers와 같이 쓰면 멈춘다 —
  // 대신 `advanceTimersByTimeAsync(0)`로 대기 중인 마이크로태스크(then/finally 체인)만
  // 흘려보낸다.
  resolveFirst();
  await vi.advanceTimersByTimeAsync(0);
  expect(onSave).toHaveBeenCalledTimes(2);
  expect(onSave).toHaveBeenLastCalledWith({ a: "1234" });
});

test("실패하면 마지막 저장본을 갱신하지 않고, flush()로 다시 시도할 수 있다", async () => {
  const onSave = vi
    .fn()
    .mockRejectedValueOnce(new Error("network"))
    .mockResolvedValueOnce(undefined);
  const { result, rerender } = renderHook(
    ({ value }) =>
      useDebouncedAutosave({ value, onSave, enabled: true, delayMs: DELAY }),
    { initialProps: { value: { a: "1" } } },
  );

  rerender({ value: { a: "12" } });
  await vi.advanceTimersByTimeAsync(DELAY);
  expect(onSave).toHaveBeenCalledTimes(1);

  // 값이 그대로인데도(추가 입력 없음) 수동 재시도가 다시 저장을 시도해야 한다 —
  // 실패가 "마지막 저장본"을 갱신하지 않았기 때문에 가능하다.
  result.current.flush();
  await vi.advanceTimersByTimeAsync(0);
  expect(onSave).toHaveBeenCalledTimes(2);
});

test("cancel()은 대기 중인 타이머만 지우고, 그 값으로는 다시 저장을 걸지 않는다", async () => {
  const onSave = vi.fn().mockResolvedValue(undefined);
  const { result, rerender } = renderHook(
    ({ value }) =>
      useDebouncedAutosave({ value, onSave, enabled: true, delayMs: DELAY }),
    { initialProps: { value: { a: "1" } } },
  );

  rerender({ value: { a: "12" } }); // 타이머 대기 중(아직 안 쏨) — 제출 직전 상황
  result.current.cancel();

  await vi.advanceTimersByTimeAsync(DELAY * 2);
  expect(onSave).not.toHaveBeenCalled();
});

test("언마운트 시 대기 중이던 변경분을 흘리지 않고 flush한다", async () => {
  const onSave = vi.fn().mockResolvedValue(undefined);
  const { rerender, unmount } = renderHook(
    ({ value }) =>
      useDebouncedAutosave({ value, onSave, enabled: true, delayMs: DELAY }),
    { initialProps: { value: { a: "1" } } },
  );

  rerender({ value: { a: "12" } }); // 디바운스 타이머가 아직 안 끝난 채로 스텝을 벗어난다
  unmount();

  expect(onSave).toHaveBeenCalledTimes(1);
  expect(onSave).toHaveBeenCalledWith({ a: "12" });
});

test("cancel() 이후 flush()는 값이 안 바뀌었어도 실제로 저장을 부른다", async () => {
  // 회귀: `cancel()`이 값을 "저장된 것"으로 표시하던 예전 구현에서는, 제출 직전
  // `cancel()`이 호출된 뒤(§4) 같은 값으로 `flush()`를 불러도 `attemptSave`의 동일값
  // 검사에 걸려 `onSave`가 아예 호출되지 않았다(사용자가 누른 "다시 시도"가 no-op).
  const onSave = vi.fn().mockResolvedValue(undefined);
  const { result, rerender } = renderHook(
    ({ value }) =>
      useDebouncedAutosave({ value, onSave, enabled: true, delayMs: DELAY }),
    { initialProps: { value: { a: "1" } } },
  );

  rerender({ value: { a: "12" } }); // 타이머 대기 중 — 제출 직전 상황
  result.current.cancel();
  expect(onSave).not.toHaveBeenCalled();

  result.current.flush({ force: true });
  await vi.advanceTimersByTimeAsync(0);
  expect(onSave).toHaveBeenCalledTimes(1);
  expect(onSave).toHaveBeenCalledWith({ a: "12" });
});

test("언마운트 시 저장이 in-flight면 끊지 않고 기다렸다가 최신값을 저장한다", async () => {
  // 회귀: 디바운스 타이머가 막 발화해 저장이 진행 중인 채로 언마운트되면, 예전
  // 구현은 in-flight 여부를 보지 않고 곧장 `onSave(최신값)`을 또 불렀다 — 페이지의
  // `handleSaveDraft`는 "이미 저장 중이면 무시"라 `undefined`를 반환하고, 훅은 그걸
  // 성공으로 착각해 방금 입력한 내용을 조용히 흘렸다.
  let resolveFirst!: () => void;
  const onSave = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveFirst = resolve;
        }),
    )
    .mockResolvedValueOnce(undefined);
  const { rerender, unmount } = renderHook(
    ({ value }) =>
      useDebouncedAutosave({ value, onSave, enabled: true, delayMs: DELAY }),
    { initialProps: { value: { a: "1" } } },
  );

  rerender({ value: { a: "12" } });
  await vi.advanceTimersByTimeAsync(DELAY); // 첫 저장 시작(아직 in-flight)
  expect(onSave).toHaveBeenCalledTimes(1);

  rerender({ value: { a: "123" } }); // in-flight인 동안 값이 또 바뀐다
  unmount();

  // in-flight 저장이 아직 안 끝났으니 언마운트 직후엔 두 번째 호출이 없어야 한다.
  expect(onSave).toHaveBeenCalledTimes(1);

  resolveFirst();
  await vi.advanceTimersByTimeAsync(0);

  expect(onSave).toHaveBeenCalledTimes(2);
  expect(onSave).toHaveBeenLastCalledWith({ a: "123" });
});

test("트레일링 저장이 도는 동안 언마운트해도 unmount flush가 동시에 발화하지 않는다", async () => {
  // 회귀(그리핑 원인 ①의 재발 방지): in-flight 저장이 끝나면서 `pendingRef`로 예약해
  // 둔 트레일링 저장이 새로 걸리는데, 언마운트 cleanup이 "처음 붙잡은 promise 하나"만
  // 기다리면 트레일링 저장이 끝나기 전에 unmount flush가 같은 값을 또 저장하려 든다
  // (페이지의 `handleSaveDraft` 가드가 "이미 저장 중"이라 무시 → undefined 반환 →
  // 훅이 성공으로 착각 → 최신 글자 유실). 여기서는 트레일링 저장이 끝날 때까지 실제로
  // 대기했다가, 값이 이미 일치하면 추가 호출 없이 끝나는 것으로 "동시 발화 없음"을 잰다.
  let resolveFirst!: () => void;
  let resolveSecond!: () => void;
  const onSave = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveFirst = resolve;
        }),
    )
    .mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveSecond = resolve;
        }),
    );
  const { rerender, unmount } = renderHook(
    ({ value }) =>
      useDebouncedAutosave({ value, onSave, enabled: true, delayMs: DELAY }),
    { initialProps: { value: { a: "1" } } },
  );

  rerender({ value: { a: "12" } });
  await vi.advanceTimersByTimeAsync(DELAY); // 첫 저장 시작(in-flight)
  expect(onSave).toHaveBeenCalledTimes(1);

  rerender({ value: { a: "123" } }); // in-flight 중 값이 또 바뀐다
  await vi.advanceTimersByTimeAsync(DELAY); // 타이머가 재발화 → attemptSave가 pendingRef만 세운다(아직 호출 없음)
  expect(onSave).toHaveBeenCalledTimes(1);

  unmount(); // 첫 저장이 아직 in-flight인 채로 언마운트

  resolveFirst();
  await vi.advanceTimersByTimeAsync(0); // 첫 저장 완료 → finally가 트레일링 저장을 새로 건다
  expect(onSave).toHaveBeenCalledTimes(2); // 트레일링 저장 1회만 — unmount flush가 동시에 끼어들지 않았다
  expect(onSave).toHaveBeenLastCalledWith({ a: "123" });

  resolveSecond();
  await vi.advanceTimersByTimeAsync(0);
  // 트레일링 저장이 최신값을 이미 저장했으므로(lastSavedRef 갱신), unmount flush가
  // 뒤늦게 깨어나도 같은 값을 또 저장하지 않는다 — 여전히 2회.
  expect(onSave).toHaveBeenCalledTimes(2);
});

test("in-flight 중 flush({force:true})가 걸리면 트레일링 저장도 force 계약을 유지한다", async () => {
  // 회귀(그리핑 원인 ②): 트레일링 저장이 일반 `attemptSave()`로 깎이면, 트레일링 실행
  // 시점의 값이 우연히 마지막 저장본과 같아 보일 때(예: 실패 후 재시도가 직전 성공분과
  // 같은 값) 동일값 스킵에 걸려 사용자가 누른 "다시 시도"가 조용히 no-op된다.
  let resolveFirst!: () => void;
  const onSave = vi.fn().mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        resolveFirst = resolve;
      }),
  );
  const { result, rerender } = renderHook(
    ({ value }) =>
      useDebouncedAutosave({ value, onSave, enabled: true, delayMs: DELAY }),
    { initialProps: { value: { a: "12" } } },
  );

  rerender({ value: { a: "12" } }); // 참조만 바뀐 동일값이라 effect가 새 타이머를 걸지 않는다
  result.current.flush({ force: true }); // 수동 재시도 — 첫 저장 시작(in-flight)
  expect(onSave).toHaveBeenCalledTimes(1);

  // in-flight인 동안 같은 값으로 또 한 번 "다시 시도"를 누른다.
  result.current.flush({ force: true });

  resolveFirst(); // 첫 저장 완료 → lastSavedRef = "12"
  await vi.advanceTimersByTimeAsync(0);

  // force 계약이 트레일링 저장까지 이어졌다면, 값이 lastSavedRef와 같아도(둘 다 "12")
  // 동일값 스킵 없이 실제로 한 번 더 호출된다.
  expect(onSave).toHaveBeenCalledTimes(2);
});

test("suspendUnmountFlush() 이후 언마운트하면 draft 저장을 건너뛴다", async () => {
  // §제출 성공 경로: 제출이 값을 이미 넘겨받았으므로 언마운트 시 같은 값을 또
  // draft로 저장해 `409 SESSION_FINALIZED`를 유발하지 않아야 한다.
  const onSave = vi.fn().mockResolvedValue(undefined);
  const { result, rerender, unmount } = renderHook(
    ({ value }) =>
      useDebouncedAutosave({ value, onSave, enabled: true, delayMs: DELAY }),
    { initialProps: { value: { a: "1" } } },
  );

  rerender({ value: { a: "12" } }); // 디바운스 타이머 대기 중(아직 저장 안 됨)
  result.current.suspendUnmountFlush();
  unmount();

  expect(onSave).not.toHaveBeenCalled();
});

test("suspendUnmountFlush() 이후에도 flush({force:true})는 정상적으로 저장한다(재시도 경로 유지)", async () => {
  const onSave = vi.fn().mockResolvedValue(undefined);
  const { result, rerender } = renderHook(
    ({ value }) =>
      useDebouncedAutosave({ value, onSave, enabled: true, delayMs: DELAY }),
    { initialProps: { value: { a: "1" } } },
  );

  rerender({ value: { a: "12" } });
  result.current.suspendUnmountFlush();
  result.current.flush({ force: true });
  await vi.advanceTimersByTimeAsync(0);

  expect(onSave).toHaveBeenCalledTimes(1);
  expect(onSave).toHaveBeenCalledWith({ a: "12" });
});

test("suspendUnmountFlush() 이후 값이 바뀌면(편집) 다시 언마운트 flush 대상이 된다", async () => {
  // 제출이 실패해 폼이 그대로 남고 사용자가 다시 고쳐 쓰는 경로 — 편집 자체가
  // 스위치를 다시 내린다(값-변경 effect).
  const onSave = vi.fn().mockResolvedValue(undefined);
  const { result, rerender, unmount } = renderHook(
    ({ value }) =>
      useDebouncedAutosave({ value, onSave, enabled: true, delayMs: DELAY }),
    { initialProps: { value: { a: "1" } } },
  );

  rerender({ value: { a: "12" } });
  result.current.suspendUnmountFlush();
  rerender({ value: { a: "123" } }); // 제출 실패 후 편집
  unmount();

  expect(onSave).toHaveBeenCalledTimes(1);
  expect(onSave).toHaveBeenCalledWith({ a: "123" });
});

test("enabled=false면 값이 바뀌어도 새 타이머를 걸지 않는다", async () => {
  const onSave = vi.fn().mockResolvedValue(undefined);
  const { rerender } = renderHook(
    ({ value, enabled }) =>
      useDebouncedAutosave({ value, onSave, enabled, delayMs: DELAY }),
    { initialProps: { value: { a: "1" }, enabled: false } },
  );

  rerender({ value: { a: "" }, enabled: false }); // 예: 사용자가 내용을 전부 지웠다
  await vi.advanceTimersByTimeAsync(DELAY * 2);
  expect(onSave).not.toHaveBeenCalled();
});
