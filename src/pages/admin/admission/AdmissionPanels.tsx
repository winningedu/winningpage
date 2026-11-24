import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  exportAdmissionRowsToXlsx,
  parseAdmissionRowsFromXlsx,
} from "@/lib/admissionBulkXlsx";
import { HWP_SECTION_JSON_KEYS } from "@/lib/admissionDoc";
import {
  ADMISSION_RESULTS_BULK_XLSX_COLUMNS,
  exportAdmissionResultRowsToXlsx,
  parseAdmissionResultRowsFromXlsx,
} from "@/lib/admissionResultsBulkXlsx";
import { ApiError, api } from "@/lib/http/client";
import { withDedupedKeys } from "@/lib/reactKeys";
import {
  AdminChunkError,
  reportAdminError,
  withChunkRows,
} from "@/pages/admin/shared/adminErrors";
import { toastSuccess, toastWarning } from "@/pages/admin/shared/adminToast";
import { confirmAdmin } from "@/pages/admin/shared/confirmAdmin";
import { pad2, triggerXlsxDownload } from "@/pages/admin/shared/xlsxDownload";

// 대입모집요강 공개 노출 연도 표시, 변경(admissionGuidelines의 ListSummary,
// AcceptanceRateSummary와 같은 확장점, 목록 페이지 헤더에서만 렌더된다.
// 상세 편집 폼(아코디언)과 완전히 다른 렌더 트리라 폼 무게(input 14개,
// 3,744px)에 영향이 없다, 2026-08-06 사용자의 "어드민이 너무 무겁다"
// 지적 이후 이 제약을 지키기 위해 일부러 폼 밖에 둔 것.
//
// 드롭다운을 안 쓰고 숫자 입력 + 버튼을 쓴다, 지금 admission_year가
// 2027 하나뿐이라(dev DB 실측) 선택지 1개짜리 select는 phase0가 공개
// 쪽에서 거부한 것과 같은 문제("없는 기능을 있는 것처럼 보이게 함")를
// admin에도 만든다. 숫자 입력은 연도 개수와 무관하게 항상 동작한다.
//
// ⚠ 자유 입력의 대가, 데이터 없는 연도를 공개로 지정하면 공개
// 페이지가 통째로 빈 화면이 된다(team-lead 지적, 2026-08-06). 저장
// 직전에 그 연도의 행 수를 이 컴포넌트가 이미 들고 있는 rows(목록
// 조회가 이미 전체 행을 가져온다, PAGE_SIZE는 화면 표시에만 쓰이는
// 클라이언트 슬라이스, loadRows의 select('*')엔 .range()가 없다.
// config.serverPaginate를 켠 탭만 예외로 서버에서 페이지 단위로 끊어
// 받는데, admissionGuidelines는 그 탭이 아니라 전제가 그대로 유효하다)에서
// 세어 0이면 확인을 받는다. 검증을 admissionSettings.js에 넣지
// 않은 이유는 그 함수가 설정 저장만 하는 게 책임이고, 리소스 테이블
// 행 수를 아는 건 호출부(이 파일)의 책임이라고 team-lead가 판단했기
// 때문이다.
//
// admissionGuidelines.ListSummary의 실제 진입점. 연도 표시, 변경(기존
// AdmissionActiveYearSummary, 안 건드림)과 엑셀 일괄 왕복 패널(신규
// AdmissionBulkXlsxPanel)을 세로로 쌓아 렌더한다, 한 줄에 몰아넣으면
// "연도 표시+입력+버튼+다운로드+업로드"가 뒤섞여 복잡해진다는 판단
// (설계 문서 §2). onReload는 AdminForm의 loadRows를 그대로 받아
// 엑셀 적용 후 목록을 재조회하는 데 쓴다.
export function AdmissionListSummary({ rows, onReload }) {
  return (
    <>
      <AdmissionActiveYearSummary rows={rows} />
      <AdmissionBulkXlsxPanel rows={rows} onReload={onReload} />
    </>
  );
}

const activeYearSchema = z.object({ year: z.number() });

const activeYearQuery = queryOptions({
  queryKey: ["admin", "admission", "active-year"],
  queryFn: ({ signal }) =>
    api.get("admin/admission/active-year", { signal }).json(activeYearSchema),
});

