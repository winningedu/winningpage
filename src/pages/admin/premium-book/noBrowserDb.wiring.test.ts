// 프리미엄 책자 화면과 어드민 엔진이 브라우저에서 Supabase DB 나 스토리지를 직접 부르지 않는지 소스로 지킨다.
// 위험은 로직이 틀리는 것이 아니라 직접 호출이 한 군데 다시 생기는 것이라 배선을 확인한다.

import fs from "node:fs";
import path from "node:path";
import { expect, test } from "vitest";

const SRC = path.resolve(import.meta.dirname, "../../..");

const sources = [
  "pages/admin/shared/AdminEngine.tsx",
  ...fs
    .readdirSync(import.meta.dirname)
    .filter((name) => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name))
    .map((name) => `pages/admin/premium-book/${name}`),
];

test.each(sources)("%s 는 @/lib/supabase 를 가져오지 않는다", (rel) => {
  const text = fs.readFileSync(path.join(SRC, rel), "utf8");
  expect(text).not.toMatch(/from\s+["']@\/lib\/supabase["']/);
  expect(text).not.toMatch(/supabase\s*\.\s*(from|rpc|storage)\b/);
});

test("옛 직접 업로드와 직접 삭제 도우미는 엔진에 남아 있지 않다", () => {
  const text = fs.readFileSync(
    path.join(SRC, "pages/admin/shared/AdminEngine.tsx"),
    "utf8",
  );
  expect(text).not.toMatch(/function\s+uploadImage\b/);
  expect(text).not.toMatch(/function\s+removeBannerPaths\b/);
});
