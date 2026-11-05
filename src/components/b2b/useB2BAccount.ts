import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthProvider";
import { cleanText } from "@/hooks/useNavGroups";
import { supabase } from "@/lib/supabase";
import { fetchProfile, getCsatDay, getMemberLabel } from "../Header";

type Resolved = {
  status: "student";
  name: string;
  memberLabel: string;
  orgName: string | null;
};

export type B2BAccount =
  | { status: "loading" }
  | { status: "guest" }
  | (Resolved & { csatDDay: string });

// 학생이 소속된 기관 이름. 행이 없으면 null이라 칩을 그리지 않는다.
async function fetchOrgName(): Promise<string | null> {
  const { data, error } = await supabase.rpc("fn_my_tenant");
  if (error || !Array.isArray(data) || data.length === 0) return null;
  return data[0]?.name ?? null;
}

// 헤더와 드로어가 함께 쓰는 로그인 상태(로딩, 게스트, 학생).
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
      const account: Resolved = {
        status: "student",
        name: cleanText(profile?.name),
        memberLabel: getMemberLabel(profile),
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
  return { ...resolved.account, csatDDay: getCsatDay() };
}
