// GET /api/goal/admin/students/:id
//
// 학생 한 명의 상세. goal_students, goal_student_state, profiles, goal_probability_logs 와
// 슬롯 4칸의 "현재 컷"을 한 번에 돌려준다(기록은 /records 가 따로 늘린다).
// goal_students 행이 없으면 404. 읽기 전용이다(구 RLS 에 어드민 쓰기 정책 없음).

import { z } from "zod";
import { getSchoolCutType } from "../../../../../src/lib/goal/calc/index.js";
import { defineHandler } from "../../../../_lib/handler.js";
import { sendError } from "../../../../_lib/httpResponse.js";

export const config = { runtime: "nodejs" };

// 화면의 GOAL_CUT_SLOTS 와 같은 키, 같은 순서다(내신 컷만 학교 유형에서 cut_type 을 유도한다).
const CUT_SLOTS = [
  { key: "idealNaesin", side: "ideal", axis: "naesin" },
  { key: "idealJungsi", side: "ideal", axis: "jungsi" },
  { key: "minNaesin", side: "min", axis: "naesin" },
  { key: "minJungsi", side: "min", axis: "jungsi" },
] as const;

const trim = (value: unknown) => String(value ?? "").trim();

export default defineHandler({
  methods: ["GET"],
  auth: "admin",
  errorShape: "problem",
  permission: { key: "goalStudents" },
  query: z.object({ id: z.string().uuid() }),
  unhandledMessage: "학생 상세를 불러오지 못했습니다.",
  logLabel: "goal/admin/students/id",
  headers: { "Cache-Control": "no-store" },
  handler: async (_req, res, ctx) => {
    const admin = ctx.supabaseAdmin;
    const { id } = ctx.query;

    const [studentRes, stateRes, profileRes, logRes] = await Promise.all([
      admin
        .from("goal_students")
        .select("*")
        .eq("profile_id", id)
        .maybeSingle(),
      admin
        .from("goal_student_state")
        .select("*")
        .eq("profile_id", id)
        .maybeSingle(),
      admin
        .from("profiles")
        .select("id, name, phone, email")
        .eq("id", id)
        .maybeSingle(),
      admin
        .from("goal_probability_logs")
        .select("*")
        .eq("profile_id", id)
        .order("created_at", { ascending: true }),
    ]);
    if (
      studentRes.error ||
      stateRes.error ||
      profileRes.error ||
      logRes.error
    ) {
      throw new Error("goal student detail failed");
    }
    const student = studentRes.data as Record<string, unknown> | null;
    if (!student) {
      sendError(
        res,
        "problem",
        404,
        "해당 학생을 찾을 수 없습니다.",
        "NOT_FOUND",
      );
      return;
    }

    // 술어는 api/_lib/goal/repo.ts fetchUniversityCut 과 같다(cut_type, 대학, 학과, is_active, id 정렬, limit 1).
    // 그 함수는 avg_cut 숫자만 돌려주는데 화면은 출처, 연도, 갱신일도 읽어 같은 술어로 따로 건다.
    const naesinType = getSchoolCutType(student.school_type);
    const entries = await Promise.all(
      CUT_SLOTS.map(async (slot) => {
        const university = trim(student[`${slot.side}_university`]);
        const department = trim(student[`${slot.side}_department`]);
        if (!university || !department) return [slot.key, null] as const;
        const { data, error } = await admin
          .from("goal_university_cuts")
          .select("avg_cut, source, source_year, updated_at")
          .eq("cut_type", slot.axis === "naesin" ? naesinType : "jungsi")
          .eq("university_name", university)
          .eq("department_name", department)
          .eq("is_active", true)
          .order("id", { ascending: true })
          .limit(1)
          .maybeSingle();
        // 컷 한 칸의 실패가 상세 전체를 막지 않는다(구 화면과 같다).
        if (error) return [slot.key, null] as const;
        return [slot.key, data ?? null] as const;
      }),
    );

    res.status(200).json({
      student,
      state: stateRes.data ?? null,
      profile: profileRes.data ?? null,
      logs: logRes.data ?? [],
      cuts: Object.fromEntries(entries),
    });
  },
});
