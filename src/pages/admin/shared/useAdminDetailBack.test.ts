// @vitest-environment jsdom
// 어드민 상세 뒤로가기 회귀 테스트 (QA 317).
//
// 이 훅은 브라우저 히스토리를 직접 만진다. 잘못 만들면 증상이 고약하다:
//   - 정리(cleanup)에서 무조건 되감으면, 상세를 연 채 사이드바로 옮긴 사용자를
//     방금 떠난 화면으로 **끌어온다.**
//   - close 가 렌더마다 새로 만들어지는데 그걸 의존성에 넣으면 항목이 여러 개
//     쌓여 뒤로가기를 여러 번 눌러야 한다.
// 둘 다 브라우저에서만 드러나므로 여기서 잠근다.
//
// 배선 쪽도 함께 본다 — 이 묶음의 진짜 위험은 로직이 아니라 **한 화면이 빠지는
// 것**이다. 빠진 화면은 예전과 똑같이 동작하므로 아무도 눈치채지 못한다.

import fs from "node:fs";
import path from "node:path";
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { useAdminDetailBack } from "./useAdminDetailBack";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../../..");

let pushSpy: ReturnType<typeof vi.spyOn>;
let backSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  pushSpy = vi.spyOn(window.history, "pushState").mockImplementation(() => {});
  backSpy = vi.spyOn(window.history, "back").mockImplementation(() => {});
});

afterEach(() => {
  pushSpy.mockRestore();
  backSpy.mockRestore();
});

test("닫혀 있으면 히스토리를 건드리지 않는다", () => {
  renderHook(() => useAdminDetailBack(false, () => {}));
  expect(pushSpy).not.toHaveBeenCalled();
});

test("상세를 열면 항목을 하나만 쌓는다", () => {
  const { rerender } = renderHook(
    ({ open }) => useAdminDetailBack(open, () => {}),
    { initialProps: { open: true } },
  );

  // 리렌더가 반복돼도 추가로 쌓이면 안 된다 — 뒤로가기를 여러 번 눌러야 해진다.
  rerender({ open: true });
  rerender({ open: true });

  expect(pushSpy).toHaveBeenCalledTimes(1);
});

test("close 가 매 렌더 새로 만들어져도 항목이 더 쌓이지 않는다", () => {
  const { rerender } = renderHook(
    ({ open }) => useAdminDetailBack(open, () => {}),
    { initialProps: { open: true } },
  );

  // 호출부는 대개 인라인 화살표 함수를 넘긴다(매 렌더 새 참조).
  rerender({ open: true });

  expect(pushSpy).toHaveBeenCalledTimes(1);
});

test("뒤로가기는 상세를 닫는다", () => {
  const close = vi.fn();
  renderHook(() => useAdminDetailBack(true, close));

  window.dispatchEvent(new PopStateEvent("popstate"));

  expect(close).toHaveBeenCalledTimes(1);
});

test("화면 안에서 닫으면 쌓아둔 항목을 되감는다", () => {
  const { rerender } = renderHook(
    ({ open }) => useAdminDetailBack(open, () => {}),
    { initialProps: { open: true } },
  );

  // 「목록으로」 버튼 — 히스토리는 그대로인데 상세만 닫혔다.
  rerender({ open: false });

  expect(backSpy).toHaveBeenCalledTimes(1);
});

test("뒤로가기로 닫힌 경우에는 되감지 않는다", () => {
  const { rerender } = renderHook(
    ({ open }) => useAdminDetailBack(open, () => {}),
    { initialProps: { open: true } },
  );

  // popstate 가 이미 우리 항목을 소비했다. 여기서 또 back() 을 부르면 한 칸 더
  // 뒤로 가 엉뚱한 화면이 뜬다.
  window.dispatchEvent(new PopStateEvent("popstate"));
  rerender({ open: false });

  expect(backSpy).not.toHaveBeenCalled();
});

test("경로가 바뀐 뒤에는 되감지 않는다 (사이드바 이동 취소 방지)", () => {
  const { unmount } = renderHook(() => useAdminDetailBack(true, () => {}));

  // 사이드바로 다른 메뉴를 눌러 라우트가 바뀌고 컴포넌트가 언마운트되는 상황.
  window.history.pushState.call(window.history, {}, "", "/admin/coupons");
  Object.defineProperty(window, "location", {
    value: { ...window.location, pathname: "/admin/coupons" },
    writable: true,
  });

  unmount();

  // 여기서 back() 을 부르면 사용자가 방금 한 이동이 취소된다.
  expect(backSpy).not.toHaveBeenCalled();
});

// --- 배선 ---------------------------------------------------------------

// 목록을 갈아끼우는 전체 화면 상세를 가진 custom 컴포넌트들. 사용자 실측으로
// 증상이 확인된 넷(회원 목록·멘토 신청 내역·쿠폰 관리·관리자 관리)에, 구조가
// 같은 둘(관리자 권한 관리·목표관리 학생 현황)을 더했다.
const WIRED_SCREENS = [
  "MembersAdmin",
  "MentorApplicationsAdmin",
  "AdminMembersAdmin",
  "AdminRolesAdmin",
  "CouponAdmin",
  "GoalStudentsAdmin",
];

test.each(WIRED_SCREENS)("%s 가 훅을 쓴다", (name) => {
  const src = fs.readFileSync(
    path.join(REPO_ROOT, `src/components/admin/${name}.tsx`),
    "utf8",
  );

  expect(src, `${name} 이 훅을 import 하지 않는다`).toContain(
    "useAdminDetailBack",
  );
  // import 만 하고 호출하지 않으면 아무 일도 안 일어난다.
  expect(src, `${name} 이 훅을 호출하지 않는다`).toMatch(
    /useAdminDetailBack\(/,
  );
});
