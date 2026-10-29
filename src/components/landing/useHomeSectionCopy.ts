import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type SectionKey = "acceptance" | "services" | "mentor";

// 섹션 컴포넌트 props 형태 그대로다. 값이 없는 필드는 키 자체를 뺀다.
export type SectionCopy = {
  eyebrow?: string;
  titleMain: string;
  titleSub?: string;
};

type HomeSectionCopies = Record<SectionKey, SectionCopy | null>;

const EMPTY: HomeSectionCopies = {
  acceptance: null,
  services: null,
  mentor: null,
};

type CopyRow = {
  section_key: string;
  eyebrow: string | null;
  title_main: string;
  title_sub: string | null;
};

function toCopy(row: CopyRow): SectionCopy {
  return {
    ...(row.eyebrow ? { eyebrow: row.eyebrow } : {}),
    titleMain: row.title_main,
    ...(row.title_sub ? { titleSub: row.title_sub } : {}),
  };
}

/** home_section_copy 3행을 1회 조회한다. 행이 없거나 조회 실패면 해당 섹션은 null. */
export function useHomeSectionCopy(): HomeSectionCopies {
  const [copies, setCopies] = useState<HomeSectionCopies>(EMPTY);

  useEffect(() => {
    let mounted = true;

    async function fetchCopies() {
      const { data, error } = await supabase
        .from("home_section_copy")
        .select("section_key, eyebrow, title_main, title_sub");

      if (!mounted) return;

      if (error) {
        console.error("랜딩 섹션 제목 조회 오류:", error);
        setCopies(EMPTY);
        return;
      }

      const next: HomeSectionCopies = { ...EMPTY };
      for (const row of (data || []) as CopyRow[]) {
        if (row.section_key in next) {
          next[row.section_key as SectionKey] = toCopy(row);
        }
      }
      setCopies(next);
    }

    fetchCopies();

    return () => {
      mounted = false;
    };
  }, []);

  return copies;
}
