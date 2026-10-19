import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import SelectField from "@/components/auth/SelectField";
import PerformanceReportSurface from "@/components/performance/report/PerformanceReportSurface";
import ReportModalShell, {
  REPORT_MODAL_FOOTER_BUTTON,
} from "@/components/performance/report/ReportModalShell";
import SectionedReportView, {
  getVisibleSections,
  type ReportSection,
} from "@/components/performance/report/SectionedReportView";
import ArtifactChip from "@/components/performance/reports/ArtifactChip";
import SavedReportCard, {
  formatSavedAt,
} from "@/components/performance/reports/SavedReportCard";
import DesignReportModal from "@/components/performance/step4/DesignReportModal";
import EvaluationReportModal, {
  type EvaluationReport,
} from "@/components/performance/step5/EvaluationReportModal";
import { useSession } from "@/context/SessionContext";
import { useToast } from "@/context/ToastContext";
import { copyTextWithToast, elementPlainText } from "@/lib/clipboard";
import {
  fetchSavedReportDetail,
  fetchSavedReportsList,
} from "@/lib/performance/reports";
import { performanceBootstrapQueryOptions } from "@/lib/queryClient";

// 저장 리포트(P12) 목록/상세 화면 — docs/수행평가-상세-명세.md §5.18(`3754:3121` 목록)/
// §5.19(`3754:3077` 빈 상태)/§10.2 P12/§11.1 Q65(라우트 채택).
//
// ── 인터페이스 (다음 통합 태스크가 App.jsx에서 배선할 때 참고)
//   이 컴포넌트는 **prop을 받지 않는다.** `App.jsx`가 이미 두 라우트를 이 컴포넌트로
//   매핑해 뒀다(`/app/performance/reports` 목록 / `/app/performance/reports/:sessionId` 상세,
//   `PerformancePlaceholder` 자리를 그대로 교체하면 된다) — 컴포넌트가 `useParams().sessionId`
//   유무로 **자체 분기**한다. 부모가 mode prop을 넘길 필요가 없다.
//
// ── 데이터 흐름
//   목록  `GET /api/performance/reports`(커서 페이지네이션, `더 보기` 버튼 — §10.2 P12
//         "더 단순한 쪽" 채택) → 카드 3장 예시가 §5.18 실측이다.
//   상세  카드 제목 클릭 → `/app/performance/reports/:sessionId`로 이동해 그 세션의
//         `GET /api/performance/reports?sessionId=` 1건을 보여준다. 목록에서 칩을 바로
//         클릭하면 **라우트 이동 없이** 그 세션 상세를 즉석 조회해 해당 리포트 모달만 연다
//         (호출부 캐시 `detailCacheRef` — 같은 세션을 두 번 조회하지 않는다).
//
// ── 리포트 뷰어 3종 — 기존 모달 재사용 여부
//   design    → `DesignReportModal`(P10) 그대로 재사용. 서버 상세 응답의 `design` 필드가
//               `design-report` 성공 응답과 같은 봉투 모양이라 그대로 넘어간다.
//   evaluation → `EvaluationReportModal`(P11) 그대로 재사용. 단 그 모달의 primary 푸터
//               버튼 라벨(`다음 단계 선택하기`)은 진행 중 플로우 전제라, 저장 리포트
//               열람 문맥에서는 클릭해도 모달을 닫을 뿐이다(같은 `onClose`) — 라벨은
//               맥락에 맞지 않지만 새 모달을 만들지 말라는 지시에 따라 그대로 둔다.
//   final     → **재사용할 기존 모달이 없다**(`performance_reports.report_type='final_submission'`
//               전용 뷰어가 이 저장소에 아직 없다 — STEP4/5는 설계·평가 2종만 자동으로 열었다).
//               새 모달 *파일*을 만드는 대신, 이 파일 안에서 `ReportModalShell` +
//               `SectionedReportView` + `PerformanceReportSurface`(전부 기존 공유 컴포넌트)를
//               `DesignReportModal`과 같은 얇은 조합으로 엮은 `FinalReportModal`을 로컬로
//               정의한다 — 셋 다 이미 있는 프리미티브를 그대로 쓰므로 "새 모달 설계"가 아니다.
//
// ── 교과군 필터(§10.2 P12 "사이드바 아코디언 폐기, 화면 내부로")
//   서버 확장 없이 **클라이언트 사이드**로 처리한다 — 현재 로드된 페이지 안에서만 걸러진다.
//   옵션은 로드된 항목의 `subjectGroup`에서 유도한다(별도 마스터 목록 API가 없다).

