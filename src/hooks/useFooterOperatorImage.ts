import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthProvider";
import { supabase } from "@/lib/supabase";

export type FooterOperatorImage = { imageUrl: string; title: string };

type FooterImageRow = {
  image_url: string;
  title: string;
  tenant_id: string | null;
};

/**
 * 정렬된 노출 행에서 푸터에 그릴 한 장을 고른다.
 * 내 소속 기관을 대상으로 한 행이 있으면 그 첫 행, 없으면 대상이 없는(공통) 첫 행,
 * 둘 다 없으면 null. 다른 기관 대상 행은 어떤 경우에도 고르지 않는다.
 */
export function selectFooterOperatorImage(
  rows: FooterImageRow[],
  matchedTenantIds: string[],
): FooterOperatorImage | null {
  const row =
    rows.find((r) => r.tenant_id && matchedTenantIds.includes(r.tenant_id)) ??
    rows.find((r) => r.tenant_id === null);
  return row ? { imageUrl: row.image_url, title: row.title } : null;
}

/**
 * footer_operator_images 의 노출 행(sort_order, id 순)을 1회 조회하고, 로그인한 회원이면
 * 소속 기관 목록과 합쳐 selectFooterOperatorImage 로 한 장을 고른다.
 * 해당하는 행이 없거나 조회 실패면 null이고, 푸터는 이미지 자리를 그리지 않는다.
 */
export function useFooterOperatorImage(): FooterOperatorImage | null {
  const { user, isReady } = useAuth();
  const userId = user?.id ?? null;
  const [rows, setRows] = useState<FooterImageRow[] | null>(null);
  // 어느 사용자의 소속 기관인지 함께 담아, 사용자가 바뀐 직후 이전 사용자의 값을 쓰지 않는다.
  const [tenants, setTenants] = useState<{
    userId: string | null;
    ids: string[];
  } | null>(null);

  useEffect(() => {
    let mounted = true;

    async function fetchRows() {
      const { data, error } = await supabase
        .from("footer_operator_images")
        .select("image_url, title, tenant_id")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("id", { ascending: true });

      if (!mounted) return;

      if (error) {
        console.error("푸터 운영기관 이미지 조회 오류:", error);
        setRows([]);
        return;
      }

      setRows((data as FooterImageRow[] | null) ?? []);
    }

    fetchRows();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isReady) return;
    if (!userId) {
      setTenants({ userId: null, ids: [] });
      return;
    }
    let mounted = true;

    async function fetchTenantIds() {
      const { data } = await supabase.rpc("fn_matched_tenant_ids");
      if (!mounted) return;
      setTenants({ userId, ids: data ?? [] });
    }

    fetchTenantIds();

    return () => {
      mounted = false;
    };
  }, [isReady, userId]);

  if (!rows || !isReady || tenants?.userId !== userId) return null;
  return selectFooterOperatorImage(rows, tenants.ids);
}
