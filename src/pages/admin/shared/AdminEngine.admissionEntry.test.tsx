// @vitest-environment node
//
// 어드민 대학모집요강 목록 — "편집 진입 경로" 검증 — scripts/verify-admission-admin-entry.mjs
// 이식.
//
// 무엇을 지키나
// -------------
// 이 저장소의 다른 게이트들은 전부 **문서 블록의 렌더 출력**(Gate A/A2/B,
// drift, block-render, table-editor …)이나 모달 껍데기·표면 CSS만 본다.
// "관리자가 그 편집기에 **도달할 수 있는가**"를 보는 게이트는 이 파일뿐이다.
// 그런데 실제로 가장 조용히 깨지는 게 그 축이다 — 편집기는 멀쩡한데 버튼이
// 없어서 못 여는 상태는 어떤 바이트 계약도 위반하지 않는다.
//
// 실제 사고가 이 파일의 존재 이유다: 목록 셀에 `summary === '내용 없음' →
// <span>-</span>` 게이트가 있어서 dev DB 55칸(특수대학 11개교 × 5카테고리)이
// 목록에서 열리지 않았다. 그 11개교는 전형방법 1칸만 내용이 있고 나머지
// 5칸이 전부 비어 있어, "빈 칸을 채운다"는 동작 자체가 불가능했다.
//
// 어떻게 보나 — 소스 스캔이 아니라 **실제 슬라이스 SSR**
// -------------------------------------------------------
// 소스에서 해당 분기·함수만 기계적으로 잘라내 하네스로 감싸고
// renderToStaticMarkup 한다. 슬라이스는 매 실행마다 현재 소스에서 다시 뜨므로
// 이 파일은 사본이 아니라 실제 엔진/config 파일을 검사한다. 앵커가 깨지면
// 조용히 통과하지 않고 throw한다.
//
// 이식 메모(node:test → Vitest, task 10.6) — **구조 이동 3건**
// -----------------------------------------------------------
// 원본은 전부 src/pages/Admin.jsx(6,000줄+) 하나를 봤다. 그 파일은 task
// 16~19(Admin.jsx 1~4단계 리팩터)로 제네릭 엔진(AdminEngine.tsx) + 도메인별
// config 파일(configs/*.ts)로 갈라졌다 — 아래 3곳은 단순 경로 드리프트가
// 아니라 검증 대상 자체가 다른 파일로 옮겨간 **구조 이동**이다.
//
//   1) 셀 스위치(admissionSection/fileList 분기)·관리 열(✏️/⚙️/🗑) 렌더 —
//      AdminEngine.tsx(제네릭 엔진, 36개 config가 공유)로 이동.
//   2) hideRowEdit/showMetaEdit 플래그 선언 — configs/admission.ts(도메인별
//      config 파일)로 이동. "이 플래그가 소스 전체에서 정확히 1회만
//      등장한다"는 원본의 안전장치를 지키려면 이제 admission.ts 한 곳이
//      아니라 configs/ 아래 **모든** 도메인 파일을 스캔해야 한다 — 한
//      파일만 보면 다른 도메인 파일에 실수로 복제돼도 못 잡는다.
//   3) FormPreview 배선(entry:8) — 원본은 "wired"(선언)·"rendered"(사용)·
//      "defined"(정의) 3가지를 **Admin.jsx 한 파일**의 정규식으로 봤다.
//      지금은 세 곳이 전부 다른 파일이다: 배선(FormPreview: AdmissionParsingPreview)은
//      configs/admission.ts, 렌더(<config.FormPreview>)는 AdminEngine.tsx,
//      정의(function AdmissionParsingPreview)는 configs/admissionGuidelinesForm.tsx.
//      추가로 "정의를 배선이 실제로 import 하는가"를 새 축(entry:8-import)으로
//      더했다 — 파일이 갈리면서 새로 생긴 위험(같은 이름의 다른 함수를
//      import하거나 import 자체가 빠지는 사고)이라 원본에 없던 축이다.
//
// AdmissionGroupField(entry:13/14)도 시그니처 자체가 바뀌었다 — 원본은 이
// 함수 하나가 raw/html/admissionDoc 3분기를 전부 내부에서 결정했지만, 지금은
// `field.type !== 'admissionDoc' ? null : <wrapper>{children}</wrapper>`
// 로만 줄고, "무엇을 children으로 넘길지"는 호출부(AdminForm의
// groupFields.map)가 결정한다. 그래서 두 조각(AdmissionGroupField 함수 +
// groupFields.map 배선)을 각각 슬라이스해 조합해야 원본과 같은 계약
// ("raw/html은 렌더 안 됨, admissionDoc만 렌더됨")을 검증할 수 있다.
//
// 실행: npx vitest run src/pages/admin/shared/AdminEngine.admissionEntry.test.tsx