const SUBJECT_GROUP_ALL = "";

/** 목록/상세 조회 응답 1건의 세션 요약 — 서버(`api/performance/reports.js`)가 정규화해
 * 내려준다. 저장소에 별도 공유 타입이 없어 이 화면 안에서만 로컬로 선언한다. */
type SavedReportListItem = {
  sessionId: string;
  topicTitle?: string;
  gradeLabel?: string;
  subjectGroup?: string;
  subject?: string;
  careerGoal?: string;
  updatedAt?: string;
  hasDesign?: boolean;
  hasEvaluation?: boolean;
  hasFinal?: boolean;
  designReportId?: string | null;
  evaluationReportId?: string | null;
  finalReportId?: string | null;
};

/** `design`/`final` 필드 공통 모양 — `SectionedReportView`가 그대로 받는 `sections` 배열에
 * 상세 조회 전용 `reportId`(재조회 없이 뷰어를 열 때 넘기는 식별자)가 곁들여진다. */
type SectionsReport = {
  sections: ReportSection[];
  reportId?: string;
  updatedAt?: string | null;
};

/** 상세 조회의 `evaluation` 필드 — `EvaluationReport`에 같은 `reportId`가 곁들여진다. */
type EvaluationDetailReport = EvaluationReport & { reportId?: string };

type SavedReportDetail = {
  session: SavedReportListItem;
  design?: SectionsReport | null;
  evaluation?: EvaluationDetailReport | null;
  final?: SectionsReport | null;
  submissions?: unknown[];
};

/** `fetchSavedReportsList`/`fetchSavedReportDetail`(`src/lib/performance/reports.js`)는
 * JSDoc `@returns`가 `object` 수준으로만 표기돼 있어(그 파일은 이 배치 밖) 응답을 이
 * 화면의 실제 필드 타입으로 캐스팅해서 쓴다 — 서버 계약은 그대로이고 타입만 좁힌다. */
type SavedReportListResponse = {
  items: SavedReportListItem[];
  nextCursor: string | null;
};

type ArtifactType = "design" | "evaluation" | "final";

/** 리포트 뷰어(모달) 상태 — `report`의 실제 모양은 `type`에 따라 갈리지만(디스크리미네이트
 * 되지 않는 이유는 아래), 조회 시점엔 서버 응답을 그대로 담아 두고 각 모달에 넘길 때
 * `type`으로 분기해 캐스팅한다. */
type ViewerState = {
  type: ArtifactType;
  sessionId: string;
  topicTitle?: string | undefined;
  /** 리포트가 속한 세션의 학년 원본(상세 조회 `session.gradeLabel`). 표지 학년 칸. */
  gradeLabel?: string | null;
  report: SectionsReport | EvaluationReport | null;
  loading: boolean;
  error: string | null;
} | null;

function buildMeta({
  gradeLabel,
  subjectGroup,
  subject,
  careerGoal,
}: Pick<
  SavedReportListItem,
  "gradeLabel" | "subjectGroup" | "subject" | "careerGoal"
>) {
  const subjectLine = [subjectGroup, subject].filter(Boolean).join(" / ");
  return [gradeLabel, subjectLine, careerGoal].filter(Boolean).join(" · ");
}

function toArtifacts(item: SavedReportListItem) {
  return {
    design: {
      available: Boolean(item.hasDesign),
      reportId: item.designReportId ?? null,
    },
    evaluation: {
      available: Boolean(item.hasEvaluation),
      reportId: item.evaluationReportId ?? null,
    },
    final: {
      available: Boolean(item.hasFinal),
      reportId: item.finalReportId ?? null,
    },
  };
}

