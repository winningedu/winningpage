import { describe, expect, it } from "vitest";
import type { ReportRow, SessionListRow, SessionRow } from "./rows.js";
import type { ActivityRecordLike, GrowthSnapshot } from "./types.js";
import {
  detailBody,
  entryBody,
  latestScores,
  listItem,
  parseReportsQuery,
} from "./view.js";

const NOW = new Date("2026-10-06T03:00:00Z");

function listRow(over: Partial<SessionListRow> = {}): SessionListRow {
  return {
    id: "s1",
    status: "in_progress",
    current_step: 3,
    academic_year: 2026,
    semester: 2,
    area: "subject",
    subject: "생명과학",
    activity_name: null,
    step_state: {},
    last_activity_at: "2026-10-05T00:00:00Z",
    completed_at: null,
    ...over,
  };
}

function session(over: Partial<SessionRow> = {}): SessionRow {
  return {
    id: "s1",
    profile_id: "u1",
    status: "in_progress",
    current_step: 4,
    academic_year: 2026,
    grade_label: "고2",
    semester: 2,
    area: "subject",
    subject: "생명과학",
    activity_name: null,
    school_prompt: "문항",
    teacher_note: null,
    target_chars: 500,
    target_chars_mode: "with_space",
    career: { career: null, department: null, universities: [] },
    growth_report_id: null,
    growth_applied: false,
    growth_snapshot: null,
    plan_item_id: null,
    reply_pending: null,
    regenerate_count: 1,
    step_state: {
      steps: {
        write: {
          status: "ok",
          attempts: 1,
          startedAt: null,
          finishedAt: null,
          issues: [],
        },
      },
    },
    ledger_id: null,
    ledger_reversed_at: null,
    last_activity_at: "2026-10-05T00:00:00Z",
    completed_at: null,
    created_at: "2026-10-01T00:00:00Z",
    ...over,
  };
}

function report(over: Partial<ReportRow> = {}): ReportRow {
  return {
    id: "r1",
    session_id: "s1",
    report_type: "generation",
    revision: 1,
    sections: { paragraphs: [] },
    char_count: { withSpace: 10, withoutSpace: 8 },
    score: null,
    mandatory_fixes: null,
    created_at: "2026-10-05T01:00:00Z",
    ...over,
  };
}

describe("listItem", () => {
  it("완료 세션은 점수와 완료 시각을 싣고 만료와 파기가 아니다", () => {
    const item = listItem(
      listRow({
        status: "completed",
        current_step: 6,
        completed_at: "2026-10-05T02:00:00Z",
      }),
      88,
    );
    expect(item).toMatchObject({
      id: "s1",
      status: "completed",
      currentStep: 6,
      academicYear: 2026,
      semester: 2,
      area: "subject",
      subject: "생명과학",
      score: 88,
      completedAt: "2026-10-05T02:00:00Z",
      expired: false,
      discarded: false,
      terminal: null,
    });
  });

  it("종결 사유 없는 archived 는 만료로 본다", () => {
    expect(listItem(listRow({ status: "archived" }), null)).toMatchObject({
      expired: true,
      discarded: false,
      terminal: null,
    });
  });

  it("terminal.reason 이 expired 면 만료, discarded 면 파기", () => {
    const at = "2026-10-05T00:00:00Z";
    const expired = listItem(
      listRow({
        status: "archived",
        step_state: { terminal: { reason: "expired", at, step: null } },
      }),
      null,
    );
    expect(expired).toMatchObject({
      expired: true,
      terminal: { reason: "expired", at },
    });
    const discarded = listItem(
      listRow({
        status: "archived",
        step_state: { terminal: { reason: "discarded", at, step: null } },
      }),
      null,
    );
    expect(discarded).toMatchObject({ expired: false, discarded: true });
  });

  it("모델 실패로 종결된 archived 는 만료도 파기도 아니다", () => {
    const item = listItem(
      listRow({
        status: "archived",
        step_state: {
          terminal: { reason: "attempts-exhausted", at: "x", step: "write" },
        },
      }),
      null,
    );
    expect(item).toMatchObject({ expired: false, discarded: false });
    expect(item.terminal?.reason).toBe("attempts-exhausted");
  });
});

const snapshot: GrowthSnapshot = {
  reportId: "g1",
  issuedAt: "2026-09-01T00:00:00Z",
  narrativeTheme: "테마",
  gradeSubthemes: [],
  stage: "seed",
  weakAxes: [],
  alignedSignals: [],
  conflictingSignals: [],
  planItems: [
    { id: "pi", title: "t", description: null, axis: null, category: null },
  ],
};

describe("entryBody", () => {
  const base = {
    quota: null,
    allowed: true,
    activityCount: 3,
    open: null,
    growth: null,
    now: NOW,
    profile: null,
    replyResent: 0,
  };

  it("열린 세션이 없으면 openSession null 과 학년도 기본값", () => {
    const body = entryBody(base);
    expect(body).toMatchObject({
      allowed: true,
      activityCount: 3,
      openSession: null,
      growth: null,
      profile: null,
      replyResent: 0,
      academicYearDefault: 2026,
    });
  });

  it("열린 세션은 이어 쓸 화면 route 를 싣는다", () => {
    const body = entryBody({ ...base, open: listRow({ current_step: 4 }) });
    expect(body.openSession).toEqual({
      id: "s1",
      status: "in_progress",
      currentStep: 4,
      route: "result",
      area: "subject",
      subject: "생명과학",
      activityName: null,
      lastActivityAt: "2026-10-05T00:00:00Z",
    });
  });

  it("성장설계는 오래됨 여부와 배너를 싣는다", () => {
    const fresh = entryBody({ ...base, growth: snapshot }).growth;
    expect(fresh).toMatchObject({
      reportId: "g1",
      issuedAt: "2026-09-01T00:00:00Z",
      stale: false,
      planItems: snapshot.planItems,
    });
    expect(fresh?.banner.theme).toBe("테마");
    const old = entryBody({
      ...base,
      growth: { ...snapshot, issuedAt: "2026-01-01T00:00:00Z" },
    }).growth;
    expect(old?.stale).toBe(true);
  });

  it("프로필은 학년, 학기, 진로 정보로 줄인다", () => {
    const body = entryBody({
      ...base,
      profile: {
        grade: "고2",
        semester: 1,
        career: "의사",
        department: "의예과",
        universities: ["가대"],
      },
    });
    expect(body.profile).toEqual({
      gradeLabel: "고2",
      semester: 1,
      career: "의사",
      department: "의예과",
      universities: ["가대"],
    });
    const odd = entryBody({
      ...base,
      profile: {
        grade: "3",
        semester: 3,
        career: null,
        department: null,
        universities: [],
      },
    });
    expect(odd.profile).toMatchObject({ gradeLabel: null, semester: null });
  });
});

