// GET /api/console/teachers/connect-preview 계약 검증(W14 학생 가입 연결 미리보기, 교 #119).
// 학생 한 명의 이름, 학년, 그룹, 반, 번호로 가입 결과를 시험한다. 아무것도 쓰지 않는다.

import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  callHandler,
  createFakeAdmin,
  createKitState,
  type KitState,
  matchRows,
  schoolAdminActor,
} from "../../../_lib/console/consoleTestKit.js";

const kit = vi.hoisted(() => ({ state: null as unknown as KitState }));

vi.mock("../../../_lib/supabaseAdmin.js", () => ({
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => createFakeAdmin(kit.state),
}));

import handler from "./connect-preview.js";

const get = (query: Record<string, string>) =>
  callHandler(handler, undefined, "GET", query);

const T = "tenant-1";
const BASE = { name: "김서연", grade: "고2", className: "3반", number: "12" };

beforeEach(() => {
  kit.state = createKitState();
  kit.state.actor = schoolAdminActor();
  kit.state.rows.tenants = () => ({ school_year: 2026, org_type: "학교" });
  kit.state.rows.classes = (f) =>
    matchRows(
      [
        {
          id: "c-3",
          tenant_id: T,
          school_year: 2026,
          grade: "고2",
          group_id: null,
          name: "3",
        },
      ],
      f,
    );
  kit.state.rows.teacher_class_assignments = (f) =>
    matchRows([{ tenant_id: T, teacher_id: "t-park", class_id: "c-3" }], f);
  kit.state.rows.teachers = (f) =>
    matchRows(
      [{ id: "t-park", tenant_id: T, name: "박지훈", deleted_at: null }],
      f,
    );
  kit.state.rows.student_enrollments = (f) =>
    matchRows(
      [
        {
          tenant_id: T,
          school_year: 2026,
          status: "active",
          class_id: "c-3",
          student_id: "s-kim",
          number: 5,
        },
        {
          tenant_id: T,
          school_year: 2026,
          status: "active",
          class_id: "c-3",
          student_id: "s-han",
          number: 12,
        },
      ],
      f,
    );
  kit.state.rows.profiles = (f) =>
    matchRows(
      [
        { id: "s-kim", name: "김서연" },
        { id: "s-han", name: "한지우" },
      ],
      f,
    );
});

describe("GET /api/console/teachers/connect-preview", () => {
  test("같은 반에 같은 이름의 학생이 이미 있으면 이미 가입으로 알린다", async () => {
    const r = await get(BASE);

    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      result: "already_signed_up",
      homeroomName: "박지훈",
    });
  });
  test("번호를 다른 학생이 쓰면 번호 사용 중과 그 학생의 가린 이름을 알린다", async () => {
    const r = await get({ ...BASE, name: "정도윤" });

    expect(r.body).toEqual({
      result: "number_taken",
      homeroomName: "박지훈",
      holderName: "한*우",
    });
  });

  test("번호를 쓰는 학생과 이름이 같은 학생이 그 반에 더 있으면 가린 이름 뒤에 별표를 붙인다", async () => {
    kit.state.rows.student_enrollments = (f) =>
      matchRows(
        [
          ...["s-kim", "s-han", "s-han2"].map((id, i) => ({
            tenant_id: T,
            school_year: 2026,
            status: "active",
            class_id: "c-3",
            student_id: id,
            number: i === 0 ? 5 : i === 1 ? 12 : null,
          })),
        ],
        f,
      );
    kit.state.rows.profiles = (f) =>
      matchRows(
        [
          { id: "s-kim", name: "김서연" },
          { id: "s-han", name: "한지우" },
          { id: "s-han2", name: "한지우" },
        ],
        f,
      );
    const r = await get({ ...BASE, name: "정도윤" });

    expect(r.body).toMatchObject({
      result: "number_taken",
      holderName: "한*우*",
    });
  });

  test("번호를 쓰는 학생의 실제 이름이 비어 있으면 별표를 붙이지 않는다", async () => {
    kit.state.rows.student_enrollments = (f) =>
      matchRows(
        ["s-kim", "s-han", "s-han2"].map((id, i) => ({
          tenant_id: T,
          school_year: 2026,
          status: "active",
          class_id: "c-3",
          student_id: id,
          number: i === 0 ? 5 : i === 1 ? 12 : null,
        })),
        f,
      );
    kit.state.rows.profiles = (f) =>
      matchRows(
        [
          { id: "s-kim", name: "김서연" },
          { id: "s-han", name: null },
          { id: "s-han2", name: null },
        ],
        f,
      );
    const r = await get({ ...BASE, name: "정도윤" });

    expect(r.body).toMatchObject({ result: "number_taken", holderName: "" });
  });

  test("이름도 번호도 겹치지 않으면 정상 연결이다", async () => {
    const r = await get({ ...BASE, name: "정도윤", number: "20" });

    expect(r.body).toEqual({ result: "ok", homeroomName: "박지훈" });
  });

  test("없는 학급이면 no_class 이고 그룹이 다른 학급도 같은 학급으로 보지 않는다", async () => {
    expect((await get({ ...BASE, className: "9반" })).body).toEqual({
      result: "no_class",
    });
    expect((await get({ ...BASE, groupId: "g-x" })).body).toEqual({
      result: "no_class",
    });
  });

  describe("학원의 다학년 학급", () => {
    beforeEach(() => {
      kit.state.rows.tenants = () => ({
        school_year: 2026,
        org_type: "사기업",
      });
      kit.state.rows.classes = (f) =>
        matchRows(
          [
            {
              id: "c-g",
              tenant_id: T,
              school_year: 2026,
              grade: "고2",
              group_id: null,
              name: "A",
            },
            {
              id: "c-m",
              tenant_id: T,
              school_year: 2026,
              grade: null,
              group_id: null,
              name: "A",
            },
          ],
          f,
        );
      kit.state.rows.student_enrollments = (f) =>
        matchRows(
          [
            {
              tenant_id: T,
              school_year: 2026,
              status: "active",
              class_id: "c-m",
              student_id: "s-mix",
              number: 7,
            },
          ],
          f,
        );
      kit.state.rows.profiles = (f) =>
        matchRows([{ id: "s-mix", name: "오지안" }], f);
    });

    test("같은 그룹과 이름의 다학년 학급이 학년 학급보다 먼저다", async () => {
      const r = await get({ ...BASE, name: "오지안", className: "A" });

      expect(r.body).toMatchObject({ result: "already_signed_up" });
    });

    test("그 학년의 학급이 없어도 다학년 학급으로 연결된다", async () => {
      const r = await get({
        ...BASE,
        grade: "고1",
        name: "정도윤",
        className: "A",
        number: "7",
      });

      expect(r.body).toMatchObject({ result: "number_taken" });
    });

    test("다른 이름은 여전히 없는 학급이다", async () => {
      expect((await get({ ...BASE, className: "B" })).body).toEqual({
        result: "no_class",
      });
    });
  });

  test("이름, 학년, 반, 번호가 비었거나 번호가 숫자가 아니면 400 이다", async () => {
    expect((await get({ ...BASE, name: " " })).status).toBe(400);
    expect((await get({ ...BASE, number: "0" })).status).toBe(400);
    expect((await get({ ...BASE, grade: "" })).status).toBe(400);
  });

  test("담임은 403 이다", async () => {
    kit.state.actor = { ...kit.state.actor, kind: "homeroom" };

    expect((await get(BASE)).status).toBe(403);
  });
});