type FinalReportModalProps = {
  open: boolean;
  /** §5.16/§5.13과 대칭인 최종 제출본 뷰어. 상세 API의 `final` 필드
   * (`{sections, submissionId, ...}`) 그대로다 — 재사용 판단은 파일 상단 주석 참고. */
  report?: SectionsReport | null;
  topicTitle?: string | undefined;
  studentName?: string | null;
  /** 리포트가 속한 세션의 학년 원본("고2" 등). 표지 학년 칸. */
  studentGrade?: string | null;
  onClose: () => void;
};

/**
 * §5.16/§5.13과 대칭인 최종 제출본 뷰어. `report`는 상세 API의 `final` 필드
 * (`{sections, submissionId, ...}`) 그대로다 — 재사용 판단은 파일 상단 주석 참고.
 */
function FinalReportModal({
  open,
  report,
  topicTitle,
  studentName,
  studentGrade,
  onClose,
}: FinalReportModalProps) {
  const isOpen = open && Boolean(report);
  const visibleSections = report ? getVisibleSections(report.sections) : [];
  const hasContent = visibleSections.length > 0;
  const toast = useToast();
  // 보고 있는 최종 제출본 표면 하나의 글만 복사한다. 본문은 HTML 마크업이라 DOM 에서 읽는다.
  const surfaceRef = useRef<HTMLDivElement>(null);

  return (
    <ReportModalShell
      open={isOpen}
      title="최종 제출본"
      {...(topicTitle !== undefined ? { subtitle: topicTitle } : {})}
      scrollLabel="최종 제출본 본문"
      {...(studentName != null ? { studentName } : {})}
      {...(studentGrade != null ? { studentGrade } : {})}
      {...(report?.updatedAt != null ? { savedAt: report.updatedAt } : {})}
      onClose={onClose}
      footer={({ print }) => (
        <>
          <button
            type="button"
            onClick={print}
            disabled={!hasContent}
            className={REPORT_MODAL_FOOTER_BUTTON.secondary}
          >
            PDF로 저장 / 인쇄
          </button>
          <button
            type="button"
            onClick={() =>
              void copyTextWithToast(
                elementPlainText(surfaceRef.current),
                toast,
              )
            }
            disabled={!hasContent}
            className={REPORT_MODAL_FOOTER_BUTTON.secondary}
          >
            전체 복사
          </button>
          <button
            type="button"
            onClick={onClose}
            className={REPORT_MODAL_FOOTER_BUTTON.primary}
          >
            닫기
          </button>
        </>
      )}
    >
      {hasContent ? (
        <div ref={surfaceRef}>
          <PerformanceReportSurface>
            <SectionedReportView sections={visibleSections} />
          </PerformanceReportSurface>
        </div>
      ) : (
        <p className="text-app-card-title font-medium leading-5.25 text-ink-sub">
          최종 제출본 내용을 불러오지 못했어요. 창을 닫고 다시 시도해 주세요.
        </p>
      )}
    </ReportModalShell>
  );
}

type ViewerStatusOverlayProps = {
  loading: boolean;
  error: string | null;
  onDismiss: () => void;
};

