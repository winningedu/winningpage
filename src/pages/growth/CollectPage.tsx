import { useCallback, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import GoalPageHeader from "@/components/goal/GoalPageHeader";
import {
  CollectSection,
  NoticeBox,
} from "@/components/growth/collect/CollectSection";
import {
  buildDirectGrades,
  buildGradeDisplay,
  buildSemesterItems,
  type CommitFailure,
  canSkipFirstYear,
  classifyCommitError,
  createBlockReason,
  currentFor,
  gradeOfKey,
  initialTrack,
  semesterOfKey,
  trackChoiceNotice,
} from "@/components/growth/collect/collectLogic";
import { GradesCard } from "@/components/growth/collect/GradesCard";
import { ManualActivityCard } from "@/components/growth/collect/ManualActivityCard";
import { OverviewCard } from "@/components/growth/collect/OverviewCard";
import { SavedActivitiesCard } from "@/components/growth/collect/SavedActivitiesCard";
import { SemesterRecordsCard } from "@/components/growth/collect/SemesterRecordsCard";
import { TrackCard } from "@/components/growth/collect/TrackCard";
import {
  UploadDialog,
  type UploadTarget,
} from "@/components/growth/collect/UploadDialog";
import type { UploadOutcome } from "@/components/growth/collect/uploadFlow";
import { useCollectSummary } from "@/components/growth/collect/useCollectSummary";
import {
  useGrowthScreenStep,
  useGrowthShell,
} from "@/components/growth/GrowthShellContext";
import { GROWTH_PATHS } from "@/components/growth/growthPaths";
import { pickProfileValues } from "@/components/growth/start/startLogic";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useSession } from "@/context/SessionContext";
import {
  collectCommit,
  collectExtract,
  type SemesterKey,
  type Track,
} from "@/lib/growth/api";

// 활동 선택(3단계, 명세 No.37~51, 73, 75, 113, 120~122, 145, 153, 154). 경로: /app/growth/collect
// 집계는 서버 summary 가 정본이고 이 화면은 입력(트랙, 성적, 업로드, 직접 입력)을 모아 보낸다.
// 판단 규칙은 components/growth/collect/collectLogic.ts 에 있다.
const BODY = "flex w-full max-w-goal-content flex-col gap-4 px-4 pb-6 md:px-12";
const SUBCOPY = "분석할 범위와 자료를 확인합니다.";

const BLOCK_TEXT: Partial<Record<string, string>> = {
  "pending-uploads": "아직 처리 중인 파일이 있어요",
  "invalid-grades": "성적 입력을 확인해 주세요",
  uploading: "파일을 올리는 중이에요",
  loading: "집계를 불러오는 중이에요",
};

