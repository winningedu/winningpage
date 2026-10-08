// 미리보기 표의 중복 검사 결과 칸과 반영 체크박스. 정확 일치는 기본 제외, 근사 일치는 경고다.

import type { DedupeResult } from "../../../../../api/_lib/knowledge/dedupe.js";
import type { DedupeMap } from "./bulkFlow";

/** 미리보기 설명 끝에 붙는 중복 검사 요약. 검사 전이면 빈 문자열이다. */
export function dedupeSummary(dedupe: DedupeMap | null): string {
  if (!dedupe) return "";
  const results = [...dedupe.values()];
  const exactCount = results.filter((r) => r.exact.length > 0).length;
  const nearCount = results.filter((r) => r.near.length > 0).length;
  return `, 정확 일치 ${exactCount}건(기본 제외), 근사 일치 ${nearCount}건(경고)`;
}

export function RowCheckbox({
  rowNo,
  checked,
  disabled,
  onToggle,
}: {
  rowNo: number;
  checked: boolean;
  disabled: boolean;
  onToggle: (rowNo: number) => void;
}) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={() => onToggle(rowNo)}
      disabled={disabled}
      aria-label={`${rowNo}행 반영`}
    />
  );
}

export function DedupeMatches({
  found,
  checked,
}: {
  found: DedupeResult | undefined;
  /** 중복 검사를 마쳤는지. 마쳤는데 결과가 없는 행은 검사하지 않은 행이다. */
  checked: boolean;
}) {
  return (
    <>
      {found && found.exact.length > 0 && (
        <p className="font-bold text-red-600">
          정확 일치: {found.exact.map((m) => m.title).join(", ")}
        </p>
      )}
      {found && found.near.length > 0 && (
        <p className="font-bold text-amber-700">
          근사 일치:{" "}
          {found.near
            .map((m) => `${m.title} (${Math.round(m.similarity * 100)}%)`)
            .join(", ")}
        </p>
      )}
      {checked && !found && <span className="text-gray-400">검사 안 함</span>}
    </>
  );
}