/** 뷰어 로딩/에러 중 임시로 뜨는 얇은 오버레이 — 세 모달 공통, 딤은 `ReportModalShell`과 같은 톤. */
function ViewerStatusOverlay({
  loading,
  error,
  onDismiss,
}: ViewerStatusOverlayProps) {
  if (!loading && !error) return null;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: 배경 클릭은 에러일 때만 켜지는 보조 닫기 경로다 — 실제 키보드 접근 경로는 안쪽 "닫기" button이 맡는다.
    // biome-ignore lint/a11y/useKeyWithClickEvents: 위와 동일.
    <div
      className="fixed inset-0 z-100 flex items-center justify-center bg-performance-dim"
      onClick={error ? onDismiss : undefined}
      role={error ? "alert" : "status"}
      aria-live="polite"
    >
      {/* biome-ignore lint/a11y/noStaticElementInteractions: 배경 클릭이 안쪽까지 닫지 않도록 막는 stopPropagation 가드일 뿐, 키보드로 도달할 사용자 동작이 없다. */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: 위와 동일. */}
      <div
        className="max-w-sm rounded-xl bg-white px-6 py-5 text-center text-app-card-title font-medium leading-5.25 text-ink shadow-[0_24px_60px_rgba(0,0,0,0.24)]"
        onClick={(event) => event.stopPropagation()}
      >
        {loading ? "리포트를 불러오는 중…" : error}
        {error && (
          <button
            type="button"
            onClick={onDismiss}
            className="mt-4 block w-full rounded-lg border border-performance-line px-4 py-2 text-app-label font-medium text-ink-sub hover:bg-performance-bubble"
          >
            닫기
          </button>
        )}
      </div>
    </div>
  );
}