export default function CollectPage() {
  useGrowthScreenStep(3);
  const navigate = useNavigate();
  const { userId } = useSession();
  const { bootstrap, openReport, isBootstrapLoading, refetchBootstrap } =
    useGrowthShell();

  const profile = useMemo(
    () =>
      pickProfileValues(
        bootstrap?.profile ?? null,
        bootstrap?.profileInitial ?? null,
      ).values,
    [bootstrap],
  );
  const [chosenTrack, setChosenTrack] = useState<Track | null>(null);
  const track = chosenTrack ?? initialTrack(profile.grade);
  const current = useMemo(
    () => (track ? currentFor(track, profile.semester) : undefined),
    [track, profile.semester],
  );

  // 사용자가 고친 성적 칸만 담는다. 건드리지 않은 칸은 서버 평균을 그대로 보여 준다.
  const [gradeTexts, setGradeTexts] = useState<
    Partial<Record<SemesterKey, string>>
  >({});
  const [uploadTarget, setUploadTarget] = useState<UploadTarget | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [failure, setFailure] = useState<CommitFailure | null>(null);
  const [skipOpen, setSkipOpen] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const manualRef = useRef<HTMLElement>(null);

  // 등급 체계는 서버 summary 가 정한다. directGrades 가 summary 호출의 입력이라 직전 응답의 체계를 들고 있는다.
  const [system, setSystem] = useState<"five" | "nine" | null>(null);
  const { directGrades, errors: gradeErrors } = useMemo(
    () => buildDirectGrades(gradeTexts, system),
    [gradeTexts, system],
  );

  const { summary, activities, status, errorMessage, refresh } =
    useCollectSummary({
      track: openReport ? track : null,
      current,
      directGrades,
    });
  const summarySystem = summary?.gradeInputs.system ?? null;
  if (summary && summarySystem !== system) setSystem(summarySystem);

  const settleUpload = useCallback(
    (outcome: UploadOutcome) => {
      void refresh();
      if (outcome === "unreadable") {
        setUploadTarget(null);
        manualRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }
    },
    [refresh],
  );

  if (isBootstrapLoading && !bootstrap) {
    return (
      <>
        <GoalPageHeader title="활동 선택" subcopy={SUBCOPY} />
        <div className={BODY}>
          <p role="status" className="text-app-body text-ink-sub">
            불러오는 중이에요.
          </p>
        </div>
      </>
    );
  }

  if (!openReport || status === "no-report") {
    return (
      <>
        <GoalPageHeader title="활동 선택" subcopy={SUBCOPY} />
        <div className={BODY}>
          <CollectSection title="학생 조사를 먼저 저장해 주세요">
            <p className="text-app-body text-ink-sub">
              학생 조사를 저장하면 분석할 활동을 고를 수 있어요.
            </p>
            <div className="mt-4">
              <Button
                type="button"
                size="lg"
                onClick={() => navigate(GROWTH_PATHS.survey)}
              >
                학생 조사로 가기
              </Button>
            </div>
          </CollectSection>
        </div>
      </>
    );
  }

  const items = summary && track ? buildSemesterItems(track, summary) : [];
  const gradeKeys = summary?.range.semesters ?? [];
  const gradeValues = buildGradeDisplay(
    gradeTexts,
    gradeKeys,
    summary?.gradeInputs.semesters ?? [],
  );

  const blockReason = createBlockReason({
    hasOpenReport: true,
    summaryLoaded: summary !== null,
    uploadsPending: summary?.uploadsPending ?? 0,
    uploadBusy,
    hasGradeErrors: Object.keys(gradeErrors).length > 0,
    committing,
  });
  const pendingUploads =
    summary?.uploads.filter(
      (u) => u.status === "pending" || u.status === "processing",
    ) ?? [];
  const manualActivities = activities.filter((a) => a.source === "manual");

  // 탭을 닫아 남은 pending 도 서버 extract 가 닫는다(객체가 없으면 410 으로 failed 처리). 결과와 무관하게 집계를 다시 부른다.
  const retryUpload = async (uploadId: string) => {
    setRetryingId(uploadId);
    await collectExtract(uploadId);
    await refresh();
    setRetryingId(null);
  };

  const commit = async () => {
    if (!track || blockReason !== null) return;
    setSkipOpen(false);
    setCommitting(true);
    setFailure(null);
    const result = await collectCommit({
      track,
      ...(current ? { current } : {}),
      directGrades,
    });
    if (result.kind === "ok") {
      await refetchBootstrap();
      navigate(GROWTH_PATHS.generate);
      return;
    }
    const classified = classifyCommitError(result);
    setFailure(classified);
    if (classified.kind === "uploads-pending") void refresh();
    setCommitting(false);
  };

  return (
    <>
      <GoalPageHeader title="활동 선택" subcopy={SUBCOPY} />
      <div className={BODY}>
        <TrackCard
          track={track}
          notice={
            track && summary
              ? trackChoiceNotice(track, summary.range.description)
              : null
          }
          onSelect={setChosenTrack}
        />

        {status === "error" && (
          <NoticeBox tone="warn" role="alert">
            {errorMessage}{" "}
            <button
              type="button"
              className="underline"
              onClick={() => void refresh()}
            >
              다시 불러오기
            </button>
          </NoticeBox>
        )}

        {summary && track && (
          <>
            <SavedActivitiesCard bySource={summary.bySource} />
            <SemesterRecordsCard
              items={items}
              uploads={summary.uploads}
              onAddFile={(item) =>
                setUploadTarget({
                  title: item.title,
                  gradeLabel:
                    `고${gradeOfKey(item.key)}` as UploadTarget["gradeLabel"],
                  semester: semesterOfKey(item.key),
                  uploadsLeft: item.uploadsLeft,
                })
              }
            />
            <GradesCard
              system={system}
              admissionYear={profile.admissionYear}
              note={summary.gradeInputs.note}
              keys={gradeKeys}
              serverSemesters={summary.gradeInputs.semesters}
              values={gradeValues}
              errors={gradeErrors}
              onChange={(key, text) =>
                setGradeTexts((prev) => ({ ...prev, [key]: text }))
              }
              onBlur={(key) =>
                setGradeTexts((prev) => {
                  if (prev[key] !== "") return prev;
                  const { [key]: _removed, ...rest } = prev;
                  return rest;
                })
              }
            />
            <ManualActivityCard
              userId={userId}
              manualActivities={manualActivities}
              onChanged={() => void refresh()}
              sectionRef={manualRef}
            />
            <OverviewCard
              bySource={summary.bySource}
              warnings={summary.warnings}
            />
          </>
        )}

        {pendingUploads.length > 0 && (
          <NoticeBox tone="warn" role="status">
            <p className="font-semibold">아직 처리 중인 파일이 있어요</p>
            <ul className="mt-1 flex flex-col gap-1">
              {pendingUploads.map((u) => (
                <li
                  key={u.id}
                  className="flex items-center justify-between gap-3"
                >
                  <span className="min-w-0 truncate">{u.fileName}</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={retryingId !== null}
                    aria-label={`${u.fileName} 다시 처리`}
                    onClick={() => void retryUpload(u.id)}
                  >
                    다시 처리
                  </Button>
                </li>
              ))}
            </ul>
          </NoticeBox>
        )}

        {failure?.kind === "locked" && (
          <NoticeBox tone="warn" role="alert">
            리포트 생성이 이미 시작됐어요.{" "}
            <button
              type="button"
              className="underline"
              onClick={() => navigate(GROWTH_PATHS.generate)}
            >
              생성 화면으로 이동
            </button>
          </NoticeBox>
        )}
        {failure?.kind === "uploads-pending" && (
          <NoticeBox tone="warn" role="alert">
            아직 처리 중인 파일이 있어요. 끝난 뒤 다시 눌러 주세요.
          </NoticeBox>
        )}
        {failure?.kind === "other" && (
          <NoticeBox tone="warn" role="alert">
            {failure.message}
          </NoticeBox>
        )}

        <div className="flex flex-col items-end gap-2">
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => navigate(GROWTH_PATHS.survey)}
            >
              이전
            </Button>
            {summary && track && canSkipFirstYear(track, summary) && (
              <Button
                type="button"
                variant="outline"
                size="lg"
                disabled={blockReason !== null}
                onClick={() => setSkipOpen(true)}
              >
                1학년 자료 없이 진행
              </Button>
            )}
            <Button
              type="button"
              size="lg"
              disabled={blockReason !== null || track === null}
              onClick={() => void commit()}
            >
              리포트 만들기
            </Button>
          </div>
          {blockReason && BLOCK_TEXT[blockReason] && (
            <p className="text-app-caption text-ink-sub">
              {BLOCK_TEXT[blockReason]}
            </p>
          )}
        </div>
      </div>

      {uploadTarget && (
        <UploadDialog
          key={`${uploadTarget.gradeLabel}-${uploadTarget.semester}`}
          target={uploadTarget}
          onClose={() => setUploadTarget(null)}
          onSettled={settleUpload}
          onBusyChange={setUploadBusy}
        />
      )}

      <Dialog open={skipOpen} onOpenChange={setSkipOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>1학년 자료 없이 진행해요</DialogTitle>
            <DialogDescription>
              1학년 평가 항목은 자료 없음으로 나와요. 리포트에서 1학년 평가와
              학년 간 성장 흐름 항목이 빠지고, 방향 제시와 학년별 목표 과제의
              비중이 높아져요. 빠진 항목은 리포트에 적어 둬요.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setSkipOpen(false)}
            >
              취소
            </Button>
            <Button type="button" onClick={() => void commit()}>
              리포트 만들기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
