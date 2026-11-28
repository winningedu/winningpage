import { useMutation, useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  GOAL_BACKFILL_YEAR_MODES,
  type GoalBackfillYearMode,
} from "@/lib/goal/goalCutBackfill";
import { ApiError } from "@/lib/http/client";
import { withDedupedKeys } from "@/lib/reactKeys";
import { AdminTableFrame } from "@/pages/admin/shared/AdminTableFrame";
import {
  AdminChunkError,
  reportAdminError,
  withChunkRows,
} from "@/pages/admin/shared/adminErrors";
import { toastSuccess, toastWarning } from "@/pages/admin/shared/adminToast";
import { useCanEditSection } from "@/pages/admin/shared/sectionEditAccess";
import { AdminLineSkeleton } from "@/pages/admin/shared/skeletons/AdminLineSkeleton";
import { pad2, triggerXlsxDownload } from "@/pages/admin/shared/xlsxDownload";
import {
  applyBackfill,
  type BackfillPreview,
  type BulkRow,
  type CutsSummary,
  cutsKeys,
  fetchAllCutRows,
  fetchBackfillPreview,
  fetchCutsSummary,
  fetchJungsiMissing,
  type OrphanMode,
  type PreserveMode,
  postBulkRows,
} from "./cutsApi";
import {
  exportGoalUniversityCutRowsToXlsx,
  parseGoalUniversityCutRowsFromXlsx,
} from "./cutsBulkXlsx";

// =====================================================================
// 목표관리 대학 컷(goal_university_cuts), CONFIGS.goalUniversityCuts 의
// ListSummary 진입점과 그 3블록.
//
//   H-1 현황 요약        GoalCutsOverviewBlock
//   H-2 입결 유도 백필    GoalCutsBackfillPanel
//   H-3 엑셀 일괄 왕복    GoalCutsBulkXlsxPanel
//
// serverPaginate 탭이므로 세 블록 모두 props 의 rows 를 쓰지 않는다,
// AdminTable 이 들고 있는 건 현재 페이지 10행뿐이라 그걸로 집계하면
// 전부 틀린 수치가 나온다(AdmissionResultsBulkXlsxPanel 과 같은 이유).
// 필요한 데이터는 서버 API(goal/admin/cuts/...)에서 받는다. 요약 수치와
// 백필 계산은 서버가 하고, 엑셀 패널만 전량 행을 청크로 이어 받는다.
// =====================================================================

// 한 번에 서버로 보내는 최대 행 수. 서버 bulk 라우트의 상한(500)과 같다.
const GOAL_CUTS_APPLY_CHUNK = 500;

const GOAL_CUTS_WARNING_GROUPS = [
  {
    key: "jungsiLooksLikeGrade",
    label: "🔴 정시 컷에 9 이하 값 \u2014 내신 등급 혼입 의심",
    tone: "danger",
    types: ["jungsiLooksLikeGrade"],
  },
  {
    key: "naesinCutTooHigh",
    label: "수시 컷이 8등급 이상",
    tone: "warning",
    types: ["naesinCutTooHigh"],
  },
  {
    key: "cutMissing",
    label: "컷 값이 비어 있음(온보딩 422)",
    tone: "warning",
    types: ["cutMissing"],
  },
  {
    key: "unknownSource",
    label:
      "출처를 알 수 없어 '수기 입력'으로 강등 \u2014 이후 백필에서 갱신 안 됨",
    tone: "warning",
    types: ["unknownSource"],
  },
  {
    key: "inactiveRow",
    label: "노출 꺼짐(온보딩 목록에서 사라짐)",
    tone: "neutral",
    types: ["inactiveRow"],
  },
];

const GOAL_CUTS_TONE_CLASS = {
  danger: "border-red-300 bg-red-50 text-red-700",
  warning: "border-amber-400 bg-amber-50 text-amber-700",
  neutral: "border-gray-300 bg-gray-50 text-gray-600",
};

// ---------------------------------------------------------------------
// H-1 현황 요약
// ---------------------------------------------------------------------