import fs from "node:fs";
import path from "node:path";
import * as esbuild from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..", "..", "..");
const ADMIN_ENGINE_REL = "src/pages/admin/shared/AdminEngine.tsx";
const ADMISSION_CONFIG_REL = "src/pages/admin/configs/admission.ts";
const CONFIGS_DIR_REL = "src/pages/admin/configs";
const FORM_PREVIEW_DEF_REL =
  "src/pages/admin/configs/admissionGuidelinesForm.tsx";
// META_MODAL_REL(AdmissionMetaEditModal 경로 상수)은 entry:12가
// AdminEngine.admissionEntry.metaModal.test.tsx로 옮겨가며 함께 옮겼다.

const CELL_SLICE_START = 'column.type === "admissionSection" ? (';
const CELL_SLICE_END = ') : column.type === "fileList" ? (';

// 관리 열(✏️/🗑) 슬라이스 앵커. 소스 전체에서 정확히 1개여야 한다.
const MANAGE_ANCHOR = "onClick={() => onEdit(row)}";

const GROUP_FIELD_START = "function AdmissionGroupField({";
const GROUP_FIELD_END = "\nexport function AdminForm<";
const COMPOSITION_START = "{groupFields.map((field) => (";
const COMPOSITION_END = "))}";

const read = (rel: string) =>
  fs.readFileSync(path.join(REPO_ROOT, rel), "utf8");

// ── esbuild 하네스 굽기 ──────────────────────────────────────────────────
async function bakeHarness(harness: string, tag: string) {
  const out = await esbuild.transform(harness, {
    loader: "tsx",
    jsx: "automatic",
    jsxImportSource: "react",
    format: "esm",
  });
  const tmpFile = path.join(
    REPO_ROOT,
    `.tmp-admin-entry-${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`,
  );
  fs.writeFileSync(tmpFile, out.code);
  try {
    const mod = await import(`file://${tmpFile}`);
    return mod.default;
  } finally {
    fs.rmSync(tmpFile, { force: true });
  }
}

// loadModule(esbuild.build 기반 실제 .tsx 모듈 번들+import)은 entry:12가
// AdminEngine.admissionEntry.metaModal.test.tsx로 옮겨가며 유일한 호출부를
// 잃어 함께 옮겼다 — 이 파일에 남은 나머지 테스트는 전부 bakeHarness(문자열
// 슬라이스 하네스)만 쓴다.

// ── 셀 분기 기계 슬라이스 ──────────────────────────────────────────────
function sliceSectionCell(source: string) {
  const startIdx = source.indexOf(CELL_SLICE_START);
  if (
    startIdx === -1 ||
    source.indexOf(CELL_SLICE_START, startIdx + 1) !== -1
  ) {
    throw new Error(
      `셀 슬라이스 앵커 "${CELL_SLICE_START}" 가 정확히 1개가 아니다. ` +
        "리팩터로 앵커가 사라졌다면 이 파일 상단의 이식 메모를 읽고 복원하라.",
    );
  }
  const bodyStart = startIdx + CELL_SLICE_START.length;
  const endIdx = source.indexOf(CELL_SLICE_END, bodyStart);
  if (endIdx === -1) {
    throw new Error(
      `셀 슬라이스 종료 앵커 "${CELL_SLICE_END}" 를 찾지 못했다.`,
    );
  }
  return source.slice(bodyStart, endIdx);
}

async function loadSectionCell(sliceText: string) {
  const harness = `
import React from 'react';
export default function SectionCellHarness({ sectionSummaries, index, column, row, onOpenSection }: any) {
  return (
    <>
      {${sliceText}}
    </>
  );
}
`;
  return bakeHarness(harness, "section-cell");
}

