import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import type { ReportRow, SessionListRow, SessionRow } from "./rows.js";
import type { ActivityRecordLike, GrowthSnapshot } from "./types.js";
import { detailBody, entryBody, latestScores, listItem } from "./view.js";

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

const VERIFICATION_SECTIONS = {
  items: [],
  total: 77,
  format: [],
  mandatoryFixes: [],
  submittable: true,
  improvements: [],
  excluded: [],
  growthFit: null,
  charCount: { withSpace: 10, withoutSpace: 8 },
  sentenceCount: 1,
  clicheDensity: 0,
  clicheHits: [],
  numberCount: 0,
};

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
    timeZone: "Asia/Seoul",
  };

  it("학년도 기본값은 보는 회원의 시간대 3월 1일 기준이다", () => {
    const now = new Date("2026-02-28T20:00:00Z");
    expect(
      entryBody({ ...base, now, timeZone: "Asia/Seoul" }).academicYearDefault,
    ).toBe(2026);
    expect(
      entryBody({ ...base, now, timeZone: "UTC" }).academicYearDefault,
    ).toBe(2025);
  });

  it("회원 시간대를 응답에 실어 화면이 같은 날짜 기준을 쓰게 한다", () => {
    expect(entryBody({ ...base, timeZone: "America/Chicago" }).timeZone).toBe(
      "America/Chicago",
    );
  });

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

  it("기관 거부 사유가 있으면 tenantReason 을 싣고, 없으면 키가 없다", () => {
    expect(entryBody({ ...base, tenantReason: "term_cap" })).toMatchObject({
      tenantReason: "term_cap",
    });
    expect(Object.keys(entryBody(base))).not.toContain("tenantReason");
    expect(
      Object.keys(entryBody({ ...base, tenantReason: null })),
    ).not.toContain("tenantReason");
  });

  it("진입 거부 사유가 없으면 한도 소진 사유를 tenantReason 으로 싣는다", () => {
    expect(
      entryBody({ ...base, tenantReason: null, capReason: "month_cap" }),
    ).toMatchObject({ tenantReason: "month_cap" });
    expect(
      entryBody({ ...base, tenantReason: "grace", capReason: "month_cap" }),
    ).toMatchObject({ tenantReason: "grace" });
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

describe("detailBody career", () => {
  it("DB 기본값 빈 진로 객체는 계약 모양으로 내보낸다", () => {
    const body = detailBody(session({ career: {} }), [], []);
    expect(body.session.career).toEqual({
      career: null,
      department: null,
      universities: [],
    });
  });
});

describe("detailBody 저장된 리포트 읽기", () => {
  it("본문 jsonb 가 계약 모양이 아니면 보내지 않고 던진다", () => {
    const broken = report({
      sections: { paragraphs: [{ sentences: [{ id: "s1" }] }] },
    });
    expect(() => detailBody(session(), [], [broken])).toThrow(ZodError);
  });

  it("글자 수 jsonb 가 계약 모양이 아니면 던진다", () => {
    const broken = report({ char_count: { withSpace: "많음" } });
    expect(() => detailBody(session(), [], [broken])).toThrow(ZodError);
  });

  it("검증 리포트의 sections 와 필수 수정을 계약 모양으로 읽는다", () => {
    const fix = { key: "cliche", message: "상투어", detail: null };
    const row = report({
      report_type: "verification",
      sections: { ...VERIFICATION_SECTIONS, mandatoryFixes: [fix] },
      score: 77,
      mandatory_fixes: [fix],
    });
    const body = detailBody(session(), [], [row]);
    expect(body.reports.verification?.sections.total).toBe(77);
    expect(body.reports.verification?.mandatoryFixes).toEqual([fix]);
  });

  it("활동의 분석 jsonb 가 계약 모양이 아니면 던진다", () => {
    const act = {
      activity_record_id: "a1",
      role: "core" as const,
      fit_score: 70,
      fit_reasons: null,
      analysis: { values: "깨짐" },
      analysis_source: "model" as const,
      record: { id: "a1" } as ActivityRecordLike,
    };
    expect(() => detailBody(session(), [act], [])).toThrow(ZodError);
  });

  it("활동의 분석 jsonb 를 계약 모양으로 읽는다", () => {
    const fields = [
      "motive",
      "concept",
      "action",
      "method",
      "result",
      "role",
      "collaboration",
      "learning",
      "career",
      "limitation",
      "next",
    ] as const;
    const analysis = {
      values: Object.fromEntries(fields.map((f) => [f, "값"])),
      sources: Object.fromEntries(fields.map((f) => [f, "record"])),
      conflicts: [],
    };
    const act = {
      activity_record_id: "a1",
      role: "core" as const,
      fit_score: 70,
      fit_reasons: null,
      analysis,
      analysis_source: "model" as const,
      record: { id: "a1" } as ActivityRecordLike,
    };
    expect(detailBody(session(), [act], []).activities[0]?.analysis).toEqual(
      analysis,
    );
  });

  it("검증 리포트의 sections 가 본문 모양이면 던진다", () => {
    const row = report({ report_type: "verification", score: 70 });
    expect(() => detailBody(session(), [], [row])).toThrow(ZodError);
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

  it("옛 근거 모양의 본문은 배열로 맞춰 돌려주고 출처 유형은 선택 기록에서 찾는다", () => {
    const legacy = {
      paragraphs: [
        {
          sentences: [
            {
              id: "p1-s1",
              text: "가함.",
              evidence: { activityId: "a1", field: "method" },
              feeling: false,
              confirmed: false,
            },
            {
              id: "p1-s2",
              text: "나함.",
              evidence: { student: true },
              feeling: false,
              confirmed: false,
            },
            {
              id: "p1-s3",
              text: "다함.",
              evidence: null,
              feeling: true,
              confirmed: false,
            },
          ],
        },
      ],
    };
    const deep = {
      id: "a1",
      sourceProgram: "deep",
      subjectGroup: "교과",
    } as ActivityRecordLike;
    const body = detailBody(
      session(),
      [{ ...act, record: deep }],
      [report({ id: "g1", revision: 1, sections: legacy })],
    );
    const sections = body.reports.generation?.sections as unknown as
      | { paragraphs: { sentences: { evidence: unknown[] }[] }[] }
      | undefined;
    const sentences = sections?.paragraphs[0]?.sentences;
    expect(sentences?.[0]?.evidence).toEqual([
      { sourceType: "D", refId: "a1", item: "method", weight: "main" },
    ]);
    expect(sentences?.[1]?.evidence).toEqual([
      { sourceType: "S", refId: null, item: "student_input", weight: "main" },
    ]);
    expect(sentences?.[2]?.evidence).toEqual([]);
  });

  it("확인하고 포함한 수기 메모 목록을 싣는다", () => {
    const body = detailBody(
      session(),
      [],
      [],
      [{ id: "m1", writtenAt: "2026-05-03", text: "메모" }],
    );
    expect(body.memos).toEqual([
      { id: "m1", writtenAt: "2026-05-03", text: "메모" },
    ]);
    expect(detailBody(session(), [], []).memos).toEqual([]);
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
          sections: VERIFICATION_SECTIONS,
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
