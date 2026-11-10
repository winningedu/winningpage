import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthProvider";
import { cleanText } from "@/hooks/useNavGroups";
import { apiFetch, getAuthHeader } from "@/lib/apiFetch";
import { clearAllDrafts } from "@/lib/diagnosisDraft";
import { classifyMember, getMemberLabel } from "@/lib/memberAccess";
import { supabase } from "@/lib/supabase";
import { fetchProfile, getCsatDay } from "../Header";

// other: 멘토, 유형 미설정, 모르는 유형, 콘솔 조회에 실패한 선생님. 이름 칩만 보이고 D-day는 없다.
type MemberStatus = "student" | "parent" | "admin" | "other";

type Member<Status extends MemberStatus> = {
  status: Status;
  name: string;
  memberLabel: string;
  orgName: string | null;
};

type Teacher = {
  status: "teacher";
  name: string;
  roleLabel: string;
  orgName: string;
};

type Resolved =
  | Member<"student">
  | Member<"parent">
  | Member<"admin">
  | Member<"other">
  | Teacher;

const TEACHER_ROLE_LABELS: Record<string, string> = {
  homeroom: "담임교사",
  school_admin: "학교 전체 관리자",
};

export type B2BAccount =
  | { status: "loading" }
  | { status: "guest" }
  | (Member<"student"> & { csatDDay: string })
  | Member<"parent">
  | Member<"admin">
  | Member<"other">
  | Teacher;

// 학생이 소속된 기관 이름. 행이 없으면 null이라 칩을 그리지 않는다.
async function fetchOrgName(): Promise<string | null> {
  const { data, error } = await supabase.rpc("fn_my_tenant");
  if (error || !Array.isArray(data) || data.length === 0) return null;
  return data[0]?.name ?? null;
}

// 선생님 콘솔 계정이면 이름, 역할, 기관을 돌려준다. 401, 403 등 실패는 null(이름 칩만 보인다).
async function fetchTeacher(): Promise<Teacher | null> {
  const headers = await getAuthHeader();
  if (!headers) return null;
  const res = await apiFetch("/api/console/me", { headers });
  if (!res.ok) return null;
  const body = await res.json();
  if (!body?.teacher || !body?.tenant) return null;
  return {
    status: "teacher",
    name: body.teacher.name,
    roleLabel: TEACHER_ROLE_LABELS[body.teacher.role] ?? "",
    orgName: body.tenant.name,
  };
}

// 헤더와 드로어가 함께 쓰는 로그인 상태(로딩, 게스트, 학생, 학부모, 관리자, 선생님, 그 외).
export function useB2BAccount(): B2BAccount {
  const { user, isReady } = useAuth();
  const [resolved, setResolved] = useState<{
    userId: string;
    account: Resolved;
  } | null>(null);

  useEffect(() => {
    if (!user) {
      setResolved(null);
      return undefined;
    }

    let alive = true;
    (async () => {
      const profile = await fetchProfile(user);
      const memberLabel = getMemberLabel({
        memberType: profile?.member_type,
        role: profile?.role,
      });
      const kind = classifyMember({
        role: profile?.role ?? null,
        memberType: profile?.member_type ?? null,
      });
      const teacher =
        kind === "teacher" ? await fetchTeacher().catch(() => null) : null;
      const account: Resolved = teacher ?? {
        status:
          kind === "admin" || kind === "parent" || kind === "student"
            ? kind
            : "other",
        name: cleanText(profile?.name),
        memberLabel,
        orgName: await fetchOrgName(),
      };
      if (alive) setResolved({ userId: user.id, account });
    })();

    return () => {
      alive = false;
    };
  }, [user]);

  if (!isReady) return { status: "loading" };
  if (!user) return { status: "guest" };
  if (resolved?.userId !== user.id) return { status: "loading" };
  const { account } = resolved;
  return account.status === "student"
    ? { ...account, csatDDay: getCsatDay() }
    : account;
}

// 현재 페이지에 머문 채 세션만 끊는다. AuthProvider가 SIGNED_OUT을 받아 게스트로 돌아간다.
export async function signOutB2B() {
  // 공용 PC에 학습진단 초안(성적, 목표 학교)이 남지 않게 함께 지운다.
  clearAllDrafts();
  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch (error) {
    console.error("로그아웃 오류:", error);
  }
}
