import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import RecordCooldownSummary from "@/components/goal/dashboard/RecordCooldownSummary";
import GoalPageHeader from "@/components/goal/GoalPageHeader";
import ChipSelectSection from "@/components/goal/study/ChipSelectSection";
import ConditionSection from "@/components/goal/study/ConditionSection";
import RetrospectSection from "@/components/goal/study/RetrospectSection";
import StudyTimeSection from "@/components/goal/study/StudyTimeSection";
import {
  CONDITION_OPTIONS,
  DEFAULT_TIMER_SUBJECTS,
  DISTURBANCE_OPTIONS,
  STUDY_ITEM_OPTIONS,
} from "@/components/goal/studyRecordOptions";
import { getSubjectLabel } from "@/components/goal/subjectTokens";
import { useAuth } from "@/context/AuthProvider";
import type {
  GoalRecordCooldown,
  GoalRecordSummary,
  GoalTomorrowTargets,
} from "@/lib/goalApi";
import {
  fetchGoalTimer,
  fetchTodayGoalRecord,
  generateGoalAdvice,
  submitDailyRecord,
} from "@/lib/goalApi";
import {
  formatCooldownUnlockLabel,
  formatTodayDateMeta,
} from "@/lib/goalPlanUtils";
import { goalDailyRecordQueryOptions } from "@/lib/queryClient";
import { goalNotAllowedMessage } from "@/lib/tenantBlock";

// 코드값 → 라벨(studyRecordOptions.js 옵션 그대로) / 라벨 → 코드값(GET 응답 프리필용, 서버는
// api/goal/daily-record.js 가 한글 라벨로 저장하므로 역매핑이 필요하다).
const TASK_CODE_BY_LABEL = Object.fromEntries(
  STUDY_ITEM_OPTIONS.map((o) => [o.label, o.value]),
);
const REASON_CODE_BY_LABEL = Object.fromEntries(
  DISTURBANCE_OPTIONS.map((o) => [o.label, o.value]),
);

// 오늘의 공부 기록(#26). 시안 실측 콘텐츠 폭은 1190px(74.375rem, part-09 §156)이지만 앱 공통 폭
// 통일 원칙(00-INDEX.md §5-2 `PageHeader`, tailwind.config.js `max-w-goal-content` 83.75rem)에
// 따라 83.75rem 컨테이너 안에서 레이아웃한다. 시안 실측 폭은 이 주석으로만 남긴다.
type DailyRecordBanner = {
  tone: "info" | "success" | "error";
  message: string;
};

const HIGHLIGHT_AUTO_DISMISS_MS = 2000;

