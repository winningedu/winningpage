// 섹션 body(서버가 형식마다 다른 모양으로 준다)를 화면용 모양으로 바꾼다.
// 느슨한 타입 가드만 쓴다. 모양이 맞지 않으면 { kind: "empty" } 로 두고 값을 지어내지 않는다.
// 모양의 출처: api/_lib/growth/report/compute.ts(앱 섹션), prompts.ts(모델 섹션).

import { isRecord, NO_DATA_TEXT, type SectionView } from "./reportLogic";

export type TableBody = {
  kind: "table";
  /** null 이면 label/value 2열 표(헤더 없음). */
  columns: string[] | null;
  rows: string[][];
  note: string | null;
  /** 3-10 도달 어려움. */
  unreachable: boolean;
};

export type CurvePoint = { key: string; average: number };

export type BodyView =
  | { kind: "empty"; reason: string | null }
  | { kind: "prose"; paragraphs: string[]; note: string | null }
  | { kind: "list"; items: { text: string; evidenceCount: number }[] }
  | TableBody
  | { kind: "bars"; bars: { label: string; value: number }[] }
  | {
      kind: "curve";
      points: CurvePoint[];
      actual: number | null;
      estimate: number | null;
      verdictLabel: string | null;
      thresholdText: string | null;
      /** y 축 아래 끝 등급. 5등급제 5, 9등급제 9. */
      maxGrade: 5 | 9;
    }
  | {
      kind: "activityMap";
      semesters: {
        label: string;
        nodes: { id: string; subjectGroup: string | null; topic: string }[];
      }[];
    }
  | {
      kind: "direction";
      percent: number;
      formula: string | null;
      verdictLabel: string | null;
      criteria: string | null;
      smallSample: boolean;
      linkedCount: number;
    }
  | {
      kind: "growthFlow";
      theme: string;
      subthemes: { grade: string; stageLabel: string; text: string }[];
    };

const empty = (reason: string | null = null): BodyView => ({
  kind: "empty",
  reason,
});

const COLUMN_LABELS: Record<string, string> = {
  subject: "과목",
  direction: "방향",
  record_to_leave: "남길 기록",
  key: "시기",
  target: "목표",
  note: "비고",
};

const ADMISSION_STATUS_LABELS: Record<string, string> = {
  within: "여유",
  gap: "차이 있음",
  no_data: NO_DATA_TEXT,
};

const str = (v: unknown): string | null =>
  typeof v === "string" && v !== "" ? v : null;
const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

function cell(v: unknown): string | null {
  if (typeof v === "string") return v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (v === null || v === undefined) return NO_DATA_TEXT;
  return null;
}

function rowsOf(
  body: Record<string, unknown>,
): Record<string, unknown>[] | null {
  if (!Array.isArray(body.rows)) return null;
  const rows = body.rows.filter(isRecord);
  return rows.length === 0 ? null : rows;
}

function tableBody(
  section: SectionView,
  body: Record<string, unknown>,
): BodyView {
  const rows = rowsOf(body);
  if (rows === null) return empty();
  const note = str(body.note);
  const base = { kind: "table" as const, note, unreachable: false };

  if (section.id === "1-14") {
    return {
      ...base,
      columns: ["대학", "최근 입결", "차이", "판정"],
      rows: rows.map((r) => [
        cell(r.university) ?? NO_DATA_TEXT,
        cell(r.latest) ?? NO_DATA_TEXT,
        cell(r.diffText) ?? NO_DATA_TEXT,
        ADMISSION_STATUS_LABELS[String(r.status)] ?? NO_DATA_TEXT,
      ]),
    };
  }
  if (section.id === "3-10") {
    return {
      ...base,
      unreachable: body.status === "unreachable",
      columns: ["시기", "목표", "비고"],
      rows: rows.map((r) => [
        cell(r.key) ?? NO_DATA_TEXT,
        cell(r.target) ?? NO_DATA_TEXT,
        str(r.note) ?? "",
      ]),
    };
  }
  const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  if (keys.includes("label") && keys.includes("value")) {
    return {
      ...base,
      columns: null,
      rows: rows.map((r) => [
        cell(r.label) ?? NO_DATA_TEXT,
        cell(r.value) ?? NO_DATA_TEXT,
      ]),
    };
  }
  const shown = keys.filter((k) => k in COLUMN_LABELS);
  if (shown.length === 0) return empty();
  return {
    ...base,
    columns: shown.map((k) => COLUMN_LABELS[k] ?? k),
    rows: rows.map((r) => shown.map((k) => cell(r[k]) ?? NO_DATA_TEXT)),
  };
}

