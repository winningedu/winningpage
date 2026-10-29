import { describe, expect, test } from "vitest";
import { mainConfigs } from "./main";

describe("랜딩 섹션 제목 패널 연결", () => {
  test.each([
    ["universityAcceptances", "acceptanceCopyPanel"],
    ["programCategories", "servicesCopyPanel"],
    ["mentorStrategies", "mentorCopyPanel"],
  ])("%s 메뉴는 %s 패널을 목록 위에 둔다", (configKey, panelKey) => {
    const config = (mainConfigs as Record<string, { listSummaryKey?: string }>)[
      configKey
    ];
    expect(config?.listSummaryKey).toBe(panelKey);
  });
});
