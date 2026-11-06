// 접근 로그 한 줄을 화면 항목으로 풀어 주는 순수 함수 검증(사 #170, 교 #66, 결정 102.5).

import { describe, expect, test } from "vitest";
import { kindLabel, kindOf } from "./describe.js";

// admin_access_logs_action_check(20261105043132_b2b_access_log_extension) 와 1:1.
const ALL_ACTIONS = [
  "download",
  "unmask",
  "view",
  "report_view",
  "update",
  "export",
  "account_issue",
  "account_reissue",
  "account_status",
  "account_delete",
  "password_set",
  "teacher_import",
  "proxy_start",
  "proxy_end",
  "settings_change",
  "member_purge",
];

describe("kindOf", () => {
  test("CHECK 에 있는 모든 동작이 구분을 가진다", () => {
    for (const action of ALL_ACTIONS) {
      expect(["view", "edit", "export", "proxy"]).toContain(kindOf(action));
    }
  });

  test.each([
    ["view", "조회"],
    ["report_view", "조회"],
    ["download", "조회"],
    ["unmask", "조회"],
    ["update", "수정"],
    ["settings_change", "수정"],
    ["account_reissue", "수정"],
    ["password_set", "수정"],
    ["teacher_import", "수정"],
    ["member_purge", "수정"],
    ["export", "출력"],
    ["proxy_start", "대행"],
    ["proxy_end", "대행"],
  ])("%s 는 %s", (action, label) => {
    expect(kindLabel(kindOf(action))).toBe(label);
  });
});
