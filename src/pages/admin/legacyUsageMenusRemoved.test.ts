// 옛 메뉴 「일일 입장」(dailyEntries, daily_entries)과 「이용 현황」(usageStatus, usage_status)
// 제거의 회귀 테스트(분석 grill Q13, 2026-11-23).
//
// 둘 다 손으로 적는 수기 장부였고, 이용 기록은 본사 대시보드(로그인 기록)가 대신한다.
// 테이블은 남기고 메뉴만 내린다. 라우트 목록, 사이드바, CONFIGS 어디에도 키가 남으면
// URL 직접 입력이나 사이드바로 다시 들어가진다.

import fs from "node:fs";
import path from "node:path";
import { expect, test } from "vitest";

import { ADMIN_SECTION_KEYS } from "./adminSectionKeys";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");
const KEYS = ["dailyEntries", "usageStatus"];

test("ADMIN_SECTION_KEYS 에 없다", () => {
  for (const key of KEYS) {
    expect(ADMIN_SECTION_KEYS as readonly string[]).not.toContain(key);
  }
});

test("Admin.tsx 에 키가 없고 programConfigs 파일도 없다", () => {
  const src = fs.readFileSync(
    path.join(REPO_ROOT, "src/pages/Admin.tsx"),
    "utf8",
  );
  for (const key of KEYS) {
    expect(src, `Admin.tsx 에 ${key} 가 남아 있다`).not.toContain(key);
  }
  expect(
    fs.existsSync(path.join(REPO_ROOT, "src/pages/admin/configs/program.ts")),
  ).toBe(false);
});
