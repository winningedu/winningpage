// api/cron/daily-report.ts · weekly-report.ts · monthly-report.ts 의 인라인
// dedupeKey·variables 조립 로직을 goalReportSend.ts 로 뽑아낸 리팩토링의 회귀
// 고정 테스트다. 아래 리터럴 기대값은 리팩토링 *전* 크론 인라인 코드가 실제로
// 만들던 문자열/객체를 그대로 옮긴 것이다 — 여기서 한 글자라도 달라지면
// alimtalk_send_logs.dedupe_key 포맷이 바뀌어 크론이 중복 발송하거나 학부모
// 문자 문구가 달라진다.
//
// loadXReportInputs는 supabase 응답을 흉내 낸 최소 fake로 검증한다 — 실제
// aligo 발송(sendAndLog)은 vi.mock으로 대체해 네트워크를 타지 않는다. 학생
// 수와 무관하게 조회 쿼리 수가 고정됨(N+1 아님)을 .from() 호출 횟수로 고정한다.

import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("./alimtalkSend.js", () => ({
  sendAndLog: vi.fn(),
}));

import { sendAndLog } from "./alimtalkSend.js";
import {
  buildDailyReportDedupeKey,
  buildDailyReportVariables,
  buildMonthlyReportDedupeKey,
  buildMonthlyReportVariables,
  buildWeeklyReportDedupeKey,
  buildWeeklyReportVariables,
  loadDailyReportInputs,
  loadMonthlyReportInputs,
  loadWeeklyReportInputs,
  sendDailyReport,
  sendMonthlyReport,
  sendWeeklyReport,
} from "./goalReportSend.js";

const sendAndLogMock = vi.mocked(sendAndLog);

type FakeTableConfig = {
  rows?: unknown[];
  single?: unknown;
  error?: { message: string };
};

// 여러 테이블을 흉내 내는 최소 fake. 실제 필터(.eq/.in 등)는 검증하지 않고
// 테이블별로 미리 정해둔 응답만 돌려준다 — 이 모듈이 조회 결과를 어떻게
// "쓰는지"(변수 조립·발송 호출)를 보는 것이 목적이지, supabase 쿼리 자체의
// 정확성을 보는 것이 아니다(그건 각 테이블 RLS/스키마의 몫). onFrom이 있으면
// .from(table) 호출마다 테이블명을 기록한다 — 조회 횟수 고정을 검증할 때 쓴다.
function fakeSupabase(
  tableData: Record<string, FakeTableConfig>,
  onFrom?: (table: string) => void,
): SupabaseClient {
  const from = (table: string) => {
    onFrom?.(table);
    const cfg = tableData[table] || {};
    const builder: Record<string, unknown> = {};
    const chain = () => builder;
    builder.select = chain;
    builder.eq = chain;
    builder.in = chain;
    builder.gte = chain;
    builder.lte = chain;
    builder.order = chain;
    builder.maybeSingle = async () => ({
      data: cfg.single ?? null,
      error: null,
    });
    // biome-ignore lint/suspicious/noThenProperty: supabase 쿼리 빌더 자체가 thenable이다(await만으로 실행) — 이 fake는 그 계약을 그대로 흉내 낸다.
    builder.then = (
      resolve: (value: {
        data: unknown[] | null;
        error: { message: string } | null;
      }) => unknown,
      reject?: (reason: unknown) => unknown,
    ) =>
      Promise.resolve({
        data: cfg.error ? null : (cfg.rows ?? []),
        error: cfg.error ?? null,
      }).then(resolve, reject);
    return builder;
  };
  return { from } as unknown as SupabaseClient;
}

const PARENT_1 = {
  parent_child_links: {
    rows: [{ parent_id: "parent-1", student_id: "student-1" }],
  },
  profiles: {
    rows: [
      { id: "parent-1", name: "학부모1", phone: "01011112222" },
      { id: "student-1", name: "김유나", phone: null },
    ],
  },
};

beforeEach(() => {
  sendAndLogMock.mockReset();
  sendAndLogMock.mockResolvedValue({ status: "sent", logId: 1 });
});