function AdmissionActiveYearSummary({ rows }) {
  const queryClient = useQueryClient();
  const yearQuery = useQuery(activeYearQuery);
  const activeYear = yearQuery.data?.year ?? null;
  const loadingActiveYear = yearQuery.isPending;
  // 지정된 연도가 없는 상태는 오류가 아니라 정상 초기 상태다. 상수로 채우지 않는다.
  const notSet =
    yearQuery.error instanceof ApiError && yearQuery.error.code === "NOT_FOUND";
  const [draftYear, setDraftYear] = useState("");

  useEffect(() => {
    if (activeYear !== null) setDraftYear(String(activeYear));
  }, [activeYear]);

  const save = useMutation({
    mutationFn: async (year: number) => {
      await api
        .put("admin/admission/active-year", { json: { year } })
        .json(activeYearSchema);
      // 낙관적 표시 대신 실제 값을 재조회한다, 이 값이 고객 노출을 좌우하므로
      // 저장이 실제로 반영됐는지 확인한다.
      return queryClient.fetchQuery({ ...activeYearQuery, staleTime: 0 });
    },
    onSuccess: ({ year }) => {
      toastSuccess(`공개 연도를 ${year}학년도로 변경했습니다.`);
    },
    onError: (err) => reportAdminError("공개 연도 저장 실패", err),
  });
  const saving = save.isPending;

  const activeYearCount = activeYear
    ? (rows || []).filter((row) => Number(row.admission_year) === activeYear)
        .length
    : 0;

  async function handleChangeYear() {
    const year = Number(draftYear);
    // 4자리 상식선 제한, 999999 같은 값이 통과하면 안 된다(team-lead 지적).
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      toastWarning("연도는 2000~2100 사이 정수로 입력해 주세요.");
      return;
    }

    const matchCount = (rows || []).filter(
      (row) => Number(row.admission_year) === year,
    ).length;
    if (matchCount === 0) {
      const proceed = await confirmAdmin({
        title: "그래도 지정하시겠습니까?",
        description: `${year}학년도 데이터가 0개교입니다. 이대로 공개 연도를 지정하면 공개 페이지의 대학별 모집요강이 통째로 빈 화면이 됩니다.`,
        confirmLabel: "지정",
        destructive: true,
      });
      if (!proceed) return;
    }

    save.mutate(year);
  }

  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 bg-white p-4 text-sm shadow-sm">
      <div className="font-semibold">
        {loadingActiveYear ? (
          "공개 연도 확인 중…"
        ) : notSet ? (
          "공개 연도가 지정되지 않았습니다"
        ) : activeYear === null ? (
          "공개 연도를 불러오지 못했습니다"
        ) : (
          <>
            현재 공개 연도:{" "}
            <span className="text-blue-600">{activeYear}학년도</span>
            {" \u00B7 "}
            {activeYearCount}개교
          </>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          value={draftYear}
          onChange={(e) => setDraftYear(e.target.value)}
          min={2000}
          max={2100}
          disabled={loadingActiveYear || saving}
          className="h-9 w-24 font-medium"
          aria-label="새 공개 연도"
        />
        <Button
          size="lg"
          type="button"
          onClick={handleChangeYear}
          disabled={loadingActiveYear || saving}
        >
          {saving ? "저장 중…" : "변경"}
        </Button>
      </div>
    </div>
  );
}

// 대입모집요강 218행 전체를 26컬럼 xlsx(src/lib/admissionBulkXlsx.js,
// 사용자가 준 모집요강.xlsx와 동일 포맷)로 일괄 왕복한다. 설계 문서
// (docs/admission-bulk-xlsx-ui-design.md, 커밋 대상 아님) §3의 흐름을
// 그대로 구현했다:
//   다운로드(항상 전체, 필터 무시) 다음 업로드(파일 선택만으로는 반영 안
//   됨) 다음 미리보기(신규/수정/거부/잘림보존/raw변경재생성 건수 +
//   errors 항상 펼침 + warnings 4그룹, 건수는 항상 보이고 목록만 접힘)
//   다음 "영향받는 N행을 확인했습니다" 체크박스로 게이트된 적용 다음 재조회.
//
// warnings.type 계약(team-lead가 phase0와 확정, 최종 b0d05c0)을 그대로
// 쓴다, reason 문자열은 파싱하지 않고 표시 전용으로만 쓴다. 4그룹
// 분류가 이 UI에서 제일 중요한 판단이다: rawChangedRegenerated는
// 이름이 다른 "보존형"과 비슷해 보이지만 실제로는 값이 바뀐다(표
// 구조가 단순해질 수 있음), 나머지 보존형(truncated/regressionSkipped,
// "반영 안 됨")과 같은 그룹에 넣으면 관리자가 오해하므로 별도 그룹
// ("반영됐지만 품질 주의")으로 시각적으로 분리한다.
//
// 엑셀 포맷에서 html 3종이 빠지면서(26에서 23컬럼) "html 파싱 실패"라는
// 상태 자체가 없어졌다, 이제 트리거는 raw 비교뿐이다: 업로드 raw가
// DB raw와 같으면 경고 자체가 안 생기고(raw가 안 바뀐 카테고리의
// "보존" type이 열거형에서 아예 빠졌다, emit된 적 없는 죽은 값이라
// 정리됐다), 다르면 raw에서 재생성하고 rawChangedRegenerated 경고가
// 남는다.
const BULK_XLSX_WARNING_GROUPS = [
  {
    key: "notApplied",
    label: "반영 안 됨 \u2014 기존 값 유지",
    tone: "neutral",
    types: ["truncated", "regressionSkipped"],
  },
  {
    key: "regeneratedCaution",
    label: "반영됨 \u2014 품질 주의(표 구조가 단순해질 수 있음)",
    tone: "warning",
    types: ["rawChangedRegenerated"],
  },
  {
    key: "emptied",
    label: "이 카테고리가 비워짐(저장 안 됨)",
    tone: "neutral",
    types: ["importFailed"],
  },
  {
    key: "newUniversity",
    label: "신규 대학 추가(오타 확인 필요)",
    tone: "info",
    types: ["newUniversity"],
  },
];

