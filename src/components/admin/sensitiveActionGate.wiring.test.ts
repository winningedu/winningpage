// 개인정보 반출 게이트가 **여섯 화면 전부**에 붙어 있는지 지키는 회귀 테스트
// (QA 268 회원목록 · 270/228 멘토신청 · 223 프리미엄상담 · 271 매출결제 · 269 마스킹해제).
//
// 왜 배선을 소스로 확인하나 — 이 묶음의 위험은 로직이 틀리는 게 아니라 **한 곳이
// 빠지는 것**이다. 게이트 없이 남은 다운로드 버튼 하나가 요구를 통째로 무력화하는데,
// 그건 단위 테스트로는 드러나지 않는다(각 화면은 저마다 잘 동작한다).

import fs from "node:fs";
import path from "node:path";
import { expect, test } from "vitest";
import { ADMIN_SECTION_KEYS } from "@/pages/admin/adminSectionKeys";
import { mainConfigs } from "@/pages/admin/configs/main";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");

const read = (rel: string) =>
  fs.readFileSync(path.join(REPO_ROOT, rel), "utf8");

// 게이트를 직접 부르는 화면 3종. 프리미엄 상담(223)은 제네릭 경로라 여기 없고
// 아래 별도 테스트가 config 플래그로 확인한다.
const GATED_SCREENS = [
  {
    rel: "src/components/admin/MembersAdmin.tsx",
    resourceKey: "members",
    actions: ["download", "unmask"],
  },
  {
    rel: "src/components/admin/MentorApplicationsAdmin.tsx",
    resourceKey: "mentorApplications",
    actions: ["download"],
  },
  {
    rel: "src/components/admin/RevenueAdmin.tsx",
    resourceKey: "revenue",
    actions: ["download"],
  },
];

test.each(GATED_SCREENS)(
  "$rel — 게이트를 부르고 $resourceKey 키로 기록한다",
  ({ rel, resourceKey, actions }) => {
    const src = read(rel);

    expect(src, `${rel} 이 게이트 훅을 쓰지 않는다`).toContain(
      "useSensitiveActionGate",
    );
    // 훅만 부르고 모달을 안 그리면 화면에 아무것도 뜨지 않는다.
    expect(src, `${rel} 이 {gate} 를 렌더하지 않는다`).toContain("{gate}");
    expect(src).toContain(`resourceKey: "${resourceKey}"`);

    for (const action of actions) {
      expect(src, `${rel} 에 action:"${action}" 요청이 없다`).toContain(
        `action: "${action}"`,
      );
    }
  },
);

test("QA 223 — 프리미엄 상담은 excel 을 열되 게이트 플래그가 함께 있다", () => {
  const config = mainConfigs.premiumConsults as {
    excel?: boolean;
    sensitiveDownload?: boolean;
  };

  // 둘 중 하나만 있으면 최악이다: excel 만 있으면 게이트 없이 개인정보가 나가고,
  // sensitiveDownload 만 있으면 버튼이 아예 안 떠서 QA 223 이 미반영으로 남는다.
  expect(config.excel).toBe(true);
  expect(config.sensitiveDownload).toBe(true);
});

test("제네릭 다운로드 버튼은 게이트 경유 핸들러에 물려 있다", () => {
  const src = read("src/pages/Admin.tsx");

  expect(src).toContain("onClick={handleDownloadClick}");
  // 버튼이 downloadExcel 을 직접 부르면 sensitiveDownload 가 무시된다.
  expect(src).not.toContain("onClick={downloadExcel}");
});

test("게이트가 쓰는 resource_key 는 전부 실재하는 메뉴 키다", () => {
  const keys = new Set<string>();

  for (const { rel } of GATED_SCREENS) {
    for (const match of read(rel).matchAll(/resourceKey: "([^"]+)"/g)) {
      const key = match[1];
      if (key) keys.add(key);
    }
  }

  expect(keys.size).toBeGreaterThan(0);
  for (const key of keys) {
    expect(ADMIN_SECTION_KEYS, `${key} 는 메뉴 키가 아니다`).toContain(key);
  }
});

test("원장 마이그레이션은 쓰기·읽기만 열고 수정·삭제 정책은 만들지 않는다", () => {
  const migrationsDir = path.join(REPO_ROOT, "supabase/migrations");
  const sql = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .map((file) => read(`supabase/migrations/${file}`))
    .join("\n")
    .toLowerCase();

  // 이 테이블에 걸린 정책 문장만 모은다(다른 테이블의 update/delete 정책은 무관하다).
  const policies = sql
    .split(";\n")
    .filter((statement) =>
      /create policy [\s\S]*? on "public"\."admin_access_logs"/.test(statement),
    )
    .join("\n");

  expect(sql).toContain(
    'create table if not exists "public"."admin_access_logs"',
  );
  expect(sql).toContain(
    'alter table "public"."admin_access_logs" enable row level security',
  );
  expect(policies).toContain('for insert to "authenticated"');
  expect(policies).toContain('for select to "authenticated"');

  // 감사 기록은 적재 후 손댈 수 없어야 증거가 된다 — RLS 는 기본 거부라
  // update/delete 정책을 "만들지 않는 것"이 곧 차단이다.
  expect(policies).not.toContain("for update");
  expect(policies).not.toContain("for delete");
  expect(policies).not.toContain("for all");
});

test("열람 메뉴가 라우트·사이드바에 함께 등록돼 있다", () => {
  expect(ADMIN_SECTION_KEYS).toContain("adminAccessLogs");
  expect(read("src/pages/Admin.tsx")).toContain('key: "adminAccessLogs"');
});