describe("buildDailyReportDedupeKey — 회귀 고정", () => {
  test("suffix 없으면 크론 원본 포맷 그대로", () => {
    expect(
      buildDailyReportDedupeKey("parent-1", "student-1", "2026-09-10"),
    ).toBe("dailyReport:parent-1:student-1:2026-09-10");
  });

  test("suffix가 있으면 뒤에 콜론으로 이어붙인다(관리자 재발송용)", () => {
    expect(
      buildDailyReportDedupeKey(
        "parent-1",
        "student-1",
        "2026-09-10",
        "resend:1735689600000",
      ),
    ).toBe("dailyReport:parent-1:student-1:2026-09-10:resend:1735689600000");
  });
});

describe("buildDailyReportVariables — 회귀 고정", () => {
  test("기록이 있을 때 크론 원본과 동일한 변수 객체", () => {
    const variables = buildDailyReportVariables({
      studentName: "김유나",
      date: "2026-09-10",
      record: {
        study_hours: 3.5,
        target_ideal_hours: 4,
        target_min_hours: 2,
        tasks: ["concept", "mockExam"],
        body_condition: "great",
        memo: "오늘 집중 잘 됐어요",
      },
      plan: { total: 5, done: 3 },
    });

    expect(variables).toEqual({
      학생명: "김유나",
      월: "9",
      일: "10",
      이상목표시간: "4시간",
      최소목표시간: "2시간",
      실제학습시간: "3시간 30분",
      이상달성률: "88",
      최소달성률: "175",
      오늘완료내용: "개념 학습, 기출/모의고사",
      전체계획수: "5",
      달성계획수: "3",
      오늘컨디션: "아주 좋음",
      학생한마디: "오늘 집중 잘 됐어요",
    });
  });

  test("기록이 없을 때(관리자 안내용) 크론의 기본값 문구를 그대로 쓴다", () => {
    const variables = buildDailyReportVariables({
      studentName: "박민수",
      date: "2026-01-05",
      record: null,
      plan: { total: 0, done: 0 },
    });

    expect(variables).toEqual({
      학생명: "박민수",
      월: "1",
      일: "5",
      이상목표시간: "0분",
      최소목표시간: "0분",
      실제학습시간: "0분",
      이상달성률: "0",
      최소달성률: "0",
      오늘완료내용: "기록된 완료 항목이 없습니다.",
      전체계획수: "0",
      달성계획수: "0",
      오늘컨디션: "기록 없음",
      학생한마디: "오늘도 수고했습니다.",
    });
  });
});

describe("loadDailyReportInputs — 조회", () => {
  test("studentIds가 null이면 그 날짜에 기록이 있는 학생을 스스로 찾는다", async () => {
    const supabaseAdmin = fakeSupabase({
      goal_daily_records: {
        rows: [
          { profile_id: "student-1", study_hours: 3.5 },
          { profile_id: "student-2", study_hours: 1 },
        ],
      },
      goal_plan_tasks: { rows: [] },
      ...PARENT_1,
    });

    const inputs = await loadDailyReportInputs(
      supabaseAdmin,
      null,
      "2026-09-10",
    );

    expect(Array.from(inputs.keys()).sort()).toEqual([
      "student-1",
      "student-2",
    ]);
    expect(inputs.get("student-1")?.record?.study_hours).toBe(3.5);
    // student-2는 profiles/parent_child_links fake에 없으므로 수신자가 비어 있다.
    expect(inputs.get("student-2")?.recipients).toEqual([]);
  });

  test("studentIds를 명시하면(관리자 재발송) 기록이 없어도 항목을 만든다(record:null)", async () => {
    const supabaseAdmin = fakeSupabase({
      goal_daily_records: { rows: [] },
      goal_plan_tasks: { rows: [] },
      ...PARENT_1,
    });

    const inputs = await loadDailyReportInputs(
      supabaseAdmin,
      ["student-1"],
      "2026-09-10",
    );

    expect(inputs.size).toBe(1);
    const input = inputs.get("student-1");
    expect(input?.record).toBeNull();
    expect(input?.recipients).toHaveLength(1);
  });

  test("studentIds 배열 크기와 무관하게 .from() 호출 횟수가 고정된다", async () => {
    // parent_child_links가 비어 있으면 resolveParentRecipients가 profiles 조회를
    // 건너뛴다(정상 최적화) — 4개 전부를 재는 실측치를 얻으려면 학부모 연결이
    // 실제로 있는 데이터를 준다.
    const tables = {
      goal_daily_records: { rows: [] },
      goal_plan_tasks: { rows: [] },
      ...PARENT_1,
    };

    const calls1: string[] = [];
    await loadDailyReportInputs(
      fakeSupabase(tables, (table) => calls1.push(table)),
      ["student-1"],
      "2026-09-10",
    );

    const calls5: string[] = [];
    await loadDailyReportInputs(
      fakeSupabase(tables, (table) => calls5.push(table)),
      ["student-1", "student-2", "student-3", "student-4", "student-5"],
      "2026-09-10",
    );

    expect(calls5.length).toBe(calls1.length);
    // goal_daily_records, goal_plan_tasks, parent_child_links, profiles — 4개 고정.
    expect(calls1.length).toBe(4);
  });

  test("기록 조회 자체가 실패하면 던진다(원본이 500으로 끊던 지점)", async () => {
    const supabaseAdmin = fakeSupabase({
      goal_daily_records: { error: { message: "connection reset" } },
    });

    await expect(
      loadDailyReportInputs(supabaseAdmin, null, "2026-09-10"),
    ).rejects.toThrow("goal_daily_records 조회 실패");
  });
});