function semesterLabel(grade: unknown, semester: unknown): string {
  const g = typeof grade === "string" ? grade.match(/^고([123])$/) : null;
  const s = num(semester);
  return g && (s === 1 || s === 2) ? `${g[1]}학년 ${s}학기` : "학기 미확인";
}

function activityMap(body: Record<string, unknown>): BodyView {
  if (!Array.isArray(body.nodes)) return empty();
  const groups = new Map<
    string,
    { id: string; subjectGroup: string | null; topic: string }[]
  >();
  for (const n of body.nodes) {
    if (!isRecord(n)) continue;
    const topic = str(n.topic);
    if (topic === null) continue;
    const label = semesterLabel(n.gradeLabel, n.semester);
    const list = groups.get(label) ?? [];
    list.push({
      id: str(n.id) ?? `${label}-${list.length}`,
      subjectGroup: str(n.subjectGroup),
      topic,
    });
    groups.set(label, list);
  }
  if (groups.size === 0) return empty();
  return {
    kind: "activityMap",
    semesters: [...groups.entries()].map(([label, nodes]) => ({
      label,
      nodes,
    })),
  };
}

function curve(body: Record<string, unknown>): BodyView {
  if (!Array.isArray(body.points)) return empty();
  const points = body.points.flatMap((p): CurvePoint[] => {
    if (!isRecord(p)) return [];
    const key = str(p.key);
    const average = num(p.average);
    return key !== null && average !== null ? [{ key, average }] : [];
  });
  if (points.length === 0) return empty();
  return {
    kind: "curve",
    points,
    actual: num(body.actual),
    estimate: num(body.estimate),
    verdictLabel: str(body.verdictLabel),
    thresholdText: str(body.thresholdText),
    maxGrade: body.system === "nine" ? 9 : 5,
  };
}

function diagram(
  section: SectionView,
  body: Record<string, unknown>,
): BodyView {
  if (section.id === "1-3") return activityMap(body);
  if (section.id === "1-10") {
    const percent = num(body.percent);
    if (percent === null) return empty();
    return {
      kind: "direction",
      percent,
      formula: section.formula ?? str(body.formula),
      verdictLabel: str(body.verdictLabel),
      criteria: str(body.criteria),
      smallSample: body.smallSample === true,
      linkedCount: Array.isArray(body.linked) ? body.linked.length : 0,
    };
  }
  if (section.id === "3-1") {
    const theme = str(body.theme);
    if (theme === null || !Array.isArray(body.subthemes)) return empty();
    const subthemes = body.subthemes.flatMap((s) => {
      if (!isRecord(s)) return [];
      const grade = str(s.grade);
      const text = str(s.text);
      return grade && text
        ? [{ grade, stageLabel: str(s.stageLabel) ?? "", text }]
        : [];
    });
    return { kind: "growthFlow", theme, subthemes };
  }
  return empty();
}

export function normalizeBody(section: SectionView): BodyView {
  if (section.status === "no_data") return empty(section.reason);
  const { body } = section;
  switch (section.format) {
    case "prose": {
      const text =
        typeof body === "string" ? body : isRecord(body) ? body.text : null;
      if (typeof text !== "string" || text.trim() === "") return empty();
      return {
        kind: "prose",
        paragraphs: text
          .split(/\n{2,}/)
          .map((p) => p.trim())
          .filter(Boolean),
        note: isRecord(body) ? str(body.note) : null,
      };
    }
    case "list": {
      const raw = Array.isArray(body)
        ? body
        : isRecord(body)
          ? body.items
          : null;
      if (!Array.isArray(raw)) return empty();
      const items = raw.flatMap((it) => {
        const text =
          typeof it === "string" ? it : isRecord(it) ? str(it.text) : null;
        if (!text) return [];
        const ev =
          isRecord(it) && Array.isArray(it.evidence_ids)
            ? it.evidence_ids.length
            : 0;
        return [{ text, evidenceCount: ev }];
      });
      return items.length === 0 ? empty() : { kind: "list", items };
    }
    case "table":
      return isRecord(body) ? tableBody(section, body) : empty();
    case "bar": {
      if (!isRecord(body) || !Array.isArray(body.bars)) return empty();
      const bars = body.bars.flatMap((b) => {
        if (!isRecord(b)) return [];
        const label = str(b.label);
        const value = num(b.value);
        return label !== null && value !== null ? [{ label, value }] : [];
      });
      return bars.length === 0 ? empty() : { kind: "bars", bars };
    }
    case "line":
      return isRecord(body) ? curve(body) : empty();
    case "diagram":
      return isRecord(body) ? diagram(section, body) : empty();
    default:
      return empty();
  }
}
