// 리포트 본문 화면의 순수 로직. 서버 응답(느슨한 unknown)을 화면용 모양으로 바꾼다.
// 서버 레지스트리(api/_lib/growth/sections.ts)는 클라이언트 번들에 끌어오지 않고,
// 라벨 문구만 같은 값으로 둔다. 섹션 항목이 title, format, badge 를 스스로 들고 온다.

export type SectionFormat =
  | "table"
  | "prose"
  | "diagram"
  | "bar"
  | "line"
  | "list";
export type SectionBadge = "fact" | "proposal";

export const FORMAT_LABELS: Record<SectionFormat, string> = {
  table: "표",
  prose: "서술",
  diagram: "도식",
  bar: "막대그래프",
  line: "선그래프",
  list: "목록",
};

export const BADGE_LABELS: Record<SectionBadge, string> = {
  fact: "확인된 사실",
  proposal: "제안",
};

export const NO_DATA_TEXT = "자료 없음";

export const PART_TITLES: Record<1 | 2 | 3, string> = {
  1: "1부 지금까지 무엇을 했는가",
  2: "2부 위닝 A부터 E 5축 진단",
  3: "3부 남은 기간 설계",
};

export type SectionView = {
  id: string;
  part: 1 | 2 | 3;
  title: string;
  /** 허용 집합 밖이면 null. 본문 대신 자료 없음을 그린다. */
  format: SectionFormat | null;
  /** 서버가 주지 않았거나 모르는 값이면 null. 배지를 그리지 않는다. */
  badge: SectionBadge | null;
  status: "ok" | "no_data";
  evidenceCount: number;
  body: unknown;
  reason: string | null;
  formula: string | null;
};

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

const FORMATS = Object.keys(FORMAT_LABELS);

function partOf(id: string): 1 | 2 | 3 | null {
  const head = id.split("-")[0];
  return head === "1" || head === "2" || head === "3"
    ? (Number(head) as 1 | 2 | 3)
    : null;
}

function orderOf(id: string): number {
  const n = Number(id.split("-")[1]);
  return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
}

function readReason(raw: Record<string, unknown>): string | null {
  const body = raw.body;
  if (isRecord(body) && typeof body.reason === "string" && body.reason !== "")
    return body.reason;
  return typeof raw.no_data_reason === "string" && raw.no_data_reason !== ""
    ? raw.no_data_reason
    : null;
}

/** 서버 sections 배열을 화면용으로 바꾼다. id 나 title 이 깨진 항목은 버린다. */
export function normalizeSections(raw: unknown): SectionView[] {
  if (!Array.isArray(raw)) return [];
  const out: SectionView[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    if (typeof item.id !== "string" || typeof item.title !== "string") continue;
    const part = partOf(item.id);
    if (part === null) continue;
    const format = FORMATS.includes(item.format as string)
      ? (item.format as SectionFormat)
      : null;
    out.push({
      id: item.id,
      part,
      title: item.title,
      format,
      badge:
        item.badge === "proposal" || item.badge === "fact" ? item.badge : null,
      status: item.status === "ok" && format !== null ? "ok" : "no_data",
      evidenceCount: Array.isArray(item.evidence_ids)
        ? item.evidence_ids.filter((e) => typeof e === "string").length
        : 0,
      body: item.body,
      reason: readReason(item),
      formula: typeof item.formula === "string" ? item.formula : null,
    });
  }
  return out;
}

export type SectionGroup = {
  part: 1 | 2 | 3;
  title: string;
  sections: SectionView[];
};

/** 1부, 2부, 3부 순서로 묶는다. 항목이 없는 부는 만들지 않는다. */
export function groupSectionsByPart(sections: SectionView[]): SectionGroup[] {
  return ([1, 2, 3] as const).flatMap((part) => {
    const inPart = sections
      .filter((s) => s.part === part)
      .sort((a, b) => orderOf(a.id) - orderOf(b.id));
    return inPart.length === 0
      ? []
      : [{ part, title: PART_TITLES[part], sections: inPart }];
  });
}

