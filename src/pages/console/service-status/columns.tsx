// W8 서비스 탭마다의 열. 이름 열도 하나의 열이라 탭마다 위치가 다르다(학습진단은 긴급도 뒤).
// 읽을 값이 없으면 칸을 비운다(기본값을 만들어 내지 않는다). 휴대폰 카드는 이름을 제목으로 쓰고 나머지 열을 줄로 쓴다.

import Chip, { type ChipTone } from "../Chip";
import { dotDate } from "../enrollment/format";
import NameCell from "../NameCell";
import type { StatusItem, TabKey } from "./tabs";

export interface Column {
  label: string;
  align?: "right" | "center";
  /** 이름 열. 휴대폰 카드에서 제목이 된다. */
  isName?: boolean;
  render: (item: StatusItem) => React.ReactNode;
}

export const URGENCY: Record<string, { label: string; tone: ChipTone }> = {
  low: { label: "낮음", tone: "Success" },
  mid: { label: "보통", tone: "Warning" },
  high: { label: "높음", tone: "Caution" },
  very_high: { label: "매우 높음", tone: "Danger" },
};

const str = (v: unknown) => (typeof v === "string" && v !== "" ? v : null);
const num = (v: unknown) => (typeof v === "number" ? v : null);
const get = (item: StatusItem, key: string) => item.detail?.[key];

/** 달성율 3단계 색(40 미만, 40~69, 70 이상). */
function rateColor(rate: number) {
  if (rate >= 70) return "bg-level-high";
  if (rate >= 40) return "bg-level-mid";
  return "bg-level-low";
}

function RateBar({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center justify-end gap-2">
      <span className="h-2 w-24 overflow-hidden rounded-full bg-surface-muted">
        <span
          className={`block h-full rounded-full ${rateColor(value)}`}
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </span>
      <span className="w-10 text-right text-app-label font-medium">{`${value}%`}</span>
    </span>
  );
}

const nameColumn: Column = {
  label: "이름",
  isName: true,
  render: (item) => <NameCell name={item.name} />,
};

const target = (item: StatusItem, key: "ideal" | "min") => {
  const t = get(item, key) as { university: string; department: string } | null;
  return t ? `${t.university} ${t.department}`.trim() : null;
};
const probability = (item: StatusItem, key: "ideal" | "min") => {
  const p = (get(item, key) as { probability: number | null } | null)
    ?.probability;
  return typeof p === "number" ? `${p}%` : null;
};

const score = (key: string) => (item: StatusItem) => {
  const v = num(get(item, key));
  return v === null ? null : `${v}점`;
};

const date = (key: string) => (item: StatusItem) => {
  const v = str(get(item, key));
  return v === null ? null : dotDate(v);
};

const progress = (item: StatusItem) => {
  const v = num(get(item, "progressPct"));
  return v === null ? null : <RateBar value={v} />;
};

const stageChip = (item: StatusItem) => {
  const v = str(get(item, "stage"));
  return v === null ? null : <Chip tone="Badge">{v}</Chip>;
};

export const COLUMNS: Record<TabKey, Column[]> = {
  diagnosis: [
    {
      label: "학습진단 긴급도",
      align: "center",
      render: (item) => {
        const u = URGENCY[str(get(item, "urgency")) ?? ""];
        return u ? <Chip tone={u.tone}>{u.label}</Chip> : null;
      },
    },
    nameColumn,
    { label: "학습 실행 역량", render: score("executionAvg") },
    { label: "학교생활 준비도", render: score("readinessAvg") },
    {
      label: "가장 시급한 영역",
      render: (item) => {
        const w = get(item, "weakest") as {
          name: string;
          score: number;
          status: string;
        } | null;
        return w ? `${w.name}(${w.score}점, ${w.status})` : null;
      },
    },
    { label: "진단일", align: "right", render: date("diagnosedAt") },
  ],
  goal: [
    nameColumn,
    {
      label: "주간 목표시간 달성율",
      align: "right",
      render: (item) => {
        const v = num(get(item, "weeklyRate"));
        return v === null ? null : <RateBar value={v} />;
      },
    },
    {
      label: "최소 목표시간 충족일",
      align: "right",
      render: (item) =>
        item.detail
          ? `${num(get(item, "minMetDays"))}일 / ${num(get(item, "minSetDays"))}일`
          : null,
    },
    {
      label: "연속 기록",
      align: "right",
      render: (item) =>
        num(get(item, "streakDays")) === null
          ? null
          : `${num(get(item, "streakDays"))}일`,
    },
    { label: "이상 목표대학/학과", render: (item) => target(item, "ideal") },
    {
      label: "이상 확률",
      align: "right",
      render: (item) => probability(item, "ideal"),
    },
    { label: "최소 목표대학/학과", render: (item) => target(item, "min") },
    {
      label: "최소 확률",
      align: "right",
      render: (item) => probability(item, "min"),
    },
  ],
  growth: [
    nameColumn,
    { label: "스토리 대주제", render: (item) => str(get(item, "storyTheme")) },
    {
      label: "학년별 스토리 수",
      render: (item) => {
        const by = get(item, "storiesByGrade") as
          { grade: string; count: number }[] | undefined;
        if (!by) return null;
        const total = by.reduce((sum, g) => sum + g.count, 0);
        return `${total}개(${by.map((g) => `${g.grade.slice(1)}학년 ${g.count}`).join(", ")})`;
      },
    },
  ],
  performance: [
    nameColumn,
    { label: "진행 단계", align: "center", render: stageChip },
    {
      label: "제출 건수",
      align: "right",
      render: (item) =>
        num(get(item, "submissionCount")) === null
          ? null
          : `${num(get(item, "submissionCount"))}건`,
    },
    {
      label: "피드백",
      align: "center",
      render: (item) => {
        const f = str(get(item, "feedback"));
        return f === "done" ? (
          <Chip tone="Info">완료</Chip>
        ) : f === "waiting" ? (
          <Chip tone="Neutral">대기중</Chip>
        ) : null;
      },
    },
    { label: "최근 제출일", align: "right", render: date("lastSubmittedAt") },
  ],
  "self-assessment": [
    nameColumn,
    { label: "진행 단계", align: "center", render: stageChip },
    { label: "진행률", align: "right", render: progress },
  ],
  research: [
    nameColumn,
    { label: "진행 상태", align: "center", render: stageChip },
    {
      label: "주제 확정 여부",
      align: "center",
      render: (item) => {
        const confirmed = get(item, "topicConfirmed");
        return typeof confirmed !== "boolean" ? null : confirmed ? (
          <Chip tone="Info">확정</Chip>
        ) : (
          <Chip tone="Neutral">미확정</Chip>
        );
      },
    },
    { label: "진행률", align: "right", render: progress },
  ],
};
