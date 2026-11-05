// 콘솔 현황 화면(W7, W8, W10)이 함께 쓰는 학생 범위 읽기. 기관의 현재 학년도 재학생 중 학급이 정해진 학생을
// 범위(담임은 담당 학급, 관리자와 대행은 전교)로 거르고 학년, 그룹, 반, 번호 순으로 준다.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConsoleActor } from "./actor.js";
import {
  compareClassName,
  gradeRank,
  loadClassIndex,
  loadTenant,
  readAll,
} from "./directory.js";
import { scopeQuery } from "./scope.js";

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
