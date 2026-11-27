// /api/goal/admin/students 아래 목표관리 학생 현황 라우트. goal 관리자 앱(api/_routes/goal/admin/app.ts)이 .route("/students", students) 로 붙인다.
// 요청 검증과 응답 모양은 shared/goal/admin-students.ts 를 따른다. 메뉴 권한은 goalStudents(GET 은 view). 전부 읽기 전용이다
// (구 RLS goal_*_admin_select = is_winning_admin() 은 읽기만 있었다).
//   GET /?page&q&filter    학생 목록. 브라우저가 3단계로 하던 조회를 서버로 옮겼다.
//     1) q 가 있으면 profiles 이름, 연락처 부분일치로 id 집합을 먼저 얻는다(goal_student_state 에는 이름이 없다).
//     2) goal_student_state(뷰)를 필터, 2축 정렬, 페이지로 읽는다.
//     3) 같은 id 집합으로 goal_students, profiles 를 채워 병합한다.
//   GET /:id               학생 한 명의 상세. goal_students, goal_student_state, profiles, goal_probability_logs 와
//                          슬롯 4칸의 "현재 컷". goal_students 행이 없으면 404.
//   GET /:id/records?limit 일별 기록. record_index 내림차순 앞에서 limit 건과 전체 건수.
//                          화면의 "더보기"가 limit 을 늘려 앞에서부터 다시 받는다.

import type { z } from "zod";
import {
  goalRecordsQuery,
  type goalRecordsResponse,
  goalStudentParams,
  goalStudentsQuery,
  type goalStudentsResponse,
} from "../../../../shared/goal/admin-students.js";
import { PROBLEM_CODE } from "../../../../shared/http/codes.js";
import { getSchoolCutType } from "../../../../src/lib/goal/calc/index.js";
import { ymdIn } from "../../../../src/lib/time/day.js";
import { SECTION_PAGE_SIZE } from "../../../_lib/admin-sections/registry.js";
import { admin } from "../../../_lib/hono/admin.js";
import { adminFactory } from "../../../_lib/hono/factory.js";
import { methodNotAllowed, ProblemError } from "../../../_lib/hono/problem.js";
import { validate } from "../../../_lib/hono/validate.js";
import { TimeZoneRequiredError } from "../../../_lib/timeZone.js";

// 검색 선행 조회 상한. 닿으면 초과분 학생이 조용히 빠지므로 searchTruncated 로 알린다.
const PROFILE_SEARCH_LIMIT = 500;

// 화면의 GOAL_CUT_SLOTS 와 같은 키, 같은 순서다(내신 컷만 학교 유형에서 cut_type 을 유도한다).
const CUT_SLOTS = [
  { key: "idealNaesin", side: "ideal", axis: "naesin" },
  { key: "idealJungsi", side: "ideal", axis: "jungsi" },
  { key: "minNaesin", side: "min", axis: "naesin" },
  { key: "minJungsi", side: "min", axis: "jungsi" },
] as const;

const trim = (value: unknown) => String(value ?? "").trim();

type ListBody = z.input<typeof goalStudentsResponse>;

const listGuard = admin({
  permission: { key: "goalStudents" },
  unhandledMessage: "학생 목록을 불러오지 못했습니다.",
  logLabel: "goal/admin/students",
});
const detailGuard = admin({
  permission: { key: "goalStudents" },
  unhandledMessage: "학생 상세를 불러오지 못했습니다.",
  logLabel: "goal/admin/students/id",
});
const recordsGuard = admin({
  permission: { key: "goalStudents" },
  unhandledMessage: "학생 기록을 불러오지 못했습니다.",
  logLabel: "goal/admin/students/id/records",
});

