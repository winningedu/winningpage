import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

// 약관·동의서 전문 — public.terms(code당 활성 1건) 단일 원본. 하드코딩 사본 없음:
// 조회 실패·행 누락이면 error를 돌려주고 호출부는 안내 문구만 보여준다.
interface TermsDoc {
  code: string;
  title: string;
  content: string;
  effectiveFrom: string;
  route: string | null;
}

interface UseTermsDocsResult<C extends string> {
  docs: Record<C, TermsDoc> | null;
  loading: boolean;
  error: string | null;
}

const TERMS_LOAD_ERROR =
  "문서를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";

// 여러 code를 한 번에 조회한다. 요청한 code가 하나라도 없으면(비활성·미시드) 전체를
// 실패로 본다 — 일부만 렌더하면 어느 문서에 동의하는지 불분명해진다.
export function useTermsDocs<C extends string>(
  codes: readonly C[],
): UseTermsDocsResult<C> {
  const [docs, setDocs] = useState<Record<C, TermsDoc> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // 호출부가 배열 리터럴을 넘겨도 재조회하지 않도록 내용 기준 키로 의존한다.
  const key = codes.join(",");

  useEffect(() => {
    let alive = true;
    const wanted = key.split(",") as C[];
    (async () => {
      setLoading(true);
      setError(null);
      const { data, error: fetchError } = await supabase
        .from("terms")
        .select("code, title, content, effective_from, route")
        .in("code", wanted)
        .eq("is_active", true);
      if (!alive) return;
      const found = {} as Record<C, TermsDoc>;
      for (const row of data ?? []) {
        if (!row.content) continue;
        found[row.code as C] = {
          code: row.code,
          title: row.title,
          content: row.content,
          effectiveFrom: row.effective_from,
          route: row.route,
        };
      }
      const missing = wanted.filter((c) => !found[c]);
      if (fetchError || missing.length > 0) {
        console.warn(
          "약관 조회 실패:",
          fetchError?.message ?? `누락 code: ${missing.join(", ")}`,
        );
        setDocs(null);
        setError(TERMS_LOAD_ERROR);
        setLoading(false);
        return;
      }
      setDocs(found);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [key]);

  return { docs, loading, error };
}

export function useTermsDoc(code: string) {
  const { docs, loading, error } = useTermsDocs([code]);
  return { doc: docs ? docs[code] : null, loading, error };
}
