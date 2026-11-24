// HWP 기반 대입모집요강 데이터의 순수 파싱·정규화·HTML 생성 로직 모음.
// React/DOM 의존 없이 동작해야 하며, 브라우저와 node(스크립트) 양쪽에서 import 가능해야 한다.

// 경찰대학·사관학교·과기원 하드코딩 상수. Phase 4에서 src/data/로 이관했다
// (아래 buildScienceSpecialHtml 등에서 그대로 소비).
import {
  ACADEMY_SPECIAL_DATA,
  POLICE_SPECIAL_DATA,
  SCIENCE_SPECIAL_DATA,
} from "@/data/admissionSpecialUniversityData.js";
// 타입 전용 import — 런타임 값은 전혀 끌어오지 않는다(isolatedModules가
// `import type`을 완전히 지워 번들에서 사라진다). admissionDoc.ts가
// "admissionParsing.js를 import하지 않는다"고 선언한 순환 의존 회피
// 원칙은 값 레벨 import 방향에 대한 것이라, 이 타입 전용 import로는
// 깨지지 않는다(admissionDoc.ts → admissionParsing.ts 방향 값 import는
// 여전히 없음).
import type {
  AdmissionDoc,
  Block,
  SectionKey,
  Warning,
} from "./admissionDoc.js";

export function clean(value) {
  return String(value || "").trim();
}

function sanitizeAdmissionDisplayText(
  value,
  { keepMajorFootnote = false } = {},
) {
  let text = clean(value);
  if (!text) return "";

  // 화면용 데이터에서는 원표 체크/주석 기호를 노출하지 않는다.
  // 모집단위의 (★) 같은 표식도 가독성을 위해 제거하되, 필요 시 옵션으로 보존 가능하게 둔다.
  if (!keepMajorFootnote) {
    text = text
      .replace(/\s*\([☆★♥♡❤]\)\s*/g, "")
      .replace(/\s*\[[☆★♥♡❤]\]\s*/g, "")
      .replace(/\s*[☆★♥♡❤]\s*[:：]\s*필수\s*/g, " ")
      .replace(/\s*[☆★♥♡❤]\s*필수\s*/g, " ");
  }

  text = text
    // 원표의 체크 기호와 뒤따르는 영역 번호가 한 셀로 밀린 경우까지 제거한다. 예: "○ 1", "◯1", "● 2"
    .replace(/\s*[◯○●]\s*\d+\s*/g, " ")
    .replace(/\s*[◯○●]\s*[:：]?\s*/g, " ")
    .replace(/\s*[☆★♥♡❤]\s*[:：]?\s*/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (/^[,./|:;·\-–—()[\]{}\s]*$/.test(text)) return "";
  return text;
}

export function sanitizeAdmissionRenderedHtml(html) {
  return (
    String(html || "")
      // 최종 렌더 HTML에도 원표 체크/주석 기호가 남지 않게 한 번 더 막는다.
      .replace(/\s*\([☆★♥♡❤]\)\s*/g, "")
      .replace(/\s*\[[☆★♥♡❤]\]\s*/g, "")
      .replace(/\s*[☆★♥♡❤]\s*[:：]?\s*(필수|반영|적용)?\s*/g, " ")
      .replace(/([>\s])[◯○●]\s*\d+\s*/g, "$1")
      .replace(/([>\s])[◯○●☆★♥♡❤]+\s*/g, "$1")
      .replace(/\s+[◯○●☆★♥♡❤]+(?=\s*<\/t[dh]>)/g, "")
      // 렌더링 중 일부 셀에서 undefined/NaN/object가 그대로 노출되는 것을 차단한다.
      // 대소문자 무시(i) 플래그를 쓰지 않는다 — 실측(커밋 7d3973f) 결과 진짜
      // 결함은 0건이고, i 플래그 탓에 "Finance"의 "nan"이 /NaN/i에 매칭돼
      // "Fi-ce"로 치환되는 데이터 손상 오탐이 2건 있었다(한국외대 용인·서울
      // exam_schedule). 정확 표기(undefined/NaN/[object Object]/null null)만
      // 잡는 게 원래 의도다.
      .replace(/undefined|NaN|\[object Object\]|null\s*null/g, "-")
      .replace(/\s{2,}/g, " ")
  );
}

export function looksLikeHtml(value) {
  return /<\s*(table|div|ul|ol|li|p|h[1-6]|section|article)\b/i.test(
    String(value || ""),
  );
}

function escapeHtml(value) {
  return clean(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// WARN17: DB 정규화 스크립트(scripts/normalize-admission-html.mjs)가 이미 적용한 매핑을
// 생성기(파서) 쪽에도 동일하게 반영한다 — Admin '파싱 실행'으로 *_html이 재생성되면
// 이 함수를 거치므로, 여기 없으면 향후 재파싱 시 판별된 PUA 문자가 다시 새어 나온다.
// 판별 근거는 scripts/normalize-admission-html.mjs의 주석과 동일(HWP 원문자 ①②가 보조
// 평면 PUA-A 코드로 내보내진 케이스만 확정 매핑, 그 외 PUA는 손대지 않는다).
const KNOWN_PUA_CODEPOINT_MAP = { 983758: "①", 983759: "②" };
function replaceKnownPuaChars(value) {
  let text = String(value || "");
  for (const [codePoint, replacement] of Object.entries(
    KNOWN_PUA_CODEPOINT_MAP,
  )) {
    text = text
      .split(String.fromCodePoint(Number(codePoint)))
      .join(replacement);
  }
  return text;
}

function normalizeAdmissionText(value) {
  return (
    replaceKnownPuaChars(clean(value))
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      // biome-ignore lint/suspicious/noControlCharactersInRegex: NUL 문자를 걸러내는 정규식이라 의도된 사용이다.
      .replace(/\u0000/g, "")
      .replace(/⦁/g, "·")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

function splitAdmissionLines(value) {
  const normalized = normalizeAdmissionText(value);
  if (!normalized) return [];

  return normalized
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^Click$/i.test(line))
    .filter((line) => !/^-\s*\d+\s*-$/.test(line))
    .filter((line) => !/^처음으로\s+대학별목록/.test(line))
    .filter((line) => !/^처음으로$/.test(line))
    .filter((line) => !/^대학별목록$/.test(line))
    .filter((line) => !/^지역별\s+/.test(line))
    .filter((line) => !Object.values(SECTION_NOTES).includes(line));
}

const SECTION_NOTES = {
  previous_year_changes: "",
  selection_method: "",
  minimum_requirements: "",
  exam_schedule: "",
  school_record_method: "",
  recruitment_quota: "",
};

const HWP_SECTION_TITLES = {
  previous_year_changes: "1. 전년도와 차이점",
  selection_method: "2. 전형방법",
  minimum_requirements: "3. 최저학력기준",
  exam_schedule: "4. 대학별고사일",
  school_record_method: "5. 학생부반영방법",
  recruitment_quota: "6. 모집인원 및 입결",
};

export const HWP_SECTION_ORDER = [
  "previous_year_changes",
  "selection_method",
  "minimum_requirements",
  "exam_schedule",
  "school_record_method",
  "recruitment_quota",
];

export const HWP_SECTION_LABELS = {
  previous_year_changes: "전년도와 차이점",
  selection_method: "전형방법",
  minimum_requirements: "최저학력기준",
  exam_schedule: "대학별고사일",
  school_record_method: "학생부반영방법",
  recruitment_quota: "모집인원 및 입결",
};

function getSectionNumber(sectionKey) {
  const idx = HWP_SECTION_ORDER.indexOf(sectionKey);
  return idx >= 0 ? String(idx + 1) : "";
}

export function getSectionTitleText(sectionKey) {
  return HWP_SECTION_TITLES[sectionKey] || HWP_SECTION_LABELS[sectionKey] || "";
}

function stripRepeatedSheetNavigation(value) {
  return normalizeAdmissionText(value)
    .split("\n")
    .map((line) => clean(line))
    .filter(Boolean)
    .filter((line) => !/^처음으로$/.test(line))
    .filter((line) => !/^대학별목록$/.test(line))
    .filter((line) => !/^처음으로\s+대학별목록$/.test(line))
    .filter((line) => !/^지역별$/.test(line))
    .filter(
      (line) =>
        !/^(서울권|경기권|인천권|대전권|충북권|충남권|전북권|전남\/광주권|강원권|국립대|제2캠퍼스|대구\/경북권|부산권|울산\/경남권|제주권)$/.test(
          line,
        ),
    )
    .filter((line) => !/^漠杳$/.test(line))
    .filter(
      (line) =>
        !/[\u6364\u7365\u6c64\u636f\u6c20\u7462\u6c6b\u2568\u6d6b\u2562]/.test(
          line,
        ),
    )
    .join("\n")
    .trim();
}

function sliceNumberedSection(value, sectionKey) {
  const text = stripRepeatedSheetNavigation(value);
  if (!text) return "";

  const sectionNo = getSectionNumber(sectionKey);
  const label = HWP_SECTION_LABELS[sectionKey];
  if (!sectionNo || !label) return text;

  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const marker = new RegExp(
    `(^|\\n)\\s*${sectionNo}\\.\\s*${escapedLabel}(?:\\s*[:：]?\\s*)?`,
    "i",
  );
  const match = marker.exec(text);
  if (!match) return "";

  const start = match.index + match[0].length;
  const rest = text.slice(start);
  const next =
    /\n\s*[1-6]\.\s*(전년도와 차이점|전형방법|최저학력기준|대학별고사일|학생부반영방법|모집인원 및 입결)\b/.exec(
      rest.slice(1),
    );
  const end = next ? 1 + next.index : rest.length;
  return rest.slice(0, end).trim();
}

export function hasDifferentNumberedSectionOnly(value, sectionKey) {
  const text = stripRepeatedSheetNavigation(value);
  if (!text) return false;
  const requestedNo = getSectionNumber(sectionKey);
  const titlePattern =
    /(^|\n)\s*([1-6])\.\s*(전년도와 차이점|전형방법|최저학력기준|대학별고사일|학생부반영방법|모집인원 및 입결)\b/gi;
  const found = Array.from(text.matchAll(titlePattern)).map((m) => m[2]);
  return found.length > 0 && !found.includes(requestedNo);
}

function getRowStringValues(row) {
  if (!row || typeof row !== "object") return [];
  return Object.entries(row)
    .filter(([, value]) => typeof value === "string" && clean(value))
    .map(([key, value]) => ({ key, value }));
}

export function resolveSectionText(row, section) {
  const direct = getSectionText(row, section.key);
  const htmlDirect = section.htmlKey
    ? stripHtmlToText(row?.[section.htmlKey])
    : "";
  const candidates = [
    { key: section.key, value: direct },
    { key: section.htmlKey || "", value: htmlDirect },
    ...getRowStringValues(row),
  ].filter((item) => clean(item.value));

  for (const item of candidates) {
    const sliced = sliceNumberedSection(item.value, section.key);
    if (sliced) return sliced;
  }

  if (direct && !hasDifferentNumberedSectionOnly(direct, section.key))
    return direct;
  if (htmlDirect && !hasDifferentNumberedSectionOnly(htmlDirect, section.key))
    return htmlDirect;

  return "";
}

export function withHwpSectionHeading(html, sectionKey) {
  const heading = getSectionTitleText(sectionKey);
  if (!heading) return html;
  const plain = stripHtmlToText(html);
  if (plain.startsWith(heading)) return html;
  return `<div class="admission-hwp-section-title">${escapeHtml(heading)}</div>${html}`;
}

function isNumericTableValue(line) {
  const v = clean(line);
  if (!v) return false;
  return (
    /^[-–—]$/.test(v) ||
    /^\(?\d+(?:\.\d+)?\)?(?:\([^)]+\))?$/.test(v) ||
    /^\d+(?:\.\d+)?\s*%$/.test(v) ||
    /^\d+(?:\.\d+)?\s*[~∼]\s*\d+(?:\.\d+)?$/.test(v) ||
    /^\d+\.\d+\([^)]+\)$/.test(v)
  );
}

function isRequirementMark(line) {
  const v = clean(line);
  return /^[◯○●ＸX☆★♥♡❤]+$/.test(v) || /^[1-9]$/.test(v) || /^[-–—]$/.test(v);
}

function isMinimumResultToken(line) {
  const v = clean(line).replace(/\s+/g, "");
  return /^(?:\d+합\d+|\d+개\d+|\d+개등급|\d+등급|한국사\d+|없음|미적용)$/.test(
    v,
  );
}

function isDateLike(line) {
  const v = clean(line);
  return /\d{1,2}\.\d{1,2}\.?\s*\([^)]+\)|\d{1,2}\.\d{1,2}\.?|\d{1,2}월|\d{4}\.\d{1,2}\.\d{1,2}/.test(
    v,
  );
}

function isSelectionType(line) {
  return /^(교과|종합|논술|실기|수능|정시|기타)$/.test(clean(line));
}

function isFootnoteLine(line) {
  const v = clean(line);
  return /^\([☆★♥♡❤]\)|^[☆★♥♡❤]\s*[:：]|^※|^\*|^주\)|^\([^)]+\)\s*:/.test(v);
}

