import { useEffect, useState } from "react";
import { site } from "@/config/site";
import { supabase } from "@/lib/supabase";

// home_mentor_strategies row → MentorSection/MentorCard 정규화 (Home.tsx에서 추출).
// fetch+정규화 로직의 단일 소유처 — Home.tsx 랜딩과 프리미엄(A 프로그램) 랜딩 섹션 9가
// 동일한 로직을 공유한다. 동작은 Home.tsx 기존 인라인 구현과 100% 동일(쿼리/정규화/에러 처리
// 모두 그대로 이식) — 다른 점은 side banner/university 조회와 묶여 있던 단일 Promise.all에서
// 분리되어 독립 effect로 fetch된다는 것뿐(둘 다 마운트 시 1회 fetch라 체감 타이밍은 동일).

export type MentorPhotoLayout = {
  top: number;
  left: number;
  width: number;
  height: number;
  crop?: { top: string; height: string };
};

export type MentorRow = {
  id: string | number;
  mentor_name?: string;
  badge?: string;
  title_lines?: unknown;
  photo_url?: string;
  photo_layout?: Record<string, unknown> | null;
  card_width?: number;
  sort_order?: number;
  [key: string]: unknown;
};

export type NormalizedMentor = MentorRow & {
  title_lines: string[] | null;
  photo: MentorPhotoLayout | null;
};

// title_lines가 문자열(JSON)로 오는 경우 방어 파싱 — 실패/비배열이면 null(카드 미노출 유도)
export function normalizeMentorRow(row: MentorRow): NormalizedMentor {
  let titleLines = row.title_lines;
  if (typeof titleLines === "string") {
    try {
      titleLines = JSON.parse(titleLines);
    } catch {
      titleLines = null;
    }
  }
  const layout = row.photo_layout;
  const hasValidLayout =
    layout &&
    ["top", "left", "width", "height"].every((key) =>
      Number.isFinite(layout[key]),
    );

  return {
    ...row,
    title_lines:
      Array.isArray(titleLines) && titleLines.length > 0
        ? (titleLines as string[])
        : null,
    photo: hasValidLayout ? (layout as unknown as MentorPhotoLayout) : null,
  };
}

/**
 * home_mentor_strategies 활성 멘토 목록을 조회·정규화해 반환한다.
 * Home.tsx 랜딩 섹션과 프리미엄(A 프로그램) 랜딩 섹션 9가 공유하는 단일 fetch 소유처.
 * @param opts.enabled false면 fetch를 건너뛰고 빈 배열을 유지한다(Home.tsx의
 *   LANDING_PREVIEW처럼 정적 픽스처를 쓰는 소비자용 가드 — 기본값 true).
 */
export function useHomeMentors({ enabled = true }: { enabled?: boolean } = {}) {
  const [mentors, setMentors] = useState<NormalizedMentor[]>([]);
  // loading은 조회 중, error는 조회 실패(스쿨멘토 홈이 영역 오류 안내를 보이는 데 쓴다).
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    enabled ? "loading" : "ready",
  );

  useEffect(() => {
    if (!enabled) return undefined;

    let mounted = true;

    async function fetchMentors() {
      const { data, error } = await supabase
        .from("home_mentor_strategies")
        .select(
          // 동의 확인 칸은 스쿨멘토만 읽는다(결정 25). 위닝 쿼리는 그대로 둔다.
          site.features.b2bMenu
            ? "id, mentor_name, badge, title_lines, photo_url, photo_layout, card_width, sort_order, consent_confirmed"
            : "id, mentor_name, badge, title_lines, photo_url, photo_layout, card_width, sort_order",
        )
        .eq("is_active", true)
        .order("sort_order", { ascending: true });

      if (!mounted) return;

      if (error) {
        console.error("멘토 조회 오류:", error);
        setMentors([]);
        setStatus("error");
        return;
      }

      // 컬럼 목록이 사이트별로 달라 select 타입 추론이 막힌다. 행 모양은 MentorRow가 정본이다.
      const rows = (data || []) as unknown as MentorRow[];
      setMentors(
        (site.features.b2bMenu
          ? rows.filter((row) => row.consent_confirmed === true)
          : rows
        ).map(normalizeMentorRow),
      );
      setStatus("ready");
    }

    fetchMentors();

    return () => {
      mounted = false;
    };
  }, [enabled]);

  return { mentors, status };
}
