// @vitest-environment node
//
// 대입모집요강 요약과 첨부(PDF) 증거 테스트 (사 #67, 결정 107.18).
//
// 사 #67: "상세에서 요강 요약, 첨부 파일(PDF), 대학 공식 링크를 제공한다.
// 첨부는 다운로드와 새 창 보기를 지원한다." 위닝 운영 화면 그대로 쓰므로 코드는
// 바꾸지 않고, 이 파일이 현재 동작을 증명한다. 별도 다운로드 버튼은 두지 않는다
// (PDF는 새 창에서 열고 저장은 브라우저 PDF 보기를 쓴다).
//
// 방식: AdmissionGuidelines.universityLink.test.tsx 와 같이 현재 소스에서 대상
// 함수만 잘라내 하네스로 굽는다. 앵커가 깨지면 조용히 통과하지 않고 throw 한다.
// 모달 본문 fetch 자체는 페이지 컴포넌트 안이라 여기서 다루지 않는다. 요약 버튼이
// 모달 요청(대학 이름, 섹션, 행)을 올리는 배선까지 확인한다.
//
// 실행: npx vitest run src/pages/AdmissionGuidelines.summaryAndPdf.test.tsx

import fs from "node:fs";
import path from "node:path";
import * as esbuild from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");
const PAGE_REL = "src/pages/AdmissionGuidelines.tsx";