export default function DailyRecord() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { userId } = useAuth();
  const [condition, setCondition] = useState<string | null>(null);
  const [disturbances, setDisturbances] = useState<string[]>([]);
  const [studyItems, setStudyItems] = useState<string[]>([]);
  const [retrospect, setRetrospect] = useState("");

  // GET /api/goal/daily-record 프리필 상태. studyHours는 이 페이지에서 입력받지 않는다 —
  // 대시보드 "오늘의 목표" 카드 또는 열공 타이머(#25, 타이머 영속화는 별도 작업)에서만
  // 채워진다(임무 지시 배경 절). QA3 행305 — "기록 수정" 버튼 문구는 제거했다(쿨다운
  // 도입으로 "수정" 개념 자체가 없다).
  const [studyHours, setStudyHours] = useState(0);

  // 과목별 순공 시간 표시(read-only) — GET /api/goal/timer의 마감 세션 합계 스냅샷.
  // 진행 중 세션의 실시간 경과는 얹지 않는다(이 페이지는 기록 스냅샷, 매초 갱신 불필요).
  // 노출 과목은 열공 타이머(#25)와 동일하게 학생이 "+ 과목 추가"한 목록을 따른다
  // (visibleSubjects, QA B9) — 로딩 중에는 기본 4과목으로 잠깐 보여준다.
  const [studySubjectTimes, setStudySubjectTimes] = useState(
    DEFAULT_TIMER_SUBJECTS.map((id) => ({
      id,
      label: getSubjectLabel(id),
      hours: 0,
    })),
  );

  useEffect(() => {
    fetchGoalTimer().then((result) => {
      if (result.kind !== "success") return;
      const seconds: Record<string, number> = {};
      for (const row of result.summary?.subjects || [])
        seconds[row.subject] = row.seconds;
      const visibleSubjects =
        result.summary?.visibleSubjects ?? DEFAULT_TIMER_SUBJECTS;
      setStudySubjectTimes(
        visibleSubjects.map((id) => ({
          id,
          label: getSubjectLabel(id),
          hours: (seconds[id] || 0) / 3600,
        })),
      );
    });
  }, []);
  const [submitting, setSubmitting] = useState(false);
  const [banner, setBanner] = useState<DailyRecordBanner | null>(null);
  const [highlightStudyTime, setHighlightStudyTime] = useState(false);
  const studyTimeRef = useRef<HTMLDivElement>(null);

  // QA3 행305 — 12시간 쿨다운. cooldown이 null이면 한 번도 제출한 적 없는
  // 학생(잠금 개념 자체가 없음), cooldown.active면 폼 대신 요약 패널을 그린다.
  // summary/tomorrowTargets는 요약 패널 전용 표시 데이터.
  const [cooldown, setCooldown] = useState<GoalRecordCooldown | null>(null);
  const [summary, setSummary] = useState<GoalRecordSummary | null>(null);
  const [tomorrowTargets, setTomorrowTargets] = useState<GoalTomorrowTargets>({
    idealHours: 0,
    minHours: 0,
  });

  // 후속(사이드바 "미기록" 뱃지 실배선) — Dashboard.tsx·GoalSidebar.tsx와 같은
  // 캐시(goalDailyRecordQueryOptions)를 구독한다. 이 페이지에 진입하기 전 다른
  // goal 화면에서 이미 조회됐다면(staleTime 15초 이내) 재요청 없이 캐시를 그대로
  // 쓴다 — 예전엔 이 페이지가 항상 독립적으로 재요청했다.
  const { data: dailyRecordResult } = useQuery(
    goalDailyRecordQueryOptions(userId),
  );

  // 폼 프리필은 데이터가 "처음 도착했을 때" 딱 한 번만 적용한다(기존 마운트 1회
  // 동작과 동일) — 그대로 data를 effect 의존성에 넣으면 저장 후 invalidate로
  // 캐시가 갱신될 때마다(staleTime 만료·포커스 재조회 포함) 사용자가 편집 중인
  // 입력값을 서버값으로 되돌려 버린다. appliedRef가 최초 1회만 통과시킨다.
  const prefillAppliedRef = useRef(false);
  useEffect(() => {
    if (!dailyRecordResult || prefillAppliedRef.current) return;
    prefillAppliedRef.current = true;

    const result = dailyRecordResult;
    if (result.kind !== "success") {
      // 방어적 분기 — RequireGoalAccess가 이미 온보딩·이용권을 걸러 정상 경로에선
      // 여기 도달하지 않는다(Dashboard.jsx의 동일 패턴 참고). 페이지는 빈 상태로 둔다.
      if (result.kind !== "no-session") {
        console.error("[DailyRecord] 오늘 기록 조회 실패:", result.kind);
      }
      return;
    }

    setCooldown(result.cooldown);
    setSummary(result.summary);
    setTomorrowTargets(result.tomorrowTargets);

    const { record } = result;
    if (!record) return;

    setStudyHours(record.studyHours || 0);
    setCondition(record.bodyCondition || null);
    setStudyItems(
      (record.tasks || [])
        .map((label: string) => TASK_CODE_BY_LABEL[label])
        .filter((code): code is string => Boolean(code)),
    );
    setDisturbances(
      (record.reasons || [])
        .map((label: string) => REASON_CODE_BY_LABEL[label])
        .filter((code): code is string => Boolean(code)),
    );
    setRetrospect(record.memo || "");
  }, [dailyRecordResult]);

  // `없었음`은 다른 방해 요인과 상호배타 처리(part-09 §247 "추정").
  const toggleDisturbance = (value: string) => {
    setDisturbances((prev) => {
      if (value === "none") {
        return prev.includes("none") ? [] : ["none"];
      }
      const withoutNone = prev.filter((item) => item !== "none");
      return withoutNone.includes(value)
        ? withoutNone.filter((item) => item !== value)
        : [...withoutNone, value];
    });
  };

  const toggleStudyItem = (value: string) => {
    setStudyItems((prev) =>
      prev.includes(value)
        ? prev.filter((item) => item !== value)
        : [...prev, value],
    );
  };

  // 필수값 정의가 시안에 없다(작업 지시 §3 확정 사항 6 "필수값 미입력 시 disabled"만 명시).
  // 최소 기준으로 추정: 컨디션 1개(필수 선택) + 핵심 학습 항목 1개 이상. 순공 시간 0은
  // disabled가 아니라 클릭 시 안내(아래 handleSave)로 처리한다 — 서버 400 no_study_time과
  // 짝을 이루는 클라이언트 선제 안내다.
  const canSave = condition !== null && studyItems.length > 0;

  const scrollToStudyTime = () => {
    studyTimeRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
    setHighlightStudyTime(true);
    setTimeout(() => setHighlightStudyTime(false), HIGHLIGHT_AUTO_DISMISS_MS);
  };

  const handleSave = async () => {
    if (!canSave || submitting) return;

    if (studyHours <= 0) {
      setBanner({
        tone: "info",
        message:
          "순공 시간이 아직 없어요. 대시보드 오늘의 목표 카드 또는 타이머에서 시간을 기록하세요.",
      });
      scrollToStudyTime();
      return;
    }

    setSubmitting(true);
    setBanner(null);

    const result = await submitDailyRecord({
      bodyCondition: condition,
      reasons: disturbances,
      tasks: studyItems,
      memo: retrospect,
    });

    setSubmitting(false);

    switch (result.kind) {
      case "success": {
        // QA 행303-1 — 저장 성공 시 배너만 띄우고 멈추던 것을 대시보드로 자동 이동시킨다.
        // 배너 전용 흐름은 여기서 제거하고, 저장 결과(델타)는 대시보드가 1회 배너로
        // 보여주도록 navigate state로 넘긴다(Dashboard.tsx savedRecordBanner).
        //
        // delta는 이상/최소 수시만 대표로 보여준다(간단 요약) — 정시는 컷 미확보 학생이면
        // 항상 0으로 나와 "정시 확률이 0만큼 늘었다"는 오해를 줄 수 있다(jungsiAvailable
        // 플래그가 이 응답엔 없다 — buildStudentPayload 전용, 이 라우트 범위 밖).
        const delta = result.delta || { idealSusi: 0, minSusi: 0 };
        // GoalProbsBlock.idealSusi/minSusi는 number|null이라 서버가 null을 주면 기존에도
        // toFixed가 그대로 터졌다(고쳐 넣지 않고 타입만 통과, 보고 대상).
        //
        // ['goal','student'] 캐시(대시보드·사이드바가 공유)를 무효화해 확률·오늘의 조언이
        // 이번 기록 반영 최신 값으로 다시 조회되게 한다 — 안 하면 stale 캐시가 15초간
        // (staleTime, queryClient.ts) 이전 확률을 계속 보여준다.
        queryClient.invalidateQueries({ queryKey: ["goal", "student"] });
        // QA 행306 — 오늘의 조언/내일 계획을 이번 기록 기준으로 1회 재생성한다
        // (fire-and-forget, 화면 이동을 막지 않는다). 대시보드가 GET으로 다시
        // 조회하도록 캐시도 함께 무효화한다.
        generateGoalAdvice("daily")
          .catch((error) => {
            console.error("[DailyRecord] 오늘의 조언 생성 요청 실패:", error);
          })
          .finally(() => {
            queryClient.invalidateQueries({ queryKey: ["goal", "advice"] });
          });
        // 후속(사이드바 "미기록" 뱃지 실배선) — ['goal','daily-record'] 캐시도 함께
        // 무효화한다. 이 페이지는 곧 언마운트되지만(아래 navigate), 목적지 대시보드가
        // 이동 즉시 같은 캐시를 구독해 방금 저장한 기록을 stale 없이 바로 받는다.
        queryClient.invalidateQueries({
          queryKey: ["goal", "daily-record", userId],
        });
        navigate("/app/goal", {
          state: {
            dailyRecordSaved: {
              idealSusi: delta.idealSusi ?? 0,
              minSusi: delta.minSusi ?? 0,
            },
          },
        });
        return;
      }
      case "no-study-time":
        setBanner({
          tone: "info",
          message:
            "순공 시간이 아직 없어요. 대시보드 오늘의 목표 카드 또는 타이머에서 시간을 기록하세요.",
        });
        scrollToStudyTime();
        break;
      case "no-session":
        setBanner({ tone: "error", message: "로그인이 필요합니다." });
        break;
      case "not-allowed":
        setBanner({
          tone: "error",
          message: goalNotAllowedMessage(
            result.tenantReason,
            "이용권이 필요한 서비스입니다.",
          ),
        });
        break;
      case "not-active":
        setBanner({
          tone: "error",
          message: "목표관리 온보딩을 먼저 완료해 주세요.",
        });
        break;
      case "cooldown":
        // QA3 행305 — 폼을 보는 동안(로드 이후) 다른 탭·기기에서 먼저 제출해
        // 쿨다운이 걸린 경쟁 상태 방어. cooldown state를 갱신해 요약 패널로
        // 전환한다(재조회 없이 이 응답만으로 충분 — GET 재호출 안 함).
        setCooldown({
          active: true,
          submittedAt: result.submittedAt,
          unlocksAt: result.unlocksAt,
        });
        setBanner({
          tone: "info",
          message: result.unlocksAt
            ? `이미 오늘 기록을 제출했어요. 다시 기록 가능: ${formatCooldownUnlockLabel(result.unlocksAt)}`
            : "이미 오늘 기록을 제출했어요. 잠시 후 다시 시도해 주세요.",
        });
        break;
      default:
        setBanner({
          tone: "error",
          message: "기록 저장에 실패했어요. 잠시 후 다시 시도해 주세요.",
        });
    }
  };

  return (
    <>
      <GoalPageHeader
        title="오늘의 공부 기록"
        meta={formatTodayDateMeta()}
        subcopy="하루를 마감하며 기록하면 달성률과 리포트에 반영됩니다."
      />
      <div className="max-w-goal-content flex flex-col gap-5 px-4 pb-24 md:px-12">
        {cooldown?.active ? (
          // QA3 행305 — 12시간 쿨다운 중에는 입력 폼 대신 요약 패널만 보여준다.
          // 폼은 잠금 해제(다음 날) 후 빈 상태로 다시 나타난다 — 여기서는 아예
          // 렌더하지 않는다(disabled 처리가 아니라 폼 자체를 감춘다).
          <RecordCooldownSummary
            cooldown={cooldown}
            summary={summary}
            tomorrowTargets={tomorrowTargets}
          />
        ) : (
          <>
            <div
              ref={studyTimeRef}
              className={`rounded-2xl transition-shadow ${highlightStudyTime ? "ring-2 ring-red-400" : ""}`}
            >
              <StudyTimeSection
                rows={studySubjectTimes}
                totalHours={studyHours}
              />
            </div>

            {/* 섹션2·3 — 시안은 639×265 + 531×265 2열(part-09 §160~161, 639:531 ≈ 6:5) */}
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-[6fr_5fr]">
              <ConditionSection
                options={CONDITION_OPTIONS}
                value={condition}
                onChange={setCondition}
              />
              <ChipSelectSection
                title="방해 요인"
                options={DISTURBANCE_OPTIONS}
                selectedValues={disturbances}
                onToggle={toggleDisturbance}
              />
            </div>

            <ChipSelectSection
              title="오늘 완료한 핵심 학습 항목"
              options={STUDY_ITEM_OPTIONS}
              selectedValues={studyItems}
              onToggle={toggleStudyItem}
            />

            <RetrospectSection value={retrospect} onChange={setRetrospect} />

            <div className="flex justify-center pt-4">
              {/* 17px — 타입 스케일 밖 값, 디자인 결정 대기 중(card-title 1rem/section 1.25rem 중 미확정) */}
              <button
                type="button"
                disabled={!canSave || submitting}
                onClick={handleSave}
                className="flex h-18.25 w-full max-w-108.75 items-center justify-center rounded-2xl text-[1.0625rem] font-bold leading-[1.2] transition-colors disabled:cursor-not-allowed disabled:bg-surface-01 disabled:text-ink-sub enabled:bg-primary enabled:text-white"
              >
                {submitting ? "저장 중…" : "기록 저장하기"}
              </button>
            </div>
          </>
        )}
      </div>

      {/* 저장 결과 안내 — Onboarding.jsx의 fixed bottom 배너 패턴(submitError)을 그대로
          준용한다. success(초록)는 이 페이지 신규 톤이고, info/error는 기존 톤 그대로다. */}
      {banner && (
        <div
          role="alert"
          className={`fixed inset-x-0 bottom-8 z-55 mx-auto w-[calc(100%-2.5rem)] max-w-md rounded-xl border px-5 py-4 text-center text-app-body font-semibold shadow-[0_18px_45px_rgba(13,27,42,0.15)] ${
            banner.tone === "success"
              ? "border-green-200 bg-green-50 text-green-700"
              : banner.tone === "error"
                ? "border-red-200 bg-red-50 text-red-600"
                : "border-blue-200 bg-blue-50 text-blue-700"
          }`}
        >
          {banner.message}
        </div>
      )}
    </>
  );
}
