// banners_seed_unique_idx 재도입 차단 (QA 314·315·316).
//
// 이 인덱스는 배너 내용 일곱 컬럼을 통째로 묶어 유일성을 봤고, 그래서 어드민이
// 배너를 새로 만들 때 값이 겹치면 23505 로 막았다. 운영자에게는 "이미 등록된
// 값입니다(중복)" 한 줄로만 보여 **왜 막히는지 알 수 없었다** — 겹친 것이 실은
// 순서(sort_order)인 경우가 많았다.
//
// 원래 목적은 구 sql/ 시드 스크립트의 중복 삽입 방지인데 그 체계는 2026-08-21 에
// 폐기됐다. 지금 banners 에 쓰는 경로는 어드민 폼 하나뿐이라 지키는 대상이 없다.
//
// 되살아나면 같은 증상이 그대로 재발하므로, 마이그레이션이 누적이라는 점을 감안해
// "이 인덱스를 언급하는 마지막 마이그레이션이 drop 쪽인가"를 본다.

import fs from "node:fs";
import path from "node:path";
import { expect, test } from "vitest";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../../..");
const MIGRATIONS = path.join(REPO_ROOT, "supabase/migrations");
const INDEX_NAME = "banners_seed_unique_idx";

test("이 인덱스는 스키마에 존재하지 않는다", () => {
  // 마이그레이션이 squash 되어 drop 문 자체가 사라졌다. drop 된 결과 상태,
  // 즉 어떤 마이그레이션도 이 인덱스를 언급하지 않는 것을 잠근다.
  const mentioning = fs
    .readdirSync(MIGRATIONS)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .filter((file) =>
      fs.readFileSync(path.join(MIGRATIONS, file), "utf8").includes(INDEX_NAME),
    );

  expect(mentioning, `${INDEX_NAME} 가 스키마에 있다`).toEqual([]);
});

test("배너 내용 전체를 묶는 유일성 인덱스를 새로 만들지 않는다", () => {
  // baseline 은 역사라 손대지 않는다. 그 뒤 마이그레이션에서 banners 에 같은
  // 모양(coalesce 로 여러 컬럼을 묶은 unique)이 다시 생기면 여기서 걸린다.
  const offenders = fs
    .readdirSync(MIGRATIONS)
    .filter((file) => file.endsWith(".sql") && !file.includes("baseline"))
    .filter((file) => {
      const sql = fs.readFileSync(path.join(MIGRATIONS, file), "utf8");
      return /create\s+unique\s+index[\s\S]{0,200}on\s+"?public"?\."?banners"?[\s\S]{0,400}coalesce/i.test(
        sql,
      );
    });

  expect(offenders, `배너에 내용 묶음 unique 인덱스가 생겼다`).toEqual([]);
});