// ── 관리 열 <td> 기계 슬라이스 ────────────────────────────────────────
function sliceManageCell(source: string) {
  const first = source.indexOf(MANAGE_ANCHOR);
  if (first === -1 || source.indexOf(MANAGE_ANCHOR, first + 1) !== -1) {
    throw new Error(
      `관리 열 앵커 "${MANAGE_ANCHOR}" 가 정확히 1개가 아니다. ` +
        "리팩터로 앵커가 사라졌다면 이 파일 상단의 이식 메모를 읽고 복원하라.",
    );
  }
  const start = source.lastIndexOf("<TableCell", first);
  const end = source.indexOf("</TableCell>", first);
  if (start === -1 || end === -1)
    throw new Error("관리 열 <TableCell> 경계를 찾지 못했다.");
  return source.slice(start, end + "</TableCell>".length);
}

async function loadManageCell(sliceText: string) {
  const harness = `
import React from 'react';
const Eye = () => <i data-icon="eye" />;
const Edit3 = () => <i data-icon="edit3" />;
const Trash2 = () => <i data-icon="trash2" />;
const Settings = () => <i data-icon="settings" />;
// 슬라이스가 ui TableCell 을 쓰므로 같은 td 로 렌더하는 스텁을 둔다.
const TableCell = (props: any) => <td {...props} />;
// activeKey: 관리 열 마지막 분기(환불완료 버튼, refundRequests 탭 전용)가
// 참조하는 자유 변수. entry:9/11 검사 대상(✏️/⚙️/🗑)과 무관해 항상 그
// 분기를 비활성으로 둔다 — onCompleteRefund/isRefundCompletionBlocked는
// && 단락 평가로 아예 호출되지 않으므로 스텁이 필요 없다.
const activeKey = "admissionGuidelines";
export default function ManageCellHarness({ config, row, onEdit, onDelete, onOpenMetaEdit }: any) {
  return (
    <table><tbody><tr>
      ${sliceText}
    </tr></tbody></table>
  );
}
`;
  return bakeHarness(harness, "manage-cell");
}

// ── AdmissionGroupField + groupFields.map 배선 기계 슬라이스(entry:13/14) ──
function sliceAdmissionGroupField(source: string) {
  const start = source.indexOf(GROUP_FIELD_START);
  if (start === -1 || source.indexOf(GROUP_FIELD_START, start + 1) !== -1) {
    throw new Error(
      "AdmissionGroupField 슬라이스 시작 앵커가 정확히 1개가 아니다. " +
        "리팩터로 시그니처가 바뀌었다면 이 파일의 GROUP_FIELD_START를 맞춰 고쳐라.",
    );
  }
  const end = source.indexOf(GROUP_FIELD_END, start);
  if (end === -1) {
    throw new Error(
      `AdmissionGroupField 슬라이스 종료 앵커 "${GROUP_FIELD_END}" 를 찾지 못했다.`,
    );
  }
  return source.slice(start, end).trim();
}

function sliceGroupFieldComposition(source: string) {
  const start = source.indexOf(COMPOSITION_START);
  if (start === -1 || source.indexOf(COMPOSITION_START, start + 1) !== -1) {
    throw new Error(
      "groupFields.map 배선 슬라이스 시작 앵커가 정확히 1개가 아니다. " +
        "리팩터로 배선이 바뀌었다면 이 파일의 COMPOSITION_START를 맞춰 고쳐라.",
    );
  }
  const end = source.indexOf(COMPOSITION_END, start);
  if (end === -1) {
    throw new Error(
      `groupFields.map 배선 슬라이스 종료 앵커 "${COMPOSITION_END}" 를 찾지 못했다.`,
    );
  }
  return source.slice(start, end + COMPOSITION_END.length);
}

async function loadGroupFieldHarness(adminEngineSrc: string) {
  const groupFieldFn = sliceAdmissionGroupField(adminEngineSrc);
  const composition = sliceGroupFieldComposition(adminEngineSrc);
  const harness = `
import React from 'react';
function AdmissionDocFieldEditor({ field }: any) {
  return <div data-testid="doc-editor" data-key={field.key} />;
}
${groupFieldFn}
export default function GroupFieldsHarness({ groupFields, form }: any) {
  const patch = () => {};
  const setDirty = () => {};
  return <>${composition}</>;
}
`;
  return bakeHarness(harness, "group-field");
}

