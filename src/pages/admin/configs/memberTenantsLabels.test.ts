// 기관 관리 메뉴와 목록 열 이름은 용어 표준(기관, 기관 유형, 소속코드)을 따른다.

import { describe, expect, test } from "vitest";
import { memberConfigs } from "./member";

describe("기관 관리 설정 용어", () => {
  test("제목과 열 이름이 표준 용어다", () => {
    const config = memberConfigs.tenants;
    expect(config?.title).toBe("기관 관리");
    const labels = Object.fromEntries(
      (config?.columns ?? []).map((column) => [column.key, column.label]),
    );
    expect(labels.org_type).toBe("기관 유형");
    expect(labels.code).toBe("소속코드");
  });
});
