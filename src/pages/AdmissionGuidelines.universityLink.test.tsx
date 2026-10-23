// @vitest-environment node
//
// 대학명 → official_source_url 배선 검증 — scripts/verify-admission-university-link.mjs
// 이식.
//
// 무엇을 지키나
// -------------
// 사용자 요청(2026-08-10): "official_source_url을 '대학이름'을 클릭했을 때
// 나오는 링크로. 어드민에서는 '다이얼로그'가 나와 수정할 수 있게."
//
// 이 축은 기존 게이트 대부분이 한 곳도 보지 않는다: modal-shell은
// AdmissionGuidelines.tsx의 모달 슬라이스만 보고, admin-entry는 admissionSection
// 셀 / 관리 열만 본다. 목록 표의 이름 셀은 둘 다 밖이다. 즉 대학명 링크는
// **조용히 죽을 수 있는** 기능이다. 이 파일이 그 구멍이다.
//
// 특히 이 기능의 최대 위험은 "코드는 완성인데 화면에서 아무 일도 안 일어남"
// 이다: 목록이 읽는 경량 뷰(admission_university_resource_index)에
// official_source_url 컬럼이 없으면 row.official_source_url이 undefined라
// 전 대학이 평문으로 렌더된다. 콘솔 에러도, 게이트 실패도, 리뷰 신호도 없다.
// 그래서 link:* 렌더 단언과 별개로 sql:12가 SQL 파일의 존재와 append-only
// 규율을 기계 검증한다.
//
// 어떻게 보나 — 소스 스캔이 아니라 **실제 슬라이스 SSR**
// -------------------------------------------------------
// 소스에서 대상 함수·분기만 기계적으로 잘라내 하네스로 감싸고
// renderToStaticMarkup 한다. 슬라이스는 매 실행마다 현재 소스에서 다시 뜨므로
// 이 파일은 사본이 아니라 실제 페이지/엔진 파일을 검사한다. 앵커가 깨지면
// **조용히 통과하지 않고 throw**한다.
//
// 이식 메모(node:test → Vitest, task 10.6)
// -----------------------------------------
// - 경로 드리프트: src/pages/AdmissionGuidelines.jsx → .tsx,
//   src/pages/Admin.jsx(어드민 목록 셀) → src/pages/admin/shared/AdminEngine.tsx.
//   Admin.jsx는 task 16~19(Admin.jsx 1~4단계 리팩터)로 제네릭 엔진으로 갈라졌고,
//   대학명 셀 분기(`column.type === "universityNameMeta"`)의 소유처가
//   AdminEngine.tsx로 옮겨갔다 — 이건 단순 확장자 드리프트가 아니라 **구조
//   이동**이다.
// - 앵커 자체(슬라이스 시작/끝 문자열)는 두 파일 모두 문자 그대로 보존돼
//   있었다(함수 시그니처·<td> 속성 순서 불변) — 재정렬 불필요, 경로만 갱신.
// - formatValue는 이제 csvExport.ts에서 export되는 실제 함수라 텍스트로
//   다시 슬라이스하지 않고 정적 import로 하네스에 주입한다(원본은 이것도
//   함수 텍스트를 잘라 하네스에 박아 넣었다 — 지금은 불필요한 우회다).
// - esbuild.build()/transform() 슬라이스 하네스는 유지한다(AdmissionGuidelines.modalShell.test.tsx와
//   같은 이유 — 검증 대상이 "현재 소스에서 기계적으로 잘라낸 임의의 JSX
//   조각"이라 런타임에 조립해야 한다). `@vitest-environment node`도 같은
//   이유로 유지한다(esbuild 자체 무결성 검사가 jsdom 전역과 충돌한다 —
//   modalShell 헤더 주석 참고).
//
// 실행: npx vitest run src/pages/AdmissionGuidelines.universityLink.test.tsx

