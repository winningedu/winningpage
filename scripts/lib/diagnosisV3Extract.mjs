// 학습진단 v3.0 xlsx 원본 추출. 생성 스크립트와 패리티 테스트가 같이 쓴다.
import * as XLSX from "xlsx";

/** @typedef {{ r: number, c: (string | number | null)[] }} SheetRow */

const roundFloat = (n) => Math.round(n * 1e10) / 1e10;

/**
 * 워크북의 모든 시트에서 비어 있지 않은 행을 원본 순서대로 뽑는다.
 * 셀 값은 SheetJS가 읽은 그대로이고 빈 셀은 null이다. 소수만 10자리로 반올림한다.
 * @param {Uint8Array | Buffer} data
 * @returns {Record<string, SheetRow[]>}
 */
export function extractSheets(data) {
  const wb = XLSX.read(data, { type: "buffer" });
  /** @type {Record<string, SheetRow[]>} */
  const out = {};
  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name];
    if (!sheet) throw new Error(`missing sheet ${name}`);
    const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1");
    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: null,
      blankrows: true,
      raw: true,
    });
    out[name] = rows.flatMap((row, i) => {
      const c = /** @type {unknown[]} */ (row).map((cell) => {
        if (cell === null || cell === undefined) return null;
        if (typeof cell === "number") return roundFloat(cell);
        if (typeof cell === "string") return cell;
        throw new Error(`unsupported cell type in ${name} row ${i + 1}`);
      });
      return c.some((cell) => cell !== null)
        ? [{ r: range.s.r + i + 1, c }]
        : [];
    });
  }
  return out;
}

const ID_HEADERS = ["문구ID", "키"];
const TEXT_HEADERS = ["문구", "템플릿", "본문", "과제"];
const TRACK_KEYED = { sheet: "08_서비스문구", header: "트랙", base: "기본" };

/**
 * ID 열이 있는 문구 시트에서 문구ID 또는 키를 문구 텍스트로 잇는다.
 * 같은 ID가 다른 문구로 두 번 나오면 던진다. 08 서비스 문구만 트랙이 다른
 * 행에 한해 기본 트랙이 아닌 쪽을 "ID@트랙" 키로 구분한다.
 * @param {Record<string, SheetRow[]>} copySheets
 * @returns {Record<string, string>}
 */
export function buildCopyText(copySheets) {
  /** @type {Record<string, string>} */
  const text = {};
  for (const [name, rows] of Object.entries(copySheets)) {
    const h = rows.findIndex((row) => ID_HEADERS.includes(String(row.c[0])));
    const header = rows[h];
    if (!header) continue;
    const textCol = header.c.findIndex((cell) =>
      TEXT_HEADERS.includes(String(cell)),
    );
    const trackCol = header.c.indexOf(TRACK_KEYED.header);
    if (textCol < 0) throw new Error(`${name}: no text column`);
    for (const row of rows.slice(h + 1)) {
      const [id] = row.c;
      const body = row.c[textCol];
      // 소제목 행("차원별 설명" 등)은 ID 칸만 차 있다.
      if (row.c.slice(1).every((cell) => cell === null)) continue;
      if (typeof id !== "string" || typeof body !== "string") {
        throw new Error(`${name} row ${row.r}: missing id or text`);
      }
      const track = row.c[trackCol];
      const key =
        name === TRACK_KEYED.sheet && track !== TRACK_KEYED.base
          ? `${id}@${track}`
          : id;
      if (key in text && text[key] !== body) {
        throw new Error(
          `${name} row ${row.r}: duplicate id ${key} with different text`,
        );
      }
      text[key] = body;
    }
  }
  return text;
}
