// 엑셀 올리기 미리보기의 오류 행 표와 반영 후보 표.

import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
        <div className="max-h-[10rem] overflow-y-auto border border-destructive/40 bg-destructive/10 p-2 text-xs">
          <p className="font-semibold text-destructive">
            오류 행 {parse.errors.length}건은 반영하지 않습니다.
          </p>
          <table className="mt-1 w-full text-left text-destructive">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead
                  scope="col"
                  className="h-6 w-[4rem] px-2 font-semibold"
                >
                  행
                </TableHead>
                <TableHead scope="col" className="h-6 px-2 font-semibold">
                  사유
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {parse.errors.map((error) => (
                <TableRow
                  key={`${error.rowNo}-${error.reason}`}
                  className="hover:bg-transparent"
                >
                  <TableCell className="px-2 py-1">{error.rowNo}</TableCell>
                  <TableCell className="px-2 py-1 whitespace-normal">
                    {error.reason}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </table>
        </div>
      )}

      {candidates.length > 0 && (
        <div className="max-h-[24rem] overflow-y-auto border border-border text-xs">
          <table className="w-full text-left">
            <TableHeader className="sticky top-0 z-10 bg-muted">
              <TableRow className="hover:bg-transparent">
                <TableHead
                  scope="col"
                  className="h-8 w-[3rem] px-2 font-semibold"
                >
                  반영
                </TableHead>
                <TableHead
                  scope="col"
                  className="h-8 w-[4rem] px-2 font-semibold"
                >
                  행
                </TableHead>
                <TableHead
                  scope="col"
                  className="h-8 w-[4rem] px-2 font-semibold"
                >
                  구분
                </TableHead>
                <TableHead scope="col" className="h-8 px-2 font-semibold">
                  제목
                </TableHead>
                <TableHead scope="col" className="h-8 px-2 font-semibold">
                  중복
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {candidates.map((row) => (
                <TableRow key={row.rowNo}>
                  <TableCell className="px-2 py-1">
                    <RowCheckbox
                      rowNo={row.rowNo}
                      checked={selected.has(row.rowNo)}
                      disabled={disabled}
                      onToggle={onToggle}
                    />
                  </TableCell>
                  <TableCell className="px-2 py-1">{row.rowNo}</TableCell>
                  <TableCell className="px-2 py-1">
                    {row.id ? "수정" : "신규"}
                  </TableCell>
                  <TableCell className="px-2 py-1 whitespace-normal">
                    {String(row.values.title ?? "")}
                  </TableCell>
                  <TableCell className="px-2 py-1 whitespace-normal">
                    <DedupeMatches
                      found={dedupe?.get(row.rowNo)}
                      checked={dedupe !== null}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </table>
        </div>
      )}
    </>
  );
}