// 주석에는 계약 문자열이 설명 목적으로 잔뜩 등장한다(이 저장소 관행). 락은
// **코드**를 봐야 하므로 주석을 걷어낸 사본에서 검사한다.
function stripComments(source: string) {
  return source
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "") // JSX 주석 {/* … */}
    .replace(/\/\*[\s\S]*?\*\//g, "") // 블록 주석
    .replace(/(^|[^:'"`\\])\/\/[^\n]*/g, "$1"); // 줄 주석(URL 의 // 는 제외)
}

// 어떤 인덱스가 어떤 config 블록 안에 있는지 판정한다. config는
// `<key>: { … }` 형태의 최상위(2-space indent) 객체 리터럴 항목이다.
function configKeyAt(code: string, index: number): string | null {
  const head = code.slice(0, index);
  const re = /\n {2}([A-Za-z_$][\w$]*): \{/g;
  let last: string | null = null;
  let m = re.exec(head);
  while (m) {
    last = m[1] ?? null;
    m = re.exec(head);
  }
  return last;
}

// configs/ 아래 모든 도메인 config 파일(*.ts, *.test.ts 제외)에서 flag
// 선언을 스캔한다 — hideRowEdit/showMetaEdit는 admission.ts 한 곳에만
// 있어야 하는데, 도메인별로 파일이 갈린 지금은 admission.ts만 보면 다른
// 도메인 파일에 실수로 복제돼도 못 잡는다.
function scanConfigFlag(flagPattern: RegExp) {
  const dir = path.join(REPO_ROOT, CONFIGS_DIR_REL);
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
  const owners: { file: string; owner: string | null }[] = [];
  let count = 0;
  for (const file of files) {
    const code = stripComments(fs.readFileSync(path.join(dir, file), "utf8"));
    const decls = [...code.matchAll(flagPattern)];
    for (const m of decls) {
      count += 1;
      owners.push({ file, owner: configKeyAt(code, m.index ?? 0) });
    }
  }
  return { count, owners };
}

describe("어드민 대학모집요강 편집 진입 경로 검증", () => {
  const adminEngineSrc = read(ADMIN_ENGINE_REL);

  const makeProps = (summary: string, sink: unknown[][]) => ({
    sectionSummaries: [{ selection_method: summary }],
    index: 0,
    column: { sectionKey: "selection_method" },
    row: { id: "fixture", university_name: "검증대학교" },
    onOpenSection: (...args: unknown[]) => sink.push(args),
  });

  const EMPTY = "내용 없음";
  const RAW_ONLY = "원문 있음(문서 미생성)";
  const FILLED = "표 1개 · 5열 12행";

  test("entry:1. 요약이 '내용 없음'인 빈 카테고리 칸에서도 <button>이 렌더된다(진입 게이트 부활 차단)", async () => {
    const SectionCell = await loadSectionCell(sliceSectionCell(adminEngineSrc));
    const html = renderToStaticMarkup(
      React.createElement(SectionCell, makeProps(EMPTY, [])),
    );
    expect(/<button\b/.test(html), html).toBe(true);
  });

  test("entry:2. 빈 칸/원문만 있음/내용 있음 3상태 전부 onOpenSection(row, sectionKey)를 조건 없이 호출한다", async () => {
    const SectionCell = await loadSectionCell(sliceSectionCell(adminEngineSrc));
    const detail: Record<string, unknown> = {};
    let pass = true;
    for (const summary of [EMPTY, RAW_ONLY, FILLED]) {
      const clicks: unknown[][] = [];
      const props = makeProps(summary, clicks);
      const el = React.createElement(SectionCell, props);
      const rendered = (el.type as (p: unknown) => unknown)(el.props);
      const button = findButton(rendered);
      (button?.props?.onClick as (() => void) | undefined)?.();
      const firstClick = clicks[0];
      const ok =
        Boolean(button) &&
        clicks.length === 1 &&
        firstClick?.[1] === "selection_method";
      detail[summary] = { hasButton: Boolean(button), clicks };
      if (!ok) pass = false;
    }
    expect(pass, JSON.stringify(detail)).toBe(true);
  });

  test("entry:3. 빈 칸 라벨은 '추가', 내용/원문 있는 칸 라벨은 '수정'", async () => {
    const SectionCell = await loadSectionCell(sliceSectionCell(adminEngineSrc));
    const renderCell = (summary: string) =>
      renderToStaticMarkup(
        React.createElement(SectionCell, makeProps(summary, [])),
      );
    const empty = renderCell(EMPTY);
    const filled = renderCell(FILLED);
    const rawOnly = renderCell(RAW_ONLY);
    const pass =
      empty.includes("추가") &&
      !empty.includes("수정") &&
      filled.includes("수정") &&
      !filled.includes("추가") &&
      rawOnly.includes("수정");
    expect(pass, JSON.stringify({ empty, filled, rawOnly })).toBe(true);
  });

  // ===================================================================
  // entry:4~8 — 목록 '관리' 열 행 수정(✏️) 버튼 게이팅(소스 락)
  // ===================================================================
  const code = stripComments(adminEngineSrc);
  const manageCell = (() => {
    const anchor = code.indexOf(MANAGE_ANCHOR);
    if (anchor === -1) return null;
    const start = code.lastIndexOf("<TableCell", anchor);
    const end = code.indexOf("</TableCell>", anchor);
    if (start === -1 || end === -1) return null;
    return code.slice(start, end + "</TableCell>".length);
  })();

  test("entry:4. 관리 열의 onEdit(row) 버튼이 `{!config.hideRowEdit && (` 로 감싸져 있다", () => {
    const pass =
      Boolean(manageCell) &&
      /\{!config\.hideRowEdit && \(\s*<button/.test(manageCell!) &&
      manageCell!.includes("onClick={() => onEdit(row)}");
    expect(
      pass,
      manageCell
        ? manageCell.slice(0, 500)
        : "관리 열 <TableCell> 를 찾지 못했다",
    ).toBe(true);
  });

  test("entry:5. `hideRowEdit: true` 가 configs/ 전체에서 정확히 1회, admissionGuidelines config 안에만 있다(35개 메뉴 감염 방지)", () => {
    const { count, owners } = scanConfigFlag(/\bhideRowEdit:\s*true\b/g);
    const pass = count === 1 && owners[0]?.owner === "admissionGuidelines";
    expect(pass, JSON.stringify({ count, owners })).toBe(true);
  });

  test("entry:6. 🗑(onDelete) 버튼이 여전히 존재하고 !config.readOnly 게이트를 유지한다(사용자 미언급 = 손대지 않음)", () => {
    const pass =
      Boolean(manageCell) &&
      /\{!config\.readOnly && \(\s*<button/.test(manageCell!) &&
      manageCell!.includes("onClick={() => onDelete(row)}") &&
      manageCell!.includes("<Trash2 size={17} />");
    expect(
      pass,
      manageCell
        ? manageCell.slice(0, 800)
        : "관리 열 <TableCell> 를 찾지 못했다",
    ).toBe(true);
  });

  test("entry:7. `config.readOnly ? <Eye /> : <Edit3 />` 분기가 그대로다(readOnly 메뉴의 상세보기 파손 방지)", () => {
    const pass =
      Boolean(manageCell) &&
      /config\.readOnly \?[\s\S]*?<Eye size=\{17\} \/>[\s\S]*?<Edit3 size=\{17\} \/>/.test(
        manageCell!,
      );
    expect(
      pass,
      manageCell
        ? manageCell.slice(0, 500)
        : "관리 열 <TableCell> 를 찾지 못했다",
    ).toBe(true);
  });

  test("entry:8. AdmissionParsingPreview 가 여전히 config.FormPreview 로 배선·렌더된다(신규 등록 폼의 HWP 파싱 경로 생존) — 배선/렌더/정의 3개 파일에 걸쳐 있다", () => {
    const configCode = stripComments(read(ADMISSION_CONFIG_REL));
    const wired = /FormPreview:\s*AdmissionParsingPreview/.test(configCode);
    const rendered = /<config\.FormPreview\b/.test(code);
    const definitionSrc = stripComments(read(FORM_PREVIEW_DEF_REL));
    const defined = /export function AdmissionParsingPreview\(/.test(
      definitionSrc,
    );
    // 파일이 갈리면서 새로 생긴 위험: wired가 참조하는 이름을 admission.ts가
    // 실제로 import 하는지는 원본(단일 파일) 시절엔 존재할 수 없던 축이다.
    const imported =
      /import\s*\{[^}]*\bAdmissionParsingPreview\b[^}]*\}\s*from\s*["']\.\/admissionGuidelinesForm["']/.test(
        configCode,
      );
    const pass = wired && rendered && defined && imported;
    expect(pass, JSON.stringify({ wired, rendered, defined, imported })).toBe(
      true,
    );
  });

  // ── entry:9 — 게이팅이 **실제 렌더**에서 정확히 1개 메뉴에만 걸린다 ──
  test("entry:9. 관리 열 실제 렌더 — hideRowEdit=✏️만 사라짐 / 기본 config=✏️🗑 보존 / readOnly=👁 보존(35개 메뉴 동반 파괴 차단)", async () => {
    const ManageCell = await loadManageCell(sliceManageCell(adminEngineSrc));
    const renderManage = (config: Record<string, boolean>) => {
      const clicks: unknown[][] = [];
      const html = renderToStaticMarkup(
        React.createElement(ManageCell, {
          config,
          row: { id: "fixture" },
          onEdit: (...a: unknown[]) => clicks.push(["edit", ...a]),
          onDelete: (...a: unknown[]) => clicks.push(["delete", ...a]),
        }),
      );
      return {
        edit: html.includes('data-icon="edit3"'),
        eye: html.includes('data-icon="eye"'),
        trash: html.includes('data-icon="trash2"'),
      };
    };
    const a = renderManage({ hideRowEdit: true });
    const b = renderManage({});
    const c = renderManage({ readOnly: true });
    const pass =
      !a.edit &&
      !a.eye &&
      a.trash &&
      b.edit &&
      !b.eye &&
      b.trash &&
      c.eye &&
      !c.edit &&
      !c.trash;
    expect(
      pass,
      JSON.stringify({ hideRowEdit: a, default: b, readOnly: c }),
    ).toBe(true);
  });

  // ===================================================================
  // entry:10~12 — 목록 '관리' 열 ⚙️(메타 전용 모달) 진입점
  // ===================================================================

  test("entry:10. `showMetaEdit: true` 가 configs/ 전체에서 정확히 1회, admissionGuidelines config 안에만 있다(35개 메뉴 감염 방지)", () => {
    const { count, owners } = scanConfigFlag(/\bshowMetaEdit:\s*true\b/g);
    const pass = count === 1 && owners[0]?.owner === "admissionGuidelines";
    expect(pass, JSON.stringify({ count, owners })).toBe(true);
  });

  test('entry:11. showMetaEdit=true 인 config 만 ⚙️(data-icon="settings")를 렌더하고 클릭 시 onOpenMetaEdit(row)를 조건 없이 호출한다; 기본 config 는 렌더하지 않는다', async () => {
    const ManageCell = await loadManageCell(sliceManageCell(adminEngineSrc));
    const renderWithMeta = (config: Record<string, boolean>) => {
      const clicks: unknown[][] = [];
      const element = React.createElement(ManageCell, {
        config,
        row: { id: "fixture" },
        onEdit: () => {},
        onDelete: () => {},
        onOpenMetaEdit: (...a: unknown[]) => clicks.push(a),
      });
      const html = renderToStaticMarkup(element);
      const settingsIcon = html.includes('data-icon="settings"');
      const rendered = (element.type as unknown as (p: unknown) => unknown)(
        element.props,
      );
      const button = findByAriaLabel(rendered, "메타 정보 수정");
      (button?.props?.onClick as (() => void) | undefined)?.();
      return { settingsIcon, hasButton: Boolean(button), clicks };
    };
    const withFlag = renderWithMeta({ showMetaEdit: true });
    const withoutFlag = renderWithMeta({});
    const firstClickRow = withFlag.clicks[0]?.[0] as
      | { id?: string }
      | undefined;
    const pass =
      withFlag.settingsIcon &&
      withFlag.hasButton &&
      withFlag.clicks.length === 1 &&
      firstClickRow?.id === "fixture" &&
      !withoutFlag.settingsIcon &&
      !withoutFlag.hasButton;
    expect(pass, JSON.stringify({ withFlag, withoutFlag })).toBe(true);
  });

  // entry:12(AdmissionMetaEditModal 렌더 검증)는
  // AdminEngine.admissionEntry.metaModal.test.tsx로 옮겼다 — AdmissionMetaEditModal이
  // AdmissionModalShell을 통해 Portal로 렌더하는 shadcn/ui Dialog(Base UI)로
  // 바뀌면서(task: AdmissionModalShell Base UI 전환) 이 파일의
  // `@vitest-environment node` + renderToStaticMarkup 조합으로는 더 이상 렌더할
  // 수 없다(포털 미지원, 선례: EvaluationReportModal.test.tsx). 그 새 파일의
  // 헤더 주석에 이전 배경이 있다.

  // ===================================================================
  // entry:13~14 — 카테고리 편집 다이얼로그: 원문(raw)/HTML 미러 접힘 패널 제거
  // ===================================================================

  test("entry:13. 카테고리 편집 다이얼로그 본문 — raw/html 필드는 아무것도 렌더하지 않고(빈 문자열), admissionDoc 필드만 렌더된다", async () => {
    const GroupFields = await loadGroupFieldHarness(adminEngineSrc);
    const rawField = {
      key: "selection_method",
      type: "textarea",
      group: "selection_method",
    };
    const htmlField = {
      key: "selection_method_html",
      type: "textarea",
      readOnly: true,
      group: "selection_method",
    };
    const docField = {
      key: "selection_method_json",
      type: "admissionDoc",
      sectionKey: "selection_method",
      group: "selection_method",
    };
    const form = {
      selection_method: "원문 텍스트",
      selection_method_html: "<p>미러</p>",
    };
    const renderOne = (field: unknown) =>
      renderToStaticMarkup(
        React.createElement(GroupFields, { groupFields: [field], form }),
      );
    const rawHtml = renderOne(rawField);
    const htmlHtml = renderOne(htmlField);
    const docHtml = renderOne(docField);
    const combined = rawHtml + htmlHtml + docHtml;
    const pass =
      rawHtml === "" &&
      htmlHtml === "" &&
      !combined.includes("원문(raw) 보기/편집") &&
      !combined.includes("HTML 미러 보기") &&
      !combined.includes("<details") &&
      docHtml.includes('data-testid="doc-editor"') &&
      docHtml.includes("admission-surface");
    expect(
      pass,
      JSON.stringify({ rawHtml, htmlHtml, docHtmlLen: docHtml.length }),
    ).toBe(true);
  });

  test("entry:14. admissionGuidelines.fields — raw 6개 + html 6개(총 12개) 필드 정의가 group과 함께 소스에 그대로 남아 있다(렌더 제거 ≠ 필드 삭제)", () => {
    const configCode = stripComments(read(ADMISSION_CONFIG_REL));
    const HWP_KEYS = [
      "previous_year_changes",
      "selection_method",
      "minimum_requirements",
      "exam_schedule",
      "school_record_method",
      "recruitment_quota",
    ];
    const missing: string[] = [];
    for (const key of HWP_KEYS) {
      const rawDecl = new RegExp(
        `key:\\s*"${key}",[\\s\\S]{0,200}?type:\\s*"textarea",[\\s\\S]{0,120}?group:\\s*"${key}"`,
      );
      if (!rawDecl.test(configCode)) missing.push(`raw:${key}`);
    }
    const HTML_KEY_MAP: Record<string, string> = {
      previous_year_changes: "previous_year_changes_html",
      selection_method: "selection_method_html",
      minimum_requirements: "minimum_requirements_html",
      exam_schedule: "exam_schedule_html",
      school_record_method: "school_record_method_html",
      recruitment_quota: "recruitment_result_html",
    };
    for (const [group, htmlKey] of Object.entries(HTML_KEY_MAP)) {
      const htmlDecl = new RegExp(
        `key:\\s*"${htmlKey}",[\\s\\S]{0,200}?type:\\s*"textarea",[\\s\\S]{0,120}?readOnly:\\s*true,[\\s\\S]{0,120}?group:\\s*"${group}"`,
      );
      if (!htmlDecl.test(configCode)) missing.push(`html:${htmlKey}`);
    }
    expect(missing.length === 0, JSON.stringify({ missing })).toBe(true);
  });
});

// 렌더 트리에서 첫 <button> 엘리먼트를 찾는다. SSR 문자열엔 핸들러가 남지
// 않으므로, "버튼이 실제로 핸들러를 부르는가"는 엘리먼트 트리로 본다.
function findButton(
  node: unknown,
): { type?: unknown; props?: Record<string, unknown> } | null {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = findButton(child);
      if (hit) return hit;
    }
    return null;
  }
  const n = node as { type?: unknown; props?: { children?: unknown } };
  if (n.type === "button")
    return n as { type?: unknown; props?: Record<string, unknown> };
  return findButton(n.props?.children);
}

function findByAriaLabel(
  node: unknown,
  label: string,
): { type?: unknown; props?: Record<string, unknown> } | null {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = findByAriaLabel(child, label);
      if (hit) return hit;
    }
    return null;
  }
  const n = node as { props?: { "aria-label"?: string; children?: unknown } };
  if (n.props?.["aria-label"] === label)
    return n as { type?: unknown; props?: Record<string, unknown> };
  return findByAriaLabel(n.props?.children, label);
}