function htmlTable(
  headers,
  rows,
  options: { compact?: boolean; className?: string } = {},
) {
  const compact = options.compact ? " admission-table-compact" : "";
  const cls = options.className || `admission-data-table${compact}`;
  return `
    <div class="admission-scroll-table">
      <table class="${cls}">
        <thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead>
        <tbody>
          ${rows
            .map(
              (row) =>
                `<tr>${headers
                  .map((_, idx) => {
                    const value = sanitizeAdmissionDisplayText(row[idx] ?? "");
                    const left = idx === 0 || idx === 1 ? ' class="left"' : "";
                    return `<td${left}>${value === "" ? '<span class="muted">-</span>' : escapeHtml(value)}</td>`;
                  })
                  .join("")}</tr>`,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function decodeBasicHtmlEntities(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

export function stripHtmlToText(value) {
  return clean(
    decodeBasicHtmlEntities(
      String(value || "")
        .replace(/<br\s*\/?>/gi, " ")
        .replace(/<[^>]+>/g, " "),
    ),
  );
}

// colspan/rowspan을 실제 그리드 컬럼 인덱스로 펼쳐서 반환한다. 이걸 하지 않으면
// (구현 이전 버전) 병합 헤더 셀 하나가 배열의 칸 1개만 차지하게 되어, 상위 헤더
// 행(그룹명)과 하위 헤더 행(연도/지표)의 컬럼 인덱스가 서로 어긋난다 — 그 결과
// buildGroupNameForColumn/normalizeRecruitmentExactHtml의 colspan 계산이 실제
// 데이터 컬럼 수와 맞지 않아 전형 그룹 헤더가 옆 전형의 컬럼까지 침범하는 문제가
// 발생했다(가톨릭관동대/고려대 사례).
function parseHtmlTableRows(html) {
  const source = String(html || "");
  const rowMatches: string[] = source.match(/<tr[\s\S]*?<\/tr>/gi) || [];

  const rowSpanCarry: { value: string; remaining: number }[] = [];
  const grid: string[][] = [];

  rowMatches.forEach((rowHtml) => {
    const cellMatches: string[] =
      rowHtml.match(/<t[hd][\s\S]*?<\/t[hd]>/gi) || [];
    const row: string[] = [];
    let col = 0;

    const placeCarried = () => {
      // rowSpanCarry[col] 재인덱싱마다 값이 바뀌지 않으므로 로컬 변수로
      // 한 번만 읽어 narrowing을 유지한다(noUncheckedIndexedAccess).
      let carry = rowSpanCarry[col];
      while (carry && carry.remaining > 0) {
        row[col] = carry.value;
        carry.remaining -= 1;
        col += 1;
        carry = rowSpanCarry[col];
      }
    };

    placeCarried();

    cellMatches.forEach((cellHtml) => {
      const openTag = (cellHtml.match(/^<t[hd][^>]*>/i) || [""])[0];
      const isBlank = /blank-cell/.test(openTag);
      const text = stripHtmlToText(cellHtml);
      const value = isBlank && !text ? "" : text;
      const colspan = Math.max(
        1,
        parseInt(
          (openTag.match(/colspan\s*=\s*["']?(\d+)/i) || [])[1] || "1",
          10,
        ) || 1,
      );
      const rowspan = Math.max(
        1,
        parseInt(
          (openTag.match(/rowspan\s*=\s*["']?(\d+)/i) || [])[1] || "1",
          10,
        ) || 1,
      );

      for (let i = 0; i < colspan; i += 1) {
        row[col] = value;
        if (rowspan > 1) {
          rowSpanCarry[col] = { value, remaining: rowspan - 1 };
        }
        col += 1;
        placeCarried();
      }
    });

    placeCarried();
    grid.push(row);
  });

  return grid.filter((row) => row.some((cell) => clean(cell)));
}

function padRows(rows) {
  const width = Math.max(0, ...rows.map((row) => row.length));
  return rows.map((row) =>
    Array.from({ length: width }, (_, idx) => clean(row[idx] || "")),
  );
}

function isYearHeaderToken(value) {
  return /^(27|26|25)$/.test(clean(value));
}

function isDescriptorHeader(value) {
  const v = clean(value).replace(/\s+/g, "");
  return [
    "계열",
    "대학",
    "단과대학",
    "모집단위",
    "세부전공",
    "개설전공",
  ].includes(v);
}

function isMetricHeader(value) {
  const v = clean(value).replace(/\s+/g, "");
  return /^(인원|모집인원|경쟁률|70%\(?등급\)?|70%|50%\(?등급\)?|50%|평균|최저|입결|등급)$/.test(
    v,
  );
}

function normalizeMetricLabel(value) {
  const v = clean(value).replace(/\s+/g, "");
  if (!v) return "";
  if (v === "모집인원") return "인원";
  if (v === "70%" || v === "70%(등급)" || v === "70%등급") return "70%(등급)";
  if (v === "50%" || v === "50%(등급)" || v === "50%등급") return "50%(등급)";
  if (v === "등급") return "70%(등급)";
  if (["인원", "경쟁률", "평균", "최저", "입결"].includes(v)) return v;
  return "";
}

function isGroupHeaderCandidate(value) {
  const v = clean(value);
  if (!v) return false;
  if (isYearHeaderToken(v) || isDescriptorHeader(v) || isMetricHeader(v))
    return false;
  if (/^(학생부교과|학생부종합|논술|실기|수능|정시|교과|종합)$/.test(v))
    return true;
  if (
    /전형|추천|일반|우수자|인재|면접|서류|논술|지역|학교|균형|교과|종합/.test(v)
  )
    return true;
  return false;
}

function getColumnFilledValue(headerRows, rowIdx, colIdx, predicate) {
  let current = "";
  for (let c = 0; c <= colIdx; c += 1) {
    const candidate = clean(headerRows[rowIdx]?.[c] || "");
    if (predicate(candidate)) current = candidate;
    if (c === colIdx) return current;
  }
  return "";
}

function findYearHeaderRow(rows) {
  let bestIdx = -1;
  let bestCount = 0;
  rows.slice(0, 10).forEach((row, idx) => {
    const count = row.filter(isYearHeaderToken).length;
    if (count > bestCount) {
      bestCount = count;
      bestIdx = idx;
    }
  });
  return bestCount >= 3 ? bestIdx : -1;
}

function findDescriptorColumns(headerRows) {
  const width = Math.max(0, ...headerRows.map((row) => row.length));
  const found: {
    series?: number;
    college?: number;
    unit?: number;
    detail?: number;
  } = {};

  for (let c = 0; c < width; c += 1) {
    const stack = headerRows
      .map((row) => clean(row[c] || "").replace(/\s+/g, ""))
      .filter(Boolean);
    stack.forEach((v) => {
      if (v === "계열" && found.series === undefined) found.series = c;
      if ((v === "대학" || v === "단과대학") && found.college === undefined)
        found.college = c;
      if (v === "모집단위" && found.unit === undefined) found.unit = c;
      if ((v === "세부전공" || v === "개설전공") && found.detail === undefined)
        found.detail = c;
    });
  }

  const result: { key: string; label: string; col: number; carry: boolean }[] =
    [];
  if (found.series !== undefined)
    result.push({
      key: "series",
      label: "계열",
      col: found.series,
      carry: true,
    });
  if (found.college !== undefined && found.college !== found.series)
    result.push({
      key: "college",
      label: "대학",
      col: found.college,
      carry: true,
    });
  if (found.unit !== undefined)
    result.push({
      key: "unit",
      label: "모집단위",
      col: found.unit,
      carry: false,
    });
  if (found.detail !== undefined && found.detail !== found.unit)
    result.push({
      key: "detail",
      label: "세부전공",
      col: found.detail,
      carry: false,
    });

  return result.filter(
    (item, idx, arr) =>
      arr.findIndex((other) => other.col === item.col) === idx,
  );
}

function inferMetricFromHeaders(
  headerRows,
  yearRowIdx,
  colIdx,
  positionInGroup,
  groupSize,
) {
  for (let r = yearRowIdx - 1; r >= 0; r -= 1) {
    const direct = normalizeMetricLabel(headerRows[r]?.[colIdx] || "");
    if (direct) return direct;
    const right1 = normalizeMetricLabel(headerRows[r]?.[colIdx + 1] || "");
    if (right1 && (right1 === "인원" || right1 === "경쟁률")) return right1;
    const left1 = normalizeMetricLabel(headerRows[r]?.[colIdx - 1] || "");
    if (left1 && left1 !== "인원") return left1;
  }

  if (groupSize >= 5)
    return (
      ["인원", "인원", "경쟁률", "경쟁률", "70%(등급)"][positionInGroup % 5] ||
      "값"
    );
  if (groupSize === 4)
    return ["인원", "인원", "경쟁률", "경쟁률"][positionInGroup] || "값";
  if (groupSize === 3)
    return ["인원", "경쟁률", "70%(등급)"][positionInGroup] || "값";
  if (groupSize === 2) return ["인원", "경쟁률"][positionInGroup] || "값";
  return "값";
}

function buildGroupNameForColumn(headerRows, yearRowIdx, colIdx) {
  const parts: string[] = [];
  for (let r = 0; r < yearRowIdx; r += 1) {
    const value = getColumnFilledValue(
      headerRows,
      r,
      colIdx,
      isGroupHeaderCandidate,
    );
    if (value && !parts.includes(value)) parts.push(value);
  }
  const cleaned = parts
    .map((part) => clean(part))
    .filter(
      (part) =>
        part &&
        !isMetricHeader(part) &&
        !isDescriptorHeader(part) &&
        !isYearHeaderToken(part),
    );
  return cleaned.join(" - ") || "전형";
}

function isNumericNoiseCell(value) {
  const v = clean(value).replace(/,/g, "").trim();
  if (!v) return false;
  if (/^[-+]?\d+(?:\.\d+)?(?:\s*\([^)]*\))?$/.test(v)) return true;
  if (/^[-+]?\d+(?:\.\d+)?\s*(평균|등급|%)$/.test(v)) return true;
  return false;
}

function isValidDescriptorCell(key, value) {
  const v = clean(value);
  if (!v) return false;
  if (isNumericNoiseCell(v)) return false;
  if (key === "series") {
    const compact = v.replace(/\s+/g, "");
    if (/^[\d.]+/.test(compact)) return false;
    return /(공통|광역|인문|사회|자연|과학|공학|의학|의예|치의|한의|약학|간호|보건|사범|교육|경영|경제|예체능|예술|체육|미술|음악|디자인|국제|융합|자유|계열|대학|학부)/.test(
      compact,
    );
  }
  if (key === "college") {
    if (/^[\d.]+/.test(v.replace(/\s+/g, ""))) return false;
    return true;
  }
  if (key === "unit" || key === "detail") {
    if (/^[\d.]+(?:\s*\([^)]*\))?$/.test(v)) return false;
    return true;
  }
  return true;
}

export function normalizeRecruitmentExactHtml(html, _fallbackText) {
  if (!/<table/i.test(String(html || ""))) return "";

  const rows = padRows(parseHtmlTableRows(html));
  const yearRowIdx = findYearHeaderRow(rows);
  if (yearRowIdx < 0) return "";

  const headerRows = rows.slice(0, yearRowIdx + 1);
  const bodyRows = rows.slice(yearRowIdx + 1);
  const fixedCols = findDescriptorColumns(headerRows);
  if (!fixedCols.some((item) => item.key === "unit")) return "";

  const firstFixedCol = Math.min(...fixedCols.map((item) => item.col));
  const fixedSet = new Set(fixedCols.map((item) => item.col));
  const yearRow = headerRows[yearRowIdx] || [];

  const leadingOrphanCols: number[] = [];
  const mainDataCols: number[] = [];
  yearRow.forEach((value, colIdx) => {
    if (!isYearHeaderToken(value) || fixedSet.has(colIdx)) return;
    if (colIdx < firstFixedCol) leadingOrphanCols.push(colIdx);
    else mainDataCols.push(colIdx);
  });

  if (!mainDataCols.length) return "";

  const baseMetas: {
    col: number;
    year: string;
    group: string;
    positionInGroup?: number;
    groupSize?: number;
    metric?: string;
  }[] = mainDataCols.map((col) => ({
    col,
    year: clean(yearRow[col]),
    group: sanitizeAdmissionDisplayText(
      buildGroupNameForColumn(headerRows, yearRowIdx, col),
    ),
  }));

  const groupCounts = new Map();
  baseMetas.forEach((meta) => {
    groupCounts.set(meta.group, (groupCounts.get(meta.group) || 0) + 1);
  });
  const groupSeen = new Map();
  baseMetas.forEach((meta) => {
    const seen = groupSeen.get(meta.group) || 0;
    meta.positionInGroup = seen;
    meta.groupSize = groupCounts.get(meta.group) || 5;
    meta.metric = inferMetricFromHeaders(
      headerRows,
      yearRowIdx,
      meta.col,
      seen,
      meta.groupSize,
    );
    groupSeen.set(meta.group, seen + 1);
  });

  const lastGroup = baseMetas[baseMetas.length - 1]?.group || "전형";
  const orphanMetas = leadingOrphanCols.map((col, idx) => ({
    col,
    year: clean(yearRow[col]) || "26",
    group: lastGroup,
    positionInGroup: (groupCounts.get(lastGroup) || 0) + idx,
    groupSize: Math.max(
      5,
      (groupCounts.get(lastGroup) || 0) + leadingOrphanCols.length,
    ),
    metric:
      normalizeMetricLabel(headerRows[yearRowIdx - 1]?.[col] || "") ||
      "70%(등급)",
  }));

  const metas = [...baseMetas, ...orphanMetas];
  const orderedGroups: { name: string; count: number }[] = [];
  metas.forEach((meta) => {
    const last = orderedGroups[orderedGroups.length - 1];
    if (!last || last.name !== meta.group)
      orderedGroups.push({ name: meta.group, count: 1 });
    else last.count += 1;
  });

  const carryValues: Record<string, string> = {};
  const renderedRows: { fixedValues: string[]; dataValues: string[] }[] = [];

  bodyRows.forEach((rawRow) => {
    const row = rawRow || [];
    const fixedValues = fixedCols.map((item) => {
      let value = sanitizeAdmissionDisplayText(row[item.col] || "");

      // 병합 셀 해제 과정에서 마지막 입결/평균값이 맨 앞 계열 칸으로 밀려오는 경우를 차단한다.
      // 계열/대학/모집단위 칸에는 숫자만 있는 값을 절대 노출하지 않고, 계열/대학은 직전 유효값을 이어받는다.
      if (!isValidDescriptorCell(item.key, value)) value = "";
      if (!value && item.carry && carryValues[item.key])
        // 바로 위 조건에서 truthy를 확인했다(재인덱싱은 값이 바뀌지 않는다).
        value = carryValues[item.key]!;
      if (value && item.carry) carryValues[item.key] = value;
      return value;
    });
    const dataValues = metas.map((meta) =>
      sanitizeAdmissionDisplayText(row[meta.col] || ""),
    );
    const hasUnit = fixedValues.some(Boolean);
    const hasData = dataValues.some(Boolean);
    if (!hasUnit && !hasData) return;

    renderedRows.push({ fixedValues, dataValues });
  });

  if (!renderedRows.length) return "";

  const fixedHeaderHtml = fixedCols
    .map(
      (item) =>
        `<th rowspan="2" class="fixed-head">${escapeHtml(item.label)}</th>`,
    )
    .join("");
  const groupHeaderHtml = orderedGroups
    .map(
      (group) =>
        `<th colspan="${group.count}" class="recruit-group-head">${escapeHtml(group.name)}</th>`,
    )
    .join("");
  const metricHeaderHtml = metas
    .map((meta) => `<th>${escapeHtml(`${meta.year} ${meta.metric}`)}</th>`)
    .join("");
  const bodyHtml = renderedRows
    .map(
      (row) => `
    <tr>
      ${row.fixedValues.map((value, idx) => `<td class="left ${idx === 0 ? "series-cell" : ""}">${value ? escapeHtml(value) : '<span class="muted">-</span>'}</td>`).join("")}
      ${row.dataValues.map((value) => `<td>${value ? escapeHtml(value) : '<span class="muted">-</span>'}</td>`).join("")}
    </tr>
  `,
    )
    .join("");

  return sanitizeAdmissionRenderedHtml(`
    <div class="admission-raw-section-wrap">
      <div class="admission-result-note">모집단위별 전형, 모집인원, 경쟁률, 입결을 정리한 표입니다.</div>
      <div class="admission-scroll-table">
        <table class="admission-data-table admission-normalized-recruit-table">
          <thead>
            <tr>${fixedHeaderHtml}${groupHeaderHtml}</tr>
            <tr>${metricHeaderHtml}</tr>
          </thead>
          <tbody>${bodyHtml}</tbody>
        </table>
      </div>
    </div>
  `);
}

export function normalizeChangeTokenSpacing(text) {
  return clean(text)
    .replace(/(\d+)\s*합\s*(\d+)/g, "$1합$2")
    .replace(/([ABC])\s+등급/g, "$1등급")
    .replace(/\s*→\s*/g, " → ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function splitSubnumberedChangeItem(text) {
  const raw = clean(text);
  if (!raw) return [];
  const markers = [...raw.matchAll(/(?:^|\s)(\d+)\)\s*/g)];
  if (markers.length < 2) return [raw];

  // markers.length >= 2가 위에서 이미 확인됐으므로 markers[0]은 항상 존재한다.
  const firstIndex = markers[0]!.index ?? 0;
  const prefix = clean(raw.slice(0, firstIndex));
  return markers
    .map((marker, idx) => {
      const start = (marker.index ?? 0) + marker[0].length;
      const end =
        idx + 1 < markers.length
          ? // idx + 1 < markers.length로 이미 범위를 확인했다.
            (markers[idx + 1]!.index ?? raw.length)
          : raw.length;
      const part = clean(raw.slice(start, end));
      return clean(prefix && prefix.length <= 28 ? `${prefix} ${part}` : part);
    })
    .filter(Boolean);
}

function parseChangeRowTitleAndContent(text) {
  const source = normalizeChangeTokenSpacing(text);
  let title = "주요 변경";
  let content = source;

  const colon = source.match(/^([^:：]{2,90})\s*[:：]\s*(.+)$/);
  if (colon) {
    title = clean(colon[1]);
    content = clean(colon[2]);
  } else {
    const titleMatch = source.match(
      /^(.{2,90}?(?:변경|신설|폐지|통폐합|개편|분리|통합|확대|축소|증가|감소))\s+(.+)$/,
    );
    if (titleMatch) {
      title = clean(titleMatch[1]);
      content = clean(titleMatch[2]);
    }
  }

  // “논술 : 전형방법 변경(논술 80 + 교과 20 → 논술 100)”처럼
  // 콜론 앞의 전형명과 콜론 뒤의 변경 항목을 합쳐 제목으로 만들고,
  // 괄호 안 비교값만 변경 내용으로 사용한다.
  const bracketedChange = content.match(
    /^(.{2,90}?(?:변경|신설|폐지|통폐합|개편|분리|통합|확대|축소|증가|감소))\s*\((.+→.+)\)$/,
  );
  if (bracketedChange) {
    const mergedTitle = clean(
      `${title === "주요 변경" ? "" : title} ${bracketedChange[1]}`,
    );
    title = mergedTitle || clean(bracketedChange[1]);
    content = clean(bracketedChange[2]);
  }

  // “전형방법 변경 논술 80 + 교과 20 → 논술 100” 유형도 제목/비교값으로 분리한다.
  const prefixedPair = content.match(
    /^(.{2,90}?(?:변경|신설|폐지|통폐합|개편|분리|통합|확대|축소|증가|감소))\s+(.+→.+)$/,
  );
  if (prefixedPair) {
    const mergedTitle = clean(
      `${title === "주요 변경" ? "" : title} ${prefixedPair[1]}`,
    );
    title = mergedTitle || clean(prefixedPair[1]);
    content = clean(prefixedPair[2]);
  }

  title =
    title
      .replace(
        /^(학생부교과|학생부종합|논술|실기)\s+(?=.+(?:변경|신설|폐지|개편|증가|감소))/,
        "$1 ",
      )
      .replace(/\s{2,}/g, " ")
      .trim() || "주요 변경";

  return { title, content };
}

function buildChangeValueHtml(content) {
  const value = normalizeChangeTokenSpacing(content);
  if (!value) return '<span class="muted">-</span>';
  const normalized = value
    .replace(/\s*→\s*/g, " → ")
    .replace(/\s*⇒\s*/g, " → ")
    .replace(/\s+/g, " ")
    .trim();
  return `<div class="admission-change-plain-cell">${escapeHtml(normalized)}</div>`;
}

function buildChangeTableHtml(rows) {
  const headers = ["번호", "변경 항목", "변경 내용"];
  return `
    <div class="admission-raw-section-wrap">
      <div class="admission-scroll-table admission-change-scroll-table">
        <table class="admission-data-table admission-change-table admission-change-table-v87">
          <thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead>
          <tbody>
            ${rows
              .map(
                (row) => `
              <tr>
                <td class="change-no-cell">${escapeHtml(row.no || "-")}</td>
                <td class="change-title-cell">${escapeHtml(row.title || "주요 변경")}</td>
                <td class="change-content-cell">${row.html || '<span class="muted">-</span>'}</td>
              </tr>
            `,
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// Phase 1 절단면: previous_year_changes의 행 추출부만 순수 함수로 분리.
// buildPreviousYearChangesHtml은 이 결과를 buildChangeValueHtml로 html화한
// 뒤 buildChangeTableHtml에 넘기는 얇은 래퍼로 남는다. "없음" 특수 케이스도
// 여기서 {no,title,content} 1건으로 통일해 반환한다(원래도 title/no가 이미
// html이 아닌 값이라 표현에 문제 없다).
function parseChangeItems(lines) {
  const cleaned = lines
    .map(clean)
    .filter(Boolean)
    .filter(
      (line) =>
        !["주요변경사항", "전년도와 차이점", "1. 전년도와 차이점"].includes(
          line,
        ),
    );

  if (
    !cleaned.length ||
    cleaned.some((line) => /^없음$|변경\s*사항\s*없음/.test(line))
  ) {
    return [{ no: "1", title: "변경 사항", content: "전년도와 동일" }];
  }

  const items: { no: string; text: string }[] = [];
  let current: { no: string; parts: string[] } | null = null;

  const pushCurrent = () => {
    if (!current) return;
    const text = current.parts.join(" ").replace(/\s+/g, " ").trim();
    if (text) items.push({ no: current.no, text });
    current = null;
  };

  cleaned.forEach((line) => {
    const numbered = line.match(/^(\d+)\.\s*(.+)$/);
    if (numbered) {
      pushCurrent();
      // 정규식이 두 캡처 그룹을 필수로 요구하므로 매치 시 항상 존재한다.
      current = { no: numbered[1]!, parts: [numbered[2]!] };
      return;
    }
    if (!current) current = { no: `${items.length + 1}`, parts: [line] };
    else current.parts.push(line);
  });
  pushCurrent();

  const baseItems: { no: string; text: string }[] = items.length
    ? items
    : cleaned.map((text, idx) => ({ no: `${idx + 1}`, text }));
  const expandedItems: { no: string; text: string }[] = [];

  baseItems.forEach((item) => {
    const parts = splitSubnumberedChangeItem(item.text);
    if (parts.length > 1) {
      parts.forEach((part) => {
        expandedItems.push({ no: "", text: part });
      });
    } else {
      expandedItems.push({ no: item.no, text: item.text });
    }
  });

  return expandedItems.map((item, idx) => {
    const parsed = parseChangeRowTitleAndContent(item.text);
    return {
      no: `${idx + 1}`,
      title: parsed.title,
      content: parsed.content,
    };
  });
}

function buildPreviousYearChangesHtml(lines, _sectionKey) {
  const items = parseChangeItems(lines);
  const rows = items.map((item) => ({
    no: item.no,
    title: item.title,
    html: buildChangeValueHtml(item.content),
  }));

  return buildChangeTableHtml(rows);
}

function buildPlainListHtml(lines, sectionKey) {
  const body: string[] = [];
  let bullets: string[] = [];

  const flushBullets = () => {
    if (!bullets.length) return;
    body.push(
      `<ul class="admission-bullet-list">${bullets.map((line) => `<li>${escapeHtml(line.replace(/^\d+\.\s*/, ""))}</li>`).join("")}</ul>`,
    );
    bullets = [];
  };

  lines.forEach((line) => {
    if (/^\d+\.\s*/.test(line)) {
      bullets.push(line);
      return;
    }
    flushBullets();
    if (/^(주요변경사항|※|\*)/.test(line)) {
      body.push(
        `<div class="admission-subtitle-line">${escapeHtml(line)}</div>`,
      );
    } else {
      body.push(`<div class="admission-text-line">${escapeHtml(line)}</div>`);
    }
  });
  flushBullets();

  return `
    <div class="admission-raw-section-wrap">
      <div class="admission-result-note">${escapeHtml(SECTION_NOTES[sectionKey] || "")}</div>
      <div class="admission-readable-body">${body.join("")}</div>
    </div>
  `;
}

function isSelectionSeatToken(line) {
  const v = clean(line).replace(/[()]/g, "").replace(/\s/g, "");
  if (!v || /^[-–—]$/.test(v)) return false;
  // 1,341처럼 쉼표가 있는 대형 모집인원도 인원값으로 본다.
  return /^\d{1,4}$/.test(v) || /^\d{1,3}(?:,\d{3})+$/.test(v);
}

function normalizeSelectionSeat(value) {
  const v = clean(value);
  if (!v || /^[-–—]$/.test(v)) return "-";
  return v;
}

function looksLikeSelectionMinimumToken(line) {
  const v = clean(line);
  if (!v) return false;
  if (/^[-–—]$/.test(v)) return true;
  if (/^[◯○●]+(?:\([^)]+\))?$/.test(v)) return true;
  if (/^(없음|미적용)$/.test(v)) return true;
  if (/^(전\s*모집단위|일반학과)$/.test(v)) return true;
  if (
    /^(의|약|간|치|한의|수의)(?:\s*[,·/]\s*(의|약|간|치|한의|수의))*$/.test(v)
  )
    return true;
  if (
    /^(의예|치의예|약학|간호|한의예|수의예)(?:과)?(?:\s*[,·/]\s*(의예|치의예|약학|간호|한의예|수의예)(?:과)?)*$/.test(
      v,
    )
  )
    return true;
  if (
    /^(의예과|치의예과|약학과|간호학과|한의예과|수의예과)(?:\s*[,·/]\s*(의예과|치의예과|약학과|간호학과|한의예과|수의예과))*$/.test(
      v,
    )
  )
    return true;
  if (
    /^(의학|치의학|약학|간호|보건의료)(?:\s*[,·/]\s*(의학|치의학|약학|간호|보건의료))*$/.test(
      v,
    )
  )
    return true;
  if (/최저/.test(v) && v.length <= 18) return true;
  return false;
}

function normalizeSelectionMinimum(value) {
  const v = clean(value);
  if (!v || /^[-–—]$/.test(v)) return "-";
  const marked = v.match(/^([◯○●]+)(?:\(([^)]+)\))?$/);
  if (marked) return marked[2] ? `있음: ${marked[2]}` : "있음";
  // WARN17: Figma 1882:4934 "최저" 컬럼 sampleValues("의/약", "의/약/간")는 슬래시 구분자를
  // 쓰고, scripts/normalize-admission-html.mjs가 이미 DB의 배지 값을 전부 슬래시로 통일했다
  // (normalizeBadgeSeparators). 생성기도 동일하게 슬래시로 맞춰 재파싱 시 회귀를 막는다.
  return v.replace(/,/g, "/");
}

function isSelectionMethodLike(value) {
  const v = clean(value);
  if (!v) return false;
  if (looksLikeSelectionMinimumToken(v)) return false;
  if (isSelectionType(v) || isSelectionSeatToken(v)) return false;
  return /(학생부|교과\)|서류|면접|논술|실기|수능|출결|봉사|적성|필기|체력|P\/F|1단계|2단계|3단계|일괄|합산|\d+\s*[+＋]\s*\S+)/.test(
    v,
  );
}