import fs from "node:fs";
import path from "node:path";
import * as esbuild from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");
const PUBLIC_REL = "src/pages/AdmissionGuidelines.tsx";
const ADMIN_REL = "src/pages/admin/shared/AdminEngine.tsx";
// META_MODAL_REL(AdmissionMetaEditModal 경로 상수)은 meta:13이
// AdmissionGuidelines.universityLink.metaModal.test.tsx로 옮겨가며 함께 옮겼다.
//
// sql:12 재배선 메모(2026-08-31, sql/ ENOENT 해소)
// -----------------------------------------------
// sql/ 은 2026-08-21 전량 baseline.sql로 스쿼시됐다(수동 넘버링 폐기,
// supabase/README.md). 구 sql:12는 "48번(플래그만) + <번호>_..._official_url.sql
// (official_source_url 추가분) 2개 파일이 append-only로 이어진다"는 마이그레이션
// *이력*을 검증했는데, 스쿼시 이후에는 그 중간 이력이 물리적으로 존재하지
// 않는다 — 지금은 admission_university_resource_index 뷰 정의가 baseline
// 하나에 최종 형태로만 있다. 그래서 "이력 append-only" 명제는 "최종 상태 —
// official_source_url이 select 목록의 맨 뒤에 정확히 1개 있다"로 좁혀 재작성한다
// (원래 명제의 알맹이인 "끝에 덧붙였지, 중간에 끼워 넣거나 다른 컬럼을 건드리지
// 않았다"는 그대로 보존된다). "sql/<번호>..." 파일 존재 검증(구 체계 전제)은
// baseline 안의 CREATE OR REPLACE VIEW 블록 존재 검증으로 치환한다.
const ADMISSION_VIEW_NAME = "admission_university_resource_index";
const MIGRATIONS_REL = "supabase/migrations";

const read = (rel: string) =>
  fs.readFileSync(path.join(REPO_ROOT, rel), "utf8");

// ── 공통: JSX 하네스를 임시 모듈로 굽는다 ────────────────────────────────
async function bakeHarness(harness: string, tag: string) {
  const out = await esbuild.transform(harness, {
    loader: "tsx",
    jsx: "automatic",
    jsxImportSource: "react",
    format: "esm",
  });
  const tmpFile = path.join(
    REPO_ROOT,
    `.tmp-univ-link-${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`,
  );
  fs.writeFileSync(tmpFile, out.code);
  try {
    const mod = await import(`file://${tmpFile}`);
    return mod.default;
  } finally {
    fs.rmSync(tmpFile, { force: true });
  }
}

// loadModule(esbuild.build 기반 실제 .tsx 모듈 번들+import)은 meta:13이
// AdmissionGuidelines.universityLink.metaModal.test.tsx로 옮겨가며 유일한
// 호출부를 잃어 함께 옮겼다 — 이 파일에 남은 나머지 테스트는 전부
// bakeHarness(문자열 슬라이스 하네스)만 쓴다.

// 소스에서 `start` 로 시작해 `end` 직전까지를 잘라낸다. start 는 정확히 1개여야 한다.
function sliceExactlyOnce(
  source: string,
  start: string,
  end: string,
  what: string,
) {
  const idx = source.indexOf(start);
  if (idx === -1 || source.indexOf(start, idx + 1) !== -1) {
    throw new Error(
      `${what} 슬라이스 시작 앵커가 정확히 1개가 아니다: ${JSON.stringify(start)}\n` +
        "리팩터로 앵커가 사라졌다면 이 파일 상단의 이식 메모를 읽고 앵커를 복원하라.",
    );
  }
  const endIdx = source.indexOf(end, idx + start.length);
  if (endIdx === -1) {
    throw new Error(
      `${what} 슬라이스 종료 앵커를 찾지 못했다: ${JSON.stringify(end)}`,
    );
  }
  return source.slice(idx, endIdx);
}