describe("sendDailyReport — 발송(DB 조회 없이 입력만 사용)", () => {
  test("수신자가 없으면 noParent:true 로 즉시 종료한다(발송 시도 없음)", async () => {
    const supabaseAdmin = fakeSupabase({});

    const result = await sendDailyReport(supabaseAdmin, {
      studentProfileId: "student-1",
      date: "2026-09-10",
      record: null,
      plan: { total: 0, done: 0 },
      recipients: [],
    });

    expect(result).toEqual({
      studentProfileId: "student-1",
      noParent: true,
      outcomes: [],
    });
    expect(sendAndLogMock).not.toHaveBeenCalled();
  });

  test("입력에 실려 온 기록·수신자로 dedupeKey·variables를 조립해 sendAndLog를 부른다", async () => {
    const supabaseAdmin = fakeSupabase({});

    const result = await sendDailyReport(
      supabaseAdmin,
      {
        studentProfileId: "student-1",
        date: "2026-09-10",
        record: {
          study_hours: 3.5,
          target_ideal_hours: 4,
          target_min_hours: 2,
          tasks: ["concept"],
          body_condition: "great",
          memo: null,
        },
        plan: { total: 2, done: 1 },
        recipients: [
          {
            studentProfileId: "student-1",
            studentName: "김유나",
            parentProfileId: "parent-1",
            parentPhone: "01011112222",
          },
        ],
      },
      { dedupeSuffix: "resend:1000" },
    );

    expect(sendAndLogMock).toHaveBeenCalledTimes(1);
    const args = sendAndLogMock.mock.calls[0];
    if (!args) throw new Error("sendAndLog가 호출되지 않았어요.");
    const call = args[0];
    expect(call.dedupeKey).toBe(
      "dailyReport:parent-1:student-1:2026-09-10:resend:1000",
    );
    expect(call.templateKey).toBe("dailyReport");
    expect(call.phone).toBe("01011112222");
    expect(call.variables.학생명).toBe("김유나");
    expect(call.variables.전체계획수).toBe("2");
    expect(call.variables.달성계획수).toBe("1");

    expect(result).toEqual({
      studentProfileId: "student-1",
      noParent: false,
      outcomes: [
        { parentProfileId: "parent-1", phone: "01011112222", status: "sent" },
      ],
    });
  });
});

describe("buildWeeklyReportDedupeKey / buildWeeklyReportVariables — 회귀 고정", () => {
  test("dedupeKey는 크론 원본과 동일 포맷", () => {
    expect(
      buildWeeklyReportDedupeKey("parent-1", "student-1", "2026-09-07"),
    ).toBe("weeklyReport:parent-1:student-1:2026-09-07");
  });

  test("variables — N월/N주차/reportId('_' 구분자)", () => {
    const variables = buildWeeklyReportVariables({
      studentName: "김유나",
      weekStart: "2026-09-07",
      studentProfileId: "student-1",
    });

    expect(variables).toEqual({
      학생명: "김유나",
      N월: "9",
      N주차: "2",
      reportId: "2026-09-07_student-1",
    });
  });
});

