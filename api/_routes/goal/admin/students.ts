// GET /api/goal/admin/students?page&q&filter
//
// 목표관리 학생 현황 목록. 브라우저가 3단계로 하던 조회를 서버로 옮겼다.
//   1) q 가 있으면 profiles 이름, 연락처 부분일치로 id 집합을 먼저 얻는다(goal_student_state 에는 이름이 없다).
//   2) goal_student_state(뷰)를 필터, 2축 정렬, 페이지로 읽는다.
//   3) 같은 id 집합으로 goal_students, profiles 를 채워 병합한다.
// 구 RLS 는 읽기만 있었고(goal_*_admin_select = is_winning_admin()) 이 라우트도 읽기 전용이다.

import { z } from "zod";
import { ymdIn } from "../../../../src/lib/time/day.js";
import { SECTION_PAGE_SIZE } from "../../../_lib/admin-sections/registry.js";
import { defineHandler, requireTimeZone } from "../../../_lib/handler.js";

export const config = { runtime: "nodejs" };

// 검색 선행 조회 상한. 닿으면 초과분 학생이 조용히 빠지므로 searchTruncated 로 알린다.
const PROFILE_SEARCH_LIMIT = 500;

const FILTERS = [
  "all",
  "awaiting_cuts",
  "noSubmitToday",
  "noRecord",
  "paused",
] as const;

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  q: z.string().optional(),
  filter: z.enum(FILTERS).default("all"),
});

export default defineHandler({
  methods: ["GET"],
  auth: "admin",
  errorShape: "problem",
  permission: { key: "goalStudents" },
  query: querySchema,
  unhandledMessage: "학생 목록을 불러오지 못했습니다.",
  logLabel: "goal/admin/students",
  headers: { "Cache-Control": "no-store" },
  handler: async (_req, res, ctx) => {
    const admin = ctx.supabaseAdmin;
    const { page, filter } = ctx.query;
    const term = (ctx.query.q ?? "").trim();
    // 오늘 기준은 보는 사람의 시간대다. 헤더가 없으면 여기서 400 이다.
    const today =
      filter === "noSubmitToday" ? ymdIn(new Date(), requireTimeZone(ctx)) : "";

    let idFilter: string[] | null = null;
    let searchTruncated = false;

    if (term) {
      // or() 는 콤마, 괄호로 구문을 끊고 %, _ 는 와일드카드라 공백으로 바꾼다.
      const safe = term.replace(/[,()%_\\*]/g, " ").trim();
      if (!safe) {
        res.status(200).json({ items: [], total: 0, searchTruncated: false });
        return;
      }
      const { data, error } = await admin
        .from("profiles")
        .select("id")
        .or(`name.ilike.%${safe}%,phone.ilike.%${safe}%`)
        .limit(PROFILE_SEARCH_LIMIT);
      if (error) throw new Error("goal students search failed");
      idFilter = (data ?? []).map((row) => String(row.id));
      searchTruncated = idFilter.length >= PROFILE_SEARCH_LIMIT;
      if (idFilter.length === 0) {
        res.status(200).json({ items: [], total: 0, searchTruncated });
        return;
      }
    }

    let query = admin
      .from("goal_student_state")
      .select("*", { count: "exact" });
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
      res.status(200).json({ items: [], total: count ?? 0, searchTruncated });
      return;
    }

    const [studentRes, profileRes] = await Promise.all([
      admin
        .from("goal_students")
        .select(
          "profile_id, grade, school_type, ideal_university, ideal_department, min_university, min_department",
        )
        .in("profile_id", ids),
      admin.from("profiles").select("id, name, phone").in("id", ids),
    ]);
    if (studentRes.error || profileRes.error) {
      throw new Error("goal students merge failed");
    }

    const students = new Map(
      (studentRes.data ?? []).map((row) => [row.profile_id, row]),
    );
    const profiles = new Map(
      (profileRes.data ?? []).map((row) => [row.id, row]),
    );

    res.status(200).json({
      items: stateRows.map((row) => ({
        ...row,
        student: students.get(row.profile_id) ?? null,
        profile: profiles.get(row.profile_id) ?? null,
      })),
      total: count ?? 0,
      searchTruncated,
    });
  },
});