describe("detailBody", () => {
  const record = { id: "a1" } as ActivityRecordLike;
  const act = {
    activity_record_id: "a1",
    role: "core" as const,
    fit_score: 70,
    fit_reasons: { signals: [], reasons: [] },
    analysis: null,
    analysis_source: null,
    record,
  };

  it("세션, 활동, 남은 재생성 횟수를 싣는다", () => {
    const body = detailBody(session(), [act], []);
    expect(body.session).toMatchObject({
      id: "s1",
      currentStep: 4,
      academicYear: 2026,
      gradeLabel: "고2",
      regenerateCount: 1,
      schoolPrompt: "문항",
      terminal: null,
    });
    expect(body.session.progress.map((p) => p.step)).toEqual([
      "analyze",
      "write",
      "verify",
    ]);
    expect(body.regenerationsLeft).toBe(2);
    expect(body.activities).toEqual([
      {
        activityRecordId: "a1",
        role: "core",
        fitScore: 70,
        fitReasons: { signals: [], reasons: [] },
        analysis: null,
        analysisSource: null,
        record,
      },
    ]);
    expect(body.reports).toEqual({
      generation: null,
      edited: null,
      verification: null,
      final: null,
    });
    expect(body.current).toBeNull();
  });

  it("유형마다 revision 이 가장 큰 리포트를 고른다", () => {
    const body = detailBody(
      session(),
      [],
      [
        report({ id: "g1", revision: 1 }),
        report({ id: "g2", revision: 2 }),
        report({
          id: "v1",
          report_type: "verification",
          revision: 1,
          score: 77,
          mandatory_fixes: [],
        }),
      ],
    );
    expect(body.reports.generation?.id).toBe("g2");
    expect(body.reports.verification).toMatchObject({
      id: "v1",
      score: 77,
      charCount: { withSpace: 10, withoutSpace: 8 },
      mandatoryFixes: [],
      createdAt: "2026-10-05T01:00:00Z",
    });
  });

  it("current 는 생성본 뒤에 만든 편집본이 있으면 편집본, 아니면 생성본", () => {
    const edited = report({
      id: "e1",
      report_type: "edited",
      created_at: "2026-10-05T02:00:00Z",
    });
    const gen = report({ id: "g1", created_at: "2026-10-05T01:00:00Z" });
    expect(detailBody(session(), [], [gen, edited]).current?.id).toBe("e1");
    expect(detailBody(session(), [], [gen]).current?.id).toBe("g1");
    // 편집 뒤에 다시 생성하면 새 생성본이 편집본을 대체한다.
    const regen = report({
      id: "g2",
      revision: 2,
      created_at: "2026-10-05T03:00:00Z",
    });
    expect(detailBody(session(), [], [gen, edited, regen]).current?.id).toBe(
      "g2",
    );
  });

  it("종결 사유와 회신 대기를 싣는다", () => {
    const body = detailBody(
      session({
        status: "archived",
        step_state: { terminal: { reason: "discarded", at: "t", step: null } },
        reply_pending: {
          itemId: "i",
          refId: "r",
          failedAt: "f",
          lastError: "e",
        },
      }),
      [],
      [],
    );
    expect(body.session.terminal).toEqual({
      reason: "discarded",
      at: "t",
      step: null,
    });
    expect(body.session.replyPending).not.toBeNull();
  });
});

describe("parseReportsQuery", () => {
  const id = "123e4567-e89b-12d3-a456-426614174000";
  it("쿼리가 없으면 목록", () => {
    expect(parseReportsQuery({})).toEqual({ ok: true });
  });
  it("sessionId 가 uuid 면 상세", () => {
    expect(parseReportsQuery({ sessionId: id })).toEqual({
      ok: true,
      sessionId: id,
    });
  });
  it("uuid 가 아니거나 배열이면 거절", () => {
    expect(parseReportsQuery({ sessionId: "x" })).toMatchObject({ ok: false });
    expect(parseReportsQuery({ sessionId: [id, id] })).toMatchObject({
      ok: false,
    });
  });
});

describe("latestScores", () => {
  const row = (
    session_id: string,
    report_type: "final" | "verification",
    revision: number,
    score: number | null,
  ) => ({ session_id, report_type, revision, score });

  it("final 이 있으면 final, 없으면 verification 의 최신 revision 점수", () => {
    const map = latestScores([
      row("a", "verification", 1, 60),
      row("a", "verification", 2, 70),
      row("a", "final", 1, 75),
      row("b", "verification", 1, 55),
      row("b", "verification", 3, 65),
    ]);
    expect(map.get("a")).toBe(75);
    expect(map.get("b")).toBe(65);
    expect(map.get("c")).toBeUndefined();
  });
});