const BULK_XLSX_TONE_CLASS = {
  neutral: "border-gray-300 bg-gray-50 text-gray-700",
  warning: "border-amber-400 bg-amber-50 text-amber-700",
  info: "border-blue-300 bg-blue-50 text-blue-700",
};

// existingRows 맵 값에 담을 6개 raw 카테고리 컬럼, CATEGORY_KEYS와
// 이름이 같다(admissionBulkXlsx.js는 이 파일에 export 안 돼 있어 여기서
// HWP_SECTION_JSON_KEYS의 키로 다시 뽑는다). html 파싱 실패 시 "raw가
// 안 바뀌었나" 비교에 쓰인다, 빠뜨리면 항상 "다름"으로 판정돼
// 불필요한 재생성이 일어난다(team-lead가 명시적으로 강조한 지점).
const BULK_XLSX_RAW_CATEGORY_KEYS = Object.keys(HWP_SECTION_JSON_KEYS);

function AdmissionBulkXlsxPanel({ rows, onReload }) {
  const [exportTruncatedCells, setExportTruncatedCells] = useState<
    ReturnType<typeof exportAdmissionRowsToXlsx>["truncatedCells"]
  >([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [parseResult, setParseResult] = useState<ReturnType<
    typeof parseAdmissionRowsFromXlsx
  > | null>(null); // { rows, errors, warnings, summary }
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(
    {},
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  // 파서(.js)가 돌려주는 rows는 Record<string, unknown>[]로 느슨하다. 서버 zod가 검증한다.
  const apply = useMutation({
    mutationFn: (items: Record<string, unknown>[]) =>
      api
        .put("admin/admission/guidelines/bulk", { json: { items } })
        .json(z.object({ upserted: z.number() })),
    onError: (err) => reportAdminError("엑셀 적용 실패", err),
  });
  const applying = apply.isPending;

  const totalRows = (rows || []).length;

  function handleDownload() {
    const { workbook, truncatedCells } = exportAdmissionRowsToXlsx(rows || []);
    setExportTruncatedCells(truncatedCells);
    const today = new Date();
    const fileName = `모집요강_전체_${today.getFullYear()}${pad2(today.getMonth() + 1)}${pad2(today.getDate())}.xlsx`;
    if (typeof document !== "undefined") {
      triggerXlsxDownload(workbook, fileName);
    }
  }

  function buildExistingRowsMap() {
    const map = new Map();
    (rows || []).forEach((row) => {
      const key = `${row.admission_year}::${row.university_key}`;
      const value = { id: row.id };
      Object.values(HWP_SECTION_JSON_KEYS).forEach((jsonColumn) => {
        value[jsonColumn] = row[jsonColumn];
      });
      BULK_XLSX_RAW_CATEGORY_KEYS.forEach((rawKey) => {
        value[rawKey] = row[rawKey];
      });
      map.set(key, value);
    });
    return map;
  }

  function handleFileChange(event) {
    const file = event.target.files?.[0];
    event.target.value = ""; // 같은 파일을 다시 선택해도 change가 발생하게 리셋
    if (!file) return;

    setParseErrors([]);
    setParseResult(null);
    setConfirmChecked(false);
    setExpandedGroups({});

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const workbook = XLSX.read(reader.result, { type: "array" });
        const existingRows = buildExistingRowsMap();
        const result = parseAdmissionRowsFromXlsx(workbook, existingRows);
        setParseResult(result);
      } catch (err) {
        setParseErrors([
          `파일을 읽는 중 오류가 발생했습니다: ${err?.message || err}`,
        ]);
      }
    };
    reader.onerror = () => {
      setParseErrors(["파일을 읽지 못했습니다."]);
    };
    reader.readAsArrayBuffer(file);
  }

  function toggleGroup(key) {
    setExpandedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function cancelPreview() {
    setParseResult(null);
    setConfirmChecked(false);
    setExpandedGroups({});
  }

  async function handleApply() {
    if (!parseResult || !confirmChecked || applying) return;
    try {
      await apply.mutateAsync(parseResult.rows);
    } catch {
      return; // 오류 안내는 mutation의 onError가 이미 띄웠다
    }
    const { summary } = parseResult;
    setParseResult(null);
    setConfirmChecked(false);
    setExpandedGroups({});
    onReload?.();
    toastSuccess(
      "엑셀 적용 완료",
      `신규 ${summary.willInsert}건, 수정 ${summary.willUpdate}건, 거부 ${summary.willSkip}건.`,
    );
  }

  const affectedCount = parseResult
    ? parseResult.summary.willInsert + parseResult.summary.willUpdate
    : 0;

  return (
    <div className="mb-6 bg-white p-4 text-sm shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="font-semibold">엑셀 일괄 관리</div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="lg"
            type="button"
            onClick={handleDownload}
          >
            {`엑셀 다운로드 (전체 ${totalRows}행)`}
          </Button>
          <Button
            variant="outline"
            size="lg"
            type="button"
            onClick={() => fileInputRef.current?.click()}
          >
            엑셀 업로드
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            onChange={handleFileChange}
            className="hidden"
            aria-label="모집요강 xlsx 파일 선택"
          />
        </div>
      </div>

      {exportTruncatedCells.length > 0 && (
        <div className="mt-3 rounded-sm border border-amber-400 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">
          <p>
            {exportTruncatedCells.length}개 셀이 문자 수 한도(32,767자)를 넘어
            잘린 채로 다운로드됐습니다. 이 파일을 그대로 재업로드하면 해당
            컬럼은 자동으로 보존됩니다(데이터 손상 아님, 스킵 처리).
          </p>
        </div>
      )}

      {parseErrors.length > 0 && (
        <div className="mt-3 rounded-sm border border-red-300 bg-red-50 px-3 py-2 text-xs font-bold text-red-600">
          {withDedupedKeys(parseErrors).map(({ item: msg, key }) => (
            <p key={key}>{msg}</p>
          ))}
        </div>
      )}

      {parseResult && (
        <div className="mt-3 rounded-sm border border-primary bg-primary/5 p-4 text-xs">
          {/* truncatedCellSkipCount 같은 개별 집계 필드는 여기서 안 쓰고
              warningCounts만 쓴다(team-lead 지시), type별 건수를 lib이
              그대로 주므로 문자열 매칭, 직접 재계산을 안 한다. 경고
              총건수도 warningCounts 값을 그대로 더한 것이다. 엑셀
              포맷에서 html 3종이 빠지면서(26에서 23컬럼) "html 파싱" 개념
              자체가 없어져 그쪽 집계 필드도 lib에서 정리됐다, 애초에
              이 컴포넌트가 그 필드를 쓴 적이 없어 갱신할 코드는 없었다. */}
          <p className="font-semibold text-primary">
            신규 {parseResult.summary.willInsert}건{" \u00B7 "}수정{" "}
            {parseResult.summary.willUpdate}건{" \u00B7 "}거부{" "}
            {parseResult.summary.willSkip}건{" \u00B7 "}경고{" "}
            {Object.values(parseResult.summary.warningCounts || {}).reduce(
              (sum, n) => sum + n,
              0,
            )}
            건
          </p>

          {parseResult.summary.newYears.length > 0 && (
            <p className="mt-2 rounded-sm border border-blue-300 bg-blue-50 px-2 py-1.5 font-bold text-blue-700">
              신규 연도: {parseResult.summary.newYears.join(", ")}학년도
              {" \u2014 "}이 파일에 새 연도 데이터가 포함돼 있습니다.
            </p>
          )}

          {parseResult.errors.length > 0 && (
            <div className="mt-3 rounded-sm border border-red-300 bg-red-50 p-2">
              <p className="font-semibold text-red-600">
                거부된 행 {parseResult.errors.length}건(적용 대상에서 완전히
                제외됩니다)
              </p>
              <ul className="mt-1 space-y-1">
                {withDedupedKeys(
                  parseResult.errors,
                  (err) => `${err.row}-${err.universityKey}-${err.reason}`,
                ).map(({ item: err, key }) => (
                  <li key={key} className="text-red-700">
                    행 {err.row + 1}
                    {" \u00B7 "}
                    {String(err.admissionYear ?? "-")}학년도{" \u00B7 "}
                    {String(err.universityKey || "(키 없음)")}
                    {" \u2014 "}
                    {err.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {BULK_XLSX_WARNING_GROUPS.map((group) => {
            // 건수는 lib이 준 warningCounts에서 합산한다(직접 세지 말라는
            // team-lead 지시), 상세 목록은 어차피 개별 항목이 필요해
            // warnings 배열을 그대로 필터링한다(같은 type 기준이라 두
            // 값은 항상 같다).
            const groupCount = group.types.reduce(
              (sum, t) => sum + (parseResult.summary.warningCounts?.[t] || 0),
              0,
            );
            if (groupCount === 0) return null;
            const items = parseResult.warnings.filter((w) =>
              group.types.includes(w.type),
            );
            const isOpen = Boolean(expandedGroups[group.key]);
            return (
              <div
                key={group.key}
                className={`mt-3 rounded-sm border p-2 ${BULK_XLSX_TONE_CLASS[group.tone]}`}
              >
                <button
                  type="button"
                  onClick={() => toggleGroup(group.key)}
                  className="flex w-full items-center justify-between text-left font-semibold"
                >
                  <span>
                    {group.label}
                    {" \u2014 "}
                    {groupCount}건
                  </span>
                  <span>{isOpen ? "접기" : "자세히 보기"}</span>
                </button>
                {isOpen && (
                  <ul className="mt-2 space-y-1 font-normal">
                    {withDedupedKeys(
                      items,
                      (w) =>
                        `${w.row}-${w.universityKey}-${w.column}-${w.reason}`,
                    ).map(({ item: w, key }) => (
                      <li key={key}>
                        행 {w.row + 1}
                        {" \u00B7 "}
                        {String(w.admissionYear ?? "-")}학년도{" \u00B7 "}
                        {String(w.universityKey || "(키 없음)")}
                        {w.column ? ` \u00B7 ${w.column}` : ""}
                        {" \u2014 "}
                        {w.reason}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}

          <p className="mt-3 rounded-sm border border-red-300 bg-red-50 px-2 py-1.5 font-bold text-red-600">
            되돌릴 수 없는 작업입니다{" \u2014 "}최대 {affectedCount}행이 일괄
            반영됩니다.
          </p>

          <label className="mt-2 flex items-center gap-2 font-bold">
            <input
              type="checkbox"
              className="accent-primary"
              checked={confirmChecked}
              onChange={(e) => setConfirmChecked(e.target.checked)}
            />
            영향받는 {affectedCount}행을 확인했습니다
          </label>

          <div className="mt-2 flex items-center gap-2">
            <Button
              size="lg"
              type="button"
              onClick={handleApply}
              disabled={!confirmChecked || applying}
            >
              {applying ? "적용 중…" : "적용"}
            </Button>
            <Button
              variant="outline"
              size="lg"
              type="button"
              onClick={cancelPreview}
              disabled={applying}
            >
              취소
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// admissionResults.ListSummary의 진입점. AdmissionListSummary(모집요강)를
// 재사용하지 않는다, 그쪽은 AdmissionActiveYearSummary(공개 연도 지정)를
// 함께 쌓는데, 입결은 공개 연도 개념이 없다(연도 자체가 result_year 행
// 값이고 그 축이 이미 데이터로 존재한다). 두 도메인을 한 컴포넌트에
// 억지로 묶으면 나중에 한쪽만 바뀌어도 다른 쪽 회귀를 걱정해야 한다.
export function AdmissionResultsListSummary({ onReload }) {
  return <AdmissionResultsBulkXlsxPanel onReload={onReload} />;
}

// 입결정보(admission_results) 43,170행 전체를 29컬럼 xlsx
// (src/lib/admissionResultsBulkXlsx.js)로 일괄 왕복한다. UX 흐름은
// AdmissionBulkXlsxPanel(모집요강)과 동일하게 맞췄다, 다운로드 다음
// 업로드 다음 미리보기(신규/수정/거부/경고 건수 + 거부 행 목록 + 경고
// 그룹 접기/펼치기) 다음 확인 체크박스로 게이트된 적용 다음 재조회.
//
// 모집요강 패널과 다른 점은 전부 43,170행 규모 + coalesce() 표현식
// 유일성 인덱스에서 온다(design brief (A)(B)):
//   (A) props로 rows를 받지 않는다, AdminTable이 config.serverPaginate
//       탓에 현재 페이지 PAGE_SIZE행만 들고 있어(Admin.jsx:6305 부근),
//       그걸 그대로 내보내면 10행짜리 파일이 나온다. 다운로드, 업로드
//       (existingIdSet 준비) 둘 다 이 컴포넌트가 자체적으로 PostgREST
//       기본 상한(1,000행)에 맞춰 .range()로 청크 반복해 전량을 읽는다.
//   (B) onConflict 기반 upsert를 쓰지 않는다, sql/53의 유일성 인덱스가
//       coalesce() 표현식이라 PostgREST onConflict가 컬럼 목록으로 못
//       받는다. 대신 admissionResultsBulkXlsx.js가 이미 행마다 id 유무로
//       insert/update를 갈라 payload를 만들어 주므로(id 없으면 insert,
//       있으면 update, 있는데 DB에 없으면 파싱 단계에서 거부), 이
//       컴포넌트는 그 분류를 그대로 받아 insert 배치는 .insert()로,
//       update 배치는 .upsert(chunk, { onConflict: 'id' })로 나눠 보낸다.
//       id는 이 테이블의 실제 기본키(평범한 컬럼 유일성)라 onConflict:'id'
//       자체는 admission_university_resources 때와 달리 문제가 없다,
//       여기서 피한 건 "자연키 축(연도, 대학, 모집단위…)으로 onConflict를
//       거는 것"이지 id 자체가 아니다.
const RESULTS_TABLE = "admission_results";
// PostgREST 기본 응답 상한과 맞춘 읽기 청크, 다운로드(전체 조회)와
// existingIdSet 준비(id만 조회) 둘 다 이 크기로 .range() 반복한다.
const RESULTS_READ_CHUNK = 1000;
// insert/upsert 배치 크기. 43k행 전량이 한 번에 바뀌는 시나리오(연도
// 전체 재적재 등)에서도 요청 하나가 과도하게 커지지 않게 나눈다.
const RESULTS_APPLY_CHUNK = 500;

const RESULTS_WARNING_GROUPS = [
  {
    key: "allGradesEmpty",
    label: "등급 9종이 전부 비어 있음",
    tone: "neutral",
    types: ["allGradesEmpty"],
  },
  {
    key: "competitionRateZero",
    label: "경쟁률 0 \u2014 §Q2 정책상 미공개는 빈 값이어야 함",
    tone: "warning",
    types: ["competitionRateZero"],
  },
  {
    key: "gradeCutInversion",
    label: "50%컷 > 70%컷 역전(원문 확인 필요)",
    tone: "warning",
    types: ["gradeCutInversion"],
  },
];

// count는 head:true로 행 본문 없이 받는다, 다운로드 버튼 라벨, 진행률
// 분모로만 쓰이므로 매번 새로 물어 최신 값을 반영한다(캐시하면 다른
// 화면에서 추가/삭제된 행수가 안 맞을 수 있다).
async function fetchResultsCount() {
  const { count, error } = await supabase
    .from(RESULTS_TABLE)
    .select("id", { count: "exact", head: true });
  if (error) throw new Error(error.message);
  return count ?? 0;
}

// 29컬럼 전량을 id 오름차순으로 청크 반복해 읽는다. order 없이 .range()만
// 반복하면 PostgREST가 매 요청마다 정렬을 보장하지 않아(암묵적 순서)
// 페이지 경계에서 행이 중복, 누락될 수 있다, id는 위닝 identity라 항상
// 유일하고 단조증가라 경계 문제가 없다.
async function fetchAllResultRows(onProgress) {
  const total = await fetchResultsCount();
  const all: Record<string, unknown>[] = [];
  for (let from = 0; from < total; from += RESULTS_READ_CHUNK) {
    const { data, error } = await supabase
      .from(RESULTS_TABLE)
      .select(ADMISSION_RESULTS_BULK_XLSX_COLUMNS.join(", "))
      .order("id", { ascending: true })
      .range(from, from + RESULTS_READ_CHUNK - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    // .select(동적 join 문자열)이라 supabase-js가 컬럼을 정적으로 못 읽어 data를
    // GenericStringError[]로 잡는다(런타임 값은 평범한 행 객체 배열), 캐스팅으로 우회한다.
    all.push(...(data as unknown as Record<string, unknown>[]));
    onProgress?.({ done: all.length, total });
  }
  return all;
}

// id 컬럼만 전량 읽어 Set으로 돌려준다, parseAdmissionResultRowsFromXlsx의
// existingIdSet 계약(파일의 id가 실제로 DB에 있는지 판정)에 쓴다. 29컬럼을
// 전부 읽는 fetchAllResultRows보다 훨씬 가볍다(업로드 시 매번 새로 조회해도
// 부담이 적다, 그 사이 다른 관리자가 지운 id를 놓치지 않기 위해 캐시하지
// 않는다).
async function fetchAllResultIds(onProgress) {
  const total = await fetchResultsCount();
  const idSet = new Set<number>();
  for (let from = 0; from < total; from += RESULTS_READ_CHUNK) {
    const { data, error } = await supabase
      .from(RESULTS_TABLE)
      .select("id")
      .order("id", { ascending: true })
      .range(from, from + RESULTS_READ_CHUNK - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    data.forEach((r) => {
      idSet.add(r.id);
    });
    onProgress?.({ done: idSet.size, total });
  }
  return idSet;
}

function AdmissionResultsBulkXlsxPanel({ onReload }) {
  const [totalRowCount, setTotalRowCount] = useState<number | null>(null);
  const [fetchProgress, setFetchProgress] = useState<{
    done: number;
    total: number;
  } | null>(null); // 다운로드 전량 읽기 진행률
  const [idSetProgress, setIdSetProgress] = useState<{
    done: number;
    total: number;
  } | null>(null); // 업로드 검증용 id 전량 읽기 진행률
  const [applyProgress, setApplyProgress] = useState<{
    done: number;
    total: number;
  } | null>(null); // 적용(insert/update) 진행률
  const [exportTruncatedCells, setExportTruncatedCells] = useState<
    ReturnType<typeof exportAdmissionResultRowsToXlsx>["truncatedCells"]
  >([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [parseResult, setParseResult] = useState<ReturnType<
    typeof parseAdmissionResultRowsFromXlsx
  > | null>(null); // { rows, errors, warnings, summary }
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [applying, setApplying] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(
    {},
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetchResultsCount()
      .then((count) => {
        if (!cancelled) setTotalRowCount(count);
      })
      .catch(() => {
        // 버튼 라벨용 참고 수치일 뿐이라 실패해도 화면을 막지 않는다,
        // 라벨은 그냥 "전체 -행"으로 남는다.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const busy = Boolean(fetchProgress || idSetProgress || applying);

  async function handleDownload() {
    if (busy) return;
    try {
      setFetchProgress({ done: 0, total: totalRowCount ?? 0 });
      const allRows = await fetchAllResultRows((p) => setFetchProgress(p));
      const { workbook, truncatedCells } =
        exportAdmissionResultRowsToXlsx(allRows);
      setExportTruncatedCells(truncatedCells);
      const today = new Date();
      const fileName = `입결정보_전체_${today.getFullYear()}${pad2(today.getMonth() + 1)}${pad2(today.getDate())}.xlsx`;
      if (typeof document !== "undefined") {
        triggerXlsxDownload(workbook, fileName);
      }
    } catch (err) {
      reportAdminError("엑셀 다운로드 실패", err);
    } finally {
      setFetchProgress(null);
    }
  }

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    event.target.value = ""; // 같은 파일을 다시 선택해도 change가 발생하게 리셋
    if (!file) return;

    setParseErrors([]);
    setParseResult(null);
    setConfirmChecked(false);
    setExpandedGroups({});

    try {
      const buffer = await file.arrayBuffer();
      setIdSetProgress({ done: 0, total: totalRowCount ?? 0 });
      const existingIdSet = await fetchAllResultIds((p) => setIdSetProgress(p));
      setIdSetProgress(null);

      const workbook = XLSX.read(buffer, { type: "array" });
      const result = parseAdmissionResultRowsFromXlsx(workbook, existingIdSet);
      setParseResult(result);
    } catch (err) {
      setIdSetProgress(null);
      setParseErrors([
        `파일을 읽는 중 오류가 발생했습니다: ${err?.message || err}`,
      ]);
    }
  }

  function toggleGroup(key) {
    setExpandedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function cancelPreview() {
    setParseResult(null);
    setConfirmChecked(false);
    setExpandedGroups({});
  }

  async function handleApply() {
    if (!parseResult || !confirmChecked || applying) return;
    setApplying(true);

    // id 유무로 이미 갈라진 payload를 그대로 배치에 나눠 보낸다, insert
    // 배치는 .insert()(id 없음, identity 자동 채번), update 배치는
    // .upsert(chunk, { onConflict: 'id' })(실제 기본키라 안전, 설계 브리핑
    // (B) 참고). 두 배치는 컬럼 구성이 달라(update만 id를 가짐) 같은
    // 요청에 섞지 않는다, PostgREST가 배열 안 각 객체의 키 집합이
    // 다르면 누락된 키를 일괄 default/null로 해석해 의도와 다르게 동작할
    // 수 있다.
    const insertRows = parseResult.rows.filter((row) => !("id" in row));
    const updateRows = parseResult.rows.filter((row) => "id" in row);
    const total = insertRows.length + updateRows.length;
    let done = 0;
    setApplyProgress({ done, total });

    try {
      for (let i = 0; i < insertRows.length; i += RESULTS_APPLY_CHUNK) {
        const chunk = insertRows.slice(i, i + RESULTS_APPLY_CHUNK);
        const { error } = await supabase.from(RESULTS_TABLE).insert(chunk);
        if (error) {
          throw new AdminChunkError(
            "신규 등록 실패",
            `${i + 1}~${i + chunk.length}`,
            error,
          );
        }
        done += chunk.length;
        setApplyProgress({ done, total });
      }
      for (let i = 0; i < updateRows.length; i += RESULTS_APPLY_CHUNK) {
        const chunk = updateRows.slice(i, i + RESULTS_APPLY_CHUNK);
        const { error } = await supabase
          .from(RESULTS_TABLE)
          .upsert(chunk, { onConflict: "id" });
        if (error) {
          throw new AdminChunkError(
            "수정 실패",
            `${i + 1}~${i + chunk.length}`,
            error,
          );
        }
        done += chunk.length;
        setApplyProgress({ done, total });
      }
    } catch (err) {
      setApplying(false);
      setApplyProgress(null);
      reportAdminError(
        `${withChunkRows("엑셀 적용 실패", err)}. 이미 반영된 청크는 되돌려지지 않습니다`,
        err,
      );
      onReload?.();
      return;
    }

    const { summary } = parseResult;
    setApplying(false);
    setApplyProgress(null);
    setParseResult(null);
    setConfirmChecked(false);
    setExpandedGroups({});
    fetchResultsCount()
      .then((count) => setTotalRowCount(count))
      .catch(() => {});
    onReload?.();
    toastSuccess(
      "엑셀 적용 완료",
      `신규 ${summary.willInsert}건, 수정 ${summary.willUpdate}건, 거부 ${summary.willSkip}건.`,
    );
  }

  const affectedCount = parseResult
    ? parseResult.summary.willInsert + parseResult.summary.willUpdate
    : 0;

  return (
    <div className="mb-6 bg-white p-4 text-sm shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="font-semibold">엑셀 일괄 관리</div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="lg"
            type="button"
            onClick={handleDownload}
            disabled={busy}
          >
            {fetchProgress
              ? `읽는 중… ${fetchProgress.done.toLocaleString()} / ${fetchProgress.total.toLocaleString()}행`
              : `엑셀 다운로드 (전체 ${totalRowCount === null ? "-" : totalRowCount.toLocaleString()}행)`}
          </Button>
          <Button
            variant="outline"
            size="lg"
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
          >
            {idSetProgress
              ? `업로드 검증 준비 중… ${idSetProgress.done.toLocaleString()} / ${idSetProgress.total.toLocaleString()}행`
              : "엑셀 업로드"}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            onChange={handleFileChange}
            className="hidden"
            aria-label="입결정보 xlsx 파일 선택"
          />
        </div>
      </div>

      {exportTruncatedCells.length > 0 && (
        <div className="mt-3 rounded-sm border border-amber-400 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">
          <p>
            {exportTruncatedCells.length}개 셀이 문자 수 한도(32,767자)를 넘어
            잘린 채로 다운로드됐습니다. 이 파일을 그대로 재업로드하면 해당 행은
            자동으로 거부됩니다(데이터 손상 아님).
          </p>
        </div>
      )}

      {parseErrors.length > 0 && (
        <div className="mt-3 rounded-sm border border-red-300 bg-red-50 px-3 py-2 text-xs font-bold text-red-600">
          {withDedupedKeys(parseErrors).map(({ item: msg, key }) => (
            <p key={key}>{msg}</p>
          ))}
        </div>
      )}

      {parseResult && (
        <div className="mt-3 rounded-sm border border-primary bg-primary/5 p-4 text-xs">
          <p className="font-semibold text-primary">
            신규 {parseResult.summary.willInsert}건{" \u00B7 "}수정{" "}
            {parseResult.summary.willUpdate}건{" \u00B7 "}거부{" "}
            {parseResult.summary.willSkip}건{" \u00B7 "}경고{" "}
            {Object.values(parseResult.summary.warningCounts || {}).reduce(
              (sum, n) => sum + n,
              0,
            )}
            건
          </p>

          {parseResult.errors.length > 0 && (
            <div className="mt-3 rounded-sm border border-red-300 bg-red-50 p-2">
              <p className="font-semibold text-red-600">
                거부된 행 {parseResult.errors.length}건(적용 대상에서 완전히
                제외됩니다)
              </p>
              <ul className="mt-1 space-y-1">
                {withDedupedKeys(
                  parseResult.errors,
                  (err) =>
                    `${err.row}-${err.universityKey}-${err.departmentKey}-${err.admissionTrack}-${err.reason}`,
                ).map(({ item: err, key }) => (
                  <li key={key} className="text-red-700">
                    행 {err.row + 1}
                    {" \u00B7 "}
                    {String(err.resultYear ?? "-")}학년도{" \u00B7"}{" "}
                    {String(err.universityKey || "(대학 키 없음)")}/
                    {String(err.departmentKey || "(모집단위 키 없음)")}
                    {" \u00B7"} {String(err.admissionTrack || "(전형명 없음)")}
                    {" \u2014"} {err.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {RESULTS_WARNING_GROUPS.map((group) => {
            const groupCount = group.types.reduce(
              (sum, t) => sum + (parseResult.summary.warningCounts?.[t] || 0),
              0,
            );
            if (groupCount === 0) return null;
            const items = parseResult.warnings.filter((w) =>
              group.types.includes(w.type),
            );
            const isOpen = Boolean(expandedGroups[group.key]);
            return (
              <div
                key={group.key}
                className={`mt-3 rounded-sm border p-2 ${BULK_XLSX_TONE_CLASS[group.tone]}`}
              >
                <button
                  type="button"
                  onClick={() => toggleGroup(group.key)}
                  className="flex w-full items-center justify-between text-left font-semibold"
                >
                  <span>
                    {group.label}
                    {" \u2014 "}
                    {groupCount}건
                  </span>
                  <span>{isOpen ? "접기" : "자세히 보기"}</span>
                </button>
                {isOpen && (
                  <ul className="mt-2 space-y-1 font-normal">
                    {withDedupedKeys(
                      items,
                      (w) =>
                        `${w.row}-${w.universityKey}-${w.departmentKey}-${w.admissionTrack}-${w.reason}`,
                    ).map(({ item: w, key }) => (
                      <li key={key}>
                        행 {w.row + 1}
                        {" \u00B7 "}
                        {String(w.resultYear ?? "-")}학년도{" \u00B7"}{" "}
                        {String(w.universityKey || "(대학 키 없음)")}/
                        {String(w.departmentKey || "(모집단위 키 없음)")}
                        {" \u00B7"}{" "}
                        {String(w.admissionTrack || "(전형명 없음)")}
                        {" \u2014"} {w.reason}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}

          <p className="mt-3 rounded-sm border border-red-300 bg-red-50 px-2 py-1.5 font-bold text-red-600">
            되돌릴 수 없는 작업입니다{" \u2014 "}최대{" "}
            {affectedCount.toLocaleString()}
            행이 일괄 반영됩니다.
          </p>

          <label className="mt-2 flex items-center gap-2 font-bold">
            <input
              type="checkbox"
              className="accent-primary"
              checked={confirmChecked}
              onChange={(e) => setConfirmChecked(e.target.checked)}
            />
            영향받는 {affectedCount.toLocaleString()}행을 확인했습니다
          </label>

          <div className="mt-2 flex items-center gap-2">
            <Button
              size="lg"
              type="button"
              onClick={handleApply}
              disabled={!confirmChecked || applying}
            >
              {(() => {
                if (!applying) return "적용";
                if (applyProgress)
                  return `적용 중… ${applyProgress.done.toLocaleString()} / ${applyProgress.total.toLocaleString()}행`;
                return "적용 중…";
              })()}
            </Button>
            <Button
              variant="outline"
              size="lg"
              type="button"
              onClick={cancelPreview}
              disabled={applying}
            >
              취소
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
