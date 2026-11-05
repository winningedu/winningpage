import { useAuth } from "@/context/AuthProvider";

export type B2BAccount = { status: "loading" } | { status: "guest" };

// 헤더와 드로어가 함께 쓰는 로그인 상태(게스트, 로딩 중).
export function useB2BAccount(): B2BAccount {
  const { session, isReady } = useAuth();

  if (!isReady) return { status: "loading" };
  if (!session?.user) return { status: "guest" };
  return { status: "loading" };
}
