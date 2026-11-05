// W9a 서비스 상세 창의 내용. 서비스마다 모양을 맞춰 화면이 한 가지로 그린다.
// 지표(metrics), 표(table), 상담 포인트(points)만 쓰고, 없는 자료는 그 칸을 만들지 않는다.

import { AXIS_NAMES } from "../growth/axes.js";
import type { GoalDay } from "./goalRate.js";
import {
  EXECUTION_AREAS,
  indicatorsOf,
  READINESS_AREAS,
  urgencyOf,
} from "./coaching.js";
import type { buildCoaching } from "./coachingBuild.js";
import { AREA_NAME, areaState } from "./coachingText.js";
import type { ServiceKey } from "./serviceUsage.js";

export interface ServiceDetail {
  service: ServiceKey;
  title: string;
  metrics: { label: string; value: string }[];
  table: { heading: string; columns: string[]; rows: string[][] } | null;
  points: string[];
}

type Built = Awaited<ReturnType<typeof buildCoaching>>;

const WEEKDAY = {
  mon: "월",
  tue: "화",
  wed: "수",
  thu: "목",
  fri: "금",
  sat: "토",
  sun: "일",
} as const;
const URGENCY = {
  low: "낮음",
  normal: "보통",
  high: "높음",
  very_high: "매우 높음",
};
const CURVE = {
  rising: "상승곡선",
  flat: "유지",
  falling: "하향곡선",
  not_judgeable: "판정 불가",
};
const FIT = { fit: "맞음", normal: "보통", off: "어긋남" };
const VERDICT = { confirmed: "확인됨", caution: "주의", none: "아직 없음" };