function splitLeadingSelectionMinimumAndMethod(value) {
  const v = clean(value).replace(/ /g, " ");
  if (!v) return { minimum: "", method: "" };

  const mark = v.match(/^([◯○●]+(?:\([^)]+\))?)\s*(?:[/·,]|\s{2,})\s*(.+)$/);
  if (mark && looksLikeSelectionMinimumToken(mark[1])) {
    return { minimum: mark[1], method: clean(mark[2]) };
  }

  const targetPattern =
    "(?:전\\s*모집단위|일반학과|의|약|간|치|한의|수의|의예|치의예|약학|간호|한의예|수의예|의예과|치의예과|약학과|간호학과|한의예과|수의예과|의학|치의학|약학|간호|보건의료)";
  const target = new RegExp(
    `^(${targetPattern}(?:\\s*[,·/]\\s*${targetPattern})*)\\s*(?:[/]\\s*|\\s{2,})(.+)$`,
  );
  const m = v.match(target);
  if (m && looksLikeSelectionMinimumToken(m[1])) {
    return { minimum: m[1], method: clean(m[2]) };
  }

  return { minimum: "", method: "" };
}

function sanitizeSelectionMethodText(value) {
  const parts = clean(value)
    .split(/\s*\/\s*/g)
    .map((part) => clean(part))
    .filter(Boolean)
    .filter((part) => !/^(전형|유형|전형명|인원|최저|전형방법)$/.test(part));

  while (parts.length > 1 && looksLikeSelectionMinimumToken(parts[0]))
    parts.shift();

  return parts.join(" / ");
}

function normalizeSelectionName(value) {
  return clean(value)
    .replace(/가톨릭지도차추천/g, "가톨릭지도자추천")
    .replace(/잠재능력우수자서류/g, "잠재능력우수자서류")
    .replace(/잠재능력우수자면접/g, "잠재능력우수자면접");
}

function isSelectionNameCandidate(value) {
  const v = clean(value);
  if (!v) return false;
  if (/^(전형|유형|전형명|인원|최저|전형방법)$/.test(v)) return false;
  if (
    isSelectionType(v) ||
    isSelectionSeatToken(v) ||
    looksLikeSelectionMinimumToken(v)
  )
    return false;
  if (isSelectionMethodLike(v)) return false;
  if (/^[0-9][0-9,]*(?:\.[0-9]+)?(?:\s*\([^)]*\))?$/.test(v)) return false;
  if (
    /^(학생부\(교과\)|학생부|서류\s*100|논술\s*100|면접\s*\d+|1단계:|2단계:)/.test(
      v,
    )
  )
    return false;
  return true;
}

function isSelectionRowStart(data, idx) {
  const token = clean(data[idx]);
  if (!isSelectionNameCandidate(token)) return false;
  const next = clean(data[idx + 1]);
  if (isSelectionSeatToken(next)) return true;
  if (
    next &&
    (isSelectionMethodLike(next) || looksLikeSelectionMinimumToken(next))
  )
    return true;
  return false;
}

function buildSelectionMethodTable(rows) {
  return `
    <div class="admission-scroll-table">
      <table class="admission-data-table admission-selection-table">
        <thead>
          <tr>
            <th>전형</th>
            <th>전형명</th>
            <th>인원</th>
            <th>최저</th>
            <th>전형방법</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map((row) => {
              const minimum = normalizeSelectionMinimum(row.minimum);
              const minimumCls = minimum === "-" ? " none" : " has";
              return `
              <tr>
                <td class="selection-type-cell">${escapeHtml(row.type || "-")}</td>
                <td class="left selection-name-cell">${escapeHtml(row.name || "-")}</td>
                <td class="selection-seat-cell">${escapeHtml(row.seats || "-")}</td>
                <td class="selection-minimum-cell"><span class="admission-minimum-badge${minimumCls}">${escapeHtml(minimum)}</span></td>
                <td class="left selection-method-cell">${escapeHtml(row.method || "-")}</td>
              </tr>
            `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

// Phase 1 절단면: validRows 확정까지가 순수 파싱, 그 이후(폴백 판정 +
// 렌더)만 buildSelectionMethodHtml에 남긴다.
function parseSelectionMethodRows(lines) {
  const idx = lines.findIndex((line) => clean(line) === "전형방법");
  const start = idx >= 0 ? idx + 1 : 0;
  const ignored = new Set([
    "전형",
    "유형",
    "전형명",
    "인원",
    "최저",
    "전형방법",
  ]);
  const data = lines
    .slice(start)
    .map((line) => clean(line))
    .filter(Boolean)
    .filter((line) => !ignored.has(clean(line)));

  const rows: {
    type: string;
    name: string;
    seats: string;
    method: string;
    minimum: string;
  }[] = [];
  let i = 0;
  let currentType = "";

  while (i < data.length) {
    const token = clean(data[i]);
    if (!token) {
      i += 1;
      continue;
    }

    if (isSelectionType(token)) {
      // HWP/PDF extraction sometimes collapses rows where the type and the
      // 전형명 are identical, e.g. "논술 / 351 / 있음 / 논술100".
      // If the type token is immediately followed by an 인원 token, treat it
      // as a complete row instead of only changing currentType.
      if (isSelectionSeatToken(data[i + 1])) {
        currentType = token;
        const name = normalizeSelectionName(token);
        const seats = normalizeSelectionSeat(data[i + 1]);
        i += 2;
        let minimum = "-";
        const methodParts: string[] = [];

        while (i < data.length) {
          const next = clean(data[i]);
          if (!next) {
            i += 1;
            continue;
          }
          if (isSelectionType(next)) break;
          if (isSelectionRowStart(data, i)) break;

          const splitMinimum = splitLeadingSelectionMinimumAndMethod(next);
          if (minimum === "-" && splitMinimum.minimum) {
            minimum = splitMinimum.minimum;
            if (splitMinimum.method) methodParts.push(splitMinimum.method);
            i += 1;
            continue;
          }

          if (looksLikeSelectionMinimumToken(next) && minimum === "-") {
            minimum = next;
            i += 1;
            continue;
          }

          if (!isSelectionSeatToken(next)) methodParts.push(next);
          i += 1;
        }

        rows.push({
          type: currentType || "-",
          name,
          seats,
          method: sanitizeSelectionMethodText(methodParts.join(" / ")) || "-",
          minimum,
        });
        continue;
      }

      currentType = token;
      i += 1;
      continue;
    }

    if (!isSelectionRowStart(data, i)) {
      i += 1;
      continue;
    }

    const name = normalizeSelectionName(token);
    let seats = "-";
    i += 1;

    if (isSelectionSeatToken(data[i])) {
      seats = normalizeSelectionSeat(data[i]);
      i += 1;
    }

    let minimum = "-";
    const methodParts: string[] = [];

    while (i < data.length) {
      const next = clean(data[i]);
      if (!next) {
        i += 1;
        continue;
      }
      if (isSelectionType(next)) break;
      if (isSelectionRowStart(data, i)) break;

      const splitMinimum = splitLeadingSelectionMinimumAndMethod(next);
      if (minimum === "-" && splitMinimum.minimum) {
        minimum = splitMinimum.minimum;
        if (splitMinimum.method) methodParts.push(splitMinimum.method);
        i += 1;
        continue;
      }

      if (looksLikeSelectionMinimumToken(next) && minimum === "-") {
        minimum = next;
        i += 1;
        continue;
      }

      if (!isSelectionSeatToken(next)) methodParts.push(next);
      i += 1;
    }

    const method = sanitizeSelectionMethodText(methodParts.join(" / ")) || "-";
    if (!name || !isSelectionNameCandidate(name)) continue;

    rows.push({
      type: currentType || "-",
      name,
      seats,
      method,
      minimum,
    });
  }

  const validRows = rows.filter(
    (row) => row.name && row.name !== "-" && !isNumericNoiseCell(row.name),
  );
  return validRows;
}

function buildSelectionMethodHtml(lines, sectionKey) {
  const validRows = parseSelectionMethodRows(lines);
  if (!validRows.length) return buildPlainListHtml(lines, sectionKey);

  return `
    <div class="admission-raw-section-wrap">
      ${buildSelectionMethodTable(validRows)}
    </div>
  `;
}

// Phase 1 절단면: 폴백 판정("없음" 특수 케이스)은 rows로 표현할 수 없는
// 별도 렌더(빈 박스)라 buildExamScheduleHtml에 남기고, 그 다음 행 추출부만
// 분리한다.
function parseExamScheduleRows(lines) {
  const headerEnd = Math.max(
    lines.findIndex((line) => clean(line) === "날짜"),
    lines.findIndex((line) => clean(line) === "일정"),
  );
  const data = lines
    .slice(headerEnd >= 0 ? headerEnd + 1 : 0)
    .filter(
      (line) =>
        !["전형", "계열", "모집단위", "고사", "내용", "날짜", "일정"].includes(
          clean(line),
        ),
    );
  const rows: string[][] = [];
  let pending: string[] = [];
  let lastType = "";

  data.forEach((line) => {
    if (isDateLike(line)) {
      // 정제 시점 통일: 분류(isDateLike)는 원문 line으로 이미 끝났으므로,
      // 여기서부터는 행 확정 값이다 — htmlTable(:307) 렌더 시점 대신
      // 여기서 sanitizeAdmissionDisplayText를 적용한다. 멱등(실측 108835줄
      // 0건 위반)이라 htmlTable이 다시 적용해도 결과는 동일하다.
      if (pending.length) {
        let type = pending[0] || lastType;
        let target = pending.slice(1).join(" / ");
        if (pending.length === 1 && lastType) {
          type = lastType;
          // pending.length === 1로 이미 확인했다.
          target = pending[0]!;
        }
        rows.push([
          sanitizeAdmissionDisplayText(type || "-"),
          sanitizeAdmissionDisplayText(target || "-"),
          sanitizeAdmissionDisplayText(line),
        ]);
        lastType = type || lastType;
      } else {
        rows.push([
          sanitizeAdmissionDisplayText(lastType || "-"),
          sanitizeAdmissionDisplayText("-"),
          sanitizeAdmissionDisplayText(line),
        ]);
      }
      pending = [];
    } else {
      pending.push(line);
    }
  });

  if (pending.length)
    rows.push([
      sanitizeAdmissionDisplayText(pending[0] || lastType || "-"),
      sanitizeAdmissionDisplayText(pending.slice(1).join(" / ") || "-"),
      sanitizeAdmissionDisplayText("-"),
    ]);

  return rows;
}

function buildExamScheduleHtml(lines, sectionKey) {
  if (lines.some((line) => clean(line) === "없음")) {
    return `
      <div class="admission-raw-section-wrap">
        <div class="admission-result-note">${escapeHtml(SECTION_NOTES[sectionKey] || "")}</div>
        <div class="admission-empty-box">대학별고사일 없음</div>
      </div>
    `;
  }

  const rows = parseExamScheduleRows(lines);
  if (!rows.length) return buildPlainListHtml(lines, sectionKey);

  return `
    <div class="admission-raw-section-wrap">
      <div class="admission-result-note">${escapeHtml(SECTION_NOTES[sectionKey] || "")}</div>
      ${htmlTable(["전형", "대상", "일정"], rows, { className: "admission-data-table admission-exam-table" })}
    </div>
  `;
}

function nextLooksLikeRequirementRow(lines, fromIndex) {
  let hasMark = false;
  for (let k = fromIndex; k < Math.min(lines.length, fromIndex + 10); k += 1) {
    if (isRequirementMark(lines[k])) hasMark = true;
    if (hasMark && isMinimumResultToken(lines[k])) return true;
  }
  return false;
}

function isLikelyMinimumNote(line) {
  const v = clean(line);
  return (
    /^\(?소수점/.test(v) ||
    /^탐구/.test(v) ||
    /^한국사/.test(v) ||
    /^\*/.test(v) ||
    /^※/.test(v) ||
    /^☆/.test(v) ||
    /^단,/.test(v) ||
    /^수\(/.test(v) ||
    (/평균|반영|필수|버림|절사|등급|과목/.test(v) &&
      !/(학과|학부|전공|계열)$/.test(v))
  );
}

function shouldSkipMinimumNote(line) {
  const original = clean(line);
  const v = original.replace(/\s+/g, "");
  // 비고 칸은 실제 설명만 남긴다. 원표의 체크 기호/별표/영역 숫자가 밀린 조각은 비고가 아니다.
  return (
    /^[-–—]$/.test(v) ||
    /^[☆★♥♡❤＊*]$/.test(v) ||
    /^[:：]$/.test(v) ||
    /^필수$/.test(v) ||
    /^[☆★♥♡❤＊*][:：]?(필수|반영|적용)$/.test(v) ||
    /^(별표|스타)[:：]?(필수|반영|적용)$/.test(v) ||
    /^[◯○●][:：]?(있음|반영|적용)?$/.test(v) ||
    /[◯○●☆★♥♡❤]/.test(original) ||
    /^(국어|수학|영어|탐구|사회탐구|과학탐구|한국사)?\s*\d+과목?$/.test(
      original,
    ) ||
    /^(인문|자연|예체능|자유전공|미래융합|모집단위|전모집단위).*[◯○●\d]$/.test(
      original,
    )
  );
}

function isLikelyAdmissionTypeLabel(line) {
  const v = clean(line);
  if (!v) return false;
  if (/(학과|학부|전공|대학|계열|모집단위)$/.test(v)) return false;
  return /(일반|교과|종합|논술|실기|전형|추천|지역|학교장|인재|면접|서류|우수자|기회|농어촌|고른기회|특별|자기추천|혜화|세움|미래)/.test(
    v,
  );
}

function subjectLabelForMark(mark, idx, marks, subjectHeaders = []) {
  const compactLabels = ["국어", "수학", "영어", "탐구"];
  const fullMap = {
    국: "국어",
    확: "수학(확통)",
    "미/기": "수학(미적분/기하)",
    영: "영어",
    사: "사회탐구",
    과: "과학탐구",
    한국사: "한국사",
  };

  let label = "";
  if (marks.length <= 4) {
    label = compactLabels[idx] || `영역 ${idx + 1}`;
  } else {
    label =
      fullMap[subjectHeaders[idx] ?? ""] ||
      subjectHeaders[idx] ||
      `영역 ${idx + 1}`;
  }

  const v = clean(mark);
  if (/^\d+$/.test(v) && /탐구/.test(label)) return `${label} ${v}과목`;
  if (v === "☆") return `${label} 필수`;
  if (/^[◯○]$/.test(v)) return `${label} 반영`;
  if (/^[-–—]$/.test(v)) return `${label} 미반영`;
  return `${label} ${v}`;
}

function formatRequirementMarks(marks, subjectHeaders = []) {
  return marks
    .map((mark, idx) => subjectLabelForMark(mark, idx, marks, subjectHeaders))
    .join(" / ");
}

function splitMinimumLabel(labelParts, lastType) {
  const parts = labelParts
    .map((part) => sanitizeAdmissionDisplayText(part))
    .filter(Boolean);
  if (!parts.length)
    return { type: lastType || "-", target: "-", nextType: lastType };

  if (parts.length === 1) {
    const only = parts[0];
    if (lastType && !isLikelyAdmissionTypeLabel(only)) {
      return { type: lastType, target: only, nextType: lastType };
    }
    return {
      type: only,
      target: "-",
      nextType: isLikelyAdmissionTypeLabel(only) ? only : lastType,
    };
  }

  const first = parts[0];
  const nextType = isLikelyAdmissionTypeLabel(first) ? first : lastType;
  return {
    type: isLikelyAdmissionTypeLabel(first) ? first : lastType || first,
    target: isLikelyAdmissionTypeLabel(first)
      ? parts.slice(1).join(" / ")
      : parts.join(" / "),
    nextType,
  };
}

// Phase 1 절단면: "없음" 특수 케이스(rows로 표현 불가한 빈 박스 렌더)는
// buildMinimumRequirementsHtml에 남기고, flush() 완료까지의 행 추출부만
// 분리한다.
function parseMinimumRequirementRows(lines) {
  const headerStart = lines.findIndex((line) => clean(line) === "국");
  const headerEnd = lines.findIndex((line) => clean(line) === "비고");
  const subjectHeaders =
    headerStart >= 0 && headerEnd > headerStart
      ? lines
          .slice(headerStart, headerEnd)
          .map(clean)
          .filter((line) => !["최저"].includes(line))
      : ["국", "확", "미/기", "영", "사", "과", "한국사"];

  const data = lines
    .slice(headerEnd >= 0 ? headerEnd + 1 : 0)
    .filter(
      (line) =>
        ![
          "전형",
          "계열",
          "모집단위",
          "국",
          "확",
          "미/기",
          "영",
          "사",
          "과",
          "한국사",
          "최저",
          "비고",
        ].includes(clean(line)),
    );

  const rows: string[][] = [];
  let label: string[] = [];
  let marks: string[] = [];
  let minimum = "";
  let notes: string[] = [];
  let state = "label";
  let lastType = "";

  const flush = () => {
    if (!label.length && !marks.length && !minimum && !notes.length) return;
    const split = splitMinimumLabel(label, lastType);
    lastType = split.nextType || lastType;
    const noteText = [
      ...new Set(
        notes
          .map(clean)
          .filter(Boolean)
          .filter((note) => !shouldSkipMinimumNote(note)),
      ),
    ].join(" ");
    // 정제 시점 통일: marks 분류(isRequirementMark 등)는 이미 끝난 뒤이므로,
    // htmlTable(:307) 렌더 시점 대신 행 확정 시점에 sanitizeAdmissionDisplayText를
    // 적용한다(멱등이라 htmlTable이 다시 적용해도 결과 동일).
    rows.push([
      sanitizeAdmissionDisplayText(split.type || "-"),
      sanitizeAdmissionDisplayText(split.target || "-"),
      sanitizeAdmissionDisplayText(
        formatRequirementMarks(marks, subjectHeaders) || "-",
      ),
      sanitizeAdmissionDisplayText(minimum || "-"),
      sanitizeAdmissionDisplayText(noteText || "-"),
    ]);
    label = [];
    marks = [];
    minimum = "";
    notes = [];
    state = "label";
  };

  data.forEach((line, idx) => {
    const v = clean(line);

    if (state === "note") {
      if (!isLikelyMinimumNote(v) && nextLooksLikeRequirementRow(data, idx)) {
        flush();
      } else {
        if (!shouldSkipMinimumNote(v)) notes.push(v);
        return;
      }
    }

    if (state === "label") {
      if (isRequirementMark(v)) {
        marks.push(v);
        state = "marks";
      } else {
        label.push(v);
      }
      return;
    }

    if (state === "marks") {
      if (isMinimumResultToken(v)) {
        minimum = v;
        state = "note";
      } else {
        marks.push(v);
      }
    }
  });
  flush();

  return rows;
}

function buildMinimumRequirementsHtml(lines, sectionKey) {
  if (lines.some((line) => clean(line) === "없음")) {
    return `
      <div class="admission-raw-section-wrap">
        <div class="admission-result-note">${escapeHtml(SECTION_NOTES[sectionKey] || "")}</div>
        <div class="admission-empty-box">수능 최저학력기준 없음</div>
      </div>
    `;
  }

  const rows = parseMinimumRequirementRows(lines);
  if (!rows.length) return buildPlainListHtml(lines, sectionKey);

  return sanitizeAdmissionRenderedHtml(`
    <div class="admission-raw-section-wrap">
      <div class="admission-result-note">${escapeHtml(SECTION_NOTES[sectionKey] || "")}</div>
      ${htmlTable(["전형", "대상", "반영 영역", "최저", "비고"], rows, { className: "admission-data-table admission-minimum-table" })}
    </div>
  `);
}

function isRecordInfoLabel(line) {
  const v = clean(line);
  return (
    /^(전형명|유형|대상|반영교과|반영과목 수|필수 반영|선택 반영|학년|반영 비율|반영비율|교과점수|산출방법|교과성적|학생부|과목|공통과목 \/ 일반선택과목.*|진로선택과목.*|출결 성적 반영 방법|봉사 점수 반영 방법)$/.test(
      v,
    ) || /^(반영점수 및|구분|배점|산출식)$/.test(v)
  );
}

function isGradeHeaderToken(line) {
  const v = clean(line);
  return (
    /^[1-9]$/.test(v) ||
    /^[ABC]$/.test(v) ||
    /^[A-E]\s*\(\d+\)$/.test(v) ||
    /^\d+등급$/.test(v) ||
    /^\d+(?:\.\d+)?(?:~|∼)\d+(?:\.\d+)?$/.test(v) ||
    /^\d+(?:\.\d+)?(?:점|일|시간|시간\s*이상|이상)?$/.test(v) ||
    /^(비고|A|B|C|0일|1~2일|3~5일|6일 이상|20시간|15시간|10시간|5시간|0시간|이상)$/.test(
      v,
    )
  );
}

function studentRecordDisplayLabel(content) {
  const v = clean(content);
  if (!v) return "세부 항목";
  if (/^※|^주\)/.test(v)) return "참고";
  if (/^[①②③④⑤⑥⑦⑧⑨]|^\d+학년/.test(v)) return "학년별 반영";
  if (/산출식|=|∑|평균등급|최종점수|교과점수/.test(v)) return "산출식";
  if (/기본점수|최고점수|만점|배점/.test(v)) return "점수 기준";
  if (/출결|결석/.test(v))
    return /반영|점수|성적/.test(v) ? "출결 반영" : "출결 기준";
  if (/봉사/.test(v))
    return /반영|점수|성적/.test(v) ? "봉사 반영" : "봉사 기준";
  if (/비교과/.test(v) && /반영/.test(v)) return "비교과 반영";
  if (/%/.test(v) && /반영/.test(v)) return "반영비율";
  if (
    /국어|수학|영어|사회|과학|한국사|전과목|전 교과|교과목|반영\s*교과|반영교과|반영\s*과목/.test(
      v,
    )
  )
    return "반영교과";
  if (/석차등급|성취도|진로선택|공통과목|일반선택|등급/.test(v))
    return "성적 반영";
  if (
    /^(교과|비교과|일반|전체전형|전형전체|전체|학생부|교과성적|학생부교과|학생부종합|논술|실기)$/.test(
      v,
    )
  )
    return "적용 구분";
  if (/전형|추천|우수자|인재|면접|서류|논술|일반/.test(v) && v.length <= 30)
    return "적용 전형";
  return "세부 항목";
}

function sanitizeStudentRecordRows(rows) {
  const out: string[][] = [];
  const seen = new Set();

  rows.forEach(([rawLabel, rawContent]) => {
    const content = clean(rawContent);
    if (!content || /^(전형|과목|비고|내용)$/.test(content)) return;

    let label = clean(rawLabel);
    if (!label || label === "내용" || label === "세부 내용")
      label = studentRecordDisplayLabel(content);
    if (label === "내용") label = "세부 항목";

    const key = `${label}::${content}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push([label, content]);
  });

  return out;
}

