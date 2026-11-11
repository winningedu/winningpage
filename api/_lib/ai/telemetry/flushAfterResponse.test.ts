// 응답을 먼저 보내는 핸들러는 텔레메트리 flush 를 응답 뒤 작업으로 넘겨야 한다.
// Vercel 은 응답이 끝난 함수의 남은 await 를 끊으므로, 응답 뒤의 `await trace.flush`
// 는 행이 유실된다. 핸들러 본문은 실행하지 않고 flush 호출 형태를 확인한다.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const API_ROOT = resolve(import.meta.dirname, "../../..");

function source(relative: string): string {
  return readFileSync(resolve(API_ROOT, relative), "utf8");
}

const AFTER_RESPONSE = [
  "_routes/performance/recommend-topics.ts",
  "_routes/performance/design-report.ts",
  "_routes/performance/evaluate.ts",
  "_routes/performance/analyze-guide.ts",
  "_routes/performance/admin-embed.ts",
  "_routes/growth/collect.ts",
  "_routes/admin/knowledge-search.ts",
  "_routes/admin/knowledge-dedupe.ts",
  "_routes/admin/knowledge-eval.ts",
];

const BEFORE_RESPONSE = [
  "performance/embed-session-vectors.ts",
  "_routes/goal/advice.ts",
  "_lib/inquiry/generate.ts",
  "_lib/selfeval/runModelStep.ts",
  "_lib/growth/report/advance.ts",
];

describe("응답 뒤에 도는 trace.flush", () => {
  it.each(AFTER_RESPONSE)(
    "%s 는 flush 를 scheduleAfterResponse 로 넘긴다",
    (file) => {
      const text = source(file);
      expect(text).toMatch(
        /scheduleAfterResponse\(\s*\(\)\s*=>\s*trace\.flush\(/,
      );
      expect(text).not.toMatch(/await\s+trace\.flush\(/);
    },
  );

  it.each(BEFORE_RESPONSE)("%s 는 응답 전에 flush 를 기다린다", (file) => {
    expect(source(file)).toMatch(/await\s+trace\.flush\(/);
  });
});