describe("loadWeeklyReportInputs — 조회", () => {
  test("studentIds 배열 크기와 무관하게 .from() 호출 횟수가 고정된다", async () => {
    const calls1: string[] = [];
    await loadWeeklyReportInputs(
      fakeSupabase(PARENT_1, (table) => calls1.push(table)),
      ["student-1"],
      "2026-09-07",
    );

    const calls5: string[] = [];
    await loadWeeklyReportInputs(
      fakeSupabase(PARENT_1, (table) => calls5.push(table)),
      ["student-1", "student-2", "student-3", "student-4", "student-5"],
      "2026-09-07",
    );

    expect(calls5.length).toBe(calls1.length);
    // parent_child_links, profiles — 2개 고정(studentIds 명시 시 discovery 쿼리 없음).
    expect(calls1.length).toBe(2);
  });
});

describe("sendWeeklyReport — 발송(DB 조회 없이 입력만 사용)", () => {
  test("입력의 recipients로 동일 weekStart dedupeKey로 sendAndLog를 부른다", async () => {
    const supabaseAdmin = fakeSupabase({});

    const result = await sendWeeklyReport(supabaseAdmin, {
      studentProfileId: "student-1",
      weekStart: "2026-09-07",
      recipients: [
        {
          studentProfileId: "student-1",
          studentName: "김유나",
          parentProfileId: "parent-1",
          parentPhone: "01011112222",
        },
      ],
    });

    expect(sendAndLogMock).toHaveBeenCalledTimes(1);
    const args = sendAndLogMock.mock.calls[0];
    if (!args) throw new Error("sendAndLog가 호출되지 않았어요.");
    const call = args[0];
    expect(call.dedupeKey).toBe("weeklyReport:parent-1:student-1:2026-09-07");
    expect(call.templateKey).toBe("weeklyReport");
    expect(call.variables.reportId).toBe("2026-09-07_student-1");
    expect(result.noParent).toBe(false);
    expect(result.outcomes).toEqual([
      { parentProfileId: "parent-1", phone: "01011112222", status: "sent" },
    ]);
  });
});

describe("buildMonthlyReportDedupeKey / buildMonthlyReportVariables — 회귀 고정", () => {
  test("dedupeKey는 크론 원본과 동일 포맷", () => {
    expect(
      buildMonthlyReportDedupeKey("parent-1", "student-1", "2026-08"),
    ).toBe("monthlyReport:parent-1:student-1:2026-08");
  });

  test("variables — N월/reportId('_' 구분자)", () => {
    const variables = buildMonthlyReportVariables({
      studentName: "김유나",
      monthKey: "2026-08",
      studentProfileId: "student-1",
    });

    expect(variables).toEqual({
      학생명: "김유나",
      N월: "8",
      reportId: "2026-08_student-1",
    });
  });
});

describe("loadMonthlyReportInputs — 조회", () => {
  test("studentIds 배열 크기와 무관하게 .from() 호출 횟수가 고정된다", async () => {
    const calls1: string[] = [];
    await loadMonthlyReportInputs(
      fakeSupabase(PARENT_1, (table) => calls1.push(table)),
      ["student-1"],
      "2026-08",
    );

    const calls5: string[] = [];
    await loadMonthlyReportInputs(
      fakeSupabase(PARENT_1, (table) => calls5.push(table)),
      ["student-1", "student-2", "student-3", "student-4", "student-5"],
      "2026-08",
    );

    expect(calls5.length).toBe(calls1.length);
    expect(calls1.length).toBe(2);
  });
});

describe("sendMonthlyReport — 발송(DB 조회 없이 입력만 사용)", () => {
  test("입력의 recipients로 동일 monthKey dedupeKey로 sendAndLog를 부른다", async () => {
    const supabaseAdmin = fakeSupabase({});

    const result = await sendMonthlyReport(supabaseAdmin, {
      studentProfileId: "student-1",
      monthKey: "2026-08",
      recipients: [
        {
          studentProfileId: "student-1",
          studentName: "김유나",
          parentProfileId: "parent-1",
          parentPhone: "01011112222",
        },
      ],
    });

    expect(sendAndLogMock).toHaveBeenCalledTimes(1);
    const args = sendAndLogMock.mock.calls[0];
    if (!args) throw new Error("sendAndLog가 호출되지 않았어요.");
    const call = args[0];
    expect(call.dedupeKey).toBe("monthlyReport:parent-1:student-1:2026-08");
    expect(call.templateKey).toBe("monthlyReport");
    expect(call.variables.reportId).toBe("2026-08_student-1");
    expect(result.noParent).toBe(false);
  });
});
