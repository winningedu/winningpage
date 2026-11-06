// 접근 로그 한 줄을 화면 항목으로 풀어 주는 순수 함수 검증(사 #170, 교 #66, 결정 102.5).

import { describe, expect, test } from "vitest";
import {
  contentSummary,
  kindLabel,
  kindOf,
  maskTeacherPhone,
  menuLabel,
} from "./describe.js";

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

describe("maskTeacherPhone", () => {
  test.each([
    ["01012341234", "010-****-1234"],
    ["010-5678-9012", "010-****-9012"],
    ["0212345678", "02-****-5678"],
  ])("%s 는 %s", (phone, masked) => {
    expect(maskTeacherPhone(phone)).toBe(masked);
  });

  test("비었거나 너무 짧으면 null", () => {
    expect(maskTeacherPhone(null)).toBeNull();
    expect(maskTeacherPhone("")).toBeNull();
    expect(maskTeacherPhone("123")).toBeNull();
  });
});

describe("menuLabel", () => {
  test.each([
    ["enrollment", "이용현황"],
    ["tenant_service_settings", "기관 서비스 설정"],
    ["student_usage_overrides", "학생별 이용 한도"],
    ["members", "회원 목록"],
  ])("%s 는 %s", (key, label) => {
    expect(menuLabel(key)).toBe(label);
  });

  test("모르는 키는 원문 그대로", () => {
    expect(menuLabel("somethingNew")).toBe("somethingNew");
  });
});

describe("contentSummary", () => {
  test("설정 변경은 프로그램, 항목, 이전 값과 바뀐 값을 풀어 쓴다", () => {
    expect(
      contentSummary({
        action: "settings_change",
        resourceKey: "tenant_service_settings",
        rowCount: null,
        meta: {
          program_key: "diagnose",
          before: { monthly_limit: 1 },
          after: { monthly_limit: 2 },
        },
      }),
    ).toBe("기관 서비스 설정 (학습진단 월 한도 1에서 2로)");
  });

  test("값이 없던 항목은 없음으로, 여러 항목은 쉼표로 잇는다", () => {
    expect(
      contentSummary({
        action: "settings_change",
        resourceKey: "student_usage_overrides",
        rowCount: null,
        meta: {
          program_key: "growth",
          before: { monthly_limit: null, term_limit: 3 },
          after: { monthly_limit: 2, term_limit: null },
        },
      }),
    ).toBe(
      "학생별 이용 한도 (성장설계 월 한도 없음에서 2로, 성장설계 학기 한도 3에서 없음으로)",
    );
  });

  test("출력은 학급 수를 붙인다", () => {
    expect(
      contentSummary({
        action: "export",
        resourceKey: "enrollment",
        rowCount: 3,
        meta: {},
      }),
    ).toBe("이용현황 (학급 3)");
  });

  test("덧붙일 내용이 없으면 메뉴 이름만", () => {
    expect(
      contentSummary({
        action: "view",
        resourceKey: "studentDetail",
        rowCount: null,
        meta: {},
      }),
    ).toBe("학생 상세");
  });
});
