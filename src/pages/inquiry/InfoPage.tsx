import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import GoalPageHeader from "@/components/goal/GoalPageHeader";
import BasicInfoCard from "@/components/inquiry/info/BasicInfoCard";
import EmptyAssetsDialog from "@/components/inquiry/info/EmptyAssetsDialog";
import GrowthBanner from "@/components/inquiry/info/GrowthBanner";
import {
  addAsset,
  decideSubmit,
  fromAssetViews,
  type InfoForm,
  type InfoFormErrors,
  initialForm,
  initialPlanItemId,
  LOCKED_MESSAGE,
  type LocalAsset,
  localWarnings,
  moveAsset,
  nextKey,
  onelineAsset,
  removeAsset,
  type SubmitErrorView,
  submitErrorView,
  toAssetInputs,
  toggleRecord,
  validateInfoForm,
  warningMessages,
} from "@/components/inquiry/info/infoLogic";
import InterviewPanel from "@/components/inquiry/info/InterviewPanel";
import LinkRulesCard from "@/components/inquiry/info/LinkRulesCard";
import OnelineInput from "@/components/inquiry/info/OnelineInput";
import QuotaCard from "@/components/inquiry/info/QuotaCard";
import RecordPicker from "@/components/inquiry/info/RecordPicker";
import SelectedAssets from "@/components/inquiry/info/SelectedAssets";
import SubmitError from "@/components/inquiry/info/SubmitError";
import { CARD, CARD_HINT, CARD_TITLE } from "@/components/inquiry/info/styles";
import Warnings from "@/components/inquiry/info/Warnings";
import { INQUIRY_PATHS } from "@/components/inquiry/inquiryPaths";
import {
  useInquiryScreenStep,
  useInquiryShell,
} from "@/components/inquiry/InquiryShellContext";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/context/SessionContext";
import { postAssets, postSession } from "@/lib/inquiry/api";
import { clearGrowthHandoff, readGrowthHandoff } from "@/lib/inquiry/handoff";
import { upsertStudentProfile } from "@/lib/inquiry/profile";
import type { SessionResponse } from "@/lib/inquiry/types";

// 정보 입력(1단계) 화면. 경로: /app/inquiry
// 단계 알림(useInquiryScreenStep)은 사이드바 진행단계가 의존한다. 고지는 InquiryAppLayout 이 그린다.
// 방문만으로는 세션을 만들지 않는다. "주제 3개 추천받기"에서 student_profiles 저장, 세션 생성 또는 갱신,
// 자산 저장을 차례로 하고 주제 추천 화면으로 넘어간다(계획 §2 3, 부록 C).
const BODY = "flex w-full max-w-goal-content flex-col gap-4 px-4 pb-6 md:px-12";

