// 회원탈퇴(api/delete-account.ts)의 순수 로직만 검증한다.
//
// 핸들러 전체(supabase RPC·auth admin 호출)는 외부 I/O에 묶여 있어 여기서
// 돌리기 어렵다 — complete-refund.test.ts와 같은 방침으로, 분리 가능한 순수
// 함수(익명화 대체 이메일 구성)만 로컬에서 검증한다. 익명화 분기의 실동작
// (auth email 교체·metadata 파기·ban·재가입 재개)은 로컬 스택 QA로 확인한다.

import { describe, expect, test, vi } from "vitest";
import {
  callHandler,
  createFakeAdmin,
  createKitState,
  type KitState,
} from "./_lib/console/consoleTestKit.js";
import handler, { buildAnonymizedEmail } from "./delete-account.js";

describe("buildAnonymizedEmail", () => {
  test("userId를 로컬 파트에 넣어 계정끼리 충돌하지 않는다", () => {
    expect(buildAnonymizedEmail("98af95da-47bf-4cee-8a2e-7d70d07fb1c9")).toBe(
      "deleted-98af95da-47bf-4cee-8a2e-7d70d07fb1c9@removed.invalid",
    );
  });

  test("도메인은 예약 TLD(.invalid)라 실제 수신자와 충돌하지 않는다", () => {
    expect(buildAnonymizedEmail("abc").endsWith("@removed.invalid")).toBe(true);
  });

  test("서로 다른 userId는 서로 다른 주소가 된다", () => {
    expect(buildAnonymizedEmail("a")).not.toBe(buildAnonymizedEmail("b"));
  });
});

// 사 #112: 탈퇴한 학생은 교사 화면 통계에서 빠져야 한다. 교사 화면은 student_enrollments 를 읽는다.
// 프로필을 지우는 탈퇴는 외래키 cascade 로 학적이 같이 사라지고, 익명화로 남는 탈퇴는 학적을 직접 지운다.
describe("POST /api/delete-account - 학적 정리(사 #112)", () => {
  const kit = vi.hoisted(() => ({ state: null as unknown as KitState }));

  vi.mock("./_lib/supabaseAdmin.js", () => ({
    isSupabaseConfigError: () => false,
    createSupabaseAdmin: () => createFakeAdmin(kit.state),
  }));

  async function withdraw(mode: "deleted" | "anonymized") {
    kit.state = createKitState();
    kit.state.user = { id: "student-1", email: "s@example.com" };
    kit.state.rpc.fn_delete_account = () => ({ data: mode, error: null });
    return callHandler(handler, {});
  }

  test("익명화로 남는 탈퇴는 그 학생의 학적과 변경 신청을 지운다", async () => {
    const res = await withdraw("anonymized");

    expect(res.status).toBe(200);
    expect(kit.state.deletes).toEqual([
      { table: "student_enrollments", filters: { student_id: "student-1" } },
      { table: "enrollment_changes", filters: { student_id: "student-1" } },
    ]);
  });

  test("프로필까지 지우는 탈퇴는 cascade 가 학적을 지우므로 따로 지우지 않는다", async () => {
    const res = await withdraw("deleted");

    expect(res.status).toBe(200);
    expect(kit.state.deletes).toEqual([]);
  });
});
