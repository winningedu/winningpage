// 엑셀 올리기 미리보기의 오류 행 표와 반영 후보 표.

import type { DedupeMap } from "./bulkFlow";
import { DedupeMatches, RowCheckbox } from "./DedupeResult";
import type { KnowledgeParseResult } from "./xlsx";

export default function PreviewTable({
  parse,
  dedupe,
  selected,
  disabled,
  onToggle,
}: {
  parse: KnowledgeParseResult;
  dedupe: DedupeMap | null;
  selected: ReadonlySet<number>;
  disabled: boolean;
  onToggle: (rowNo: number) => void;
}) {
  const candidates = [...parse.inserts, ...parse.updates];
  return (
    <>
      {parse.errors.length > 0 && (
        <div className="max-h-[10rem] overflow-y-auto border border-red-300 bg-red-50 p-2 text-xs">
          <p className="font-black text-red-600">
            오류 행 {parse.errors.length}건은 반영하지 않습니다.
          </p>
          <table className="mt-1 w-full text-left text-red-700">
            <thead>
              <tr>
                <th className="w-[4rem]">행</th>
                <th>사유</th>
              </tr>
            </thead>
            <tbody>
              {parse.errors.map((error) => (
                <tr key={`${error.rowNo}-${error.reason}`}>
                  <td>{error.rowNo}</td>
                  <td>{error.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {candidates.length > 0 && (
        <div className="max-h-[24rem] overflow-y-auto border border-gray-200 text-xs">
          <table className="w-full text-left">
            <thead className="sticky top-0 bg-gray-50">
              <tr>
                <th className="w-[3rem] px-2 py-1">반영</th>
                <th className="w-[4rem] px-2 py-1">행</th>
                <th className="w-[4rem] px-2 py-1">구분</th>
                <th className="px-2 py-1">제목</th>
                <th className="px-2 py-1">중복</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((row) => (
                <tr key={row.rowNo} className="border-t border-gray-100">
                  <td className="px-2 py-1">
                    <RowCheckbox
                      rowNo={row.rowNo}
                      checked={selected.has(row.rowNo)}
                      disabled={disabled}
                      onToggle={onToggle}
                    />
                  </td>
                  <td className="px-2 py-1">{row.rowNo}</td>
                  <td className="px-2 py-1">{row.id ? "수정" : "신규"}</td>
                  <td className="px-2 py-1">
                    {String(row.values.title ?? "")}
                  </td>
                  <td className="px-2 py-1">
                    <DedupeMatches
                      found={dedupe?.get(row.rowNo)}
                      checked={dedupe !== null}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
