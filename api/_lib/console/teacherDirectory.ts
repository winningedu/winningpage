// 교사 읽기 라우트(목록, 계정, 계정 없는 교사)가 함께 쓰는 조회. 기관의 삭제되지 않은 교사와 올해 담당 학급,
// 학급별 재학생 수를 한 번에 모은다. 필터와 정렬은 라우트가 한다.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  compareClassName,
  gradeRank,
  loadGroupNames,
  loadTenant,
  readAll,
} from "./directory.js";

export interface DirectoryClass {
  id: string;
  grade: string;
  groupId: string | null;
  groupName: string | null;
  name: string;
  isPrimary: boolean;
  activeStudents: number;
}

export interface DirectoryTeacher {
  id: string;
  name: string;
  phone: string;
  role: "homeroom" | "school_admin";
  status: "active" | "inactive";
  loginId: string | null;
  hasAccount: boolean;
  passwordSet: boolean;
  /** 학년, 그룹, 반 순. */
  classes: DirectoryClass[];
}

export interface DirectoryClassRow {
  id: string;
  grade: string;
  groupId: string | null;
  groupName: string | null;
  name: string;
  activeStudents: number;
}

export interface TeacherDirectory {
  teachers: DirectoryTeacher[];
  /** 올해의 모든 학급(담임이 없는 학급 포함), 학년, 그룹, 반 순. */
  classes: DirectoryClassRow[];
  /** 학급 id 의 담임. */
  holderByClassId: Map<string, DirectoryTeacher>;
}

interface TeacherRow {
  id: string;
  name: string;
  phone: string;
  role: "homeroom" | "school_admin";
  status: "active" | "inactive";
  login_id: string | null;
  profile_id: string | null;
  password_set_at: string | null;
  deleted_at: string | null;
}

export function compareClasses(
  a: { grade: string; groupName: string | null; name: string },
  b: { grade: string; groupName: string | null; name: string },
): number {
  return (
    gradeRank(a.grade) - gradeRank(b.grade) ||
    (a.groupName ?? "").localeCompare(b.groupName ?? "", "ko") ||
    compareClassName(a.name, b.name)
  );
}

export async function loadTeacherDirectory(
  admin: SupabaseClient,
  tenantId: string,
): Promise<TeacherDirectory> {
  const { schoolYear } = await loadTenant(admin, tenantId);
  const [teacherRows, classRows, assignments, enrollments, groupNames] =
    await Promise.all([
      readAll<TeacherRow>(
        admin,
        "teachers",
        "id, name, phone, role, status, login_id, profile_id, password_set_at, deleted_at",
        (q) => q.eq("tenant_id", tenantId),
      ),
      readAll<{
        id: string;
        grade: string;
        group_id: string | null;
        name: string;
      }>(admin, "classes", "id, grade, group_id, name", (q) =>
        q.eq("tenant_id", tenantId).eq("school_year", schoolYear),
      ),
      readAll<{ teacher_id: string; class_id: string; is_primary: boolean }>(
        admin,
        "teacher_class_assignments",
        "teacher_id, class_id, is_primary",
        (q) => q.eq("tenant_id", tenantId),
        "class_id",
      ),
      readAll<{ class_id: string | null }>(
        admin,
        "student_enrollments",
        "class_id",
        (q) =>
          q
            .eq("tenant_id", tenantId)
            .eq("school_year", schoolYear)
            .eq("status", "active"),
      ),
      loadGroupNames(admin, tenantId),
    ]);

  const students = new Map<string, number>();
  for (const e of enrollments) {
    if (e.class_id)
      students.set(e.class_id, (students.get(e.class_id) ?? 0) + 1);
  }
  const classes: DirectoryClassRow[] = classRows
    .map((c) => ({
      id: c.id,
      grade: c.grade,
      groupId: c.group_id,
      groupName: c.group_id ? (groupNames.get(c.group_id) ?? null) : null,
      name: c.name,
      activeStudents: students.get(c.id) ?? 0,
    }))
    .sort(compareClasses);
  const classById = new Map(classes.map((c) => [c.id, c]));

  const primaryByAssignment = new Map(
    assignments.map((a) => [`${a.teacher_id}|${a.class_id}`, a.is_primary]),
  );
  const teachers: DirectoryTeacher[] = teacherRows
    .filter((t) => !t.deleted_at)
    .map((t) => ({
      id: t.id,
      name: t.name,
      phone: t.phone,
      role: t.role,
      status: t.status,
      loginId: t.login_id,
      hasAccount: t.profile_id !== null,
      passwordSet: t.password_set_at !== null,
      classes: assignments
        .filter((a) => a.teacher_id === t.id && classById.has(a.class_id))
        .map((a) => classById.get(a.class_id) as DirectoryClassRow)
        .sort(compareClasses)
        .map((c) => ({
          ...c,
          isPrimary: primaryByAssignment.get(`${t.id}|${c.id}`) === true,
        })),
    }));

  const holderByClassId = new Map<string, DirectoryTeacher>();
  for (const t of teachers) {
    for (const c of t.classes) holderByClassId.set(c.id, t);
  }
  return { teachers, classes, holderByClassId };
}