export default function PerformanceReportsPage() {
  const { sessionId: routeSessionId } = useParams();
  const { session, userId } = useSession();
  const accessToken = session?.access_token || null;
  // 표지 학생명: 셸(PerformanceAppLayout)이 이미 구독하는 bootstrap 캐시를 재구독한다.
  const { data: bootstrap } = useQuery(
    performanceBootstrapQueryOptions(userId, accessToken),
  );
  const studentName = bootstrap?.profile.name ?? null;

  const isDetailMode = Boolean(routeSessionId);

  // 세션 상세는 목록 칩 클릭·상세 라우트 양쪽에서 필요하다 — 같은 세션을 두 번 조회하지
  // 않도록 여기서 캐시한다. `useState`가 아니라 `useRef`인 이유: 캐시 자체는 렌더를
  // 트리거할 필요가 없고(뷰어 열람은 `viewer` 상태가 이미 리렌더를 낸다), Map을 상태로
  // 두면 매 set마다 새 Map을 만들어야 하는 번거로움만 늘어난다.
  const detailCacheRef = useRef(new Map<string, SavedReportDetail>());

  // ── 목록 상태
  const [items, setItems] = useState<SavedReportListItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(!isDetailMode);
  const [listLoadingMore, setListLoadingMore] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [subjectGroupFilter, setSubjectGroupFilter] =
    useState(SUBJECT_GROUP_ALL);

  // ── 상세 라우트 상태(`/app/performance/reports/:sessionId`)
  const [detail, setDetail] = useState<SavedReportDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(isDetailMode);
  const [detailError, setDetailError] = useState<string | null>(null);

  // ── 리포트 뷰어(모달) — 목록 칩 클릭 또는 상세 화면 칩 클릭 어느 쪽에서도 이 상태 하나로
  //   수렴시킨다. `report`가 채워지기 전엔 로딩 오버레이만 뜬다(§5.13/§5.16 모달 자체는
  //   `report`가 있어야만 연다는 계약을 그대로 따른다 — `ReportModalShell` 호출부 계약).
  const [viewer, setViewer] = useState<ViewerState>(null);

  useEffect(() => {
    if (isDetailMode || !accessToken) return undefined;

    let alive = true;
    setListLoading(true);
    setListError(null);

    (async () => {
      try {
        const data = (await fetchSavedReportsList({
          accessToken,
        })) as SavedReportListResponse;
        if (!alive) return;
        setItems(Array.isArray(data?.items) ? data.items : []);
        setNextCursor(data?.nextCursor || null);
      } catch (error) {
        if (!alive) return;
        console.error(
          "[performance] 저장 리포트 목록 조회 실패:",
          error?.code,
          error,
        );
        setListError(
          error?.userMessage ||
            "저장 리포트를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.",
        );
      } finally {
        if (alive) setListLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [isDetailMode, accessToken]);

  useEffect(() => {
    if (!isDetailMode || !accessToken || !routeSessionId) return undefined;

    let alive = true;
    setDetailLoading(true);
    setDetailError(null);

    (async () => {
      try {
        const cached = detailCacheRef.current.get(routeSessionId);
        const data: SavedReportDetail =
          cached ||
          ((await fetchSavedReportDetail({
            accessToken,
            sessionId: routeSessionId,
          })) as SavedReportDetail);
        if (!alive) return;
        detailCacheRef.current.set(routeSessionId, data);
        setDetail(data);
      } catch (error) {
        if (!alive) return;
        console.error(
          "[performance] 저장 리포트 상세 조회 실패:",
          error?.code,
          error,
        );
        setDetailError(
          error?.userMessage ||
            "저장 리포트를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.",
        );
      } finally {
        if (alive) setDetailLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [isDetailMode, accessToken, routeSessionId]);

  async function loadMore() {
    if (!accessToken || !nextCursor || listLoadingMore) return;

    setListLoadingMore(true);
    try {
      const data = (await fetchSavedReportsList({
        accessToken,
        cursor: nextCursor,
      })) as SavedReportListResponse;
      setItems((prev) => [
        ...prev,
        ...(Array.isArray(data?.items) ? data.items : []),
      ]);
      setNextCursor(data?.nextCursor || null);
    } catch (error) {
      console.error(
        "[performance] 저장 리포트 추가 조회 실패:",
        error?.code,
        error,
      );
      setListError(
        error?.userMessage ||
          "목록을 더 불러오지 못했어요. 잠시 후 다시 시도해 주세요.",
      );
    } finally {
      setListLoadingMore(false);
    }
  }

  /**
   * 칩 클릭 → 뷰어 모달. 이미 상세를 캐시로 갖고 있으면(같은 세션을 상세 화면에서 이미
   * 봤거나, 목록에서 다른 칩을 눌러 이미 받아 온 경우) 재조회하지 않는다.
   */
  async function openArtifact({
    sessionId,
    type,
    reportId,
    topicTitle,
  }: {
    sessionId: string;
    type: ArtifactType;
    reportId?: string | null | undefined;
    topicTitle?: string | undefined;
  }) {
    if (!accessToken || !sessionId || !reportId) return;

    setViewer({
      type,
      sessionId,
      topicTitle,
      gradeLabel: null,
      report: null,
      loading: true,
      error: null,
    });

    try {
      let data = detailCacheRef.current.get(sessionId);
      if (!data) {
        data = (await fetchSavedReportDetail({
          accessToken,
          sessionId,
        })) as SavedReportDetail;
        detailCacheRef.current.set(sessionId, data);
      }
      setViewer({
        type,
        sessionId,
        topicTitle,
        gradeLabel: data?.session?.gradeLabel ?? null,
        report: data?.[type] || null,
        loading: false,
        error: null,
      });
    } catch (error) {
      console.error("[performance] 리포트 뷰어 조회 실패:", error?.code, error);
      setViewer({
        type,
        sessionId,
        topicTitle,
        report: null,
        loading: false,
        error:
          error?.userMessage ||
          "리포트를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.",
      });
    }
  }

  function closeViewer() {
    setViewer(null);
  }

  if (isDetailMode) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto pb-14">
        <Link
          to="/app/performance/reports"
          className="text-app-label font-medium leading-4.5 text-ink-sub hover:underline"
        >
          ← 저장 리포트 목록으로
        </Link>

        {detailLoading && (
          <p className="mt-6 text-app-card-title font-medium leading-5.25 text-ink-sub">
            불러오는 중…
          </p>
        )}

        {!detailLoading && detailError && (
          <p
            role="alert"
            className="mt-6 text-app-card-title font-medium leading-5.25 text-[#d01c1c]"
          >
            {detailError}
          </p>
        )}

        {!detailLoading && !detailError && detail?.session && (
          <div className="mt-6 max-w-200 rounded-perf-modal border border-performance-line bg-white p-8">
            <h2 className="text-app-section font-semibold leading-6.5 tracking-[-0.025rem] text-ink">
              {detail.session.topicTitle || "제목 없는 수행평가"}
            </h2>
            <p className="mt-2 text-app-body font-normal leading-4.5 tracking-[-0.0175rem] text-ink-sub">
              {[
                buildMeta(detail.session),
                formatSavedAt(detail.session.updatedAt),
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>

            <div className="mt-6 flex gap-3">
              <ArtifactChip
                label={detail.design ? "설계 리포트" : "설계 리포트 없음"}
                available={Boolean(detail.design)}
                onClick={() =>
                  openArtifact({
                    sessionId: routeSessionId as string,
                    type: "design",
                    reportId: detail.design?.reportId,
                    topicTitle: detail.session.topicTitle,
                  })
                }
              />
              <ArtifactChip
                label={detail.evaluation ? "평가 리포트" : "평가 리포트 없음"}
                available={Boolean(detail.evaluation)}
                onClick={() =>
                  openArtifact({
                    sessionId: routeSessionId as string,
                    type: "evaluation",
                    reportId: detail.evaluation?.reportId,
                    topicTitle: detail.session.topicTitle,
                  })
                }
              />
              <ArtifactChip
                label={detail.final ? "최종 제출본" : "최종 제출본 없음"}
                available={Boolean(detail.final)}
                onClick={() =>
                  openArtifact({
                    sessionId: routeSessionId as string,
                    type: "final",
                    reportId: detail.final?.reportId,
                    topicTitle: detail.session.topicTitle,
                  })
                }
              />
            </div>
          </div>
        )}

        <DesignReportModal
          open={viewer?.type === "design"}
          report={
            viewer?.type === "design"
              ? (viewer.report as SectionsReport | null)
              : null
          }
          topicTitle={viewer?.topicTitle}
          studentName={studentName}
          studentGrade={viewer?.gradeLabel ?? null}
          onClose={closeViewer}
        />
        <EvaluationReportModal
          open={viewer?.type === "evaluation"}
          report={
            viewer?.type === "evaluation"
              ? (viewer.report as EvaluationReport | null)
              : null
          }
          topicTitle={viewer?.topicTitle}
          studentName={studentName}
          studentGrade={viewer?.gradeLabel ?? null}
          onClose={closeViewer}
        />
        <FinalReportModal
          open={viewer?.type === "final"}
          report={
            viewer?.type === "final"
              ? (viewer.report as SectionsReport | null)
              : null
          }
          topicTitle={viewer?.topicTitle}
          studentName={studentName}
          studentGrade={viewer?.gradeLabel ?? null}
          onClose={closeViewer}
        />
        <ViewerStatusOverlay
          loading={Boolean(viewer?.loading)}
          error={viewer?.error ?? null}
          onDismiss={closeViewer}
        />
      </div>
    );
  }

  // ── 목록 화면(§5.18/§5.19) ──────────────────────────────────────────────
  const subjectGroups = Array.from(
    new Set(items.map((item) => item.subjectGroup).filter(Boolean)),
  ) as string[];
  const filteredItems =
    subjectGroupFilter === SUBJECT_GROUP_ALL
      ? items
      : items.filter((item) => item.subjectGroup === subjectGroupFilter);

  // §5.19 단정 — "빈 상태에서는 목록 헤더가 노출되지 않는다". 이 조건은 **로드된 리포트가
  // 아예 하나도 없는** 최초 빈 상태에 한정한다(필터로 0건이 된 경우는 별개 — 아래 참고).
  const isTrulyEmpty = !listLoading && !listError && items.length === 0;
  const showListContent = !listLoading && !listError && !isTrulyEmpty;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto pb-14">
      {!isTrulyEmpty && (
        <div className="flex items-center justify-between">
          <h2 className="text-app-stat font-semibold tracking-[-0.03rem] text-ink">
            저장 리포트 {items.length}
          </h2>

          {subjectGroups.length > 0 && (
            <SelectField
              size="perf"
              className="w-40"
              id="performance-reports-subject-filter"
              value={subjectGroupFilter}
              onChange={setSubjectGroupFilter}
              placeholder="교과군 전체"
              options={[
                { value: SUBJECT_GROUP_ALL, label: "교과군 전체" },
                ...subjectGroups.map((group) => ({
                  value: group,
                  label: group,
                })),
              ]}
            />
          )}
        </div>
      )}

      {listLoading && (
        <p className="mt-6 text-app-card-title font-medium leading-5.25 text-ink-sub">
          불러오는 중…
        </p>
      )}

      {!listLoading && listError && (
        <p
          role="alert"
          className="mt-6 text-app-card-title font-medium leading-5.25 text-[#d01c1c]"
        >
          {listError}
        </p>
      )}

      {isTrulyEmpty && (
        // §5.19 실측 — 68.75rem×22.5rem r1.25rem `fill #f9fafb`, 내부 문구+CTA VERTICAL gap 2rem.
        <div className="mt-10 flex h-90 w-full max-w-275 flex-col items-center justify-center gap-8 rounded-perf-modal bg-surface-footer">
          <p className="text-center text-app-stat font-medium tracking-[-0.03rem] text-ink">
            아직 저장된 리포트가 없어요
          </p>
          <Link
            to="/app/performance"
            className="flex h-11 w-50 items-center justify-center rounded-lg bg-primary px-5 py-3 text-app-card-title font-medium leading-5 text-white transition hover:bg-primary/90"
          >
            채팅으로 돌아가 시작하기
          </Link>
        </div>
      )}

      {showListContent && (
        <>
          {filteredItems.length === 0 ? (
            <p className="mt-6 text-app-card-title font-medium leading-5.25 text-ink-sub">
              이 교과군의 저장 리포트가 없어요.
            </p>
          ) : (
            <div className="mt-6 flex flex-col gap-5">
              {filteredItems.map((item) => (
                <SavedReportCard
                  key={item.sessionId}
                  {...(item.topicTitle !== undefined
                    ? { title: item.topicTitle }
                    : {})}
                  meta={buildMeta(item)}
                  {...(item.updatedAt !== undefined
                    ? { savedAt: item.updatedAt }
                    : {})}
                  sessionId={item.sessionId}
                  artifacts={toArtifacts(item)}
                  onArtifactClick={(type, reportId) =>
                    openArtifact({
                      sessionId: item.sessionId,
                      type,
                      reportId,
                      topicTitle: item.topicTitle,
                    })
                  }
                />
              ))}
            </div>
          )}

          {nextCursor && (
            <button
              type="button"
              onClick={loadMore}
              disabled={listLoadingMore}
              className="mt-6 flex h-11 items-center justify-center rounded-lg border border-performance-line px-6 text-app-label font-medium leading-4.5 text-ink-sub transition hover:bg-performance-bubble disabled:cursor-not-allowed disabled:opacity-60"
            >
              {listLoadingMore ? "불러오는 중…" : "더 보기"}
            </button>
          )}
        </>
      )}

      <DesignReportModal
        open={viewer?.type === "design"}
        report={
          viewer?.type === "design"
            ? (viewer.report as SectionsReport | null)
            : null
        }
        topicTitle={viewer?.topicTitle}
        studentName={studentName}
        studentGrade={viewer?.gradeLabel ?? null}
        onClose={closeViewer}
      />
      <EvaluationReportModal
        open={viewer?.type === "evaluation"}
        report={
          viewer?.type === "evaluation"
            ? (viewer.report as EvaluationReport | null)
            : null
        }
        topicTitle={viewer?.topicTitle}
        studentName={studentName}
        studentGrade={viewer?.gradeLabel ?? null}
        onClose={closeViewer}
      />
      <FinalReportModal
        open={viewer?.type === "final"}
        report={
          viewer?.type === "final"
            ? (viewer.report as SectionsReport | null)
            : null
        }
        topicTitle={viewer?.topicTitle}
        studentName={studentName}
        studentGrade={viewer?.gradeLabel ?? null}
        onClose={closeViewer}
      />
      <ViewerStatusOverlay
        loading={Boolean(viewer?.loading)}
        error={viewer?.error ?? null}
        onDismiss={closeViewer}
      />
    </div>
  );
}