function sliceOnce(source: string, start: string, end: string, what: string) {
  const idx = source.indexOf(start);
  if (idx === -1 || source.indexOf(start, idx + 1) !== -1) {
    throw new Error(
      `${what} 슬라이스 시작 앵커가 정확히 1개가 아니다: ${JSON.stringify(start)}`,
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

type RowProps = {
  university: { name: string; region: string };
  row: Record<string, unknown> | null;
  onOpenInfo: (payload: unknown) => void;
};

type Harness = {
  Row: (props: RowProps) => React.ReactElement;
  INFO_SECTIONS: { key: string; label: string }[];
};

async function loadHarness(): Promise<Harness> {
  const src = fs.readFileSync(path.join(REPO_ROOT, PAGE_REL), "utf8");
  const infoSections = sliceOnce(
    src,
    "const INFO_SECTIONS = [",
    "\nconst LINK_SECTIONS",
    "INFO_SECTIONS",
  );
  const linkSections = sliceOnce(
    src,
    "const LINK_SECTIONS = [",
    "\n];",
    "LINK_SECTIONS",
  );
  const categoryInfoSections = sliceOnce(
    src,
    "const CATEGORY_INFO_SECTIONS = [",
    "\n];",
    "CATEGORY_INFO_SECTIONS",
  );
  const sectionHasContent = sliceOnce(
    src,
    "function sectionHasContent(row, section) {",
    "\n}\n",
    "sectionHasContent",
  );
  const infoButton = sliceOnce(
    src,
    "function InfoButton({",
    "\n// 외부 절대 URL만",
    "InfoButton",
  );
  const externalUrl = sliceOnce(
    src,
    "function externalUrl(value) {",
    "\nfunction ",
    "externalUrl",
  );
  const linkButton = sliceOnce(
    src,
    "function LinkButton({",
    "\n// InfoButton 클릭 시",
    "LinkButton",
  );
  const requestInfo = sliceOnce(
    src,
    "function requestUniversityInfo(",
    "\nfunction ",
    "requestUniversityInfo",
  );
  const rowFn = sliceOnce(
    src,
    "function UniversityResourceRow({ university, row, onOpenInfo }) {",
    "\nfunction UniversityResourceTable(",
    "UniversityResourceRow",
  );
  const harness = `
import React from 'react';
const HWP_SECTION_JSON_KEYS = {};
const getFirstUrl = (row, keys) => {
  if (!row) return '';
  for (const key of keys) {
    const v = typeof row[key] === 'string' ? row[key].trim() : '';
    if (v) return v;
  }
  return '';
};
${infoSections}
${linkSections}
];
${categoryInfoSections}
];
${sectionHasContent}
}
${infoButton}
${externalUrl}
${linkButton}
${requestInfo}
${rowFn}
export const Row = UniversityResourceRow;
export { INFO_SECTIONS };
`;
  const out = await esbuild.transform(harness, {
    loader: "tsx",
    jsx: "automatic",
    jsxImportSource: "react",
    format: "esm",
  });
  const tmpFile = path.join(
    REPO_ROOT,
    `.tmp-guideline-summary-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`,
  );
  fs.writeFileSync(tmpFile, out.code);
  try {
    return (await import(`file://${tmpFile}`)) as Harness;
  } finally {
    fs.rmSync(tmpFile, { force: true });
  }
}

type El = { type?: unknown; props?: Record<string, unknown> };

function findAll(
  node: unknown,
  predicate: (n: El) => boolean,
  hits: El[] = [],
) {
  if (!node || typeof node !== "object") return hits;
  if (Array.isArray(node)) {
    for (const child of node) findAll(child, predicate, hits);
    return hits;
  }
  const n = node as El;
  if (predicate(n)) hits.push(n);
  findAll(n.props?.children, predicate, hits);
  return hits;
}

const university = { name: "가톨릭관동대학교", region: "강원" };

function render(h: Harness, row: Record<string, unknown> | null) {
  return renderToStaticMarkup(
    React.createElement(h.Row, { university, row, onOpenInfo: () => {} }),
  );
}

describe("대입모집요강 요약과 첨부 (사 #67)", () => {
  test("요약 섹션 6개가 전년도와 차이점(수시) 등 정해진 이름으로 있다", async () => {
    const h = await loadHarness();
    expect(h.INFO_SECTIONS.map((s) => s.label)).toEqual([
      "전년도와 차이점(수시)",
      "전형방법",
      "최저학력기준",
      "대학별고사일",
      "학생부반영방법",
      "모집인원 및 입결",
    ]);
  });

  test("내용이 있는 요약 섹션은 보기 버튼이고, 누르면 그 섹션과 대학 이름으로 모달 요청을 올린다", async () => {
    const h = await loadHarness();
    const row = { id: "row-1", has_selection_method: true };
    const requests: unknown[] = [];
    const tree = h.Row({
      university,
      row,
      onOpenInfo: (payload) => requests.push(payload),
    });
    const buttons = findAll(
      tree,
      (n) => typeof n.type === "function" && "onOpen" in (n.props ?? {}),
    );
    const selection = buttons.find(
      (b) =>
        (b.props?.section as { key: string } | undefined)?.key ===
        "selection_method",
    );
    if (!selection?.props) throw new Error("전형방법 보기 버튼이 없다");
    (selection.props.onOpen as (s: unknown) => void)(selection.props.section);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      universityName: "가톨릭관동대학교",
      section: { key: "selection_method", label: "전형방법" },
      row,
    });

    const html = render(h, row);
    expect(html).toContain('title="전형방법 보기"');
    expect(html).toContain('title="최저학력기준: 등록된 정보가 없습니다."');
  });

  test("정시모집요강(PDF) 보기 링크는 행의 URL을 새 창으로 연다", async () => {
    const h = await loadHarness();
    const url = "https://ex.ac.kr/guide.pdf";
    const html = render(h, { id: "row-1", jungsi_guideline_url: url });
    const tag =
      html.match(/<a\b[^>]*title="정시모집요강 열기"[^>]*>/)?.[0] ?? "";
    expect(tag).toContain(`href="${url}"`);
    expect(tag).toContain('target="_blank"');
    expect(tag).toContain('rel="noopener noreferrer"');
    expect(html).toContain(">보기</a>");
  });

  test("정시모집요강 URL이 없거나 절대 주소가 아니면 링크 없이 -와 안내 제목을 보인다", async () => {
    const h = await loadHarness();
    for (const row of [
      { id: "row-1" },
      { id: "row-2", jungsi_guideline_url: "-" },
    ]) {
      const html = render(h, row);
      expect(html).toContain(
        'title="정시모집요강 URL이 아직 등록되지 않았습니다."',
      );
      expect(html).not.toContain('title="정시모집요강 열기"');
    }
  });
});
