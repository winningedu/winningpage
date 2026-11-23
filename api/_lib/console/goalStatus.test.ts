// 목표관리 현황. 하루 기준은 보는 사람이 아니라 학생의 시간대(profiles.time_zone)다.

import { beforeEach, describe, expect, test } from "vitest";
import {
  createFakeAdmin,
  createKitState,
  type KitState,
  matchRows,
} from "./consoleTestKit.js";
import { loadGoalStatus } from "./goalStatus.js";

// 서울은 11-11 05:00, 로스앤젤레스는 11-10 12:00 이다.
const NOW = new Date("2026-11-10T20:00:00Z");

let kit: KitState;

const record = (profile_id: string, record_date: string) => ({
  profile_id,
  record_date,
  study_hours: 1,
  target_ideal_hours: 2,
  target_min_hours: 1,
});

beforeEach(() => {
  kit = createKitState();
  kit.rows.profiles = (f) =>
    matchRows(
      [
        { id: "seoul", time_zone: "Asia/Seoul" },
        { id: "la", time_zone: "America/Los_Angeles" },
      ],
      f,
    );
  kit.rows.goal_students = (f) =>
    matchRows(
      ["seoul", "la"].map((id) => ({
        profile_id: id,
        study_schedule: null,
        ideal_university: "",
        ideal_department: "",
        min_university: "",
        min_department: "",
      })),
      f,
    );
  kit.rows.goal_student_state = () => [];
});

const load = (options: { streak?: boolean } = {}) =>
  loadGoalStatus(createFakeAdmin(kit) as never, ["seoul", "la"], NOW, options);

describe("loadGoalStatus student time zone", () => {
  test("the week window of each student follows that student's zone in one list", async () => {
    kit.rows.goal_daily_records = (f) =>
      matchRows([record("seoul", "2026-11-10"), record("la", "2026-11-03")], f);
    const status = await load();
    // 서울 창은 11-04~11-10, 로스앤젤레스 창은 11-03~11-09 이다.
    expect(status.get("seoul")?.minSetDays).toBe(1);
    expect(status.get("la")?.minSetDays).toBe(1);
  });

  test("the streak of a Seoul student counts Seoul days", async () => {
    kit.rows.goal_daily_records = (f) =>
      matchRows(
        [record("seoul", "2026-11-11"), record("seoul", "2026-11-10")],
        f,
      );
    const status = await load({ streak: true });
    expect(status.get("seoul")?.streakDays).toBe(2);
  });

  test("the profile zones are read in one query for the chunk", async () => {
    kit.rows.goal_daily_records = () => [];
    await load();
    expect(kit.reads.filter((r) => r.table === "profiles")).toHaveLength(1);
  });
});