function normalizeStudentRecordInfoRows(rows) {
  const normalized: string[][] = [];
  const applyValues: string[] = [];

  const flushApplyValues = () => {
    if (!applyValues.length) return;
    normalized.push(["적용 구분", [...new Set(applyValues)].join(" / ")]);
    applyValues.length = 0;
  };

  for (let i = 0; i < rows.length; i += 1) {
    const [rawLabel, rawContent] = rows[i] || [];
    const content = clean(rawContent);
    if (!content) continue;

    let label = clean(rawLabel);
    if (label === "내용") label = studentRecordDisplayLabel(content);

    if (label === "적용 구분") {
      applyValues.push(content);
      continue;
    }

    flushApplyValues();

    // '90%(등급) 반영' 다음에 '(기본점수 ...)'처럼 붙는 행은 한 행으로 묶는다.
    const next = rows[i + 1];
    const nextLabel = (() => {
      if (!next) return "";
      if (clean(next[0]) === "내용") return studentRecordDisplayLabel(next[1]);
      return clean(next[0]);
    })();
    const nextContent = next ? clean(next[1]) : "";
    if (
      (label === "교과 반영" ||
        label === "출결 반영" ||
        label === "봉사 반영" ||
        label === "비교과 반영") &&
      nextContent &&
      (nextLabel === "점수 기준" ||
        /^\([^)]*(기본점수|최고점수|만점|배점)/.test(nextContent))
    ) {
      normalized.push([label, `${content} ${nextContent}`]);
      i += 1;
      continue;
    }

    normalized.push([label || "세부 내용", content]);
  }

  flushApplyValues();
  return sanitizeStudentRecordRows(normalized);
}

function buildRecordInfoRows(lines) {
  const rows: string[][] = [];
  let i = 0;
  while (i < lines.length) {
    const line = clean(lines[i]);
    if (!line || ["전형", "과목", "비고"].includes(line)) {
      i += 1;
      continue;
    }

    if (isRecordInfoLabel(line)) {
      const values: string[] = [];
      i += 1;
      while (
        i < lines.length &&
        !isRecordInfoLabel(lines[i]) &&
        !/^(석차등급|성취도|평균석차등급|원점수|미인정 결석일수|봉사시간)$/.test(
          clean(lines[i]),
        )
      ) {
        const v = clean(lines[i]);
        if (v && !["전형", "과목", "비고"].includes(v)) values.push(v);
        i += 1;
      }
      if (values.length) rows.push([line, values.join(" / ")]);
      continue;
    }

    rows.push(["내용", line]);
    i += 1;
  }
  return normalizeStudentRecordInfoRows(rows);
}

// Phase 1 절단면: buildGradeScoreTables는 루프 안에서 metric/headers/rows를
// 만든 뒤 즉시 escapeHtml + htmlTable로 HTML화해 절단면이 없던 유일한
// 지점이다. buildGradeScoreBlocks가 구조({metric,headers,rows}[])만 반환하고,
// buildGradeScoreTables는 그 결과를 renderGradeScoreTable로 렌더하는 얇은
// 래퍼로 남는다. 템플릿 리터럴의 공백·개행은 골든 바이트 비교 대상이라
// 원본 그대로 유지한다.
function buildGradeScoreBlocks(lines) {
  const blocks: { metric: string; headers: string[]; rows: string[][] }[] = [];
  let i = 0;

  while (i < lines.length) {
    const metric = clean(lines[i]);
    if (
      !/^(석차등급|성취도|평균석차등급|원점수|미인정 결석일수|봉사시간)$/.test(
        metric,
      )
    ) {
      i += 1;
      continue;
    }

    const headers: string[] = [];
    i += 1;
    while (i < lines.length && isGradeHeaderToken(lines[i])) {
      headers.push(clean(lines[i]));
      i += 1;
    }

    const rows: string[][] = [];
    let guard = 0;
    while (i < lines.length && guard < 80) {
      guard += 1;
      const labelParts: string[] = [];
      while (
        i < lines.length &&
        !isGradeHeaderToken(lines[i]) &&
        !isNumericTableValue(lines[i]) &&
        !/^(석차등급|성취도|평균석차등급|원점수|미인정 결석일수|봉사시간)$/.test(
          clean(lines[i]),
        )
      ) {
        const v = clean(lines[i]);
        if (/^※|^\d+\)|^①|^②|^③|^④/.test(v)) break;
        labelParts.push(v);
        i += 1;
      }

      if (/^※|^\d+\)|^①|^②|^③|^④/.test(clean(lines[i] || ""))) break;
      if (
        /^(석차등급|성취도|평균석차등급|원점수|미인정 결석일수|봉사시간)$/.test(
          clean(lines[i] || ""),
        )
      )
        break;

      const values: string[] = [];
      while (
        i < lines.length &&
        (isGradeHeaderToken(lines[i]) ||
          isNumericTableValue(lines[i]) ||
          /^[ABC]$/.test(clean(lines[i])) ||
          /^\d+등급$/.test(clean(lines[i])))
      ) {
        values.push(clean(lines[i]));
        i += 1;
        if (headers.length && values.length >= headers.length) break;
      }

      if (labelParts.length || values.length) {
        const label = labelParts.join(" / ") || "환산값";
        const row: string[] = [label];
        for (let h = 0; h < headers.length; h += 1) row.push(values[h] || "");
        if (!headers.length) row.push(values.join(" / "));
        rows.push(row);
      } else {
        break;
      }

      if (!headers.length) break;
    }

    if (headers.length && rows.length) {
      blocks.push({ metric, headers, rows });
    }
  }

  return blocks;
}

function renderGradeScoreTable({ metric, headers, rows }) {
  return `
        <div class="admission-subhead">${escapeHtml(metric)} 환산표</div>
        ${htmlTable(["구분", ...headers], rows, { compact: true, className: "admission-data-table admission-score-table" })}
      `;
}

function buildGradeScoreTables(lines) {
  return buildGradeScoreBlocks(lines).map(renderGradeScoreTable);
}

function buildStudentRecordHtml(lines, sectionKey) {
  const firstGradeIdx = lines.findIndex((line) =>
    /^(석차등급|성취도|평균석차등급|원점수|미인정 결석일수|봉사시간)$/.test(
      clean(line),
    ),
  );
  const infoLines = firstGradeIdx >= 0 ? lines.slice(0, firstGradeIdx) : lines;
  const tableLines = firstGradeIdx >= 0 ? lines.slice(firstGradeIdx) : [];

  const infoRows = buildRecordInfoRows(infoLines);
  const infoTable = infoRows.length
    ? htmlTable(["구분", "내용"], infoRows, {
        compact: true,
        className: "admission-data-table admission-record-info-table",
      })
    : "";

  const scoreTables = buildGradeScoreTables(tableLines);
  return `
    <div class="admission-raw-section-wrap">
      <div class="admission-result-note">${escapeHtml(SECTION_NOTES[sectionKey] || "")}</div>
      ${infoTable}
      ${scoreTables.join("")}
    </div>
  `;
}

function isMajorAdmissionCategory(line) {
  return /^(학생부교과|학생부종합|논술|실기|수능|정시|교과|종합)$/.test(
    clean(line),
  );
}

function scoreRecruitLabel(label, category) {
  const l = clean(label);
  const c = clean(category);
  if (!l || !c) return 0;
  if (/논술/.test(l) && /논술/.test(c)) return 5;
  if (/(실기|예체능)/.test(l) && /실기/.test(c)) return 5;
  if (
    /(교과|지역균형|학교장|고교추천|일반고교과|교과우수|학생부교과)/.test(l) &&
    /(교과|학생부교과)/.test(c)
  )
    return 4;
  if (
    /(종합|인재|서류|면접|자기추천|활동|추천|성장|창의|혜화|세움|미래)/.test(
      l,
    ) &&
    /(종합|학생부종합)/.test(c)
  )
    return 3;
  return 0;
}

function deriveRecruitGroupLabels(headerLines, groupCount) {
  const ignore = new Set([
    "계열",
    "대학",
    "단과",
    "캠퍼스",
    "모집단위",
    "개설전공",
    "세부전공",
    "인원",
    "경쟁률",
    "70%",
    "75%",
    "80%",
    "90%",
    "50%",
    "평균",
    "최저",
    "(등급)",
    "표 값",
  ]);
  const firstMetric = headerLines.findIndex((line) =>
    ["인원", "경쟁률"].includes(clean(line)),
  );
  const beforeMetric = (
    firstMetric >= 0 ? headerLines.slice(0, firstMetric) : headerLines
  )
    .map(clean)
    .filter(Boolean)
    .filter((line) => !ignore.has(line));

  const categories = beforeMetric
    .filter(isMajorAdmissionCategory)
    .map((cat) =>
      cat === "교과" ? "학생부교과" : cat === "종합" ? "학생부종합" : cat,
    );
  const labels = beforeMetric.filter((line) => !isMajorAdmissionCategory(line));

  if (!groupCount) return [];
  if (!labels.length)
    return Array.from(
      { length: groupCount },
      (_, idx) => categories[idx] || `전형 ${idx + 1}`,
    );

  const result: string[] = [];
  let currentCatIdx = 0;
  for (let i = 0; i < groupCount; i += 1) {
    const label = labels[i] || `전형 ${i + 1}`;
    let cat = categories[currentCatIdx] || "";

    let bestIdx = currentCatIdx;
    let bestScore = scoreRecruitLabel(label, cat);
    categories.forEach((candidate, idx) => {
      const score = scoreRecruitLabel(label, candidate);
      if (score > bestScore) {
        bestScore = score;
        bestIdx = idx;
      }
    });

    if (bestScore > 0) {
      cat = categories[bestIdx];
      currentCatIdx = bestIdx;
    } else if (labels.length === groupCount && categories.length) {
      // 제목이 애매한 경우에는 일반적으로 첫 전형은 첫 큰 분류, 이후는 다음 분류로 이어진다.
      if (i > 0 && currentCatIdx < categories.length - 1) currentCatIdx += 1;
      cat = categories[currentCatIdx] || cat;
    }

    result.push([cat, label].filter(Boolean).join(" · "));
  }

  while (result.length < groupCount) result.push(`전형 ${result.length + 1}`);
  return result.slice(0, groupCount);
}

function toNumberForRecruit(value) {
  const v = clean(value).replace(/[(),]/g, "");
  if (!/^-?\d+(?:\.\d+)?$/.test(v)) return null;
  return Number(v);
}

function isIntegerLike(value) {
  const n = toNumberForRecruit(value);
  return n !== null && Math.abs(n - Math.round(n)) < 0.00001;
}

function splitRecruitValues(values, groupCount) {
  if (!groupCount) return [values];
  const n = values.length;
  const memo = new Map<string, { score: number; chunks: string[][] }>();

  const scoreChunk = (chunk, groupIdx) => {
    if (!chunk.length) return -100;
    let score = 0;
    if (chunk[0] && isIntegerLike(chunk[0])) score += 3;
    if (chunk[1] && isIntegerLike(chunk[1])) score += 3;
    if (chunk.length >= 3 && toNumberForRecruit(chunk[2]) !== null) score += 1;
    const last = toNumberForRecruit(chunk[chunk.length - 1]);
    if (last !== null && last >= 0 && last <= 9.99) score += 2;
    if (chunk.length === 5) score += 3;
    if (chunk.length === 4) score += 1;
    if (groupIdx === groupCount - 1 && chunk.length < 3) score -= 1;
    return score;
  };

  const solve = (idx, g): { score: number; chunks: string[][] } => {
    const key = `${idx}:${g}`;
    if (memo.has(key)) return memo.get(key)!;
    if (g === groupCount) {
      return idx === n
        ? { score: 0, chunks: [] }
        : { score: -9999, chunks: [] };
    }
    const groupsLeft = groupCount - g;
    let best: { score: number; chunks: string[][] } = {
      score: -9999,
      chunks: [],
    };
    for (let len = 5; len >= 1; len -= 1) {
      if (idx + len > n) continue;
      const remaining = n - (idx + len);
      if (remaining < groupsLeft - 1 || remaining > (groupsLeft - 1) * 5)
        continue;
      const chunk = values.slice(idx, idx + len);
      const rest = solve(idx + len, g + 1);
      const score = scoreChunk(chunk, g) + rest.score;
      if (score > best.score) best = { score, chunks: [chunk, ...rest.chunks] };
    }
    memo.set(key, best);
    return best;
  };

  const result = solve(0, 0);
  if (result.score <= -999) {
    const fallback: string[][] = [];
    for (let i = 0; i < n; i += 5) fallback.push(values.slice(i, i + 5));
    while (fallback.length < groupCount) fallback.push([]);
    return fallback.slice(0, groupCount);
  }
  return result.chunks;
}

function inferSingleRecruitLabel(value) {
  const n = toNumberForRecruit(value);
  if (n === null) return "수치";
  // 입결 등급은 보통 1.00~9.00 범위다. 1 미만은 등급으로 보기 어려우므로 경쟁률로 표시한다.
  if (n < 1) return "경쟁률";
  // 10을 넘는 값은 모집인원이 단독으로 남은 경우가 아니면 대체로 경쟁률이다.
  if (n > 9.99) return "경쟁률";
  // 단독 잔여값은 원표에서 앞 칸이 비어 있고 마지막 입결만 남은 경우가 많다.
  return "입결";
}

function recruitChunkLabelMap(chunk) {
  if (chunk.length >= 5)
    return ["27 인원", "26 인원", "26 경쟁률", "25 경쟁률", "26 입결"];
  if (chunk.length === 4) {
    // 원자료 기본 열 순서상 4개만 있으면 마지막 입결칸이 비어 있는 경우로 보고 앞 4개 열에 맞춘다.
    if (chunk.slice(0, 2).every(isIntegerLike))
      return ["27 인원", "26 인원", "26 경쟁률", "25 경쟁률"];
    return chunk.map(inferSingleRecruitLabel);
  }
  if (chunk.length === 3) {
    if (chunk.slice(0, 2).every(isIntegerLike))
      return ["27 인원", "26 인원", "26 경쟁률"];
    return chunk.map(inferSingleRecruitLabel);
  }
  if (chunk.length === 2) {
    if (chunk.every(isIntegerLike)) return ["27 인원", "26 인원"];
    return chunk.map(inferSingleRecruitLabel);
  }
  if (chunk.length === 1) return [inferSingleRecruitLabel(chunk[0])];
  return [];
}

function buildRecruitCell(values) {
  if (!values?.length) return '<span class="muted">-</span>';
  const labels = recruitChunkLabelMap(values);
  return `<div class="admission-recruit-cell-values">
    ${values.map((v, idx) => `<span><b>${escapeHtml(labels[idx] || `값 ${idx + 1}`)}</b>${escapeHtml(v)}</span>`).join("")}
  </div>`;
}

// Phase 1 절단면: 렌더 직전(rows/groupLabels/footnotes 확정)까지가 순수
// 파싱이다. buildRecruitmentHtml은 이 결과로 폴백 판정 + 렌더만 한다.
function parseRecruitmentRows(lines) {
  const pattern = ["27", "26", "26", "25", "26"];
  let dataStart = -1;
  let yearStart = -1;
  for (let i = 0; i <= lines.length - pattern.length; i += 1) {
    let ok = true;
    for (let j = 0; j < pattern.length; j += 1) {
      if (clean(lines[i + j]) !== pattern[j]) {
        ok = false;
        break;
      }
    }
    if (ok) {
      yearStart = i;
      let k = i;
      while (k < lines.length && /^(27|26|25)$/.test(clean(lines[k]))) k += 1;
      dataStart = k;
      break;
    }
  }

  const headerLines = dataStart >= 0 ? lines.slice(0, dataStart) : [];
  const yearTokens =
    yearStart >= 0 ? lines.slice(yearStart, dataStart).map(clean) : [];
  const groupCount = Math.max(1, Math.floor(yearTokens.length / 5));
  const groupLabels = deriveRecruitGroupLabels(headerLines, groupCount).map(
    (label) => sanitizeAdmissionDisplayText(label) || "전형",
  );
  const data = dataStart >= 0 ? lines.slice(dataStart) : lines;
  const rows: {
    group: string;
    unit: string;
    rawValues: string[];
    chunks: string[][];
  }[] = [];
  const footnotes: string[] = [];
  let lastGroup = "";
  let i = 0;

  while (i < data.length) {
    const line = sanitizeAdmissionDisplayText(data[i]);
    if (isFootnoteLine(line)) {
      footnotes.push(sanitizeAdmissionDisplayText(data.slice(i).join(" ")));
      break;
    }

    if (isNumericTableValue(line)) {
      // rows.length로 이미 확인했다.
      if (rows.length) rows[rows.length - 1]!.rawValues.push(line);
      i += 1;
      continue;
    }

    const nameParts: string[] = [];
    let j = i;
    while (
      j < data.length &&
      !isNumericTableValue(data[j]) &&
      !isFootnoteLine(data[j])
    ) {
      nameParts.push(sanitizeAdmissionDisplayText(data[j]));
      j += 1;
    }

    const values: string[] = [];
    while (j < data.length && isNumericTableValue(data[j])) {
      values.push(sanitizeAdmissionDisplayText(data[j]));
      j += 1;
    }

    if (values.length) {
      const cleanedNameParts = nameParts
        .map((part) => sanitizeAdmissionDisplayText(part))
        .filter(Boolean);
      const cleanedValues = values
        .map((part) => sanitizeAdmissionDisplayText(part))
        .filter(Boolean);
      const unit = cleanedNameParts.pop() || "-";
      let group = cleanedNameParts.join(" ");
      if (!group && lastGroup) group = lastGroup;
      if (group) lastGroup = group;
      rows.push({
        group,
        unit,
        rawValues: cleanedValues,
        chunks: splitRecruitValues(cleanedValues, groupCount),
      });
    } else if (nameParts.length && rows.length) {
      // rows.length로 이미 확인했다.
      rows[rows.length - 1]!.unit += ` / ${nameParts.join(" / ")}`;
    } else if (nameParts.length) {
      lastGroup = nameParts.join(" ");
    }
    i = Math.max(j, i + 1);
  }

  return { rows, groupLabels, footnotes };
}