export default function InfoPage() {
  useInquiryScreenStep(1);
  const { bootstrap, isBootstrapLoading, bootstrapError, refetchBootstrap } =
    useInquiryShell();

  return (
    <>
      <GoalPageHeader
        title="무엇을 이어서 파고들까요"
        subcopy="심화탐구는 새로 시작하는 활동이 아니라 이미 한 활동에서 이어지는 활동이에요. 그동안의 활동을 먼저 고르면, 거기서 뻗어 나오는 주제를 추천해요."
      />
      {bootstrap ? (
        <InfoBody bootstrap={bootstrap} />
      ) : isBootstrapLoading ? (
        <div role="status" aria-label="불러오는 중" className={BODY}>
          <Skeleton className="h-52 w-full rounded-xl" />
          <Skeleton className="h-72 w-full rounded-xl" />
        </div>
      ) : (
        <div className={BODY}>
          <p className="text-app-body text-ink-sub">
            정보를 불러오지 못했어요.
          </p>
          {bootstrapError?.result.kind === "error" &&
            bootstrapError.result.code === "NO_ENTITLEMENT" && (
              <Link
                to="/pricing?service=inquiry"
                className={`${buttonVariants({ variant: "outline", size: "lg" })} h-10 w-fit px-5 text-app-label`}
              >
                이용권 보기
              </Link>
            )}
          <div>
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="h-10 px-5 text-app-label"
              onClick={() => void refetchBootstrap()}
            >
              다시 시도
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

function InfoBody({ bootstrap }: { bootstrap: SessionResponse }) {
  const navigate = useNavigate();
  const { userId } = useSession();
  const { applyBootstrap } = useInquiryShell();

  // 확정, 보관된 세션은 이어서 쓸 수 없다. 새 세션 시작을 누르기 전에는 안내만 그린다.
  const finished =
    bootstrap.session !== null &&
    (bootstrap.session.status === "completed" ||
      bootstrap.session.status === "archived");
  const [startNew, setStartNew] = useState(false);
  const session = finished ? null : bootstrap.session;
  const locked = session?.designReportId != null;

  const [form, setForm] = useState<InfoForm>(() =>
    initialForm({ session, profile: bootstrap.profile }),
  );
  const [errors, setErrors] = useState<InfoFormErrors>({});
  const [assets, setAssets] = useState<LocalAsset[]>(() =>
    session ? fromAssetViews(bootstrap.assets) : [],
  );
  // 성장설계 실행계획에서 넘어온 과제(growth:handoff)는 읽은 뒤 키를 지운다.
  const [storedPlanItemId] = useState(
    () => readGrowthHandoff()?.planItemId ?? null,
  );
  useEffect(() => {
    clearGrowthHandoff();
  }, []);
  const [planItemId, setPlanItemId] = useState<string | null>(() =>
    initialPlanItemId({
      handoff: bootstrap.handoff,
      session,
      storedPlanItemId,
    }),
  );
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<SubmitErrorView | null>(null);

  const disabled = submitting || locked;
  const selectedIds = new Set(
    assets.flatMap((a) =>
      a.input.kind === "record" ? [a.input.activityRecordId] : [],
    ),
  );
  const warnings = warningMessages(localWarnings(assets, bootstrap.records));

  async function submit(emptyConfirmed: boolean) {
    const validation = validateInfoForm(form);
    if (!validation.ok) {
      setErrors(validation.errors);
      return;
    }
    setErrors({});
    const decision = decideSubmit({
      session,
      info: validation.value,
      assetCount: assets.length,
      emptyConfirmed,
    });
    if (decision.kind === "locked") {
      setSubmitError({ kind: "locked", text: LOCKED_MESSAGE });
      return;
    }
    if (decision.kind === "confirm-empty") {
      setConfirmEmpty(true);
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    try {
      if (userId) {
        await upsertStudentProfile(userId, {
          gradeLabel: validation.value.gradeLabel,
          semester: validation.value.semester,
          career: validation.value.career,
        });
      }

      let current = session;
      if (decision.createSession) {
        const created = await postSession({
          action: "create",
          info: validation.value,
        });
        if (created.kind !== "ok") {
          setSubmitError(submitErrorView(created));
          return;
        }
        applyBootstrap(created.data);
        current = created.data.session;
      }
      if (!current) {
        setSubmitError(
          submitErrorView({
            kind: "error",
            status: 500,
            code: "INTERNAL",
            message: "",
          }),
        );
        return;
      }

      const saved = await postAssets({
        sessionId: current.id,
        items: toAssetInputs(assets),
        planItemId,
      });
      if (saved.kind !== "ok") {
        setSubmitError(submitErrorView(saved));
        return;
      }
      applyBootstrap({
        assets: saved.data.assets,
        session: { ...current, planItemId: saved.data.planItemId },
      });
      navigate(INQUIRY_PATHS.topics, { state: { startRecommend: true } });
    } finally {
      setSubmitting(false);
    }
  }

  if (finished && !startNew) {
    return (
      <div className={BODY}>
        <section aria-labelledby="inquiry-finished" className={CARD}>
          <h2 id="inquiry-finished" className={CARD_TITLE}>
            이 세션은 확정됐어요
          </h2>
          <p className={CARD_HINT}>
            새 세션을 시작해 다른 활동에서 이어가거나, 보관함에서 지난 탐구를 볼
            수 있어요.
          </p>
          <div className="mt-4 flex gap-2">
            <Button
              type="button"
              size="lg"
              className="h-10 px-5 text-app-label"
              onClick={() => setStartNew(true)}
            >
              새 세션 시작하기
            </Button>
            <Link
              to={INQUIRY_PATHS.reports}
              className={`${buttonVariants({ variant: "outline", size: "lg" })} h-10 px-5 text-app-label`}
            >
              보관함 보기
            </Link>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className={BODY}>
      <GrowthBanner
        handoff={bootstrap.handoff}
        selectedPlanItemId={planItemId}
        disabled={disabled}
        onSelectPlanItem={setPlanItemId}
      />

      {locked && (
        <p
          role="status"
          className="rounded-xl bg-surface-04 px-5 py-4 text-app-label text-ink"
        >
          {LOCKED_MESSAGE}
        </p>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)_17rem] items-start gap-4">
        <div className="flex flex-col gap-4">
          <BasicInfoCard
            form={form}
            errors={errors}
            gradeNote={bootstrap.gradeNote}
            disabled={disabled}
            onChange={(patch) => setForm((prev) => ({ ...prev, ...patch }))}
          />

          <section aria-labelledby="inquiry-activities" className={CARD}>
            <h2 id="inquiry-activities" className={CARD_TITLE}>
              그동안 한 활동
            </h2>
            <p className={CARD_HINT}>
              주제 한 줄이 있으면 돼요. 그 한 줄에서 이어질 수 있는 후속 탐구를
              찾아 줘요.
            </p>
            <div className="mt-4 flex flex-col gap-4">
              <OnelineInput
                disabled={disabled}
                onAdd={(text) =>
                  setAssets((prev) =>
                    addAsset(
                      prev,
                      onelineAsset(text, nextKey(prev, "oneline")),
                    ),
                  )
                }
              />
              <SelectedAssets
                items={assets}
                disabled={disabled}
                onRemove={(key) => setAssets((prev) => removeAsset(prev, key))}
                onMove={(key, direction) =>
                  setAssets((prev) => moveAsset(prev, key, direction))
                }
              />
              <Warnings messages={warnings} />

              <div className="border-t border-line/60 pt-4">
                <h3 className="text-app-card-title font-bold text-ink-strong">
                  위닝 기록에서 불러오기
                </h3>
                <p className={`${CARD_HINT} mb-3`}>
                  과목을 누르면 그 과목에서 했던 활동이 주제와 함께 나와요.
                </p>
                <RecordPicker
                  records={bootstrap.records}
                  subjectCounts={bootstrap.subjectCounts}
                  selectedIds={selectedIds}
                  disabled={disabled}
                  onToggle={(record) =>
                    setAssets((prev) => toggleRecord(prev, record))
                  }
                />
              </div>

              <InterviewPanel
                disabled={disabled}
                assetKey={nextKey(assets, "interview")}
                onSave={(asset) => setAssets((prev) => addAsset(prev, asset))}
              />
            </div>
          </section>

          {submitError && <SubmitError error={submitError} />}

          <div className="flex justify-end">
            <Button
              type="button"
              size="lg"
              className="h-11 px-8 text-app-label"
              disabled={disabled}
              onClick={() => void submit(false)}
            >
              주제 3개 추천받기
            </Button>
          </div>
        </div>

        <aside className="flex flex-col gap-4" aria-label="이용 안내">
          {bootstrap.quota && <QuotaCard quota={bootstrap.quota} />}
          <LinkRulesCard />
        </aside>
      </div>

      <EmptyAssetsDialog
        open={confirmEmpty}
        onPickActivity={() => setConfirmEmpty(false)}
        onProceed={() => {
          setConfirmEmpty(false);
          void submit(true);
        }}
      />
    </div>
  );
}