/** 시간(소수)을 "5시간 30분" 모양으로. */
export function hoursText(hours: number): string {
  const total = Math.round(hours * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}분`;
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
}

const md = (date: string) => `${date.slice(5, 7)}.${date.slice(8, 10)}`;

function dayRow(d: GoalDay): string[] {
  if (d.weekday === "sun" || d.ideal === 0) {
    return [
      md(d.date),
      WEEKDAY[d.weekday],
      "목표 없음",
      "",
      hoursText(d.actual),
      "",
      "주간 달성율에 가산",
    ];
  }
  return [
    md(d.date),
    WEEKDAY[d.weekday],
    hoursText(d.ideal),
    hoursText(d.min),
    hoursText(d.actual),
    `${Math.round((d.actual / d.ideal) * 100)}%`,
    d.actual >= d.min ? "충족" : "못 지킴",
  ];
}

export function serviceDetail(
  service: ServiceKey,
  built: Built,
): ServiceDetail | null {
  const { data, text } = built;
  const m = data.metrics;
  const base = { service, table: null, points: [] as string[] };
  switch (service) {
    case "goal": {
      const g = data.goalFacts;
      if (!g) return null;
      const a = g.week.achievementPct;
      const last = g.lastWeek?.achievementPct;
      const targets = data.targets;
      return {
        ...base,
        title: "목표관리 상세",
        metrics: [
          ...(a !== null
            ? [
                {
                  label: `이번 주 목표시간 달성율${last != null ? ` (지난주 ${Math.round(last)}%)` : ""}`,
                  value: `${Math.round(a)}%`,
                },
              ]
            : []),
          {
            label: "최소 목표시간 충족",
            value: `${g.week.metDays}일 / ${g.week.setDays}일`,
          },
          { label: "연속 기록", value: `${g.streak}일` },
          ...(targets?.ideal
            ? [
                {
                  label: "이상 목표대학",
                  value: `${targets.ideal.university} ${targets.ideal.department}`,
                },
              ]
            : []),
          ...(targets?.min
            ? [
                {
                  label: "최소 목표대학",
                  value: `${targets.min.university} ${targets.min.department}`,
                },
              ]
            : []),
        ],
        table: {
          heading: "최근 14일 일별 기록, 최근 날짜부터, 일요일은 목표 없음",
          columns: [
            "날짜",
            "요일",
            "이상",
            "최소",
            "실제",
            "일별 달성율",
            "최소 충족",
          ],
          rows: [...g.days, ...(g.previousDays ?? [])].map(dayRow),
        },
        points: text.goalOpinion ? [text.goalOpinion.summary] : [],
      };
    }
    case "diagnosis": {
      const dx = m.diagnosis;
      if (!dx) return null;
      const ind = indicatorsOf(m);
      const areas = [...EXECUTION_AREAS, ...READINESS_AREAS];
      return {
        ...base,
        title: "학습진단 상세",
        metrics: [
          { label: "긴급도", value: URGENCY[urgencyOf(dx.areas)] },
          {
            label: "학습 실행 역량",
            value: `${Math.round(ind.dxExecution.score as number)}점`,
          },
        ],
        table: {
          heading: "12개 영역",
          columns: ["영역", "점수", "상태"],
          rows: areas.map((c) => [
            AREA_NAME[c],
            `${dx.areas[c]}점`,
            areaState(c, dx.areas[c]),
          ]),
        },
        points: [],
      };
    }
    case "growth": {
      if (!m.growth) return null;
      const axes = Object.entries(m.growth.axes).filter(
        ([, v]) => v !== null,
      ) as [
        keyof typeof AXIS_NAMES,
        NonNullable<(typeof m.growth.axes)["A"]>,
      ][];
      return {
        ...base,
        title: "성장설계 상세",
        metrics: [
          ...(data.growthKeywords[0]
            ? [{ label: "스토리 주제", value: data.growthKeywords[0] }]
            : []),
          ...(m.growth.curve
            ? [{ label: "성적 곡선", value: CURVE[m.growth.curve] }]
            : []),
        ],
        table: axes.length
          ? {
              heading: "5축 판정",
              columns: ["축", "판정", "기록 / 필요"],
              rows: axes.map(([k, v]) => [
                AXIS_NAMES[k],
                VERDICT[v.verdict],
                `${v.count} / ${v.required}`,
              ]),
            }
          : null,
        points: [],
      };
    }
    case "performance": {
      if (!m.performance) return null;
      return {
        ...base,
        title: "수행평가 상세",
        metrics: [
          { label: "제출", value: `${m.performance.tasks}건` },
          { label: "피드백 완료", value: `${m.performance.feedbackDone}건` },
          ...(m.performance.avgScore !== null
            ? [
                {
                  label: "평가 점수 평균",
                  value: `${Math.round(m.performance.avgScore)}점`,
                },
              ]
            : []),
        ],
        table: data.performanceTasks.length
          ? {
              heading: "수행평가 목록",
              columns: ["과목", "제목", "상태", "점수"],
              rows: data.performanceTasks.map((t) => [
                t.subject ?? "",
                t.title ?? "",
                t.done ? "피드백 완료" : "피드백 대기",
                t.score !== null ? `${Math.round(t.score)}점` : "",
              ]),
            }
          : null,
        points: [],
      };
    }
    case "selfeval": {
      if (!m.selfeval) return null;
      return {
        ...base,
        title: "자기평가 상세",
        metrics: [
          {
            label: "검증 결과",
            value:
              m.selfeval.verifyScore !== null
                ? `${Math.round(m.selfeval.verifyScore)}점`
                : "검증 전",
          },
        ],
      };
    }
    case "inquiry": {
      if (!m.inquiry) return null;
      return {
        ...base,
        title: "심화탐구 상세",
        metrics: [
          { label: "탐구 주제", value: data.inquiryTopic ?? "주제 탐색중" },
          ...(m.inquiry.topicFit
            ? [{ label: "주제 적합도", value: FIT[m.inquiry.topicFit] }]
            : []),
          {
            label: "평가 점수",
            value:
              m.inquiry.reportScore !== null
                ? `${Math.round(m.inquiry.reportScore)}점`
                : "평가 전",
          },
        ],
      };
    }
  }
}