// ── 공개: UniversityResourceRow 하네스 ───────────────────────────────────
//
// 이름 셀만 관심사다. 나머지(InfoButton/LinkButton/섹션 상수)는 식별 가능한
// 스텁으로 갈아끼운다 — 이 검사는 "대학명이 링크가 되는가"를 보지, 셀 버튼
// 내부를 보지 않는다. externalUrl 은 **검사 대상 본인**이라 실제 소스를 쓴다.
async function loadResourceRow() {
  const src = read(PUBLIC_REL);
  const externalUrlFn = sliceExactlyOnce(
    src,
    "function externalUrl(value) {",
    "\nfunction ",
    "externalUrl",
  );
  const rowFn = sliceExactlyOnce(
    src,
    "function UniversityResourceRow({ university, row, onOpenInfo }) {",
    "\nfunction UniversityResourceTable(",
    "UniversityResourceRow",
  );
  const harness = `
import React from 'react';
const INFO_SECTIONS = [{ key: 'selection_method', label: '전형방법' }];
const CATEGORY_INFO_SECTIONS = [{ key: 'selection_method', label: '입학자료' }];
const LINK_SECTIONS = [{ label: '정시모집요강', keys: ['jungsi_guideline_url'] }];
function InfoButton() { return <span data-stub="info" />; }
function LinkButton() { return <span data-stub="link" />; }
function requestUniversityInfo() {}
${externalUrlFn}
${rowFn}
export default function RowHarness(props) {
  return <table><tbody><UniversityResourceRow {...props} /></tbody></table>;
}
`;
  return bakeHarness(harness, "row");
}

// ── 어드민: 목록 셀 <td> 통째 하네스 ─────────────────────────────────────
//
// **분기만** 잘라내면 안 된다. AdminTable의 이 <td>는 36개 config가 공유하는
// 단일 셀이고, 진짜 위험은 "우리 분기가 잘못 발동하는 것"보다 "이 셀에
// 무언가를 덧붙여 나머지 35개 메뉴가 같이 바뀌는 것"이다. 분기만 슬라이스하면
// 그 오염이 슬라이스 밖에 생겨 검사를 통과해버린다. 그래서 셀 전체를 잘라
// "평범한 컬럼은 formatValue 결과만 낸다"까지 못박는다.
async function loadNameCell() {
  const src = read(ADMIN_REL);
  const cell = sliceExactlyOnce(
    src,
    '<td key={column.key} className="px-3 py-3">',
    "</td>",
    "어드민 목록 셀",
  );
  // 셀이 참조하는 나머지 자유 변수는 식별 가능한 스텁으로 갈아끼운다 — 이
  // 검사의 관심사는 대학명 셀과 "평범한 셀의 순수함"이지 이미지/파일 목록
  // 렌더가 아니다. formatValue는 실제 csvExport.ts export를 정적 import한다
  // (원본은 이것도 함수 텍스트를 슬라이스했지만, TS 전환 후 export된
  // 실제 함수라 다시 슬라이스할 이유가 없다).
  const harness = `
import React from 'react';
import { formatValue } from '@/pages/admin/shared/csvExport';
const fileNameFromUrl = () => 'stub-file';
const normalizeArray = (v) => (Array.isArray(v) ? v : []);
const formatListValue = () => 'stub-list';
const truncateText = () => 'stub-truncate';
export default function CellHarness({
  column, row, index, sectionSummaries, onOpenMetaEdit, onEdit, onOpenSection
}) {
  return (
    <table><tbody><tr>
      ${cell}</td>
    </tr></tbody></table>
  );
}
`;
  const built = await esbuild.build({
    stdin: {
      contents: harness,
      resolveDir: REPO_ROOT,
      loader: "tsx",
    },
    bundle: true,
    format: "esm",
    jsx: "automatic",
    jsxImportSource: "react",
    platform: "node",
    mainFields: ["module", "main"],
    alias: { "@": path.join(REPO_ROOT, "src") },
    external: ["react", "react-dom", "react/jsx-runtime", "react-dom/server"],
    write: false,
  });
  const bundlePath = path.join(
    REPO_ROOT,
    `.tmp-univ-link-cell-bundle-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`,
  );
  fs.writeFileSync(bundlePath, built.outputFiles[0]!.text);
  try {
    const mod = await import(`file://${bundlePath}`);
    return mod.default;
  } finally {
    fs.rmSync(bundlePath, { force: true });
  }
}