function buildRecruitmentHtml(lines, sectionKey) {
  const { rows, groupLabels, footnotes } = parseRecruitmentRows(lines);
  if (!rows.length) return buildPlainListHtml(lines, sectionKey);

  const headerCells = ["계열/대학", "모집단위", ...groupLabels];
  const rowHtml = rows
    .map(
      (row) => `
    <tr>
      <td class="left group-cell">${escapeHtml(row.group || "-")}</td>
      <td class="left unit-cell">${escapeHtml(row.unit || "-")}</td>
      ${groupLabels.map((_, idx) => `<td class="recruit-values-cell">${buildRecruitCell(row.chunks[idx] || [])}</td>`).join("")}
    </tr>
  `,
    )
    .join("");

  return sanitizeAdmissionRenderedHtml(`
    <div class="admission-raw-section-wrap">
      <div class="admission-result-note">${escapeHtml(SECTION_NOTES[sectionKey] || "")}</div>
      <div class="admission-recruit-legend"></div>
      <div class="admission-scroll-table">
        <table class="admission-data-table admission-recruit-table">
          <thead><tr>${headerCells.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead>
          <tbody>${rowHtml}</tbody>
        </table>
      </div>
      ${footnotes.filter(Boolean).length ? `<div class="admission-footnote">${escapeHtml(footnotes.filter(Boolean).join(" "))}</div>` : ""}
    </div>
  `);
}

function specialBlock(title, bodyHtml) {
  return `<section class="admission-special-block"><div class="admission-special-title">${escapeHtml(title)}</div>${bodyHtml}</section>`;
}

function buildScienceSpecialHtml(universityName) {
  const data =
    SCIENCE_SPECIAL_DATA[universityName] ||
    SCIENCE_SPECIAL_DATA[removeCampus(universityName)] ||
    null;
  if (!data) return "";
  return `
    <div class="admission-raw-section-wrap admission-special-wrap">
      <div class="admission-result-note">${escapeHtml(data.displayName)} 입학자료를 전형별로 다시 정리한 내용입니다. 모집인원, 면접일, 전형방법, 수능최저, 정시 선발 여부를 한 표에서 확인할 수 있습니다.</div>
      ${specialBlock("2027 수시·정시 전형 요약", htmlTable(["전형명", "인원", "면접일", "전형방법", "수능최저", "정시"], data.summaryRows, { className: "admission-data-table admission-special-table" }))}
      ${data.competitionRows?.length ? specialBlock("수시 3개년 경쟁률", htmlTable(["전형", "2026학년도", "2025학년도", "2024학년도"], data.competitionRows, { className: "admission-data-table admission-special-table" })) : ""}
      ${data.changeRows?.length ? specialBlock("전년도와의 차이점", htmlTable(["구분", "변경 사항"], data.changeRows, { className: "admission-data-table admission-special-table" })) : ""}
      ${data.evaluationRows?.length ? specialBlock("서류·면접 평가 방법", htmlTable(["구분", "내용"], data.evaluationRows, { className: "admission-data-table admission-special-table" })) : ""}
    </div>
  `;
}

function buildPoliceSpecialHtml() {
  return `
    <div class="admission-raw-section-wrap admission-special-wrap">
      <div class="admission-result-note">경찰대학 입학자료를 일정, 선발 구조, 평가 요소, 최근 경쟁률로 나누어 정리한 내용입니다.</div>
      ${specialBlock("전형 일정", htmlTable(["구분", "내용"], POLICE_SPECIAL_DATA.scheduleRows, { className: "admission-data-table admission-special-table" }))}
      ${specialBlock("선발 구조", htmlTable(["구분", "내용"], POLICE_SPECIAL_DATA.summaryRows, { className: "admission-data-table admission-special-table" }))}
      ${specialBlock("1차 시험", htmlTable(["과목", "출제범위", "문항수/시간", "배점"], POLICE_SPECIAL_DATA.firstTestRows, { className: "admission-data-table admission-special-table" }))}
      ${specialBlock("학생부·수능 반영", htmlTable(["구분", "내용"], POLICE_SPECIAL_DATA.studentRows, { className: "admission-data-table admission-special-table" }))}
      ${specialBlock("최근 3개년 경쟁률", htmlTable(["학년도", "모집인원", "경쟁률"], POLICE_SPECIAL_DATA.competitionRows, { className: "admission-data-table admission-special-table" }))}
      ${specialBlock("최근 3개년 1차 시험 최초 합격자 평균", htmlTable(["학년도", "국어", "영어", "수학", "평균"], POLICE_SPECIAL_DATA.firstPassRows, { className: "admission-data-table admission-special-table" }))}
    </div>
  `;
}

function buildAcademySpecialHtml() {
  return `
    <div class="admission-raw-section-wrap admission-special-wrap">
      <div class="admission-result-note">사관학교와 국군간호사관학교 입학자료를 일정, 모집인원, 1차 시험, 가산점으로 나누어 정리한 내용입니다.</div>
      ${specialBlock("전형 일정 비교", htmlTable(["구분", "육군사관학교", "해군사관학교", "공군사관학교", "국군간호사관학교"], ACADEMY_SPECIAL_DATA.scheduleRows, { className: "admission-data-table admission-special-table" }))}
      ${specialBlock("모집인원 및 선발 구조", htmlTable(["구분", "육군사관학교", "해군사관학교", "공군사관학교", "국군간호사관학교"], ACADEMY_SPECIAL_DATA.quotaRows, { className: "admission-data-table admission-special-table" }))}
      ${specialBlock("1차 시험 및 가산점", htmlTable(["구분", "내용"], ACADEMY_SPECIAL_DATA.firstTestRows, { className: "admission-data-table admission-special-table" }))}
      ${specialBlock("국방미래인재전형 참고", htmlTable(["구분", "내용"], ACADEMY_SPECIAL_DATA.futureRows, { className: "admission-data-table admission-special-table" }))}
    </div>
  `;
}

function buildSpecialCategoryHtml(rawValue, row, universityName) {
  const name = clean(
    universityName || row?.university_name || row?.university_key,
  );
  if (name === "경찰대학") return buildPoliceSpecialHtml();
  if (
    [
      "육군사관학교",
      "해군사관학교",
      "공군사관학교",
      "국군간호사관학교",
    ].includes(name)
  )
    return buildAcademySpecialHtml();
  if (SCIENCE_SPECIAL_DATA[name] || SCIENCE_SPECIAL_DATA[removeCampus(name)])
    return buildScienceSpecialHtml(name);
  return buildPlainListHtml(splitAdmissionLines(rawValue), "selection_method");
}

export function buildSmartRawHtml(
  value,
  sectionKey,
  row: any = null,
  universityName = "",
) {
  if (row?.detail_status === "category" && sectionKey === "selection_method") {
    return buildSpecialCategoryHtml(value, row, universityName);
  }

  const lines = splitAdmissionLines(value).filter(
    (line) => clean(line) !== "표 값",
  );
  if (!lines.length) return "";

  if (sectionKey === "previous_year_changes")
    return buildPreviousYearChangesHtml(lines, sectionKey);
  if (sectionKey === "selection_method")
    return buildSelectionMethodHtml(lines, sectionKey);
  if (sectionKey === "exam_schedule")
    return buildExamScheduleHtml(lines, sectionKey);
  if (sectionKey === "minimum_requirements")
    return buildMinimumRequirementsHtml(lines, sectionKey);
  if (sectionKey === "school_record_method")
    return buildStudentRecordHtml(lines, sectionKey);
  if (sectionKey === "recruitment_quota")
    return buildRecruitmentHtml(lines, sectionKey);
  return buildPlainListHtml(lines, sectionKey);
}

function buildSafeTextSectionHtml(value, sectionKey) {
  const text = splitAdmissionLines(value)
    .map((line) => sanitizeAdmissionDisplayText(line))
    .filter(Boolean)
    .join("\n");

  if (!text) return "";

  return sanitizeAdmissionRenderedHtml(
    withHwpSectionHeading(
      `
    <div class="admission-raw-section-wrap">
      <pre class="admission-raw-pre admission-safe-text-block">${escapeHtml(text)}</pre>
    </div>
  `,
      sectionKey,
    ),
  );
}

export function buildRawSectionHtml(
  value,
  sectionKey,
  row = null,
  universityName = "",
) {
  if (looksLikeHtml(value)) return sanitizeAdmissionRenderedHtml(value);
  if (sectionKey === "recruitment_quota")
    return buildSafeTextSectionHtml(value, sectionKey);
  return sanitizeAdmissionRenderedHtml(
    withHwpSectionHeading(
      buildSmartRawHtml(value, sectionKey, row, universityName),
      sectionKey,
    ),
  );
}

export function buildRecruitmentResultHtml(value) {
  return buildSmartRawHtml(value, "recruitment_quota");
}

// admission_university_resources 컬럼 매핑: 카테고리 raw 키 → 대응하는 *_html 컬럼 키.
// recruitment_quota만 실 서비스에서 recruitment_result_html이라는 별도 컬럼명을 쓴다.
export const HWP_SECTION_HTML_KEYS = {
  previous_year_changes: "previous_year_changes_html",
  selection_method: "selection_method_html",
  minimum_requirements: "minimum_requirements_html",
  exam_schedule: "exam_schedule_html",
  school_record_method: "school_record_method_html",
  recruitment_quota: "recruitment_result_html",
};

// HWP에서 복사한 원문 전체 텍스트를 "1.~6." 번호 마커 기준으로 6개 카테고리 원문으로 분할한다.
// 마커를 하나도 찾지 못하면 전 카테고리가 빈 문자열로 반환되며, 호출부는 이를 자동 분할 실패로
// 간주하고 카테고리별 개별 붙여넣기(fallback) 입력을 안내해야 한다.
export function splitHwpTextIntoSections(fullText) {
  const result = {};
  HWP_SECTION_ORDER.forEach((key) => {
    result[key] = sliceNumberedSection(fullText, key);
  });
  return result;
}

// 카테고리 원문(raw) → 미리보기/저장용 HTML 한 번에 생성.
// recruitment_quota는 buildRawSectionHtml이 안전한 <pre> 텍스트만 만들도록 되어 있어
// (실 서비스에서 recruitment_result_html은 보통 손으로 다듬은 HTML 표로 관리되기 때문),
// 어드민 파싱 미리보기에서는 buildRecruitmentResultHtml(표 파서)을 직접 사용해
// 다른 카테고리와 동일하게 표 형태 미리보기를 제공한다.
export function buildHwpCategoryHtml(
  sectionKey,
  rawText,
  row = null,
  universityName = "",
) {
  const value = clean(rawText);
  if (!value) return "";
  if (sectionKey === "recruitment_quota") {
    return sanitizeAdmissionRenderedHtml(
      withHwpSectionHeading(buildRecruitmentResultHtml(value), sectionKey),
    );
  }
  return buildRawSectionHtml(value, sectionKey, row, universityName);
}

// =====================================================================
// 구조화 문서(AdmissionDoc) 생성기 — 기존 HTML 빌더의 무변경 병렬 미러.
// 위 buildXxxHtml 함수는 한 글자도 고치지 않는다. 아래 함수들은 같은
// parse*Rows / buildRecordInfoRows / buildGradeScoreBlocks 순수 함수를
// 그대로 소비해 HTML 대신 구조화 blocks를 만든다 — 파싱 로직 이중 구현
// 금지 원칙을 지킨다. 스키마는 src/lib/admissionDoc.js.
//
// 이 파일은 admissionDoc.js를 import하지 않는다(순환 의존 없음 — 반대
// 방향 의존만 존재). 아래 함수가 만드는 객체는 AdmissionDoc 인터페이스를
// 따르지만 타입 검증은 호출부(어드민/백필 스크립트)가
// validateAdmissionDoc으로 별도 수행한다.
// =====================================================================

// TODO(Phase 3): 빌드 시점 git short sha 주입 배선(Vite define)이 아직
// 없어 고정 태그를 쓴다. DB에 실제로 쓰기 시작하는 커밋에서 배선한다.
const DOC_GENERATOR_TAG = "admissionParsing@phase2-lib";

// 정제 시점 통일(§2.5) 공용 헬퍼 — htmlTable(:294) 계열(exam/minimum/
// recordInfo/score/special)이 렌더 시점에 셀마다 적용해온
// sanitizeAdmissionDisplayText를, doc 생성 시점(행 확정 직후)으로 옮길 때
// 쓴다. 문자열만 담는 rows(각 variant 전부 plain string[][])에만 쓴다 —
// selection/recruit처럼 객체 셀(badge/chips)이 섞인 variant에는 쓰지 않는다.
function sanitizeTableCellRows(rows) {
  return rows.map((row) =>
    row.map((cell) => sanitizeAdmissionDisplayText(cell)),
  );
}

// change/plainList 전용 — sanitizeAdmissionDisplayText는 문맥과 무관하게
// 마크(◯○●☆★)를 지우지만, renderDocToHtml 최종 단계의
// sanitizeAdmissionRenderedHtml(HTML 문자열 대상)은 '>' 또는 공백 "뒤"에
// 오는 마크만 지운다(실측: "수능최저○ → ..."처럼 앞 글자에 붙은 마크는
// 보존, "○ 학과명"처럼 공백 뒤 마크는 제거). doc 생성 시점에 미리
// 정제하면서 sanitizeAdmissionDisplayText를 그대로 썼다가 숙명여자대학교
// previous_year_changes 1건에서 이 위치 조건 차이로 Gate A2가 깨졌다
// (골든은 "○" 보존, sanitizeAdmissionDisplayText는 위치 무관하게 제거).
// 이 함수는 문자열 시작 또는 공백 뒤에 오는 마크만 지워 실제 렌더 시점
// 동작을 정확히 재현한다.
function stripLeadingAdmissionMarks(text) {
  return String(text || "")
    .replace(/(^|\s)[◯○●]\s*\d+\s*/g, "$1")
    .replace(/(^|\s)[◯○●☆★♥♡❤]+\s*/g, "$1");
}

function makeDoc(
  sectionKey: SectionKey,
  blocks: Block[],
  {
    source = "parser",
    warnings,
    wrapModifier,
  }: {
    source?: AdmissionDoc["source"];
    warnings?: Warning[];
    wrapModifier?: AdmissionDoc["wrapModifier"];
  } = {},
): AdmissionDoc {
  const doc: AdmissionDoc = {
    v: 1,
    section: sectionKey,
    source,
    generator: DOC_GENERATOR_TAG,
    generatedAt: new Date().toISOString(),
    blocks,
  };
  if (wrapModifier) doc.wrapModifier = wrapModifier;
  if (warnings?.length) doc.warnings = warnings;
  return doc;
}

// previous_year_changes: buildPreviousYearChangesHtml 미러. 이 카테고리는
// 원래도 plainList 폴백이 없다(parseChangeItems가 "없음" 특수 케이스까지
// 항상 최소 1행을 반환하므로).
function buildChangeDocBlocks(lines): Block[] {
  const items = parseChangeItems(lines);
  return [
    {
      kind: "table",
      variant: "change",
      columns: [
        { role: "no", label: "번호" },
        { role: "title", label: "변경 항목" },
        { role: "content", label: "변경 내용" },
      ],
      // 정제 시점 통일: 원래는 renderDocToHtml의 최종 sanitizeAdmissionRenderedHtml
      // 래핑에서만 ◯○●☆★ 등이 걷혔다(예: "○ 학과명 → 새 학과명"). doc은
      // React 렌더러도 그대로 소비하므로(그쪽은 그 래핑을 거치지 않는다),
      // 행 확정 시점에 미리 정제해 저장한다. content는 위치 조건이 있는
      // stripLeadingAdmissionMarks를 쓴다(sanitizeAdmissionDisplayText는
      // 위치 무관하게 지워 렌더 시점 실제 동작과 어긋난다 — 위 주석 참고).
      rows: items.map((item) => [
        sanitizeAdmissionDisplayText(item.no),
        sanitizeAdmissionDisplayText(item.title),
        stripLeadingAdmissionMarks(item.content),
      ]),
    },
  ];
}

// selection_method: buildSelectionMethodHtml 미러.
function buildSelectionDocBlocks(
  lines,
  sectionKey: SectionKey,
  warnings: Warning[],
): Block[] {
  const validRows = parseSelectionMethodRows(lines);
  if (!validRows.length) {
    warnings.push({ code: "fallback-plain-list", detail: sectionKey });
    return buildPlainListDocBlocks(lines, sectionKey);
  }
  return [
    {
      kind: "table",
      variant: "selection",
      columns: [
        { role: "type", label: "전형" },
        { role: "name", label: "전형명" },
        { role: "seats", label: "인원" },
        { role: "minimum", label: "최저" },
        { role: "method", label: "전형방법" },
      ],
      // method는 정제 없이 저장돼왔고 renderDocToHtml 최종 wrap의
      // sanitizeAdmissionRenderedHtml에서만 마크가 걷혔다(예: "100 / ● / 100").
      // stripLeadingAdmissionMarks로 그 위치 조건을 재현해 미리 정제한다.
      rows: validRows.map((r) => {
        const minimum = normalizeSelectionMinimum(r.minimum);
        return [
          r.type || "-",
          r.name || "-",
          r.seats || "-",
          {
            text: minimum,
            badge: minimum === "-" ? "minimumNone" : "minimumHas",
          },
          stripLeadingAdmissionMarks(r.method) || "-",
        ];
      }),
    },
  ];
}

// exam_schedule: buildExamScheduleHtml 미러. "없음" 특수 케이스는 rows로
// 표현 불가한 별도 렌더(emptyBox)라 그대로 분기 유지.
function buildExamDocBlocks(
  lines,
  sectionKey: SectionKey,
  warnings: Warning[],
): Block[] {
  if (lines.some((line) => clean(line) === "없음")) {
    return [{ kind: "emptyBox", message: "대학별고사일 없음" }];
  }
  const rows = parseExamScheduleRows(lines);
  if (!rows.length) {
    warnings.push({ code: "fallback-plain-list", detail: sectionKey });
    return buildPlainListDocBlocks(lines, sectionKey);
  }
  return [
    {
      kind: "table",
      variant: "exam",
      columns: [
        { role: "type", label: "전형" },
        { role: "target", label: "대상" },
        { role: "schedule", label: "일정" },
      ],
      rows,
    },
  ];
}

// minimum_requirements: buildMinimumRequirementsHtml 미러.
function buildMinimumDocBlocks(
  lines,
  sectionKey: SectionKey,
  warnings: Warning[],
): Block[] {
  if (lines.some((line) => clean(line) === "없음")) {
    return [{ kind: "emptyBox", message: "수능 최저학력기준 없음" }];
  }
  const rows = parseMinimumRequirementRows(lines);
  if (!rows.length) {
    warnings.push({ code: "fallback-plain-list", detail: sectionKey });
    return buildPlainListDocBlocks(lines, sectionKey);
  }
  if (rows.some((r) => r[2] && r[2] !== "-")) {
    warnings.push({ code: "subject-marks-flattened" });
  }
  return [
    {
      kind: "table",
      variant: "minimum",
      columns: [
        { role: "type", label: "전형" },
        { role: "target", label: "대상" },
        { role: "areas", label: "반영 영역" },
        { role: "minimum", label: "최저" },
        { role: "note", label: "비고" },
      ],
      rows,
    },
  ];
}

// school_record_method: buildStudentRecordHtml 미러. 이 카테고리는 원래도
// plainList 폴백이 없다 — infoRows/scoreBlocks가 전부 비어도 그대로
// 빈 blocks를 반환한다(원본은 빈 wrap을 그대로 반환).
function buildRecordDocBlocks(lines): Block[] {
  const firstGradeIdx = lines.findIndex((line) =>
    /^(석차등급|성취도|평균석차등급|원점수|미인정 결석일수|봉사시간)$/.test(
      clean(line),
    ),
  );
  const infoLines = firstGradeIdx >= 0 ? lines.slice(0, firstGradeIdx) : lines;
  const tableLines = firstGradeIdx >= 0 ? lines.slice(firstGradeIdx) : [];

  const blocks: Block[] = [];
  const infoRows = buildRecordInfoRows(infoLines);
  if (infoRows.length) {
    blocks.push({
      kind: "table",
      variant: "recordInfo",
      columns: [
        { role: "type", label: "구분" },
        { role: "content", label: "내용" },
      ],
      // 정제 시점 통일(§2.5) — htmlTable(:294)이 렌더 시점에 셀마다
      // sanitizeAdmissionDisplayText를 적용해왔다(예: 리터럴 '-' → 빈 값 →
      // muted span). React 렌더러는 이 래핑을 거치지 않고 doc 값을 그대로
      // 쓰므로, 행 확정 시점(여기)에 미리 정제해 저장한다.
      rows: sanitizeTableCellRows(infoRows),
    });
  }

  buildGradeScoreBlocks(tableLines).forEach(({ metric, headers, rows }) => {
    blocks.push({ kind: "heading", text: `${metric} 환산표` });
    blocks.push({
      kind: "table",
      variant: "score",
      columns: [
        { role: "type", label: "구분" },
        ...headers.map((h) => ({ role: "data", label: h })),
      ],
      rows: sanitizeTableCellRows(rows),
    });
  });

  return blocks;
}