function GoalCutsOverviewBlock({
  summary,
  isPending,
}: {
  summary: CutsSummary | undefined;
  isPending: boolean;
}) {
  // 실패해도 화면을 막지 않는다, 참고 지표일 뿐이다.
  if (isPending && !summary) {
    return (
      <div className="bg-white p-4 text-sm shadow-sm">
        <div className="font-semibold">현황 요약</div>
        <AdminLineSkeleton
          className="mt-2 h-4 w-80"
          label="현황 요약을 불러오는 중"
        />
      </div>
    );
  }
  if (!summary) {
    return (
      <div className="bg-white p-4 text-sm shadow-sm">
        <div className="font-semibold">현황 요약</div>
        <p className="mt-2 text-xs text-gray-500">
          현황을 불러오지 못했습니다(목록 사용에는 영향 없습니다).
        </p>
      </div>
    );
  }

  const n = (v: number) => v.toLocaleString();
  return (
    <div className="bg-white p-4 text-sm shadow-sm">
      <div className="font-semibold">현황 요약</div>
      <p className="mt-2 text-xs font-bold text-gray-700">
        전체 {n(summary.total)}건{" \u00B7 "}노출 {n(summary.active)}건
        {" \u00B7 "}수시 일반 {n(summary.normal)}건{" \u00B7 "}수시 특목{" "}
        {n(summary.special)}건{" \u00B7 "}정시 {n(summary.jungsi)}건{" \u00B7 "}
        컷 미확보 {n(summary.missing)}건
      </p>
      {/* 🟠(품질 지표)이지 🔴(블로커)가 아니다, 정시 컷이 없어도 그 조합은
          온보딩 목록에 뜨고 학생은 고를 수 있다. 다만 그 학생의 정시 확률
          2종이 계속 미산출로 남고, 나중에 컷을 채워도 재계산되지 않는다
          (base_* 는 온보딩 이후 불변). */}
      <p className="mt-2 rounded-sm border border-amber-400 bg-amber-50 px-2 py-1.5 text-xs font-bold text-amber-700">
        🟠 정시 컷 없는 (대학, 학과) 조합: {n(summary.comboNoJungsi)}건 / 전체{" "}
        {n(summary.comboTotal)}조합{" \u2014 "}이 조합을 고른 학생은 정시 확률
        2종이 계속 미산출입니다.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------
// H-2 입결 유도 백필
// ---------------------------------------------------------------------

// 서버가 청크 중간에 실패하면 problem 확장 멤버 range 로 실패 행 범위를 준다.
function chunkRangeOf(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null;
  const range = error.problem?.range;
  return typeof range === "string" ? range : null;
}

// 서버 쓰기가 중간까지 갔을 수 있는 실패(5xx, 응답 없음)인지.
// 청크 실패(range 가 있는 응답)는 상태와 무관하게 앞 청크가 이미 쓰였으므로 호출부가 따로 본다.
function mayHavePartialWrite(error: unknown): boolean {
  return (
    !(error instanceof ApiError) || error.status === null || error.status >= 500
  );
}

function GoalCutsBackfillPanel({ onReload }) {
  const [yearMode, setYearMode] = useState<GoalBackfillYearMode>("prefer2026");
  const [preserveMode, setPreserveMode] = useState<PreserveMode>("preserve");
  const [orphanMode, setOrphanMode] = useState<OrphanMode>("keep");
  const [preview, setPreview] = useState<BackfillPreview | null>(null);
  const [confirmChecked, setConfirmChecked] = useState(false);

  const compute = useMutation({
    mutationFn: fetchBackfillPreview,
    onSuccess: setPreview,
    onError: (err) => {
      setPreview(null);
      reportAdminError("미리보기 계산 실패", err);
    },
  });
  const apply = useMutation({ mutationFn: applyBackfill });
  const computing = compute.isPending;
  const applying = apply.isPending;
  const busy = computing || applying;

  // 옵션이 바뀌면 미리보기를 버린다, 산출값(N)이 확인 게이트 문구와
  // 적용 대상 양쪽의 근거라, 옵션과 어긋난 미리보기를 남겨 두면
  // "확인한 N행"과 "실제 반영되는 N행"이 달라진다.
  function resetPreview() {
    setPreview(null);
    setConfirmChecked(false);
  }

  function handleCompute() {
    if (busy) return;
    setPreview(null);
    setConfirmChecked(false);
    compute.mutate({ yearMode, preserveMode });
  }

  function handleApply() {
    if (!preview || !confirmChecked || applying) return;
    const orphanCount = orphanMode === "deactivate" ? preview.orphanCount : 0;
    if (preview.applyCount + orphanCount === 0) {
      toastWarning("반영할 행이 없습니다.");
      return;
    }
    // 서버가 반영 직전에 다시 계산해 이 건수와 다르면 쓰지 않고 409 로 돌려보낸다.
    apply.mutate(
      {
        yearMode,
        preserveMode,
        orphanMode,
        expectedApplyCount: preview.applyCount,
        expectedOrphanCount: preview.orphanCount,
      },
      {
        onSuccess: (result) => {
          setPreview(null);
          setConfirmChecked(false);
          onReload?.();
          toastSuccess(
            `입결 유도 컷 ${result.applied.toLocaleString()}행을 반영했습니다.`,
            result.deactivated
              ? `고아 유도 행 ${result.deactivated.toLocaleString()}건의 노출을 껐습니다.`
              : undefined,
          );
        },
        onError: (err) => {
          const range = chunkRangeOf(err);
          const title = range
            ? withChunkRows(
                "백필 적용 실패",
                new AdminChunkError("백필 적용 실패", range, err),
              )
            : "백필 적용 실패";
          reportAdminError(
            range !== null || mayHavePartialWrite(err)
              ? `${title}. 이미 반영된 청크는 되돌려지지 않습니다`
              : title,
            err,
          );
          // 미리보기 이후 데이터가 바뀌었으면 그 미리보기는 더 믿을 수 없다. 다시 계산하게 닫는다.
          if (
            err instanceof ApiError &&
            err.code === "BACKFILL_PREVIEW_STALE"
          ) {
            resetPreview();
          }
          onReload?.();
        },
      },
    );
  }

  const affectedCount =
    (preview?.applyCount ?? 0) +
    (orphanMode === "deactivate" ? (preview?.orphanCount ?? 0) : 0);

  return (
    <div className="bg-white p-4 text-sm shadow-sm">
      <div className="font-semibold">입결정보에서 수시 컷 일괄 생성</div>
      <p className="mt-2 text-xs leading-5 text-gray-600">
        입결정보(admission_results)의 70% 컷 등급에서 수시 컷을 유도해 이 표에
        채웁니다. 정시 컷은 원본 데이터가 없어 생성되지 않습니다{" \u2014 "}수기
        또는 엑셀로 입력해 주세요.
      </p>

      <div className="mt-3 space-y-2 rounded-sm border border-gray-200 bg-muted p-3 text-xs">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="w-32 shrink-0 font-semibold">기준 연도</span>
          {GOAL_BACKFILL_YEAR_MODES.map((mode) => (
            <label
              key={mode.value}
              className="flex items-center gap-1 font-bold"
            >
              <input
                type="radio"
                className="accent-primary"
                name="goalCutsBackfillYear"
                checked={yearMode === mode.value}
                disabled={busy}
                onChange={() => {
                  setYearMode(mode.value);
                  resetPreview();
                }}
              />
              {mode.label}
            </label>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="w-32 shrink-0 font-semibold">기존 행 처리</span>
          {[
            { value: "preserve", label: "관리자가 손댄 행은 보존" },
            { value: "overwrite", label: "전부 덮어쓰기" },
          ].map((mode) => (
            <label
              key={mode.value}
              className="flex items-center gap-1 font-bold"
            >
              <input
                type="radio"
                className="accent-primary"
                name="goalCutsBackfillPreserve"
                checked={preserveMode === mode.value}
                disabled={busy}
                onChange={() => {
                  setPreserveMode(mode.value as PreserveMode);
                  resetPreview();
                }}
              />
              {mode.label}
            </label>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="w-32 shrink-0 font-semibold">
            이번 산출에 없는 기존 유도 행
          </span>
          {[
            { value: "keep", label: "그대로 둔다" },
            { value: "deactivate", label: "노출을 끈다(is_active=false)" },
          ].map((mode) => (
            <label
              key={mode.value}
              className="flex items-center gap-1 font-bold"
            >
              <input
                type="radio"
                className="accent-primary"
                name="goalCutsBackfillOrphan"
                checked={orphanMode === mode.value}
                disabled={busy}
                onChange={() => {
                  setOrphanMode(mode.value as OrphanMode);
                  resetPreview();
                }}
              />
              {mode.label}
            </label>
          ))}
        </div>
      </div>

      <div className="mt-3">
        <Button
          variant="outline"
          size="lg"
          type="button"
          onClick={handleCompute}
          disabled={busy}
        >
          {computing ? "계산 중…" : "미리보기 계산"}
        </Button>
      </div>

      {preview &&
        // preview는 위 && 로 non-null 확정이지만 stats/analysis는 preview?.stats
        // 로 뽑아 둔 밖의 alias라 타입이 좁혀지지 않는다, 이 서브트리 안에서만
        // 좁혀진 지역 변수로 다시 감싼다(로직 변경 없음, 값은 preview.stats/analysis 그대로).
        (() => {
          const stats = preview.stats;
          const analysis = preview.analysis;
          return (
            <div className="mt-3 rounded-sm border border-primary bg-primary/5 p-4 text-xs">
              <p className="font-semibold text-primary">
                생성 대상: 대학 {stats.universityCount.toLocaleString()}개
                {" \u00B7 "}학과 조합 {stats.pairCount.toLocaleString()}개
                {" \u00B7 "}총 {stats.totalRows.toLocaleString()}행 (수시 일반{" "}
                {stats.normalCount.toLocaleString()} / 수시 특목{" "}
                {stats.specialCount.toLocaleString()})
              </p>
              <p className="mt-1 text-gray-700">
                소스 {preview.sourceRowCount.toLocaleString()}행{" \u00B7 "}기준
                연도 내역: 2026 기준 {stats.year2026Pairs.toLocaleString()}조합
                {" \u00B7 "}2025 폴백 {stats.year2025Pairs.toLocaleString()}조합
              </p>
              <p className="mt-1 text-gray-700">
                제외: (*) 접미 {stats.excludedStarPairs.toLocaleString()}조합
                {" \u00B7 "}빈 학과명{" "}
                {stats.excludedEmptyPairs.toLocaleString()}조합{" \u00B7 "}교과
                {"\u00B7"}종합 없음{" "}
                {stats.excludedNoTrackPairs.toLocaleString()}조합 (현재 데이터
                기준 전부 0이 정상입니다)
              </p>
              <p className="mt-1 text-gray-700">
                중복 병합: {stats.mergedCount.toLocaleString()}건
              </p>

              <p className="mt-2 font-bold text-gray-700">
                컷 값 분포{" \u2014 "}min {stats.distribution.min ?? "-"}
                {" \u00B7 "}p25 {stats.distribution.p25 ?? "-"}
                {" \u00B7 "}median {stats.distribution.median ?? "-"}
                {" \u00B7 "}p75 {stats.distribution.p75 ?? "-"}
                {" \u00B7 "}max {stats.distribution.max ?? "-"} (전부 내신 등급
                1~9 스케일이어야 합니다)
              </p>

              <div className="mt-2 rounded-sm border border-gray-300 bg-white p-2">
                <p className="font-semibold">
                  기존 행과 겹침: {analysis.overlapCount.toLocaleString()}행
                </p>
                <ul className="mt-1 space-y-0.5 text-gray-700">
                  <li>
                    ├ 수기 입력(source=manual){" "}
                    {analysis.manualCount.toLocaleString()}행
                  </li>
                  <li>
                    ├ 노출이 꺼져 있음(is_active=false){" "}
                    {analysis.inactiveCount.toLocaleString()}행
                  </li>
                  <li>
                    └ 운영 메모가 있음(note&lt;&gt;&apos;&apos;){" "}
                    {analysis.notedCount.toLocaleString()}행
                  </li>
                </ul>
                <p className="mt-1 text-gray-700">
                  {preserveMode === "preserve"
                    ? `\u2192 보존 대상 ${analysis.preservedCount.toLocaleString()}행을 이번 반영에서 제외합니다.`
                    : "\u2192 전부 덮어쓰기 \u2014 보존 술어를 적용하지 않습니다."}
                </p>
                <p className="mt-1 text-gray-700">
                  이번 산출에 없는 기존 유도 행(source=admission_results):{" "}
                  {preview.orphanCount.toLocaleString()}행
                  {orphanMode === "deactivate"
                    ? " \u2192 노출을 끕니다"
                    : " \u2192 그대로 둡니다"}
                </p>
              </div>

              {analysis.nameAxisCount > 0 && (
                <p className="mt-2 rounded-sm border border-red-300 bg-red-50 px-2 py-1.5 font-bold text-red-600">
                  🔴 {analysis.nameAxisCount.toLocaleString()}행이 기존 활성
                  행과 (컷 종류, 대학명, 학과명)은 같은데 key 컬럼이 달라 유일성
                  인덱스 goal_university_cuts_name_key 와 충돌합니다. 그대로
                  보내면 청크 500행이 통째로 실패하므로 이번 반영에서
                  제외했습니다{" \u2014 "}해당 기존 행을 목록에서 찾아 정리해
                  주세요.
                </p>
              )}

              {preserveMode === "overwrite" && (
                <p className="mt-2 rounded-sm border border-red-300 bg-red-50 px-2 py-1.5 font-bold text-red-600">
                  노출이 꺼진 {analysis.inactiveCount.toLocaleString()}행이 다시
                  켜지지는 않지만, 컷 값{"\u00B7"}출처{"\u00B7"}기준 연도는 전부
                  덮어써집니다.
                </p>
              )}

              {stats.samples.length > 0 && (
                <div className="mt-3">
                  <p className="font-semibold">
                    상위 {stats.samples.length}행 샘플
                  </p>
                  <AdminTableFrame
                    label={`상위 ${stats.samples.length}행 샘플`}
                    className="mt-1 min-w-150"
                  >
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        {["대학", "학과", "종류", "컷", "연도"].map((h) => (
                          <TableHead
                            key={h}
                            scope="col"
                            className="font-semibold whitespace-normal"
                          >
                            {h}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stats.samples.map((s) => (
                        <TableRow
                          key={`${s.cut_type}-${s.university_key}-${s.department_key}`}
                        >
                          <TableCell className="whitespace-normal">
                            {s.university_name}
                          </TableCell>
                          <TableCell className="whitespace-normal">
                            {s.department_name}
                          </TableCell>
                          <TableCell className="whitespace-normal">
                            {s.cut_type === "normal"
                              ? "수시 일반"
                              : "수시 특목"}
                          </TableCell>
                          <TableCell className="whitespace-normal">
                            {s.avg_cut}등급
                          </TableCell>
                          <TableCell className="whitespace-normal">
                            {s.source_year}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </AdminTableFrame>
                </div>
              )}

              <p className="mt-3 rounded-sm border border-red-300 bg-red-50 px-2 py-1.5 font-bold text-red-600">
                ⚠ 되돌릴 수 없는 작업입니다{" \u2014 "}
                {affectedCount.toLocaleString()}행이 생성{"\u00B7"}갱신됩니다.
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
                  {applying ? "적용 중…" : "적용"}
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  type="button"
                  onClick={resetPreview}
                  disabled={applying}
                >
                  취소
                </Button>
              </div>
            </div>
          );
        })()}
    </div>
  );
}

// ---------------------------------------------------------------------
// H-3 엑셀 일괄 왕복
// ---------------------------------------------------------------------

type Progress = { done: number; total: number };

function GoalCutsBulkXlsxPanel({
  onReload,
  totalRowCount,
}: {
  onReload: () => void;
  totalRowCount: number | null;
}) {
  const canEdit = useCanEditSection();
  // 다운로드 버튼은 하나뿐이다(2026-08-07 사용자 지시: "엑셀 다운로드
  // 버튼이 여러 개다, 우리가 개발한 걸로 통일해라"). 범위는 라디오로 고른다.
  const [downloadScope, setDownloadScope] = useState("all"); // all | jungsiTemplate
  const [fetchProgress, setFetchProgress] = useState<Progress | null>(null);
  const [idMapProgress, setIdMapProgress] = useState<Progress | null>(null);
  const [applyProgress, setApplyProgress] = useState<Progress | null>(null);
  const [exportTruncatedCells, setExportTruncatedCells] = useState<
    ReturnType<typeof exportGoalUniversityCutRowsToXlsx>["truncatedCells"]
  >([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [parseResult, setParseResult] = useState<ReturnType<
    typeof parseGoalUniversityCutRowsFromXlsx
  > | null>(null);
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(
    {},
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  const download = useMutation({
    mutationFn: async (scope: string) => {
      setFetchProgress({ done: 0, total: totalRowCount ?? 0 });
      try {
        let rows: Record<string, unknown>[];
        let fileNamePrefix: string;
        if (scope === "jungsiTemplate") {
          // 정시 컷 없는 (대학, 학과)를 id 빈 정시 템플릿 행으로 내려준다.
          // 🔴 대학명, 학과명은 수시 컷 행의 문자열을 **그대로 복사**한다,
          // 관리자가 손으로 타이핑하면 goalRepo.fetchUniversityCut 의 완전일치
          // 조회가 깨져 그 학생의 정시 확률이 영원히 미산출로 남는다.
          const options = await fetchJungsiMissing();
          rows = options.map((o) => ({
            id: "",
            cut_type: "jungsi",
            university_name: o.university_name,
            department_name: o.department_name,
            avg_cut: "",
            source: "manual",
            source_year: "",
            is_active: true,
            note: "",
          }));
          fileNamePrefix = "목표관리_정시컷_템플릿";
        } else {
          rows = await fetchAllCutRows(totalRowCount ?? 0, setFetchProgress);
          fileNamePrefix = "목표관리_대학컷_전체";
        }
        return { ...exportGoalUniversityCutRowsToXlsx(rows), fileNamePrefix };
      } finally {
        setFetchProgress(null);
      }
    },
    onSuccess: ({ workbook, truncatedCells, fileNamePrefix }) => {
      setExportTruncatedCells(truncatedCells);
      const today = new Date();
      const fileName = `${fileNamePrefix}_${today.getFullYear()}${pad2(today.getMonth() + 1)}${pad2(today.getDate())}.xlsx`;
      if (typeof document !== "undefined") {
        triggerXlsxDownload(workbook, fileName);
      }
    },
    onError: (err) => reportAdminError("엑셀 다운로드 실패", err),
  });

  const verify = useMutation({
    mutationFn: async (file: File) => {
      setIdMapProgress({ done: 0, total: totalRowCount ?? 0 });
      try {
        // idNotFound 와 cutTypeChanged 를 같은 조회 결과로 판정한다.
        // 캐시하지 않는다: 그 사이 다른 관리자가 지운 id 를 놓치지 않기 위해서다.
        // 파일 읽기와 전량 조회는 서로 기다릴 필요가 없어 함께 시작한다.
        const [buffer, existing] = await Promise.all([
          file.arrayBuffer(),
          fetchAllCutRows(totalRowCount ?? 0, setIdMapProgress),
        ]);
        const idMap = new Map<number, string>(
          existing.map((r) => [r.id as number, r.cut_type as string]),
        );
        const workbook = XLSX.read(buffer, { type: "array" });
        return parseGoalUniversityCutRowsFromXlsx(workbook, idMap);
      } finally {
        setIdMapProgress(null);
      }
    },
    onSuccess: setParseResult,
    onError: (err) =>
      setParseErrors([
        `파일을 읽는 중 오류가 발생했습니다: ${err?.message || err}`,
      ]),
  });

  // id 유무로 이미 갈라진 payload 를 그대로 배치에 나눠 보낸다. 두 배치는
  // 컬럼 구성이 달라(update 만 id 를 가짐) 같은 요청에 섞지 않는다,
  // 서버는 섞여 와도 나눠 쓰지만 라벨과 실패 행 범위를 지키려고 화면도 따로 보낸다.
  const apply = useMutation({
    mutationFn: async (rows: BulkRow[]) => {
      const insertRows = rows.filter((row) => !("id" in row));
      const updateRows = rows.filter((row) => "id" in row);
      const total = insertRows.length + updateRows.length;
      let done = 0;
      setApplyProgress({ done, total });
      try {
        for (const [label, group] of [
          ["신규 등록 실패", insertRows],
          ["수정 실패", updateRows],
        ] as const) {
          for (let i = 0; i < group.length; i += GOAL_CUTS_APPLY_CHUNK) {
            const chunk = group.slice(i, i + GOAL_CUTS_APPLY_CHUNK);
            try {
              await postBulkRows(chunk);
            } catch (err) {
              throw new AdminChunkError(
                label,
                `${i + 1}~${i + chunk.length}`,
                err as ApiError,
              );
            }
            done += chunk.length;
            setApplyProgress({ done, total });
          }
        }
      } finally {
        setApplyProgress(null);
      }
    },
  });

  const downloading = download.isPending;
  const applying = apply.isPending;
  const busy = downloading || verify.isPending || applying;

  function handleDownload() {
    if (busy) return;
    download.mutate(downloadScope);
  }

  function handleFileChange(event) {
    const file = event.target.files?.[0];
    event.target.value = ""; // 같은 파일을 다시 선택해도 change 가 발생하게 리셋
    if (!file) return;

    setParseErrors([]);
    setParseResult(null);
    setConfirmChecked(false);
    setExpandedGroups({});
    verify.mutate(file);
  }

  function toggleGroup(key) {
    setExpandedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function cancelPreview() {
    setParseResult(null);
    setConfirmChecked(false);
    setExpandedGroups({});
  }

  function handleApply() {
    if (!parseResult || !confirmChecked || applying) return;
    const { summary } = parseResult;
    apply.mutate(parseResult.rows, {
      onSuccess: () => {
        setParseResult(null);
        setConfirmChecked(false);
        setExpandedGroups({});
        onReload?.();
        toastSuccess(
          "엑셀 적용 완료",
          `신규 ${summary.willInsert}건, 수정 ${summary.willUpdate}건, 거부 ${summary.willSkip}건.`,
        );
      },
      onError: (err) => {
        // 청크 실패는 AdminChunkError 로 감싸 왔다. 사용자에게 보일 원인은 서버가 준 ApiError 쪽이다.
        const cause =
          err instanceof AdminChunkError && err.cause instanceof ApiError
            ? err.cause
            : err;
        reportAdminError(
          `${withChunkRows("엑셀 적용 실패", err)}. 이미 반영된 청크는 되돌려지지 않습니다`,
          cause,
        );
        onReload?.();
      },
    });
  }

  const affectedCount = parseResult
    ? parseResult.summary.willInsert + parseResult.summary.willUpdate
    : 0;

  return (
    <div className="bg-white p-4 text-sm shadow-sm">
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
              : downloadScope === "jungsiTemplate"
                ? "엑셀 다운로드 (정시 컷 템플릿)"
                : `엑셀 다운로드 (전체 ${totalRowCount === null ? "-" : totalRowCount.toLocaleString()}행)`}
          </Button>
          {canEdit && (
            <>
              <Button
                variant="outline"
                size="lg"
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={busy}
              >
                {idMapProgress
                  ? `업로드 검증 준비 중… ${idMapProgress.done.toLocaleString()} / ${idMapProgress.total.toLocaleString()}행`
                  : "엑셀 업로드"}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx"
                onChange={handleFileChange}
                className="hidden"
                aria-label="목표관리 대학 컷 xlsx 파일 선택"
              />
            </>
          )}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span className="font-semibold">다운로드 범위</span>
        {[
          { value: "all", label: "전체" },
          { value: "jungsiTemplate", label: "정시 컷 없는 조합(정시 템플릿)" },
        ].map((scope) => (
          <label
            key={scope.value}
            className="flex items-center gap-1 font-bold"
          >
            <input
              type="radio"
              className="accent-primary"
              name="goalCutsDownloadScope"
              checked={downloadScope === scope.value}
              disabled={busy}
              onChange={() => setDownloadScope(scope.value)}
            />
            {scope.label}
          </label>
        ))}
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
          {withDedupedKeys(parseErrors).map(({ item: message, key }) => (
            <p key={key}>{message}</p>
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
                    `${err.row}-${err.universityName}-${err.departmentName}-${err.reason}`,
                ).map(({ item: err, key }) => (
                  <li key={key} className="text-red-700">
                    행 {err.row + 1}
                    {" \u00B7"} {String(err.universityName || "(대학명 없음)")}
                    {" \u00B7"} {String(err.departmentName || "(학과명 없음)")}
                    {" \u2014"} {err.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 건수는 lib 이 준 warningCounts 에서 합산한다, UI 는 reason
              문자열을 파싱하지 않고 type 으로만 분기, 집계한다. */}
          {GOAL_CUTS_WARNING_GROUPS.map((group) => {
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
                className={`mt-3 rounded-sm border p-2 ${GOAL_CUTS_TONE_CLASS[group.tone]}`}
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
                        `${w.row}-${w.universityName}-${w.departmentName}-${w.column}-${w.reason}`,
                    ).map(({ item: w, key }) => (
                      <li key={key}>
                        행 {w.row + 1}
                        {" \u00B7"}{" "}
                        {String(w.universityName || "(대학명 없음)")}
                        {" \u00B7"}{" "}
                        {String(w.departmentName || "(학과명 없음)")}
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

// LIST_SUMMARY_REGISTRY.goalCutsListSummary(config.listSummaryKey="goalCutsListSummary")의
// 진입점. 그 레지스트리가 모듈 초기화 시점에 이 참조를 평가하므로 **반드시
// function 선언문이어야 한다**(const 화살표 함수로 쓰면 TDZ ReferenceError 로
// 어드민 전체가 죽는다).
//
// props 는 { rows, onReload, mutationSeq } 지만 rows 는 쓰지 않는다,
// serverPaginate 탭이라 현재 페이지 10행뿐이다.
export function GoalCutsListSummary({ onReload, mutationSeq }) {
  const canEdit = useCanEditSection();
  // 백필, 엑셀 적용 후 H-1 현황 요약도 같이 갱신되게 하는 토큰.
  const [refreshToken, setRefreshToken] = useState(0);
  function handleReload() {
    setRefreshToken((t) => t + 1);
    onReload?.();
  }
  // 현황 요약과 엑셀 버튼의 전체 건수가 같은 조회를 쓴다. 갱신 신호가 둘이다, 이 컴포넌트 안의
  // 백필, 엑셀 적용(refreshToken)과 목록의 등록, 수정, 삭제(mutationSeq, Admin()이 내려 준다).
  // 둘 중 무엇이 바뀌어도 집계를 다시 읽어야 화면 숫자가 DB와 어긋나지 않는다.
  // 키가 저장마다 새로 생기므로 이전 숫자를 붙들지 않고 스켈레톤 뒤 새 숫자를 보인다.
  const summary = useQuery({
    queryKey: cutsKeys.summary(refreshToken, mutationSeq),
    queryFn: ({ signal }) => fetchCutsSummary(signal),
    refetchOnWindowFocus: false,
  });
  return (
    <div className="mb-6 space-y-4">
      <GoalCutsOverviewBlock
        summary={summary.data}
        isPending={summary.isPending}
      />
      {canEdit && <GoalCutsBackfillPanel onReload={handleReload} />}
      <GoalCutsBulkXlsxPanel
        onReload={handleReload}
        totalRowCount={summary.data?.total ?? null}
      />
    </div>
  );
}