// React 엘리먼트 트리에서 조건에 맞는 첫 노드를 찾는다(클릭 재현용).
function findNode(
  node: unknown,
  predicate: (n: { type?: unknown; props?: { children?: unknown } }) => boolean,
): { type?: unknown; props?: Record<string, unknown> } | null {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = findNode(child, predicate);
      if (hit) return hit;
    }
    return null;
  }
  const n = node as { type?: unknown; props?: { children?: unknown } };
  if (predicate(n))
    return n as { type?: unknown; props?: Record<string, unknown> };
  return findNode(n.props?.children, predicate);
}

// ── SQL: 뷰 select 항목을 최상위 콤마로 분해 ─────────────────────────────
function selectItems(sqlText: string, whatFile: string): string[] {
  const stripped = sqlText
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n");
  // baseline(pg_dump)은 식별자를 큰따옴표로 감싼다("public"."admission_university_resources")
  // — 구 sql/48은 따옴표 없는 public.admission_university_resources였다. 둘 다 받는다.
  const m = stripped.match(
    /create or replace view[\s\S]*?\bas\s*select\b([\s\S]*?)\bfrom\s+"?public"?\."?admission_university_resources"?/i,
  );
  if (!m)
    throw new Error(
      `${whatFile}: create or replace view … select … from 구간을 파싱하지 못했다.`,
    );
  const items: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of m[1]!) {
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (ch === "," && depth === 0) {
      items.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) items.push(cur);
  return items.map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
}

