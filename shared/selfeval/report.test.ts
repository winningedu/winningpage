// 자기평가서 리포트 계약: 쿼리, 본문, 응답 스키마.

import { describe, expect, test } from "vitest";
import {
  reportBody,
  reportPayloadSchema,
  reportQuery,
  reportResponseSchema,
  reportViewSchema,
} from "./report.js";

const ID = "123e4567-e89b-12d3-a456-426614174000";

const sentence = { n: 1, text: "측정했다.", tags: ["P1"], needsConfirm: false };

const payload = {
  version: 1,
  cover: {
    gradeLabel: "고등학교 1학년",
    savedAt: "2026. 11. 23",
    subjectTitle: "수학 자기평가서",
    academicYear: 2026,
    steps: {
      diagnosis: true,
      goal: false,
      growth: true,
      performance: true,
      inquiry: false,
      selfeval: true,
    },
  },
  ch01: {
    paragraphs: [{ sentences: [sentence] }],
    charCount: { withSpace: 5, withoutSpace: 4 },
    targetChars: 500,
    targetCharsMode: "with_space",
    diffPercent: -99.0,
    paragraphCount: 1,
    sentenceCount: 1,
  },
  ch02: {
    subjects: [
      {
        subject: "수학",
        label: "수학 (공통수학1)",
        writing: true,
        counts: { performance: 1, deep: 0, activity: 0 },
        inProgress: { performance: 0, deep: 0, activity: 0 },
        reflectedSentenceCount: 1,
        rows: [
          {
            tag: "P1",
            recordId: "r1",
            kind: "performance",
            title: "함수 보고서",
            submittedOn: "2026.10.01",
            inProgress: false,
            summary: null,
            sentenceNumbers: [1],
            role: "core",
            roleLabel: "핵심",
            dots: 5,
            reasonCode: null,
            reasonLabel: null,
            reasonText: null,
            recommendation: null,
          },
        ],
      },
    ],
  },
  ch03: {
    rows: [
      {
        tag: "D1",
        recordId: "r2",
        kind: "deep",
        title: null,
        subject: null,
        submittedOn: null,
        role: "support",
        relation: "deepen",
        relationLabel: "심화",
        strengthLabel: null,
        sentenceNumbers: [1],
        explanation: null,
      },
    ],
  },
  ch04: null,
  ch05: {
    counts: {
      completedReports: 1,
      subjectCount: 1,
      reflectedReports: 1,
      reflectedMemos: 0,
      linkedSubjects: ["수학"],
    },
    cards: {
      diagnosis: { state: "ok", text: "진단", date: "2026.09.01" },
      goal: { state: "none", text: null, date: null },
      growth: { state: "error", text: null, date: null },
      performance: {
        items: [{ tag: "P1", subject: "수학" }],
        inProgressTags: [],
      },
      inquiry: { items: [], inProgressTags: [] },
      selfeval: { total: 1, linked: 1, allLinked: true, text: "이어졌다" },
    },
    nextSteps: [{ key: "memo_detail", tag: "H1", text: null }],
  },
  composeMissing: false,
  composePartial: false,
};

const view = {
  sessionId: ID,
  finalRevision: 1,
  status: "ready",
  attempts: 1,
  builtAt: "2026-11-23T00:00:00.000Z",
  payload,
};

describe("reportPayloadSchema", () => {
  test("표지와 01~05장을 담은 payload 를 읽는다", () => {
    expect(reportPayloadSchema.parse(payload)).toEqual(payload);
  });

  test("수기 메모가 있으면 04장을 읽는다", () => {
    const ch04 = {
      rows: [
        {
          tag: "H1",
          logId: "l1",
          writtenOn: "2026.05.03",
          text: "메모",
          sentenceNumbers: [1],
          reflected: true,
          explanation: null,
          reasonLabel: null,
        },
      ],
      reflectedCount: 1,
      totalCount: 1,
      sentenceTotal: 1,
      sentenceNumbers: [1],
      summary: "요약",
    };
    expect(reportPayloadSchema.parse({ ...payload, ch04 }).ch04).toEqual(ch04);
  });

  test("장이 빠지거나 모양이 틀리면 거절한다", () => {
    const { ch01: _ch01, ...noCh01 } = payload;
    expect(reportPayloadSchema.safeParse(noCh01).success).toBe(false);
    expect(
      reportPayloadSchema.safeParse({ ...payload, version: 2 }).success,
    ).toBe(false);
    const badRole = structuredClone(payload);
    (badRole.ch02.subjects[0]?.rows[0] as { role: string }).role = "boss";
    expect(reportPayloadSchema.safeParse(badRole).success).toBe(false);
    const badStep = structuredClone(payload);
    (badStep.ch05.nextSteps[0] as { key: string }).key = "x";
    expect(reportPayloadSchema.safeParse(badStep).success).toBe(false);
  });
});

describe("reportQuery, reportBody", () => {
  test("sessionId 가 uuid 면 받는다", () => {
    expect(reportQuery.parse({ sessionId: ID })).toEqual({ sessionId: ID });
    expect(reportBody.parse({ sessionId: ID })).toEqual({ sessionId: ID });
  });

  test("없거나 uuid 가 아니거나 배열이면 거절한다", () => {
    for (const schema of [reportQuery, reportBody]) {
      expect(schema.safeParse({}).success).toBe(false);
      expect(schema.safeParse({ sessionId: "x" }).success).toBe(false);
      expect(schema.safeParse({ sessionId: [ID, ID] }).success).toBe(false);
    }
  });
});

describe("reportViewSchema", () => {
  test("ready 리포트와 payload 가 없는 failed 리포트를 받는다", () => {
    expect(reportViewSchema.parse(view)).toEqual(view);
    const failed = { ...view, status: "failed", payload: null };
    expect(reportViewSchema.parse(failed)).toEqual(failed);
  });

  test("모르는 상태와 payload 가 빠진 본문은 거절한다", () => {
    expect(reportViewSchema.safeParse({ ...view, status: "x" }).success).toBe(
      false,
    );
    const { payload: _p, ...rest } = view;
    expect(reportViewSchema.safeParse(rest).success).toBe(false);
  });
});

describe("reportResponseSchema", () => {
  test("ok 필드 없이 report 와 선택 reused 를 받는다", () => {
    expect(reportResponseSchema.parse({ report: view })).toEqual({
      report: view,
    });
    expect(reportResponseSchema.parse({ reused: true, report: view })).toEqual({
      reused: true,
      report: view,
    });
  });
});