// ── 서사, 한눈에, 제외 안내 ─────────────────────────────────────────────

const STAGE_LABELS: Record<string, string> = {
  seed: "씨앗",
  flower: "꽃",
  bloom: "만개",
};

export type NarrativeView = {
  theme: string;
  subthemes: { label: string; text: string }[];
  previous: { theme: string; issuedAt: string | null } | null;
};

const nonEmpty = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v : null;

/** 서사. theme 이 없으면 null(대주제 카드를 그리지 않는다). */
export function normalizeNarrative(raw: unknown): NarrativeView | null {
  if (!isRecord(raw)) return null;
  const theme = nonEmpty(raw.theme);
  if (theme === null) return null;
  const subthemes = Array.isArray(raw.subthemes)
    ? raw.subthemes.flatMap((s) => {
        if (!isRecord(s)) return [];
        const text = nonEmpty(s.text);
        const grade = nonEmpty(s.grade)?.match(/^고([123])$/);
        const stage = STAGE_LABELS[String(s.stage)];
        return text && grade && stage
          ? [{ label: `${grade[1]}학년 ${stage}`, text }]
          : [];
      })
    : [];
  const prev = isRecord(raw.previous) ? raw.previous : null;
  const prevTheme = prev ? nonEmpty(prev.theme) : null;
  return {
    theme,
    subthemes,
    previous: prevTheme
      ? { theme: prevTheme, issuedAt: nonEmpty(prev?.issuedAt) }
      : null,
  };
}

export type OverviewCardView = {
  key: string;
  label: string;
  value: string;
  sub: string | null;
};

/** 한눈에 카드. label 과 value 가 문자열인 것만 그대로 그린다. */
export function normalizeOverview(raw: unknown): OverviewCardView[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((c, i) => {
    if (!isRecord(c)) return [];
    const label = nonEmpty(c.label);
    const value = nonEmpty(c.value);
    return label && value
      ? [
          {
            key: nonEmpty(c.key) ?? String(i),
            label,
            value,
            sub: nonEmpty(c.sub),
          },
        ]
      : [];
  });
}

export type OmittedNotice = { message: string; ids: string[] };

/** 제외 항목 안내. 학부모 열람이면 성적 민감 항목을 뺐다는 문구, 아니면 서버 사유. */
export function omittedNotice(input: {
  omitted: { ids: string[]; reasons: string[] } | null;
  excludedSectionIds: string[];
  parentView: boolean;
}): OmittedNotice | null {
  const { omitted, excludedSectionIds, parentView } = input;
  if (parentView) {
    return excludedSectionIds.length === 0
      ? null
      : {
          message: "학생의 성적과 관련된 항목은 학부모 열람에서 제외했어요.",
          ids: excludedSectionIds,
        };
  }
  const ids = omitted?.ids ?? [];
  if (ids.length === 0) return null;
  const reasons = (omitted?.reasons ?? []).filter((r) => r !== "");
  return {
    message:
      reasons.length > 0
        ? reasons.join(" ")
        : "이번 리포트에서 제외된 항목이에요.",
    ids,
  };
}

/** 하단 "꼭 알아 두세요" 문구. 시안 texts 원문. */
export const REPORT_NOTICES = [
  "이 진단은 위닝 내부 기준이에요. 합격 가능성이나 학교 평가를 예측하지 않아요.",
  "생활기록부 원문은 받지 않아요(초중등교육법 제25조의2).",
] as const;

export const SMALL_SAMPLE_TEXT =
  "분석한 활동이 적어 수치는 냈지만 단정하지 않아요. 활동이 쌓이면 다시 봐야 해요.";

export const UNREACHABLE_TEXT =
  "그대로 적어요. 지금 추이로는 닿기 어려워서, 교과전형이나 정시 등 다른 전형을 함께 보세요.";
