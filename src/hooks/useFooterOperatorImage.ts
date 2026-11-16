import { useEffect, useState } from "react";
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
 * footer_operator_images 에서 노출 중인 첫 행(sort_order, id 순)을 1회 조회한다.
 * 행이 없거나 조회 실패면 null이고, 푸터는 이미지 자리를 그리지 않는다.
 */
export function useFooterOperatorImage(): FooterOperatorImage | null {
  const [image, setImage] = useState<FooterOperatorImage | null>(null);

  useEffect(() => {
    let mounted = true;

    async function fetchImage() {
      const { data, error } = await supabase
        .from("footer_operator_images")
        .select("image_url, title")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("id", { ascending: true })
        .limit(1);

      if (!mounted) return;

      if (error) {
        console.error("푸터 운영기관 이미지 조회 오류:", error);
        setImage(null);
        return;
      }

      const row = (data as FooterImageRow[] | null)?.[0];
      setImage(row ? { imageUrl: row.image_url, title: row.title } : null);
    }

    fetchImage();

    return () => {
      mounted = false;
    };
  }, []);

  return image;
}