describe("대학명 → official_source_url 배선 검증", () => {
  const publicSrc = read(PUBLIC_REL);

  test('link:1. official_source_url 이 https URL 이면 대학명이 <a href="(그 URL)"> 정확히 1개로 렌더된다', async () => {
    const RowHarness = await loadResourceRow();
    const university = { name: "가톨릭관동대학교", region: "강원" };
    const html = renderToStaticMarkup(
      React.createElement(RowHarness, {
        university,
        row: { official_source_url: "https://ex.ac.kr/adm" },
        onOpenInfo: () => {},
      }),
    );
    const anchors =
      html.match(/<a\b[^>]*admission-directory-name-link[^>]*>/g) || [];
    const pass =
      anchors.length === 1 &&
      (anchors[0] ?? "").includes('href="https://ex.ac.kr/adm"') &&
      html.includes("가톨릭관동대학교");
    expect(
      pass,
      JSON.stringify({ anchors, hasName: html.includes("가톨릭관동대학교") }),
    ).toBe(true);
  });

  test('link:2. 대학명 링크는 target="_blank" 이고 rel 에 noopener·noreferrer 를 둘 다 갖는다(탭 나빙·리퍼러 유출 차단)', async () => {
    const RowHarness = await loadResourceRow();
    const university = { name: "가톨릭관동대학교", region: "강원" };
    const html = renderToStaticMarkup(
      React.createElement(RowHarness, {
        university,
        row: { official_source_url: "https://ex.ac.kr/adm" },
        onOpenInfo: () => {},
      }),
    );
    const nameAnchors = (h: string) =>
      h.match(/<a\b[^>]*admission-directory-name-link[^>]*>/g) || [];
    const tag = nameAnchors(html)[0] || "";
    const rel = (tag.match(/rel="([^"]*)"/) || [])[1] || "";
    const pass =
      tag.includes('target="_blank"') &&
      rel.includes("noopener") &&
      rel.includes("noreferrer");
    expect(pass, JSON.stringify({ tag, rel })).toBe(true);
  });

  test("link:3. official_source_url 이 없으면 <a> 를 만들지 않고 대학명을 평문으로 렌더한다(빈 링크 금지)", async () => {
    const RowHarness = await loadResourceRow();
    const university = { name: "가톨릭관동대학교", region: "강원" };
    const html = renderToStaticMarkup(
      React.createElement(RowHarness, {
        university,
        row: { detail_status: "normal" },
        onOpenInfo: () => {},
      }),
    );
    const nameAnchors = (h: string) =>
      h.match(/<a\b[^>]*admission-directory-name-link[^>]*>/g) || [];
    const pass =
      nameAnchors(html).length === 0 && html.includes("가톨릭관동대학교");
    expect(
      pass,
      JSON.stringify({
        anchors: nameAnchors(html),
        hasName: html.includes("가톨릭관동대학교"),
      }),
    ).toBe(true);
  });

  test("link:4. row 가 null 인 미매칭 대학(교대·예종 등)도 throw 없이 평문으로 렌더된다", async () => {
    const RowHarness = await loadResourceRow();
    const university = { name: "가톨릭관동대학교", region: "강원" };
    let threw: string | null = null;
    let html = "";
    try {
      html = renderToStaticMarkup(
        React.createElement(RowHarness, {
          university,
          row: null,
          onOpenInfo: () => {},
        }),
      );
    } catch (err) {
      threw = String(err instanceof Error ? err.message : err);
    }
    const nameAnchors = (h: string) =>
      h.match(/<a\b[^>]*admission-directory-name-link[^>]*>/g) || [];
    const pass =
      threw === null &&
      nameAnchors(html).length === 0 &&
      html.includes("가톨릭관동대학교");
    expect(pass, JSON.stringify({ threw, anchors: nameAnchors(html) })).toBe(
      true,
    );
  });

  test("link:5. 자리표시자 '-' · 상대경로 · 공백만 있는 값은 링크로 승격되지 않는다(href=\"-\" 회귀 방지)", async () => {
    const RowHarness = await loadResourceRow();
    const university = { name: "가톨릭관동대학교", region: "강원" };
    const renderRow = (row: unknown) =>
      renderToStaticMarkup(
        React.createElement(RowHarness, {
          university,
          row,
          onOpenInfo: () => {},
        }),
      );
    const nameAnchors = (h: string) =>
      h.match(/<a\b[^>]*admission-directory-name-link[^>]*>/g) || [];
    const dashHtml = renderRow({ official_source_url: "-" });
    const relHtml = renderRow({ official_source_url: "/admission/foo" });
    const spaceHtml = renderRow({ official_source_url: "   " });
    const pass =
      nameAnchors(dashHtml).length === 0 &&
      nameAnchors(relHtml).length === 0 &&
      nameAnchors(spaceHtml).length === 0 &&
      !dashHtml.includes('href="-"');
    expect(
      pass,
      JSON.stringify({
        dash: nameAnchors(dashHtml).length,
        relative: nameAnchors(relHtml).length,
        space: nameAnchors(spaceHtml).length,
      }),
    ).toBe(true);
  });

  test("link:6. 특수대학(detail_status='category', 경찰대/과기원/사관학교 11개교)의 이름 링크가 일반 대학과 문자 그대로 동일하게 렌더된다", async () => {
    const RowHarness = await loadResourceRow();
    const university = { name: "가톨릭관동대학교", region: "강원" };
    const renderRow = (row: unknown) =>
      renderToStaticMarkup(
        React.createElement(RowHarness, {
          university,
          row,
          onOpenInfo: () => {},
        }),
      );
    const nameAnchors = (h: string) =>
      h.match(/<a\b[^>]*admission-directory-name-link[^>]*>/g) || [];
    const catHtml = renderRow({
      detail_status: "category",
      official_source_url: "https://kps.ac.kr",
    });
    const normalHtml = renderRow({
      detail_status: "normal",
      official_source_url: "https://kps.ac.kr",
    });
    const catAnchor = nameAnchors(catHtml)[0] || "";
    const normalAnchor = nameAnchors(normalHtml)[0] || "";
    const pass = catAnchor !== "" && catAnchor === normalAnchor;
    expect(pass, JSON.stringify({ catAnchor, normalAnchor })).toBe(true);
  });

  test('link:7. 어떤 입력에서도 href="#" / href="" 같은 죽은 링크를 만들지 않는다', async () => {
    const RowHarness = await loadResourceRow();
    const university = { name: "가톨릭관동대학교", region: "강원" };
    const renderRow = (row: unknown) =>
      renderToStaticMarkup(
        React.createElement(RowHarness, {
          university,
          row,
          onOpenInfo: () => {},
        }),
      );
    const combined = [
      renderRow({ official_source_url: "https://ex.ac.kr/adm" }),
      renderRow({ official_source_url: "-" }),
      renderRow(null),
      renderRow({}),
    ].join("");
    const pass =
      !combined.includes('href="#"') && !combined.includes('href=""');
    expect(
      pass,
      JSON.stringify({
        hash: combined.includes('href="#"'),
        empty: combined.includes('href=""'),
      }),
    ).toBe(true);
  });

  test(`rel:8. ${PUBLIC_REL} 의 모든 target="_blank" 링크가 rel 에 noopener·noreferrer 를 갖는다(대학명 링크 + 정시모집요강 버튼)`, () => {
    const offenders: unknown[] = [];
    const needle = 'target="_blank"';
    let from = 0;
    let count = 0;
    for (;;) {
      const at = publicSrc.indexOf(needle, from);
      if (at === -1) break;
      count += 1;
      const window = publicSrc.slice(Math.max(0, at - 300), at + 300);
      const rel = (window.match(/rel="([^"]*)"/) || [])[1] || "";
      if (!rel.includes("noopener") || !rel.includes("noreferrer")) {
        offenders.push({ at, rel });
      }
      from = at + needle.length;
    }
    const pass = count >= 2 && offenders.length === 0;
    expect(pass, JSON.stringify({ blankCount: count, offenders })).toBe(true);
  });

  test("admin:9. column.type='universityNameMeta' 이고 onOpenMetaEdit 가 있으면 대학명이 <button> 1개로 렌더된다", async () => {
    const NameCell = await loadNameCell();
    const html = renderToStaticMarkup(
      React.createElement(NameCell, {
        column: { key: "university_name", type: "universityNameMeta" },
        row: { id: "fixture", university_name: "가톨릭관동대학교" },
        index: 0,
        sectionSummaries: null,
        onOpenMetaEdit: () => {},
        onEdit: () => {},
        onOpenSection: () => {},
      }),
    );
    const buttons = html.match(/<button\b/g) || [];
    const pass = buttons.length === 1 && html.includes("가톨릭관동대학교");
    expect(
      pass,
      JSON.stringify({ buttons: buttons.length, html: html.slice(0, 200) }),
    ).toBe(true);
  });

  test("admin:10. 그 버튼을 클릭하면 onOpenMetaEdit 가 해당 row 로 정확히 1회 호출되고, onEdit(행 전체 폼)은 호출되지 않는다", async () => {
    const NameCell = await loadNameCell();
    const metaClicks: unknown[][] = [];
    const editClicks: unknown[][] = [];
    const element = React.createElement(NameCell, {
      column: { key: "university_name", type: "universityNameMeta" },
      row: { id: "fixture", university_name: "가톨릭관동대학교" },
      onOpenMetaEdit: (...a: unknown[]) => metaClicks.push(a),
      onEdit: (...a: unknown[]) => editClicks.push(a),
    });
    const rendered = (element.type as unknown as (props: unknown) => unknown)(
      element.props,
    );
    const button = findNode(rendered, (n) => n.type === "button");
    (button?.props?.onClick as (() => void) | undefined)?.();
    const firstMetaClickArg = metaClicks[0]?.[0] as { id?: string } | undefined;
    const pass =
      Boolean(button) &&
      metaClicks.length === 1 &&
      firstMetaClickArg?.id === "fixture" &&
      editClicks.length === 0;
    expect(
      pass,
      JSON.stringify({
        hasButton: Boolean(button),
        metaClicks: metaClicks.length,
        editClicks: editClicks.length,
      }),
    ).toBe(true);
  });

  test("admin:11. 공유 셀 무오염 — 타입 없는 평범한 컬럼(35개 메뉴)의 셀은 formatValue 결과만 렌더하고, onOpenMetaEdit 가 없으면 대학명도 평문이다(완전 일치)", async () => {
    const NameCell = await loadNameCell();
    const WRAP = (inner: string) =>
      `<table><tbody><tr><td class="px-3 py-3">${inner}</td></tr></tbody></table>`;
    const plain = renderToStaticMarkup(
      React.createElement(NameCell, {
        column: { key: "title" },
        row: { id: "fixture", title: "평범한 제목" },
        index: 0,
        sectionSummaries: null,
        onOpenMetaEdit: () => {},
        onEdit: () => {},
        onOpenSection: () => {},
      }),
    );
    const noHandler = renderToStaticMarkup(
      React.createElement(NameCell, {
        column: { key: "university_name", type: "universityNameMeta" },
        row: { id: "fixture", university_name: "가톨릭관동대학교" },
        index: 0,
        sectionSummaries: null,
        onOpenMetaEdit: undefined,
        onEdit: () => {},
        onOpenSection: () => {},
      }),
    );
    const plainExact = plain === WRAP("평범한 제목");
    const noHandlerExact = noHandler === WRAP("가톨릭관동대학교");
    const pass = plainExact && noHandlerExact;
    expect(
      pass,
      JSON.stringify({ plainExact, noHandlerExact, plain, noHandler }),
    ).toBe(true);
  });

  test("sql:12. 목록 뷰가 baseline에 존재하고, official_source_url 1개가 select 목록 맨 뒤에만 있으며, anon/authenticated에 조회 권한이 있다", () => {
    // 구 sql:12는 "48번(플래그만) → <번호>_..._official_url.sql(official_source_url
    // 추가분)" 2파일의 append-only 이력을 검증했다. sql/ 스쿼시 이후 그 중간
    // 이력은 물리적으로 없다 — baseline에 최종 뷰 정의 1개만 있다. 그래서
    // "이력이 append-only였다"가 아니라 그 이력이 남긴 결과 상태, 즉
    // "official_source_url이 select 목록 맨 뒤에 정확히 1개 있고 나머지는
    // 그 앞에서 중복 없이 온다"를 검증한다.
    // 마이그레이션 전체를 이름 순으로 이은 현재 스키마 원본.
    const baselineSql = fs
      .readdirSync(path.join(REPO_ROOT, MIGRATIONS_REL))
      .filter((file) => file.endsWith(".sql"))
      .sort()
      .map((file) => read(`${MIGRATIONS_REL}/${file}`))
      .join("\n");
    const viewNeedle = `CREATE OR REPLACE VIEW "public"."${ADMISSION_VIEW_NAME}"`;
    let pass = false;
    let detail: string;
    if (!baselineSql.includes(viewNeedle)) {
      detail = JSON.stringify({
        expected: `${MIGRATIONS_REL} 안에 ${viewNeedle} 존재`,
        found: false,
      });
    } else {
      const items = selectItems(
        baselineSql.slice(baselineSql.lastIndexOf(viewNeedle)),
        MIGRATIONS_REL,
      );
      const officialUrlIndexes = items
        .map((v, i) => (v === '"official_source_url"' ? i : -1))
        .filter((i) => i >= 0);
      const isLastOnly =
        officialUrlIndexes.length === 1 &&
        officialUrlIndexes[0] === items.length - 1;
      const hasGrant =
        /GRANT\s+ALL\s+ON\s+TABLE\s+"public"\."admission_university_resource_index"\s+TO\s+"anon";/i.test(
          baselineSql,
        ) &&
        /GRANT\s+ALL\s+ON\s+TABLE\s+"public"\."admission_university_resource_index"\s+TO\s+"authenticated";/i.test(
          baselineSql,
        );
      pass = isLastOnly && hasGrant;
      detail = JSON.stringify({
        itemCount: items.length,
        officialUrlIndexes,
        isLastOnly,
        hasGrant,
        lastItem: items[items.length - 1],
      });
    }
    expect(pass, detail).toBe(true);
  });

  // meta:13(AdmissionMetaEditModal 렌더 검증)은
  // AdmissionGuidelines.universityLink.metaModal.test.tsx로 옮겼다 —
  // AdmissionMetaEditModal이 AdmissionModalShell을 통해 Portal로 렌더하는
  // shadcn/ui Dialog(Base UI)로 바뀌면서(task: AdmissionModalShell Base UI
  // 전환) 이 파일의 `@vitest-environment node` + renderToStaticMarkup
  // 조합으로는 더 이상 렌더할 수 없다(포털 미지원, 선례:
  // EvaluationReportModal.test.tsx). 그 새 파일의 헤더 주석에 이전 배경이
  // 있다.
});
