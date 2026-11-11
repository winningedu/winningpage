// KeyValueBlock 렌더러. ⚠ 현재 **대입 모집요강** 파서 어느 빌더도 KeyValueBlock을
// 만들지 않는다(admissionParsing.js 전수 확인 — recordInfo는 2컬럼 GenericTable로
// 이미 렌더되고 있어 KeyValue 경로를 타지 않는다). 즉 이 컴포넌트는 바이트
// 재현 대상 legacy 마크업이 없다 — admission-readable-body/admission-text-line
// 기존 클래스를 재사용해 최소 구현했을 뿐, §5.3 표에 대응 행이 없으므로
// Gate B 대조 시 반드시 재검토가 필요하다(design-doc §9 미결 항목 아님 —
// 스키마에는 있으나 생성 경로가 아직 없는 케이스).
//
// **실사용 생성 경로는 수행평가 설계 리포트다**(2026-08, P10). `api/_routes/performance/design-report.js`가
// §8.5 계약대로 `{kind:'keyValue', rows:[{label, content, href?}]}`를 만들고,
// `PerformanceReportSurface`가 admission-* 클래스에 수행평가 시안 스타일을 다시 입힌다
// (docs/수행평가-상세-명세.md §6.2 「`AdmissionSurface`는 재사용 불가 — 스타일 신설」).
//
// ── `href` 확장 (docs/수행평가-상세-명세.md §8.5 「출처 링크를 클릭 가능한 `<a>`로 →
//    블록 뷰 확장(`rows[].href` 추가)」)
// **하위 호환이다**: `href`가 없는 행은 이전과 완전히 같은 DOM(텍스트 노드)을 낸다.
// 대입 모집요강 쪽 생성 경로가 0건이므로 회귀 표면 자체가 없고, 신규 경로만 이 분기를 탄다.
//
// 링크는 **외부 자료(위닝DB `source_link`)** 라 새 창으로 연다 — 리포트를 읽던 모달이
// 링크 하나로 통째로 날아가면 사용자가 읽던 자리를 잃는다. 새 창임을 시각적으로 표시하는
// 아이콘이 시안에 없으므로 접근성 이름에만 실어 알린다(`QuotaExhaustedCard.jsx`의
// `PURCHASE_ARIA_LABEL`과 같은 관례). `rel="noopener noreferrer"`는 `target="_blank"`의
// 필수 동반 속성이다(opener 탈취·referrer 유출 방지).

import { withDedupedKeys } from "@/lib/reactKeys";

/** 링크 라벨 접미. 시각적 표시가 없는 링크라 접근성 이름으로만 새 창을 알린다. */
const NEW_WINDOW_SUFFIX = " (새 창)";

type KeyValueRow = {
  label?: string;
  content?: string;
  href?: string;
};

type KeyValueViewProps = {
  rows?: KeyValueRow[];
};

export default function KeyValueView({ rows }: KeyValueViewProps) {
  if (!rows?.length) return null;

  return (
    <div className="admission-readable-body">
      {withDedupedKeys(
        rows,
        (row) => `${row.label}-${row.content}-${row.href}`,
      ).map(({ item: row, key }) => (
        <div key={key} className="admission-text-line">
          {row.label ? <b>{row.label}</b> : null}
          {row.label && row.content ? " " : ""}
          {row.href ? (
            <a
              className="admission-inline-link"
              href={row.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${row.content}${NEW_WINDOW_SUFFIX}`}
            >
              {row.content}
            </a>
          ) : (
            row.content
          )}
        </div>
      ))}
    </div>
  );
}