// recruitment_quota: buildRecruitmentHtml 미러.
function buildRecruitDocBlocks(
  lines,
  sectionKey: SectionKey,
  warnings: Warning[],
): Block[] {
  const { rows, groupLabels, footnotes } = parseRecruitmentRows(lines);
  if (!rows.length) {
    warnings.push({ code: "fallback-plain-list", detail: sectionKey });
    return buildPlainListDocBlocks(lines, sectionKey);
  }

  if (groupLabels.length) warnings.push({ code: "chunk-split-heuristic" });
  let usedInferredLabel = false;

  const dataRows = rows.map((row) => {
    const seriesCells = groupLabels.map((_, idx) => {
      const chunk = row.chunks[idx] || [];
      if (!chunk.length) return { chips: [] };
      const labels = recruitChunkLabelMap(chunk);
      if (chunk.length !== 5) usedInferredLabel = true;
      return {
        chips: chunk.map((value, chunkIdx) => ({
          label: labels[chunkIdx] || `값 ${chunkIdx + 1}`,
          value,
        })),
      };
    });
    return [row.group || "-", row.unit || "-", ...seriesCells];
  });

  if (usedInferredLabel) warnings.push({ code: "label-inferred" });

  const blocks: Block[] = [
    {
      kind: "table",
      variant: "recruit",
      columns: [
        { role: "group", label: "계열/대학" },
        { role: "unit", label: "모집단위" },
        ...groupLabels.map((label) => ({ role: "series", label })),
      ],
      rows: dataRows,
    },
  ];
  const cleanedFootnotes = footnotes.filter(Boolean);
  if (cleanedFootnotes.length)
    blocks.push({ kind: "footnote", items: cleanedFootnotes });
  return blocks;
}

// buildPlainListHtml 미러. exam/minimum/selection/recruit이 rows 0행일 때
// 공유하는 폴백이자, buildSpecialCategoryDoc의 비특수대학 분기이기도 하다.
// _sectionKey는 일부 호출부(buildSelectionDocBlocks 등)가 관례적으로 넘기지만
// 실제로는 쓰이지 않는다(원본 JS부터 그랬다 — 타입 전환 시 시그니처만
// 맞춰 arity 불일치를 해소하고 동작은 그대로 둔다).
function buildPlainListDocBlocks(lines, _sectionKey?: SectionKey): Block[] {
  const items: { type: "bullet" | "subtitle" | "text"; text: string }[] = [];
  let bullets: string[] = [];

  // 정제 시점 통일(§2.5) — buildPlainListHtml은 자체 정제 없이 escapeHtml만
  // 하고, 마크 제거는 renderDocToHtml 최종 wrap의 sanitizeAdmissionRenderedHtml
  // 에서 일어났다. React 렌더러는 그 wrap을 거치지 않으므로 행 확정 시점에
  // 미리 정제한다.
  const flushBullets = () => {
    if (!bullets.length) return;
    bullets.forEach((line) => {
      items.push({
        type: "bullet",
        text: sanitizeAdmissionDisplayText(line.replace(/^\d+\.\s*/, "")),
      });
    });
    bullets = [];
  };

  lines.forEach((line) => {
    if (/^\d+\.\s*/.test(line)) {
      bullets.push(line);
      return;
    }
    flushBullets();
    if (/^(주요변경사항|※|\*)/.test(line)) {
      items.push({
        type: "subtitle",
        text: sanitizeAdmissionDisplayText(line),
      });
    } else {
      items.push({ type: "text", text: sanitizeAdmissionDisplayText(line) });
    }
  });
  flushBullets();

  return [{ kind: "plainList", items }];
}

// 특수대학 표 헤더 라벨 → Column.role 추정. role은 렌더에 관여하지 않는
// 문서화용 메타데이터라 매핑이 없으면 'data'로 떨어져도 무해하다.
const SPECIAL_COLUMN_ROLE_MAP = {
  구분: "type",
  전형명: "name",
  전형: "type",
  인원: "seats",
  모집인원: "seats",
  전형방법: "method",
  수능최저: "minimum",
  정시: "note",
  학년도: "series",
  내용: "content",
  과목: "name",
  출제범위: "content",
  "문항수/시간": "content",
  배점: "seats",
  "변경 사항": "content",
  육군사관학교: "series",
  해군사관학교: "series",
  공군사관학교: "series",
  국군간호사관학교: "series",
};
function inferSpecialColumnRole(label) {
  return SPECIAL_COLUMN_ROLE_MAP[label] || "data";
}

function buildSpecialGroupBlock(title, headers, rows): Block {
  return {
    kind: "group",
    title,
    children: [
      {
        kind: "table",
        variant: "special",
        columns: headers.map((label) => ({
          role: inferSpecialColumnRole(label),
          label,
        })),
        // SCIENCE_SPECIAL_DATA/POLICE_SPECIAL_DATA/ACADEMY_SPECIAL_DATA는
        // 손으로 정리한 하드코딩 상수라 리터럴 '-' 등이 그대로 들어있다.
        // htmlTable 렌더 시점 정제와 동일하게 여기서 미리 정제한다.
        rows: sanitizeTableCellRows(rows),
      },
    ],
  };
}

// buildScienceSpecialHtml 미러.
function buildScienceSpecialDoc(universityName) {
  const data =
    SCIENCE_SPECIAL_DATA[universityName] ||
    SCIENCE_SPECIAL_DATA[removeCampus(universityName)] ||
    null;
  if (!data)
    return makeDoc("selection_method", [], { source: "bundled-special" });

  const blocks: Block[] = [
    {
      kind: "note",
      text: `${data.displayName} 입학자료를 전형별로 다시 정리한 내용입니다. 모집인원, 면접일, 전형방법, 수능최저, 정시 선발 여부를 한 표에서 확인할 수 있습니다.`,
    },
    buildSpecialGroupBlock(
      "2027 수시·정시 전형 요약",
      ["전형명", "인원", "면접일", "전형방법", "수능최저", "정시"],
      data.summaryRows,
    ),
  ];
  if (data.competitionRows?.length) {
    blocks.push(
      buildSpecialGroupBlock(
        "수시 3개년 경쟁률",
        ["전형", "2026학년도", "2025학년도", "2024학년도"],
        data.competitionRows,
      ),
    );
  }
  if (data.changeRows?.length) {
    blocks.push(
      buildSpecialGroupBlock(
        "전년도와의 차이점",
        ["구분", "변경 사항"],
        data.changeRows,
      ),
    );
  }
  if (data.evaluationRows?.length) {
    blocks.push(
      buildSpecialGroupBlock(
        "서류·면접 평가 방법",
        ["구분", "내용"],
        data.evaluationRows,
      ),
    );
  }

  return makeDoc("selection_method", blocks, {
    source: "bundled-special",
    wrapModifier: "special",
  });
}

// buildPoliceSpecialHtml 미러.
function buildPoliceSpecialDoc() {
  const blocks: Block[] = [
    {
      kind: "note",
      text: "경찰대학 입학자료를 일정, 선발 구조, 평가 요소, 최근 경쟁률로 나누어 정리한 내용입니다.",
    },
    buildSpecialGroupBlock(
      "전형 일정",
      ["구분", "내용"],
      POLICE_SPECIAL_DATA.scheduleRows,
    ),
    buildSpecialGroupBlock(
      "선발 구조",
      ["구분", "내용"],
      POLICE_SPECIAL_DATA.summaryRows,
    ),
    buildSpecialGroupBlock(
      "1차 시험",
      ["과목", "출제범위", "문항수/시간", "배점"],
      POLICE_SPECIAL_DATA.firstTestRows,
    ),
    buildSpecialGroupBlock(
      "학생부·수능 반영",
      ["구분", "내용"],
      POLICE_SPECIAL_DATA.studentRows,
    ),
    buildSpecialGroupBlock(
      "최근 3개년 경쟁률",
      ["학년도", "모집인원", "경쟁률"],
      POLICE_SPECIAL_DATA.competitionRows,
    ),
    buildSpecialGroupBlock(
      "최근 3개년 1차 시험 최초 합격자 평균",
      ["학년도", "국어", "영어", "수학", "평균"],
      POLICE_SPECIAL_DATA.firstPassRows,
    ),
  ];
  return makeDoc("selection_method", blocks, {
    source: "bundled-special",
    wrapModifier: "special",
  });
}

// buildAcademySpecialHtml 미러.
function buildAcademySpecialDoc() {
  const blocks: Block[] = [
    {
      kind: "note",
      text: "사관학교와 국군간호사관학교 입학자료를 일정, 모집인원, 1차 시험, 가산점으로 나누어 정리한 내용입니다.",
    },
    buildSpecialGroupBlock(
      "전형 일정 비교",
      [
        "구분",
        "육군사관학교",
        "해군사관학교",
        "공군사관학교",
        "국군간호사관학교",
      ],
      ACADEMY_SPECIAL_DATA.scheduleRows,
    ),
    buildSpecialGroupBlock(
      "모집인원 및 선발 구조",
      [
        "구분",
        "육군사관학교",
        "해군사관학교",
        "공군사관학교",
        "국군간호사관학교",
      ],
      ACADEMY_SPECIAL_DATA.quotaRows,
    ),
    buildSpecialGroupBlock(
      "1차 시험 및 가산점",
      ["구분", "내용"],
      ACADEMY_SPECIAL_DATA.firstTestRows,
    ),
    buildSpecialGroupBlock(
      "국방미래인재전형 참고",
      ["구분", "내용"],
      ACADEMY_SPECIAL_DATA.futureRows,
    ),
  ];
  return makeDoc("selection_method", blocks, {
    source: "bundled-special",
    wrapModifier: "special",
  });
}

// buildSpecialCategoryHtml 미러.
export function buildSpecialCategoryDoc(rawValue, row, universityName) {
  const name = clean(
    universityName || row?.university_name || row?.university_key,
  );
  if (name === "경찰대학") return buildPoliceSpecialDoc();
  if (
    [
      "육군사관학교",
      "해군사관학교",
      "공군사관학교",
      "국군간호사관학교",
    ].includes(name)
  )
    return buildAcademySpecialDoc();
  if (SCIENCE_SPECIAL_DATA[name] || SCIENCE_SPECIAL_DATA[removeCampus(name)])
    return buildScienceSpecialDoc(name);
  return makeDoc(
    "selection_method",
    buildPlainListDocBlocks(splitAdmissionLines(rawValue), "selection_method"),
  );
}

// buildSmartRawHtml 미러.
function buildSmartRawDoc(
  value,
  sectionKey,
  row: any = null,
  universityName = "",
) {
  if (row?.detail_status === "category" && sectionKey === "selection_method") {
    return buildSpecialCategoryDoc(value, row, universityName);
  }

  const lines = splitAdmissionLines(value).filter(
    (line) => clean(line) !== "표 값",
  );
  if (!lines.length) return makeDoc(sectionKey, []);

  const warnings: Warning[] = [];
  let blocks: Block[];
  if (sectionKey === "previous_year_changes")
    blocks = buildChangeDocBlocks(lines);
  else if (sectionKey === "selection_method")
    blocks = buildSelectionDocBlocks(lines, sectionKey, warnings);
  else if (sectionKey === "exam_schedule")
    blocks = buildExamDocBlocks(lines, sectionKey, warnings);
  else if (sectionKey === "minimum_requirements")
    blocks = buildMinimumDocBlocks(lines, sectionKey, warnings);
  else if (sectionKey === "school_record_method")
    blocks = buildRecordDocBlocks(lines);
  else if (sectionKey === "recruitment_quota")
    blocks = buildRecruitDocBlocks(lines, sectionKey, warnings);
  else blocks = buildPlainListDocBlocks(lines, sectionKey);

  return makeDoc(sectionKey, blocks, { warnings });
}

// buildRawSectionHtml의 3분기를 정확히 미러링한다: looksLikeHtml →
// RawHtmlBlock{input-was-html} / recruitment_quota → PreTextBlock /
// 그 외 → buildSmartRawDoc.
export function buildRawSectionDoc(
  value,
  sectionKey,
  row = null,
  universityName = "",
) {
  if (looksLikeHtml(value)) {
    return makeDoc(
      sectionKey,
      [
        {
          kind: "rawHtml",
          html: String(value || ""),
          reason: "input-was-html",
        },
      ],
      {
        source: "html-import",
      },
    );
  }
  if (sectionKey === "recruitment_quota") {
    const text = splitAdmissionLines(value)
      .map((line) => sanitizeAdmissionDisplayText(line))
      .filter(Boolean)
      .join("\n");
    return makeDoc(sectionKey, text ? [{ kind: "preText", text }] : []);
  }
  return buildSmartRawDoc(value, sectionKey, row, universityName);
}

// buildHwpCategoryHtml 미러. recruitment_quota에서 표 파서를 강제한다
// (buildRecruitmentResultHtml과 동일) — 어드민이 html과 json을 서로 다른
// 빌더로 만들면 병행 저장 계약이 이 카테고리에서만 깨진다.
export function buildHwpCategoryDoc(
  sectionKey,
  rawText,
  row = null,
  universityName = "",
) {
  const value = clean(rawText);
  if (!value) return makeDoc(sectionKey, []);
  if (sectionKey === "recruitment_quota") {
    return buildSmartRawDoc(value, "recruitment_quota", row, universityName);
  }
  return buildRawSectionDoc(value, sectionKey, row, universityName);
}

// =====================================================================
// 문서 → HTML 미러 렌더러(골든 게이트 + *_html 미러 컬럼 생성 전용,
// React 비의존 — 노드 스크립트에서도 동작해야 한다).
//
// 목표는 renderDocToHtml(buildRawSectionDoc(raw, key, row, name))가 골든과
// 바이트 단위로 일치하는 것뿐이다. 가능한 곳은 기존 렌더 함수
// (buildSelectionMethodTable/buildChangeTableHtml/buildRecruitCell/
// htmlTable/specialBlock)를 그대로 재사용해 같은 템플릿을 두 번 베끼는
// 실수를 원천 차단한다 — 손으로 다시 쓴 부분(plainList/emptyBox/preText/
// recruit 외곽 틀/special 외곽 틀)만 골든 대조로 바이트를 검증했다.
// =====================================================================

function renderPlainListBlockHtml(block) {
  const body: string[] = [];
  let bulletGroup: string[] = [];
  // `ordered` 확장(§8.5, 수행평가 설계 리포트의 `분석 포인트`)을 **React 렌더러와 같은 태그·
  // 같은 클래스 순서로** 낸다. 이 미러는 Gate B(React 출력 ↔ renderDocToHtml 출력 바이트 대조)
  // 의 한쪽 입력이라 두 렌더러가 같은 DOM을 내야 한다 — PlainListView.jsx의 `listClassName`과
  // 짝이다. 대입 모집요강 빌더는 `ordered`를 만들지 않으므로(전수 확인) 기존 골든은 그대로
  // `<ul>`을 탄다.
  const listTag = block.ordered ? "ol" : "ul";
  const listClass = block.ordered
    ? "admission-bullet-list admission-ordered-list"
    : "admission-bullet-list";
  const flushBulletGroup = () => {
    if (!bulletGroup.length) return;
    body.push(
      `<${listTag} class="${listClass}">${bulletGroup.map((text) => `<li>${escapeHtml(text)}</li>`).join("")}</${listTag}>`,
    );
    bulletGroup = [];
  };
  block.items.forEach((item) => {
    if (item.type === "bullet") {
      bulletGroup.push(item.text);
      return;
    }
    flushBulletGroup();
    if (item.type === "subtitle") {
      body.push(
        `<div class="admission-subtitle-line">${escapeHtml(item.text)}</div>`,
      );
    } else {
      body.push(
        `<div class="admission-text-line">${escapeHtml(item.text)}</div>`,
      );
    }
  });
  flushBulletGroup();

  return `
    <div class="admission-raw-section-wrap">
      <div class="admission-result-note"></div>
      <div class="admission-readable-body">${body.join("")}</div>
    </div>
  `;
}

function renderEmptyBoxBlockHtml(block) {
  return `
      <div class="admission-raw-section-wrap">
        <div class="admission-result-note"></div>
        <div class="admission-empty-box">${escapeHtml(block.message)}</div>
      </div>
    `;
}

function renderPreTextBlockHtml(block) {
  return `
    <div class="admission-raw-section-wrap">
      <pre class="admission-raw-pre admission-safe-text-block">${escapeHtml(block.text)}</pre>
    </div>
  `;
}

function renderChangeBlockHtml(block) {
  const rows = block.rows.map((row) => ({
    no: row[0],
    title: row[1],
    html: buildChangeValueHtml(row[2]),
  }));
  return buildChangeTableHtml(rows);
}