export const students = adminFactory
  .createApp()
  .get("/", listGuard, validate("query", goalStudentsQuery), async (c) => {
    const db = c.var.supabaseAdmin;
    const { page, filter, q } = c.req.valid("query");
    const term = (q ?? "").trim();
    // 오늘 기준은 보는 사람의 시간대다. 헤더가 없으면 여기서 400 이다.
    let today = "";
    if (filter === "noSubmitToday") {
      if (!c.var.timeZone) throw new TimeZoneRequiredError();
      today = ymdIn(new Date(), c.var.timeZone);
    }

    let idFilter: string[] | null = null;
    let searchTruncated = false;

    if (term) {
      // or() 는 콤마, 괄호로 구문을 끊고 %, _ 는 와일드카드라 공백으로 바꾼다.
      const safe = term.replace(/[,()%_\\*]/g, " ").trim();
      if (!safe) {
        return c.json({
          items: [],
          total: 0,
          searchTruncated: false,
        } satisfies ListBody);
      }
      const { data, error } = await db
        .from("profiles")
        .select("id")
        .or(`name.ilike.%${safe}%,phone.ilike.%${safe}%`)
        .limit(PROFILE_SEARCH_LIMIT);
      if (error) throw new Error("goal students search failed");
      idFilter = (data ?? []).map((row) => String(row.id));
      searchTruncated = idFilter.length >= PROFILE_SEARCH_LIMIT;
      if (idFilter.length === 0) {
        return c.json({
          items: [],
          total: 0,
          searchTruncated,
        } satisfies ListBody);
      }
    }

    let query = db.from("goal_student_state").select("*", { count: "exact" });
    if (idFilter) query = query.in("profile_id", idFilter);
    if (filter === "awaiting_cuts") query = query.eq("status", "awaiting_cuts");
    else if (filter === "paused") query = query.eq("status", "paused");
    else if (filter === "noRecord") query = query.eq("record_count", 0);
    // last_record_date 가 null 인 행은 걸리지 않는다(기록 0행은 noRecord 담당).
    else if (filter === "noSubmitToday")
      query = query.lt("last_record_date", today);

    // 이 뷰에는 id 가 없고 awaiting_cuts 학생은 onboarded_at 이 전부 null 이라,
    // 동점 처리축이 없으면 페이지 경계에서 행이 겹치거나 빠진다.
    const { data, error, count } = await query
      .order("onboarded_at", { ascending: false, nullsFirst: true })
      .order("profile_id", { ascending: true })
      .range((page - 1) * SECTION_PAGE_SIZE, page * SECTION_PAGE_SIZE - 1);
    if (error) throw new Error("goal students list failed");

    const stateRows = (data ?? []).filter(
      (row): row is typeof row & { profile_id: string } =>
        row.profile_id !== null,
    );
    const ids = stateRows.map((row) => row.profile_id);
    if (ids.length === 0) {
      return c.json({
        items: [],
        total: count ?? 0,
        searchTruncated,
      } satisfies ListBody);
    }

    const [studentRes, profileRes] = await Promise.all([
      db
        .from("goal_students")
        .select(
          "profile_id, grade, school_type, ideal_university, ideal_department, min_university, min_department",
        )
        .in("profile_id", ids),
      db.from("profiles").select("id, name, phone").in("id", ids),
    ]);
    if (studentRes.error || profileRes.error) {
      throw new Error("goal students merge failed");
    }

    const studentById = new Map(
      (studentRes.data ?? []).map((row) => [row.profile_id, row]),
    );
    const profileById = new Map(
      (profileRes.data ?? []).map((row) => [row.id, row]),
    );

    return c.json({
      items: stateRows.map((row) => ({
        ...row,
        student: studentById.get(row.profile_id) ?? null,
        profile: profileById.get(row.profile_id) ?? null,
      })),
      total: count ?? 0,
      searchTruncated,
    });
  })
  .all("/", methodNotAllowed("GET"))
  .get("/:id", detailGuard, validate("param", goalStudentParams), async (c) => {
    const db = c.var.supabaseAdmin;
    const { id } = c.req.valid("param");

    const [studentRes, stateRes, profileRes, logRes] = await Promise.all([
      db.from("goal_students").select("*").eq("profile_id", id).maybeSingle(),
      db
        .from("goal_student_state")
        .select("*")
        .eq("profile_id", id)
        .maybeSingle(),
      db
        .from("profiles")
        .select("id, name, phone, email")
        .eq("id", id)
        .maybeSingle(),
      db
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
      throw new ProblemError(
        404,
        "해당 학생을 찾을 수 없습니다.",
        PROBLEM_CODE.NOT_FOUND,
      );
    }

    // 술어는 api/_lib/goal/repo.ts fetchUniversityCut 과 같다(cut_type, 대학, 학과, is_active, id 정렬, limit 1).
    // 그 함수는 avg_cut 숫자만 돌려주는데 화면은 출처, 연도, 갱신일도 읽어 같은 술어로 따로 건다.
    const naesinType = getSchoolCutType(student.school_type);
    const entries = await Promise.all(
      CUT_SLOTS.map(async (slot) => {
        const university = trim(student[`${slot.side}_university`]);
        const department = trim(student[`${slot.side}_department`]);
        if (!university || !department) return [slot.key, null] as const;
        const { data, error } = await db
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

    return c.json({
      student,
      state: stateRes.data ?? null,
      profile: profileRes.data ?? null,
      logs: logRes.data ?? [],
      cuts: Object.fromEntries(entries),
    });
  })
  .all("/:id", methodNotAllowed("GET"))
  .get(
    "/:id/records",
    recordsGuard,
    validate("param", goalStudentParams),
    validate("query", goalRecordsQuery),
    async (c) => {
      const { id } = c.req.valid("param");
      const { limit } = c.req.valid("query");
      const { data, error, count } = await c.var.supabaseAdmin
        .from("goal_daily_records")
        .select("*", { count: "exact" })
        .eq("profile_id", id)
        .order("record_index", { ascending: false })
        .range(0, limit - 1);
      if (error) throw new Error("goal records failed");
      return c.json({
        items: data ?? [],
        total: count ?? 0,
      } satisfies z.input<typeof goalRecordsResponse>);
    },
  )
  .all("/:id/records", methodNotAllowed("GET"));
