// 콘솔 화면이 함께 쓰는 학생 범위 읽기.
// 목록(W7, W8, W10): 기관의 현재 학년도 재학생 중 학급이 정해진 학생을 범위(담임은 담당 학급, 관리자와 대행은 전교)로 거르고 학년, 그룹, 반, 번호 순으로 준다.
// 한 명 열기(W9 코칭, 메모, 서비스 상세): 현재 학년도 재학생만 열린다. 졸업생과 지난 담임의 옛 학급은 범위 밖이라 404 다.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { VercelResponse } from "@vercel/node";
import { sendError } from "../httpResponse.js";
import type { ConsoleActor } from "./actor.js";
import {
  compareClassName,
  gradeRank,
  loadClassIndex,
  loadTenant,
  readAll,
} from "./directory.js";
import { requireInScope, scopeQuery } from "./scope.js";

/** 입시를 앞둔 학년(W10 대상). */
export const ADMISSION_GRADES = ["중3", "고3"] as const;

export interface ScopedStudent {
  studentId: string;
  grade: string;
  classId: string;
  className: string;
  groupId: string | null;
  groupName: string | null;
  number: number | null;
}

export interface StudentFilter {
  /** 허용할 학년들. 없으면 전체. */
  grades?: readonly string[] | undefined;
  grade?: string | undefined;
  groupId?: string | undefined;
  classId?: string | undefined;
}

interface EnrollmentRow {
  student_id: string;
  grade: string | null;
  class_id: string | null;
  number: number | null;
}

export async function loadScopedStudents(
  admin: SupabaseClient,
  actor: ConsoleActor,
  filter: StudentFilter = {},
): Promise<ScopedStudent[]> {
  const { schoolYear } = await loadTenant(admin, actor.tenantId);
  const [rows, classes] = await Promise.all([
    readAll<EnrollmentRow>(
      admin,
      "student_enrollments",
      "student_id, grade, class_id, number",
      (q) =>
        scopeQuery(q, actor, { classColumn: "class_id" })
          .eq("school_year", schoolYear)
          .eq("status", "active"),
    ),
    loadClassIndex(admin, actor.tenantId),
  ]);

  const students: ScopedStudent[] = [];
  for (const row of rows) {
    const cls = row.class_id ? classes.get(row.class_id) : undefined;
    if (!row.grade || !cls) continue;
    if (filter.grades && !filter.grades.includes(row.grade)) continue;
    if (filter.grade && row.grade !== filter.grade) continue;
    if (filter.classId && cls.id !== filter.classId) continue;
    if (filter.groupId && cls.groupId !== filter.groupId) continue;
    students.push({
      studentId: row.student_id,
      grade: row.grade,
      classId: cls.id,
      className: cls.name,
      groupId: cls.groupId,
      groupName: cls.groupName,
      number: row.number,
    });
  }
  students.sort(
    (a, b) =>
      gradeRank(a.grade) - gradeRank(b.grade) ||
      (a.groupName ?? "").localeCompare(b.groupName ?? "", "ko") ||
      compareClassName(a.className, b.className) ||
      (a.number ?? 100) - (b.number ?? 100) ||
      a.studentId.localeCompare(b.studentId),
  );
  return students;
}

export interface ScopedEnrollment {
  student_id: string;
  grade: string | null;
  class_id: string | null;
  number: number | null;
}

/** 범위 안이면 학적을, 아니면 404 를 보내고 null 을 돌려준다. 호출부는 null 일 때 바로 return 한다. */
export async function loadScopedEnrollment(
  admin: SupabaseClient,
  res: VercelResponse,
  actor: ConsoleActor,
  studentId: string,
): Promise<ScopedEnrollment | null> {
  const { schoolYear } = await loadTenant(admin, actor.tenantId);
  const [enrollment] = await readAll<ScopedEnrollment>(
    admin,
    "student_enrollments",
    "student_id, grade, class_id, number",
    (q) =>
      q
        .eq("tenant_id", actor.tenantId)
        .eq("student_id", studentId)
        .eq("school_year", schoolYear)
        .eq("status", "active"),
  );
  if (!enrollment) {
    sendError(res, "coded", 404, "대상을 찾을 수 없습니다.", "NOT_FOUND");
    return null;
  }
  const inScope = requireInScope(res, "coded", actor, {
    tenantId: actor.tenantId,
    classId: enrollment.class_id,
  });
  return inScope ? enrollment : null;
}