// buildSelectionMethodTable을 그대로 재사용하지 않는다 — 그 함수는 내부에서
// normalizeSelectionMinimum(row.minimum)을 다시 호출하는데, 이 함수는
// "◯(미술대학, 체육대학 제외)" 같은 마킹 값에 한해 멱등이 아니다(1차: 마킹
// 매치 → 쉼표 보존, 2차: 마킹 없음 → 쉼표를 슬래시로 치환). doc은 이미
// 정규화된 최종 텍스트를 저장하므로, 여기서는 재정규화 없이 그대로 쓴다.
function renderSelectionTable(rows) {
  return `
    <div class="admission-scroll-table">
      <table class="admission-data-table admission-selection-table">
        <thead>
          <tr>
            <th>전형</th>
            <th>전형명</th>
            <th>인원</th>
            <th>최저</th>
            <th>전형방법</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map((row) => {
              const minimumCell = row[3];
              const minimum = minimumCell.text;
              const minimumCls =
                minimumCell.badge === "minimumNone" ? " none" : " has";
              return `
              <tr>
                <td class="selection-type-cell">${escapeHtml(row[0] || "-")}</td>
                <td class="left selection-name-cell">${escapeHtml(row[1] || "-")}</td>
                <td class="selection-seat-cell">${escapeHtml(row[2] || "-")}</td>
                <td class="selection-minimum-cell"><span class="admission-minimum-badge${minimumCls}">${escapeHtml(minimum)}</span></td>
                <td class="left selection-method-cell">${escapeHtml(row[4] || "-")}</td>
              </tr>
            `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderSelectionBlockHtml(block) {
  return `
    <div class="admission-raw-section-wrap">
      ${renderSelectionTable(block.rows)}
    </div>
  `;
}

function renderExamBlockHtml(block) {
  return `
    <div class="admission-raw-section-wrap">
      <div class="admission-result-note"></div>
      ${htmlTable(
        block.columns.map((c) => c.label),
        block.rows,
        { className: "admission-data-table admission-exam-table" },
      )}
    </div>
  `;
}

function renderMinimumBlockHtml(block) {
  return sanitizeAdmissionRenderedHtml(`
    <div class="admission-raw-section-wrap">
      <div class="admission-result-note"></div>
      ${htmlTable(
        block.columns.map((c) => c.label),
        block.rows,
        { className: "admission-data-table admission-minimum-table" },
      )}
    </div>
  `);
}

function renderRecordBlocksHtml(blocks) {
  const recordInfoBlock = blocks.find(
    (b) => b.kind === "table" && b.variant === "recordInfo",
  );
  const infoTable = recordInfoBlock
    ? htmlTable(
        recordInfoBlock.columns.map((c) => c.label),
        recordInfoBlock.rows,
        {
          compact: true,
          className: "admission-data-table admission-record-info-table",
        },
      )
    : "";

  const scoreTables: string[] = [];
  blocks.forEach((block, idx) => {
    if (block.kind !== "heading") return;
    const tableBlock = blocks[idx + 1];
    if (tableBlock?.kind !== "table" || tableBlock.variant !== "score") return;
    scoreTables.push(`
        <div class="admission-subhead">${escapeHtml(block.text)}</div>
        ${htmlTable(
          tableBlock.columns.map((c) => c.label),
          tableBlock.rows,
          {
            compact: true,
            className: "admission-data-table admission-score-table",
          },
        )}
      `);
  });

  return `
    <div class="admission-raw-section-wrap">
      <div class="admission-result-note"></div>
      ${infoTable}
      ${scoreTables.join("")}
    </div>
  `;
}

// total 함수 — table(variant==='recruit')이 없으면 예외 대신 빈 문자열을
// 반환한다(호출부인 renderInnerHtmlForDoc이 이미 존재를 확인하고 부르지만,
// 이 함수가 다른 경로에서 직접 불려도 안전하도록 방어한다).
function renderRecruitBlocksHtml(blocks) {
  const table = blocks.find(
    (b) => b.kind === "table" && b.variant === "recruit",
  );
  if (!table) return "";
  const footnoteBlock = blocks.find((b) => b.kind === "footnote");
  const groupLabels = table.columns.slice(2).map((c) => c.label);
  const headerCells = table.columns.map((c) => c.label);

  const rowHtml = table.rows
    .map(
      (row) => `
    <tr>
      <td class="left group-cell">${escapeHtml(row[0] || "-")}</td>
      <td class="left unit-cell">${escapeHtml(row[1] || "-")}</td>
      ${groupLabels
        .map((_, idx) => {
          const cell = row[2 + idx];
          const values = cell?.chips
            ? cell.chips.map((chip) => chip.value)
            : [];
          return `<td class="recruit-values-cell">${buildRecruitCell(values)}</td>`;
        })
        .join("")}
    </tr>
  `,
    )
    .join("");

  const footnotes = footnoteBlock ? footnoteBlock.items : [];

  return sanitizeAdmissionRenderedHtml(`
    <div class="admission-raw-section-wrap">
      <div class="admission-result-note"></div>
      <div class="admission-recruit-legend"></div>
      <div class="admission-scroll-table">
        <table class="admission-data-table admission-recruit-table">
          <thead><tr>${headerCells.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead>
          <tbody>${rowHtml}</tbody>
        </table>
      </div>
      ${footnotes.filter(Boolean).length ? `<div class="admission-footnote">${escapeHtml(footnotes.filter(Boolean).join(" "))}</div>` : ""}
    </div>
  `);
}

// recruitExact variant 렌더러 — Phase 5 legacy 임포터(recruitment_quota
// 저장 HTML 207건 중 200건이 admission-normalized-recruit-table, 2단
// 헤더) 검증 전용이다. 현행 파서(buildRecruitmentHtml)는 이 variant를
// 절대 생성하지 않는다(recruitExact 스키마는 정의만 되어 있었다 — 설계
// §4.2). RecruitExactTable.jsx(React)의 fixedColumns/groups 처리를
// 그대로 미러링한다. 실측: 저장 HTML에 admission-result-note/legend div가
// 없어 여기도 넣지 않는다(다른 recruit variant와 다른 점).
function renderRecruitExactBlockHtml(table) {
  const fixedCount = table.fixedColumnCount || 0;
  const fixedColumns = table.columns.slice(0, fixedCount);
  const groups = table.groups || [];
  const dataColumns = table.columns.slice(fixedCount);

  const fixedHeaderHtml = fixedColumns
    .map(
      (c) => `<th rowspan="2" class="fixed-head">${escapeHtml(c.label)}</th>`,
    )
    .join("");
  const groupHeaderHtml = groups
    .map(
      (g) =>
        `<th colspan="${g.count}" class="recruit-group-head">${escapeHtml(g.name)}</th>`,
    )
    .join("");
  const metricHeaderHtml = dataColumns
    .map((c) => `<th>${escapeHtml(c.label)}</th>`)
    .join("");

  const bodyHtml = table.rows
    .map(
      (row) => `
    <tr>
      ${row
        .slice(0, fixedCount)
        .map(
          (cell, idx) =>
            `<td class="left ${idx === 0 ? "series-cell" : ""}">${cell ? escapeHtml(cell) : '<span class="muted">-</span>'}</td>`,
        )
        .join("")}
      ${row
        .slice(fixedCount)
        .map(
          (cell) =>
            `<td>${cell ? escapeHtml(cell) : '<span class="muted">-</span>'}</td>`,
        )
        .join("")}
    </tr>
  `,
    )
    .join("");

  return `
    <div class="admission-scroll-table">
      <table class="admission-data-table admission-normalized-recruit-table">
        <thead>
          <tr>${fixedHeaderHtml}${groupHeaderHtml}</tr>
          <tr>${metricHeaderHtml}</tr>
        </thead>
        <tbody>${bodyHtml}</tbody>
      </table>
    </div>
  `;
}

// 특수대학(경찰대학/사관학교4종/과기원6종) 3개 소스 함수 미러.
//
// 2026-08-08 이전: 첫 GroupBlock의 title로 소스를 판별해 그 소스가 쓰는
// group 제목들을 하드코딩 순서로 하나씩 조회(renderGroup(title))해
// 그렸다. 그 결과 blocks 배열에 없는 title은 항상 빈 문자열이었고 —
// 거꾸로 하드코딩 목록에 없는 title(관리자가 편집기로 새로 추가한 최상위
// 블록)은 blocks 배열에 실제로 들어 있어도 절대 렌더되지 않았다(추가가
// "조용히 무시"됨, team-lead 실측: 4053B → 4053B 무변화).
//
// 지금은 blocks 배열을 순서대로 순회한다. kind별 렌더 방식은 이전과
// 동일(note는 무조건 div, group은 specialBlock+중첩 표)하되 title로
// 조회하지 않고 배열에 실제로 있는 블록만, 있는 순서대로 그린다. 3개
// 소스 빌더(buildPoliceSpecialDoc/buildAcademySpecialDoc/
// buildScienceSpecialDoc)가 만드는 blocks는 항상 [note, group, group...]
// 순서라 기존 데이터의 출력은 바이트 단위로 그대로다(Gate A/A2 재검증
// 완료). group도 아니고 note도 아닌 블록(관리자가 새로 추가한 top-level
// table/plainList/heading 등, docBlockOperations.js의
// PRIMARY_ADDABLE_KINDS_BY_SECTION.selection_method 참고)은
// renderFallbackBlockBodyHtml(그 종류를 "이 블록만 있다면" 수준으로
// 렌더하는 범용 함수, :3115)로 그려 최소한 무시되지 않고 나타나게 한다.
function renderSpecialBlocksHtml(blocks) {
  const bodyHtml = blocks
    .map((block) => {
      if (block.kind === "note") {
        return `<div class="admission-result-note">${escapeHtml(block.text || "")}</div>`;
      }
      if (block.kind === "group") {
        const tableHtml = (block.children || [])
          .map((child) =>
            child.kind === "table"
              ? htmlTable(
                  child.columns.map((c) => c.label),
                  child.rows,
                  { className: "admission-data-table admission-special-table" },
                )
              : renderFallbackBlockBodyHtml(child),
          )
          .join("");
        return specialBlock(block.title, tableHtml);
      }
      return renderFallbackBlockBodyHtml(block);
    })
    .join("\n      ");

  return `
    <div class="admission-raw-section-wrap admission-special-wrap">
      ${bodyHtml}
    </div>
  `;
}

// -----------------------------------------------------------------------
// renderDocToHtml을 total 함수로 만들기 위한 범용 폴백(2026-08-06,
// safehtml이 어드민 배선 중 실제로 재현한 크래시 대응 — 계약: 유효한
// AdmissionDoc이면 어떤 블록 조합이 와도 renderDocToHtml은 절대 던지지
// 않는다).
//
// 배경: validateAdmissionDoc은 "이 섹션엔 반드시 table이 있어야 한다"를
// 강제하지 않는다. 그런데 섹션별 렌더러(renderRecruitBlocksHtml 등)는
// 그 table의 존재를 전제로 무가드 접근했다 — recruitment_quota doc에
// note 블록만 있으면 validate는 통과하는데 렌더는 예외를 던졌다. 지금까지
// 실데이터(HWP 파싱/legacy 임포트)는 항상 "표가 있는" 정상 doc만 만들어서
// 이 경로를 한 번도 안 탔지만, 어드민 표 편집기(DocBlocksEditor.jsx)가
// 임의 블록 조합(표 없이 note만 등)을 만들 수 있게 되면서 처음 실측됐다.
//
// 각 섹션 분기도 함께 고쳤다: 예전엔 kind==='table'만 보고 찾았는데,
// 그러면 다른 섹션용 table(예: 편집기가 새로 추가한 "generic 2컬럼"
// table)이 우연히 껴 있어도 그걸 붙잡아 그 섹션 전용 렌더러(예:
// renderSelectionTable의 row[3].text 접근)에 넘겨 크래시할 수 있었다.
// variant까지 맞는 table만 찾도록 좁혔다 — 못 찾으면 이 폴백으로 온다.
// -----------------------------------------------------------------------

// 블록 하나를 "이 블록만 있다면 이렇게 보여준다" 수준으로 렌더한다(각
// View 컴포넌트가 쓰는 클래스와 동일 — NoteView/FootnoteView/HeadingView
// 재현). 모르는 kind나 필수 값이 빈 블록은 빈 문자열(스킵)만 반환하고
// 절대 던지지 않는다.
function renderFallbackBlockBodyHtml(block) {
  switch (block.kind) {
    case "note":
      return block.text
        ? `<div class="admission-result-note">${escapeHtml(block.text)}</div>`
        : "";
    case "footnote": {
      const text = (block.items || []).filter(Boolean).join(" ");
      return text
        ? `<div class="admission-footnote">${escapeHtml(text)}</div>`
        : "";
    }
    case "heading":
      return block.text
        ? `<div class="admission-subhead">${escapeHtml(block.text)}</div>`
        : "";
    case "emptyBox":
      return block.message
        ? `<div class="admission-empty-box">${escapeHtml(block.message)}</div>`
        : "";
    case "preText":
      return block.text
        ? `<pre class="admission-raw-pre admission-safe-text-block">${escapeHtml(block.text)}</pre>`
        : "";
    case "plainList": {
      const body: string[] = [];
      let bulletGroup: string[] = [];
      const flush = () => {
        if (!bulletGroup.length) return;
        body.push(
          `<ul class="admission-bullet-list">${bulletGroup.map((text) => `<li>${escapeHtml(text)}</li>`).join("")}</ul>`,
        );
        bulletGroup = [];
      };
      (block.items || []).forEach((item) => {
        if (item.type === "bullet") {
          bulletGroup.push(item.text);
          return;
        }
        flush();
        const cls =
          item.type === "subtitle"
            ? "admission-subtitle-line"
            : "admission-text-line";
        body.push(`<div class="${cls}">${escapeHtml(item.text)}</div>`);
      });
      flush();
      return body.length
        ? `<div class="admission-readable-body">${body.join("")}</div>`
        : "";
    }
    case "table":
      if (
        !Array.isArray(block.columns) ||
        !Array.isArray(block.rows) ||
        !block.columns.length
      )
        return "";
      return htmlTable(
        block.columns.map((c) => c.label),
        block.rows,
        { className: "admission-data-table" },
      );
    case "rawHtml":
      return block.html ? sanitizeAdmissionRenderedHtml(block.html) : "";
    // group은 편집기(DocBlocksEditor.jsx)의 추가 가능 목록에 없어(특수대학
    // 전용, wrapModifier==='special' 경로로만 생성) 여기서 만날 일이
    // 없어야 정상이다. 그래도 나타나면 던지지 말고 조용히 스킵한다.
    default:
      return "";
  }
}

// 섹션이 기대하는 핵심 블록(대개 table)을 못 찾았을 때 쓰는 범용 폴백.
// 있는 블록만 최대한 렌더하고, 무엇을 못 찾아서 폴백으로 왔는지 HTML
// 주석으로 남긴다(sanitizeAdmissionRenderedHtml은 정규식 치환이라 주석을
// 지우지 않는다 — 진단용, 실데이터 경로는 안 타므로 골든 무영향).
function renderFallbackBlocksHtml(blocks, sectionKey, reason) {
  const bodies = blocks.map(renderFallbackBlockBodyHtml).filter(Boolean);
  return sanitizeAdmissionRenderedHtml(`
    <div class="admission-raw-section-wrap">
      <!-- renderDocToHtml fallback: section=${sectionKey}, reason=${reason} -->
      ${bodies.join("")}
    </div>
  `);
}

// buildSmartRawHtml 미러(렌더 쪽) — sectionKey별로 buildXxxHtml이 만들던
// "안쪽" HTML(자체 admission-raw-section-wrap 포함, heading/최종 sanitize
// 제외)을 doc.blocks에서 재현한다.
function renderInnerHtmlForDoc(doc, sectionKey) {
  const { blocks, wrapModifier } = doc;
  if (!blocks.length) return "";

  if (wrapModifier === "special") return renderSpecialBlocksHtml(blocks);
  if (blocks.length === 1 && blocks[0].kind === "emptyBox")
    return renderEmptyBoxBlockHtml(blocks[0]);
  if (blocks.length === 1 && blocks[0].kind === "plainList")
    return renderPlainListBlockHtml(blocks[0]);
  if (blocks.length === 1 && blocks[0].kind === "preText")
    return renderPreTextBlockHtml(blocks[0]);

  if (sectionKey === "previous_year_changes") {
    const table = blocks.find(
      (b) => b.kind === "table" && b.variant === "change",
    );
    if (table) return renderChangeBlockHtml(table);
    return renderFallbackBlocksHtml(blocks, sectionKey, "change 표 블록 없음");
  }
  if (sectionKey === "selection_method") {
    const table = blocks.find(
      (b) => b.kind === "table" && b.variant === "selection",
    );
    if (table) return renderSelectionBlockHtml(table);
    return renderFallbackBlocksHtml(
      blocks,
      sectionKey,
      "selection 표 블록 없음",
    );
  }
  if (sectionKey === "exam_schedule") {
    const table = blocks.find(
      (b) => b.kind === "table" && b.variant === "exam",
    );
    if (table) return renderExamBlockHtml(table);
    return renderFallbackBlocksHtml(blocks, sectionKey, "exam 표 블록 없음");
  }
  if (sectionKey === "minimum_requirements") {
    const table = blocks.find(
      (b) => b.kind === "table" && b.variant === "minimum",
    );
    if (table) return renderMinimumBlockHtml(table);
    return renderFallbackBlocksHtml(blocks, sectionKey, "minimum 표 블록 없음");
  }
  if (sectionKey === "school_record_method") {
    const hasRecognizedShape = blocks.some(
      (b, idx) =>
        (b.kind === "table" && b.variant === "recordInfo") ||
        (b.kind === "heading" &&
          blocks[idx + 1]?.kind === "table" &&
          blocks[idx + 1]?.variant === "score"),
    );
    if (hasRecognizedShape) return renderRecordBlocksHtml(blocks);
    return renderFallbackBlocksHtml(
      blocks,
      sectionKey,
      "recordInfo/score 표 블록 없음",
    );
  }
  if (sectionKey === "recruitment_quota") {
    const table = blocks.find(
      (b) =>
        b.kind === "table" &&
        (b.variant === "recruit" || b.variant === "recruitExact"),
    );
    if (table && table.variant === "recruitExact") {
      return `<div class="admission-raw-section-wrap">${renderRecruitExactBlockHtml(table)}</div>`;
    }
    if (table) return renderRecruitBlocksHtml(blocks);
    return renderFallbackBlocksHtml(
      blocks,
      sectionKey,
      "recruit/recruitExact 표 블록 없음",
    );
  }

  return renderFallbackBlocksHtml(blocks, sectionKey, "알 수 없는 sectionKey");
}

/**
 * 문서 → HTML 미러 렌더러. buildRawSectionHtml/buildHwpCategoryHtml과
 * 바이트 단위로 동일한 출력을 목표로 한다(Gate A2). React 비의존.
 * @param {import('./admissionDoc.js').AdmissionDoc} doc
 * @param {import('./admissionDoc.js').SectionKey} sectionKey
 * @returns {string}
 */
export function renderDocToHtml(doc, sectionKey) {
  if (!doc || !Array.isArray(doc.blocks)) return "";

  // buildRawSectionHtml의 looksLikeHtml 분기는 heading wrap도 거치지 않고
  // 값 자체를 그대로 sanitizeAdmissionRenderedHtml만 적용해 반환한다 —
  // 이 분기만 예외적으로 상단에서 처리한다.
  if (
    doc.blocks.length === 1 &&
    doc.blocks[0].kind === "rawHtml" &&
    doc.blocks[0].reason === "input-was-html"
  ) {
    return sanitizeAdmissionRenderedHtml(doc.blocks[0].html);
  }

  const inner = renderInnerHtmlForDoc(doc, sectionKey);
  return sanitizeAdmissionRenderedHtml(
    withHwpSectionHeading(inner, sectionKey),
  );
}

// =====================================================================
// Phase 5 — legacy HTML(curated-html RawHtmlBlock) → 구조화 doc 임포터.
//
// 현행 parseHtmlTableRows(:346)는 colspan/rowspan을 그리드로 펼쳐서
// 병합 "사실"을 폐기한다(recruitExact 2단 헤더처럼 병합 자체가 의미인
// 경우 복원 불가). parseHtmlTableGrid는 헤더의 colSpan/rowSpan을
// 보존하고, 바디는 실측(DB 717셀 전수 확인 — 바디 병합 0건, 헤더만
// 976건)에 근거해 직사각형으로 가정하되 방어적으로 병합을 감지해
// hasBodyMerge 플래그로 알린다(감지 시 호출부가 구조화를 포기하고
// rawHtml을 유지해야 한다는 신호).
// =====================================================================

function extractSpanAttrs(openTag) {
  const colSpan = Math.max(
    1,
    parseInt(
      (openTag.match(/colspan\s*=\s*["']?(\d+)/i) || [])[1] || "1",
      10,
    ) || 1,
  );
  const rowSpan = Math.max(
    1,
    parseInt(
      (openTag.match(/rowspan\s*=\s*["']?(\d+)/i) || [])[1] || "1",
      10,
    ) || 1,
  );
  return { colSpan, rowSpan };
}

function extractClassAttr(openTag) {
  const m = openTag.match(/class\s*=\s*["']([^"']*)["']/i);
  return m ? m[1] : "";
}

function extractCellInnerHtml(cellHtml) {
  return cellHtml.replace(/^<t[hd][^>]*>/i, "").replace(/<\/t[hd]>\s*$/i, "");
}

// <thead> 안의 <th> 셀을 행별로 {text, className, innerHtml, colSpan, rowSpan}
// 배열로 추출한다. 그리드로 펼치지 않는다 — groups/fixedColumnCount 도출에
// span 원본값이 그대로 필요하기 때문이다.
function extractHeaderRows(theadHtml) {
  const rowMatches = String(theadHtml || "").match(/<tr[\s\S]*?<\/tr>/gi) || [];
  return rowMatches.map((rowHtml) => {
    const cellMatches = rowHtml.match(/<th[\s\S]*?<\/th>/gi) || [];
    return cellMatches.map((cellHtml) => {
      const openTag = (cellHtml.match(/^<th[^>]*>/i) || [""])[0];
      const { colSpan, rowSpan } = extractSpanAttrs(openTag);
      return {
        text: clean(stripHtmlToText(cellHtml)),
        className: extractClassAttr(openTag),
        innerHtml: extractCellInnerHtml(cellHtml),
        colSpan,
        rowSpan,
      };
    });
  });
}

// 헤더가 정확히 2행이면 recruitExact류 2단 헤더로 간주한다. 1행 rowSpan=2
// 셀은 fixedColumnCount(양쪽 헤더에 걸친 고정 컬럼), colSpan>1 셀은
// groups(그 아래 하위 헤더 colSpan개를 묶는 그룹)로 환원한다.
// ⚠ 현재 실제 2단 헤더 HTML 샘플로 검증되지 않았다(이번 커밋 대상인
// previous_year_changes/selection_method는 둘 다 1행 헤더) — recruitment_
// quota 임포트 착수 시 재검증 필요.
function deriveHeaderGroups(headerRows) {
  if (headerRows.length !== 2)
    return { groups: undefined, fixedColumnCount: undefined };
  const firstRow = headerRows[0];
  const groups: { name: string; count: number }[] = [];
  let fixedColumnCount = 0;
  firstRow.forEach((cell) => {
    if (cell.rowSpan >= 2) {
      fixedColumnCount += 1;
    } else {
      groups.push({ name: cell.text, count: cell.colSpan });
    }
  });
  return { groups, fixedColumnCount };
}

// <tbody> 안의 <tr>/<td>를 행별로 {text, className, innerHtml} 배열로
// 추출한다(직사각형 가정 — 펼치지 않는다). colspan/rowspan>1인 셀을
// 하나라도 발견하면 hasMerge=true로 표시한다(방어적 감지 — 실측상 0건).
function extractBodyRows(tbodyHtml) {
  const rowMatches = String(tbodyHtml || "").match(/<tr[\s\S]*?<\/tr>/gi) || [];
  let hasMerge = false;
  const rows = rowMatches
    .map((rowHtml) => {
      const cellMatches = rowHtml.match(/<td[\s\S]*?<\/td>/gi) || [];
      return cellMatches.map((cellHtml) => {
        const openTag = (cellHtml.match(/^<td[^>]*>/i) || [""])[0];
        const { colSpan, rowSpan } = extractSpanAttrs(openTag);
        if (colSpan > 1 || rowSpan > 1) hasMerge = true;
        return {
          text: clean(stripHtmlToText(cellHtml)),
          className: extractClassAttr(openTag),
          innerHtml: extractCellInnerHtml(cellHtml),
        };
      });
    })
    .filter((row) => row.length > 0);
  return { rows, hasMerge };
}

/**
 * legacy 저장 HTML의 <table>을 구조화된 그리드로 파싱한다(값 하나 =
 * 셀 하나, 병합은 폐기하지 않고 헤더는 span 그대로, 바디는 병합 감지만).
 * @param {string} html
 * @returns {{headerRows: object[][], bodyRows: object[][], hasBodyMerge: boolean, groups?: {name:string,count:number}[], fixedColumnCount?: number}}
 */
function parseHtmlTableGrid(html) {
  const source = String(html || "");
  const theadMatch = source.match(/<thead[^>]*>([\s\S]*?)<\/thead>/i);
  const tbodyMatch = source.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);

  const headerRows = theadMatch ? extractHeaderRows(theadMatch[1]) : [];
  const { rows: bodyRows, hasMerge: hasBodyMerge } = tbodyMatch
    ? extractBodyRows(tbodyMatch[1])
    : { rows: [], hasMerge: false };
  const { groups, fixedColumnCount } = deriveHeaderGroups(headerRows);

  return { headerRows, bodyRows, hasBodyMerge, groups, fixedColumnCount };
}

// previous_year_changes legacy HTML → TableBlock{variant:'change'} doc.
// 실패(컬럼 수 불일치·바디 병합 감지 등) 시 null — 호출부가 rawHtml
// 폴백을 결정한다. buildChangeTableHtml(:941)의 클래스 계약을 그대로
// 소비한다: change-no-cell/change-title-cell/change-content-cell(내부
// div.admission-change-plain-cell 또는 빈 값이면 span.muted).
export function importChangeDocFromHtml(html) {
  const grid = parseHtmlTableGrid(html);
  if (grid.hasBodyMerge || !grid.bodyRows.length) return null;

  const rows: string[][] = [];
  for (const row of grid.bodyRows) {
    if (row.length !== 3) return null;
    const [noCell, titleCell, contentCell] = row;
    rows.push([noCell.text, titleCell.text, contentCell.text]);
  }

  return {
    v: 1,
    section: "previous_year_changes",
    source: "legacy-html",
    generator: LEGACY_IMPORT_GENERATOR_TAG,
    generatedAt: new Date().toISOString(),
    blocks: [
      {
        kind: "table",
        variant: "change",
        columns: [
          { role: "no", label: "번호" },
          { role: "title", label: "변경 항목" },
          { role: "content", label: "변경 내용" },
        ],
        rows,
      },
    ],
  };
}

// selection_method legacy HTML → TableBlock{variant:'selection'} doc.
// buildSelectionMethodTable(:1194)의 클래스 계약을 그대로 소비한다:
// selection-type-cell/selection-name-cell/selection-seat-cell/
// selection-minimum-cell(내부 span.admission-minimum-badge.has|none)/
// selection-method-cell.
export function importSelectionDocFromHtml(html) {
  const grid = parseHtmlTableGrid(html);
  if (grid.hasBodyMerge || !grid.bodyRows.length) return null;

  const rows: (string | { text: string; badge: string })[][] = [];
  for (const row of grid.bodyRows) {
    if (row.length !== 5) return null;
    const [typeCell, nameCell, seatsCell, minimumCell, methodCell] = row;
    const badgeMatch = minimumCell.innerHtml.match(
      /admission-minimum-badge\s+(has|none)/i,
    );
    const badge = (() => {
      if (badgeMatch)
        return badgeMatch[1].toLowerCase() === "has"
          ? "minimumHas"
          : "minimumNone";
      return minimumCell.text === "-" ? "minimumNone" : "minimumHas";
    })();
    rows.push([
      typeCell.text || "-",
      nameCell.text || "-",
      seatsCell.text || "-",
      { text: minimumCell.text, badge },
      methodCell.text || "-",
    ]);
  }

  return {
    v: 1,
    section: "selection_method",
    source: "legacy-html",
    generator: LEGACY_IMPORT_GENERATOR_TAG,
    generatedAt: new Date().toISOString(),
    blocks: [
      {
        kind: "table",
        variant: "selection",
        columns: [
          { role: "type", label: "전형" },
          { role: "name", label: "전형명" },
          { role: "seats", label: "인원" },
          { role: "minimum", label: "최저" },
          { role: "method", label: "전형방법" },
        ],
        rows,
      },
    ],
  };
}

// htmlTable(:294)/buildRecruitCell(:2164) 계열은 빈 값을
// <span class="muted">-</span>로 렌더한다. 그 셀의 stripHtmlToText 결과는
// "-"(muted span의 텍스트 콘텐츠)라 리터럴 "-"와 구분이 안 된다 — doc에는
// ''(빈 문자열)으로 저장해야 렌더러가 다시 muted span을 재현한다.
function cellValueOrMuted(cell) {
  return /class="muted"/.test(cell.innerHtml) ? "" : cell.text;
}

// exam_schedule legacy HTML → TableBlock{variant:'exam'} doc.
export function importExamDocFromHtml(html) {
  const grid = parseHtmlTableGrid(html);
  if (grid.hasBodyMerge || !grid.bodyRows.length) return null;
  const rows: string[][] = [];
  for (const row of grid.bodyRows) {
    if (row.length !== 3) return null;
    rows.push(row.map((cell) => cellValueOrMuted(cell)));
  }
  return {
    v: 1,
    section: "exam_schedule",
    source: "legacy-html",
    generator: LEGACY_IMPORT_GENERATOR_TAG,
    generatedAt: new Date().toISOString(),
    blocks: [
      {
        kind: "table",
        variant: "exam",
        columns: [
          { role: "type", label: "전형" },
          { role: "target", label: "대상" },
          { role: "schedule", label: "일정" },
        ],
        rows,
      },
    ],
  };
}

// minimum_requirements legacy HTML → TableBlock{variant:'minimum'} doc.
export function importMinimumDocFromHtml(html) {
  const grid = parseHtmlTableGrid(html);
  if (grid.hasBodyMerge || !grid.bodyRows.length) return null;
  const rows: string[][] = [];
  for (const row of grid.bodyRows) {
    if (row.length !== 5) return null;
    rows.push(row.map((cell) => cellValueOrMuted(cell)));
  }
  return {
    v: 1,
    section: "minimum_requirements",
    source: "legacy-html",
    generator: LEGACY_IMPORT_GENERATOR_TAG,
    generatedAt: new Date().toISOString(),
    blocks: [
      {
        kind: "table",
        variant: "minimum",
        columns: [
          { role: "type", label: "전형" },
          { role: "target", label: "대상" },
          { role: "areas", label: "반영 영역" },
          { role: "minimum", label: "최저" },
          { role: "note", label: "비고" },
        ],
        rows,
      },
    ],
  };
}

// admission-empty-box(수능 최저학력기준 없음 / 대학별고사일 없음) 단독
// wrap → EmptyBoxBlock doc. table 임포터가 실패했을 때 시도한다.
export function importEmptyBoxDocFromHtml(sectionKey, html) {
  const source = String(html || "");
  const m = source.match(/<div class="admission-empty-box">([\s\S]*?)<\/div>/i);
  if (!m) return null;
  const message = clean(stripHtmlToText(m[1]));
  if (!message) return null;
  return {
    v: 1,
    section: sectionKey,
    source: "legacy-html",
    generator: LEGACY_IMPORT_GENERATOR_TAG,
    generatedAt: new Date().toISOString(),
    blocks: [{ kind: "emptyBox", message }],
  };
}

// admission-readable-body(admission-bullet-list/admission-subtitle-line/
// admission-text-line) → PlainListBlock doc. table/emptyBox 임포터가
// 모두 실패했을 때 마지막으로 시도한다.
export function importPlainListDocFromHtml(sectionKey, html) {
  const source = String(html || "");
  const bodyMatch = source.match(
    /<div class="admission-readable-body">([\s\S]*?)<\/div>\s*<\/div>\s*$/i,
  );
  if (!bodyMatch) return null;
  // 정규식의 캡처 그룹은 하나뿐이라 매치되면 항상 존재한다.
  const bodyHtml = bodyMatch[1]!;

  const items: { type: string; text: string }[] = [];
  const nodeRe =
    /<ul class="admission-bullet-list">([\s\S]*?)<\/ul>|<div class="admission-subtitle-line">([\s\S]*?)<\/div>|<div class="admission-text-line">([\s\S]*?)<\/div>/gi;
  for (const m of bodyHtml.matchAll(nodeRe)) {
    if (m[1] !== undefined) {
      const liRe = /<li>([\s\S]*?)<\/li>/gi;
      for (const liMatch of m[1].matchAll(liRe)) {
        items.push({
          type: "bullet",
          text: clean(stripHtmlToText(liMatch[1])),
        });
      }
    } else if (m[2] !== undefined) {
      items.push({ type: "subtitle", text: clean(stripHtmlToText(m[2])) });
    } else if (m[3] !== undefined) {
      items.push({ type: "text", text: clean(stripHtmlToText(m[3])) });
    }
  }
  if (!items.length) return null;

  return {
    v: 1,
    section: sectionKey,
    source: "legacy-html",
    generator: LEGACY_IMPORT_GENERATOR_TAG,
    generatedAt: new Date().toISOString(),
    blocks: [{ kind: "plainList", items }],
  };
}

// school_record_method 전용 — <table>과 <div class="admission-subhead">를
// 문서 등장 순서대로 추출한다(recordInfo 0~1개 + (heading,score) 쌍 0개
// 이상이 형제로 나열된 구조 — 실측 확인, GroupBlock으로 묶여있지 않다).
function extractOrderedTableFragments(html) {
  const fragments: (
    | { type: "table"; index: number; className: string; raw: string }
    | { type: "heading"; index: number; text: string }
  )[] = [];
  const tableRe = /<table([^>]*)>([\s\S]*?)<\/table>/gi;
  for (const m of html.matchAll(tableRe)) {
    fragments.push({
      type: "table",
      // matchAll 결과의 index는 항상 매치 위치를 가리킨다.
      index: m.index ?? 0,
      className: extractClassAttr(m[1]),
      raw: m[0],
    });
  }
  const headingRe = /<div class="admission-subhead">([\s\S]*?)<\/div>/gi;
  for (const m of html.matchAll(headingRe)) {
    fragments.push({
      type: "heading",
      index: m.index ?? 0,
      text: clean(stripHtmlToText(m[1])),
    });
  }
  fragments.sort((a, b) => a.index - b.index);
  return fragments;
}

// school_record_method legacy HTML → [TableBlock{recordInfo}?, (HeadingBlock,
// TableBlock{score})...] doc. buildRecordDocBlocks(생성기)와 동일한 blocks
// 모양을 만들어 기존 renderRecordBlocksHtml을 그대로 재사용해 렌더한다.
export function importRecordDocFromHtml(html) {
  const fragments = extractOrderedTableFragments(html);
  if (!fragments.length) return null;

  const blocks: Block[] = [];
  let pendingHeading: string | null = null;

  for (const frag of fragments) {
    if (frag.type === "heading") {
      pendingHeading = frag.text;
      continue;
    }
    const grid = parseHtmlTableGrid(frag.raw);
    if (grid.hasBodyMerge || !grid.bodyRows.length) return null;

    if (frag.className.includes("admission-record-info-table")) {
      const rows: string[][] = [];
      for (const row of grid.bodyRows) {
        if (row.length !== 2) return null;
        rows.push(row.map((cell) => cellValueOrMuted(cell)));
      }
      blocks.push({
        kind: "table",
        variant: "recordInfo",
        columns: [
          { role: "type", label: "구분" },
          { role: "content", label: "내용" },
        ],
        rows,
      });
      pendingHeading = null;
    } else if (frag.className.includes("admission-score-table")) {
      if (!pendingHeading) return null; // 헤딩 없는 score 표 — 예상 못한 모양, 강행하지 않는다
      const headerCells = grid.headerRows[0] || [];
      if (!headerCells.length) return null;
      const rows: string[][] = [];
      for (const row of grid.bodyRows) {
        if (row.length !== headerCells.length) return null;
        rows.push(row.map((cell) => cellValueOrMuted(cell)));
      }
      blocks.push({ kind: "heading", text: pendingHeading });
      blocks.push({
        kind: "table",
        variant: "score",
        columns: headerCells.map((c, idx) => ({
          role: idx === 0 ? "type" : "data",
          label: c.text,
        })),
        rows,
      });
      pendingHeading = null;
    } else {
      return null; // 알 수 없는 표 — 강행하지 않는다
    }
  }

  if (!blocks.length) return null;
  return {
    v: 1,
    section: "school_record_method",
    source: "legacy-html",
    generator: LEGACY_IMPORT_GENERATOR_TAG,
    generatedAt: new Date().toISOString(),
    blocks,
  };
}

// recruitment_quota — admission-normalized-recruit-table(2단 헤더, 저장
// HTML 207건 중 200건) → TableBlock{variant:'recruitExact'} doc. 이 커밋
// 이전에는 groups/fixedColumnCount 경로가 실검증된 적이 없다.
export function importRecruitExactDocFromHtml(html) {
  if (!/admission-normalized-recruit-table/.test(String(html || "")))
    return null;
  const grid = parseHtmlTableGrid(html);
  if (grid.hasBodyMerge || !grid.bodyRows.length) return null;
  if (
    grid.headerRows.length !== 2 ||
    grid.groups === undefined ||
    grid.fixedColumnCount === undefined
  )
    return null;

  const fixedCount = grid.fixedColumnCount;
  const totalColumns =
    fixedCount + grid.groups.reduce((sum, g) => sum + g.count, 0);
  // validateAdmissionDoc 불변식(§2.4-4)을 임포트 시점에 먼저 확인한다 —
  // 어긋나면 needsReview로 보내고 절대 강행하지 않는다.
  if (grid.bodyRows.some((row) => row.length !== totalColumns)) return null;

  const fixedHeaderCells = grid.headerRows[0].filter((c) => c.rowSpan >= 2);
  const metricHeaderCells = grid.headerRows[1] || [];
  if (
    fixedHeaderCells.length !== fixedCount ||
    metricHeaderCells.length !== totalColumns - fixedCount
  )
    return null;

  const columns = [
    ...fixedHeaderCells.map((c, idx) => ({
      role: idx === 0 ? "series" : "unit",
      label: c.text,
    })),
    ...metricHeaderCells.map((c) => ({ role: "data", label: c.text })),
  ];
  const rows = grid.bodyRows.map((row) =>
    row.map((cell) => cellValueOrMuted(cell)),
  );

  return {
    v: 1,
    section: "recruitment_quota",
    source: "legacy-html",
    generator: LEGACY_IMPORT_GENERATOR_TAG,
    generatedAt: new Date().toISOString(),
    blocks: [
      {
        kind: "table",
        variant: "recruitExact",
        columns,
        rows,
        groups: grid.groups,
        fixedColumnCount: fixedCount,
      },
    ],
  };
}

// recruitment_quota — admission-recruit-table(chips 기반, 저장 HTML
// 207건 중 7건 — admission-normalized-recruit-table 도입 전 구버전).
// buildRecruitCell(:2164)이 만드는 <div class="admission-recruit-cell-values">
// <span><b>라벨</b>값</span>...</div> 구조를 역파싱한다.
export function importRecruitLegacyDocFromHtml(html) {
  const source = String(html || "");
  if (
    !/admission-recruit-table\b/.test(source) ||
    /admission-normalized-recruit-table/.test(source)
  )
    return null;
  const grid = parseHtmlTableGrid(html);
  if (grid.hasBodyMerge || !grid.bodyRows.length || !grid.headerRows.length)
    return null;

  const headerCells = grid.headerRows[0];
  if (headerCells.length < 3) return null;
  const groupLabels = headerCells.slice(2).map((c) => c.text);

  const chipRe = /<span><b>([^<]*)<\/b>([^<]*)<\/span>/g;
  const rows: (string | { chips: { label: string; value: string }[] })[][] = [];
  for (const row of grid.bodyRows) {
    if (row.length !== headerCells.length) return null;
    const [groupCell, unitCell, ...valueCells] = row;
    const seriesCells: ({
      chips: { label: string; value: string }[];
    } | null)[] = valueCells.map((cell) => {
      if (/class="muted"/.test(cell.innerHtml)) return { chips: [] };
      const chips: { label: string; value: string }[] = [];
      for (const m of cell.innerHtml.matchAll(chipRe)) {
        chips.push({
          label: clean(decodeBasicHtmlEntities(m[1])),
          value: clean(decodeBasicHtmlEntities(m[2])),
        });
      }
      if (!chips.length) return null; // 예상 못한 셀 모양 — 강행하지 않는다
      return { chips };
    });
    if (seriesCells.some((c) => c === null)) return null;
    // 바로 위에서 null을 걸러냈다.
    rows.push([
      groupCell.text || "-",
      unitCell.text || "-",
      ...(seriesCells as { chips: { label: string; value: string }[] }[]),
    ]);
  }

  const blocks: Block[] = [
    {
      kind: "table",
      variant: "recruit",
      columns: [
        { role: "group", label: headerCells[0].text },
        { role: "unit", label: headerCells[1].text },
        ...groupLabels.map((label) => ({ role: "series", label })),
      ],
      rows,
    },
  ];
  // buildRecruitmentHtml(:2288)의 footnotes.filter(Boolean).join(' ')를
  // 역으로 통짜 텍스트 1건으로 담는다 — 원래 몇 개 문자열이 join됐는지는
  // 저장 HTML만으로 복원 불가하지만, FootnoteBlock 렌더는 join(' ')이라
  // 1건짜리 items로도 바이트 동일하게 재현된다.
  const footnoteMatch = String(html || "").match(
    /<div class="admission-footnote">([\s\S]*?)<\/div>/i,
  );
  if (footnoteMatch) {
    const footnoteText = clean(stripHtmlToText(footnoteMatch[1]));
    if (footnoteText) blocks.push({ kind: "footnote", items: [footnoteText] });
  }

  return {
    v: 1,
    section: "recruitment_quota",
    source: "legacy-html",
    generator: LEGACY_IMPORT_GENERATOR_TAG,
    generatedAt: new Date().toISOString(),
    blocks,
  };
}

const LEGACY_IMPORT_GENERATOR_TAG = "import-legacy-admission-html@phase5";

export function normalizeName(value) {
  return clean(value)
    .replace(/\s+/g, "")
    .replace(/[［[]/g, "(")
    .replace(/[］\]]/g, ")")
    .toLowerCase();
}

function removeCampus(value) {
  return clean(value).replace(/\([^)]*\)/g, "");
}

export function getFirstUrl(row, keys) {
  if (!row) return "";

  for (const key of keys) {
    const value = clean(row[key]);
    if (value) return value;
  }

  return "";
}

export function getSectionText(row, key) {
  return clean(row?.[key]);
}

function getFullResourceName(row) {
  const name = clean(row?.university_name || row?.name);
  const campus = clean(row?.campus);

  if (!name) return "";
  if (!campus || name.includes("(")) return name;
  return `${name}(${campus})`;
}

export function buildResourceIndex(rows) {
  const exactMap = new Map();
  const baseBucket = new Map();

  rows.forEach((row) => {
    const names = [
      row?.university_key,
      row?.university_name,
      row?.name,
      getFullResourceName(row),
    ]
      .map(clean)
      .filter(Boolean);

    names.forEach((name) => {
      exactMap.set(normalizeName(name), row);
    });

    const baseName = removeCampus(row?.university_name || row?.name);
    const baseKey = normalizeName(baseName);
    if (baseKey) {
      if (!baseBucket.has(baseKey)) baseBucket.set(baseKey, []);
      baseBucket.get(baseKey).push(row);
    }
  });

  const uniqueBaseMap = new Map();
  baseBucket.forEach((bucket, key) => {
    if (bucket.length === 1) uniqueBaseMap.set(key, bucket[0]);
  });

  return { exactMap, uniqueBaseMap };
}

export function findResourceRow(university, resourceIndex) {
  const exactKey = normalizeName(university.name);
  const exact = resourceIndex.exactMap.get(exactKey);
  if (exact) return exact;

  const baseKey = normalizeName(removeCampus(university.name));
  return resourceIndex.uniqueBaseMap.get(baseKey) || null;
}

// DB(admission_university_resources) 행을 university 정규화 이름 기준으로
// 중복 제거한다. 과거에는 admissionHwpSections.json 데이터를 여기서 우선
// 병합했으나, 해당 데이터는 이미 DB의 *_html(6종)/raw(6종) 컬럼으로 적재되어
// 있으므로 더 이상 JSON을 참조하지 않는다.
export function mergeHwpResourceRows(rows) {
  const mergedMap = new Map();

  (rows || []).forEach((row) => {
    const fullName =
      getFullResourceName(row) || clean(row?.university_name || row?.name);
    const key = normalizeName(fullName);
    if (key) mergedMap.set(key, row);
  });

  return Array.from(mergedMap.values());
}
