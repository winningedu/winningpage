import { describe, expect, it } from "vitest";
import { inferMemoBelongsTo } from "./memoBelongs.js";
import type { ActivityRecordLike } from "./types.js";

const rec = (
  id: string,
  submittedAt: string,
  over: Partial<ActivityRecordLike> = {},
): ActivityRecordLike => ({
  id,
  sourceProgram: "performance",
  status: "final",
  gradeLabel: null,
  semester: null,
  subjectGroup: "교과",
  subject: "수학",
  topic: "미세먼지 센서 측정",
  concept: "표준편차 개념",
  method: "센서 반복 측정",
  result: null,
  limitation: null,
  numbers: [],
  sources: [],
  createdAt: "2026-01-01T00:00:00Z",
  submittedAt,
  ...over,
});
const memo = (text: string, writtenAt: string | null = "2026-05-10") => ({
  id: "m1",
  writtenAt,
  text,
  belongsTo: null as string | null,
});

describe("inferMemoBelongsTo", () => {
  it("실행 구간에 날짜가 들고 낱말을 둘 이상 겹치는 기록이 하나면 그 기록에 붙인다", () => {
    const out = inferMemoBelongsTo(
      [memo("미세먼지 센서를 다시 확인함")],
      [rec("r1", "2026-05-20")],
    );
    expect(out.get("m1")).toBe("r1");
  });

  it("겹치는 낱말이 하나뿐이면 붙이지 않는다", () => {
    const out = inferMemoBelongsTo(
      [memo("미세먼지 농도를 적어 둠")],
      [rec("r1", "2026-05-20")],
    );
    expect(out.has("m1")).toBe(false);
  });

  it("후보가 둘 이상이면 낱말이 충분히 겹쳐도 붙이지 않는다", () => {
    const out = inferMemoBelongsTo(
      [memo("미세먼지 센서를 다시 확인함")],
      [rec("r1", "2026-05-20"), rec("r2", "2026-05-25", { subject: "과학" })],
    );
    expect(out.has("m1")).toBe(false);
  });

  it("구간은 같은 과목 앞 기록 제출일 다음 날부터 이 기록 제출일까지다", () => {
    const rows = [rec("r1", "2026-05-10"), rec("r2", "2026-05-31")];
    const text = "미세먼지 센서를 다시 확인함";
    const onPrevDay = inferMemoBelongsTo([memo(text, "2026-05-10")], rows);
    expect(onPrevDay.get("m1")).toBe("r1");
    const nextDay = inferMemoBelongsTo([memo(text, "2026-05-11")], rows);
    expect(nextDay.get("m1")).toBe("r2");
    const after = inferMemoBelongsTo([memo(text, "2026-06-01")], rows);
    expect(after.has("m1")).toBe(false);
  });

  it("제출일이 없으면 생성일로 읽고, 메모 날짜가 없으면 붙이지 않는다", () => {
    const r = rec("r1", "2026-05-20", { createdAt: "2026-05-20T00:00:00Z" });
    r.submittedAt = null;
    const text = "미세먼지 센서를 다시 확인함";
    expect(inferMemoBelongsTo([memo(text)], [r]).get("m1")).toBe("r1");
    expect(inferMemoBelongsTo([memo(text, null)], [r]).has("m1")).toBe(false);
  });

  it("이미 소속이 있는 메모는 건드리지 않는다", () => {
    const m = { ...memo("미세먼지 센서를 다시 확인함"), belongsTo: "x" };
    expect(inferMemoBelongsTo([m], [rec("r1", "2026-05-20")]).size).toBe(0);
  });
});
