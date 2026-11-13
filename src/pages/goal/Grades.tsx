import { useQuery } from "@tanstack/react-query";
import type { ComponentProps } from "react";
import { useEffect, useMemo, useState } from "react";
import GoalPageHeader from "@/components/goal/GoalPageHeader";
import AddMockExamGradeModal from "@/components/goal/modals/AddMockExamGradeModal";
import AddNaesinGradeModal from "@/components/goal/modals/AddNaesinGradeModal";
import GoalGaugeCard from "@/components/goal/report/GoalGaugeCard";
import GoalTable from "@/components/goal/report/GoalTable";
import { useAuth } from "@/context/AuthProvider";
import {
  addGoalGrade,
  deleteGoalGrade,
  type FetchGoalGradesResult,
  fetchGoalGrades,
  updateGoalGrade,
} from "@/lib/goalApi";
import {
  improvementDelta,
  latestKpi,
  mockBaselineRow,
  naesinBaselineRow,
  round1,
  toTableRows,
} from "@/lib/goalGrades";
import { goalStudentQueryOptions } from "@/lib/queryClient";
import { goalNotAllowedMessage } from "@/lib/tenantBlock";

// 성적 관리(#35) + 내신/모의고사 성적 추가 모달(#36, 4022:5216) — 실데이터 배선.
//
// 두 엔드포인트를 함께 쓴다:
//   - fetchGoalStudent()  기존(온보딩) — 목표 대학 컷(targets)과 온보딩 시점 베이스라인
//     성적(scores.convertedGrade/currentMogo)을 가져온다. 이 페이지가 새로 만드는 게 아니다.
//   - fetchGoalGrades()   신규(api/_routes/goal/grades.js) — 이 페이지에서 추가한 회차 기록 배열.
//
// mockGrades(옛 목업 데이터)는 더 이상 쓰지 않는다 — 이 페이지는 실데이터 전용이다.
//
// ── KPI 게이지 값 파생 규칙(판단 지점, 팀장 지시 "파생 가능한 것만") ─────────────
// - value/round: 기록된 회차가 있으면 최신 회차, 없으면 온보딩 베이스라인(scores.*)로 대체
//   (goalGrades.js latestKpi 참고 — 둘 다 실데이터라 fallback도 목업이 아니다).
// - delta: 비교 대상(직전 회차 또는 베이스라인)이 있을 때만 계산, 없으면 배지를 아예
//   렌더하지 않는다(GoalGaugeCard는 delta==null이면 배지를 그리지 않는다, 기존 구현).
// - targetLabel/remaining: targets.min.naesinCut(내신) / targets.ideal.jungsiCut(모의고사) —
//   시안(2910:3638)이 내신엔 "최소 목표", 모의고사엔 "이상 목표"를 쓰는 것과 동일한 짝짓기.
//   컷이 null(목표 대학 컷 미확보)이면 GoalGaugeCard가 마커·목표 텍스트를 생략한다(이번에
//   그 가드를 추가했다 — GoalGaugeCard.jsx 참고). 확률과 무관한 단순 뺄셈이라 calc를
//   쓰지 않는다.
// api/_routes/goal/grades.js 회차 레코드 shape.
type GradeRecord = {
  term: string;
  value: number;
  subjects?: Record<string, number | string>;
  [key: string]: unknown;
};

type GradesState =
  | { status: "loading" }
  | { status: "error" }
  | {
      status: "ready";
      targets: {
        min: { naesinCut?: number | null };
        ideal: { jungsiCut?: number | null };
      };
      scores: {
        convertedGrade?: number | null;
        lastNaesinExam?: string | null;
        currentMogo?: number | null;
        lastMogoExam?: string | null;
      };
      mockInput: Record<string, unknown> | null;
      naesinRecords: GradeRecord[];
      mockRecords: GradeRecord[];
    };

export default function Grades() {
  const [naesinModalOpen, setNaesinModalOpen] = useState(false);
  const [mockModalOpen, setMockModalOpen] = useState(false);
  // 수정 모드 대상 회차(성적관리 행322) — null이면 두 모달 모두 추가 모드. term을
  // 그대로 들고 있으면(레코드 전체가 아니라) 저장 사이 목록이 바뀌어도(다른 탭에서
  // 삭제 등) 항상 최신 레코드를 다시 찾을 수 있어 진부화된 값을 편집 폼에 띄울 일이 없다.
  const [editingNaesinTerm, setEditingNaesinTerm] = useState<string | null>(
    null,
  );
  const [editingMockTerm, setEditingMockTerm] = useState<string | null>(null);

  // 목표 대학 컷·온보딩 베이스라인은 ['goal','student', userId] 쿼리
  // 캐시(src/lib/queryClient.ts)를 그대로 구독한다 — goal 진입 시 미들웨어·
  // Dashboard.tsx가 이미 채워둔 응답을 재사용해 이 페이지 전용 재요청을 없앤다
  // (명세 B-3 §5, 캐시 키의 userId는 리뷰 C1). 회차 기록(fetchGoalGrades)은 이
  // 페이지 전용 데이터라 이번 배치 전환 대상이 아니다(계획서 B-3 범위는
  // fetchGoalStudent만) — 기존처럼 로컬 상태로 직접 조회한다.
  const { userId } = useAuth();
  const goalStudentQuery = useQuery(goalStudentQueryOptions(userId));
  const [gradesResult, setGradesResult] =
    useState<FetchGoalGradesResult | null>(null);

  useEffect(() => {
    let alive = true;

    fetchGoalGrades().then((result) => {
      if (alive) setGradesResult(result);
    });

    return () => {
      alive = false;
    };
  }, []);

  // 두 응답을 각자의 discriminated union 그대로 보관하지 않고 이 페이지가 바로 쓰는
  // 모양으로 한 번만 합친다 — 소비 지점이 이 컴포넌트 하나뿐이라 goalApi.js의 kind
  // 계약을 그대로 노출할 이유가 없다(Dashboard.jsx의 result 보관 방식과는 다른 이유:
  // 거긴 여러 매퍼가 같은 result를 나눠 쓴다).
  const state: GradesState = useMemo(() => {
    if (goalStudentQuery.isPending || gradesResult === null) {
      return { status: "loading" };
    }

    const studentResult = goalStudentQuery.data;

    if (
      !studentResult ||
      studentResult.kind !== "onboarded" ||
      gradesResult.kind !== "ok"
    ) {
      return { status: "error" };
    }

    // goalApi.ts의 GoalGradeRecord/GoalTargets는 export되지 않아(파일 소유권 제약)
    // 이 파일의 로컬 shape와 구조는 같지만 인덱스 시그니처가 없다 — 실제 데이터는
    // GradesState 계약을 그대로 만족하므로 여기서만 단언한다.
    return {
      status: "ready",
      targets: studentResult.student.targets,
      scores: studentResult.student.scores,
      mockInput: studentResult.student.mockInput,
      naesinRecords: gradesResult.naesinRecords,
      mockRecords: gradesResult.mockRecords,
    } as unknown as GradesState;
  }, [goalStudentQuery.isPending, goalStudentQuery.data, gradesResult]);

  // 목록(gradesResult)이 곧 정본이라 성공 응답의 records를 그대로 덮어쓴다 — 별도
  // invalidate/재조회 없이 addGoalGrade 저장 흐름과 동일한 방식(react-query를 쓰지 않는
  // 이 페이지 고유 데이터 소스, 상단 §5 주석 참고)을 update/delete에도 그대로 맞춘다.
  function applyRecords(type: "naesin" | "mock", records: unknown[]) {
    setGradesResult((prev) =>
      prev?.kind === "ok"
        ? {
            ...prev,
            [type === "naesin" ? "naesinRecords" : "mockRecords"]: records,
          }
        : prev,
    );
  }

  async function handleSaveGrade(
    type: "naesin" | "mock",
    entry: {
      term: string;
      enteredAt?: string;
      examDate?: string;
      subjects: Record<string, string>;
    },
  ) {
    // addGoalGrade의 JSDoc 계약은 subjects 4과목 키를 명시하지만, 두 모달(AddNaesinGradeModal/
    // AddMockExamGradeModal)이 넘기는 entry는 항상 그 4키를 가진 Record<string,string>이다 —
    // 형태는 같고 TS 표현만 다르다(MockExamCard.jsx/NaesinCard.jsx의 동일 캐스트 참고).
    const result = await addGoalGrade(
      type,
      entry as unknown as Parameters<typeof addGoalGrade>[1],
    );
    if (result.kind !== "success") {
      const detail =
        result.kind === "validation-error"
          ? result.detail
          : result.kind === "not-allowed"
            ? goalNotAllowedMessage(result.tenantReason, "이용권이 필요합니다.")
            : "저장에 실패했습니다. 다시 시도해 주세요.";
      return { ok: false, detail };
    }

    // 서버가 돌려준 갱신된 전체 회차 배열로 교체한다 — 재조회 왕복 없이 즉시 반영.
    applyRecords(type, result.records);
    return { ok: true };
  }

  async function handleUpdateGrade(
    type: "naesin" | "mock",
    originalTerm: string,
    entry: {
      term: string;
      enteredAt?: string;
      examDate?: string;
      subjects: Record<string, string>;
    },
  ) {
    const result = await updateGoalGrade(
      type,
      originalTerm,
      entry as unknown as Parameters<typeof updateGoalGrade>[2],
    );
    if (result.kind !== "success") {
      const detail =
        result.kind === "validation-error"
          ? result.detail
          : result.kind === "not-allowed"
            ? goalNotAllowedMessage(result.tenantReason, "이용권이 필요합니다.")
            : result.kind === "not-found"
              ? "이미 삭제된 회차입니다. 새로고침해 주세요."
              : "수정에 실패했습니다. 다시 시도해 주세요.";
      return { ok: false, detail };
    }

    applyRecords(type, result.records);
    return { ok: true };
  }

  async function handleDeleteGrade(type: "naesin" | "mock", term: string) {
    const result = await deleteGoalGrade(type, term);
    // 실패해도 이 페이지엔 토스트 인프라가 없어(에러 카피를 보여줄 자리가 모달 폼처럼
    // 없다) 조용히 무시한다 — 목록이 바뀌지 않으니 사용자가 다시 삭제를 눌러 재시도할 수
    // 있다(판단 지점, 별도 알림 UI는 이번 범위 밖).
    if (result.kind !== "success") {
      console.error("[Grades] 회차 삭제 실패:", result.kind);
      return;
    }
    applyRecords(type, result.records);
  }

  if (state.status !== "ready") {
    return (
      <>
        <GoalPageHeader
          title="성적 관리"
          subcopy="내신과 모의고사를 회차별로 기록하면 목표와의 격차가 자동 계산됩니다."
        />
        <div className="max-w-goal-content px-4 pb-24 md:px-12">
          <p className="text-app-body leading-[1.4] text-ink-sub">
            {state.status === "loading"
              ? "불러오는 중입니다…"
              : "성적 데이터를 불러오지 못했습니다. 새로고침해 주세요."}
          </p>
        </div>
      </>
    );
  }

  const { targets, scores, mockInput, naesinRecords, mockRecords } = state;

  // .find()는 항상 T | undefined를 돌려주므로(editingXxxTerm이 존재해도 배열에서 방금
  // 지워졌을 수 있음), exactOptionalPropertyTypes 아래서 모달 props로 안전하게 넘기려면
  // truthy 체크로 한 번 좁혀 둬야 한다(아래 JSX의 조건부 스프레드가 이 값에 의존).
  const editingNaesinRecord = editingNaesinTerm
    ? naesinRecords.find((record) => record.term === editingNaesinTerm)
    : undefined;
  const editingMockRecord = editingMockTerm
    ? mockRecords.find((record) => record.term === editingMockTerm)
    : undefined;

  const naesinKpi = latestKpi(naesinRecords, {
    fallbackValue: scores.convertedGrade,
    fallbackRound: scores.lastNaesinExam ?? undefined,
  });
  const mockKpi = latestKpi(mockRecords, {
    fallbackValue: scores.currentMogo,
    fallbackRound: scores.lastMogoExam ?? undefined,
  });

  // 컷(naesinCut/mockCut)과 현재값(naesinKpi.value/mockKpi.value)이 둘 다 있을 때만 격차를
  // 계산한다 — 값이 없는데 뺄셈을 하면 NaN이 그대로 화면에 노출된다(온보딩 직후 정시 컷이
  // 없는 awaiting_cuts류 학생 등 실제로 값이 비는 경로가 있다, api/_routes/goal/intake.js §9-Q1(b)).
  const naesinCut =
    targets.min.naesinCut != null && naesinKpi.value != null
      ? targets.min.naesinCut
      : null;
  const mockCut =
    targets.ideal.jungsiCut != null && mockKpi.value != null
      ? targets.ideal.jungsiCut
      : null;

  return (
    <>
      <GoalPageHeader
        title="성적 관리"
        subcopy="내신과 모의고사를 회차별로 기록하면 목표와의 격차가 자동 계산됩니다."
      />
      <div className="max-w-goal-content flex flex-col gap-8 px-4 pb-24 md:px-12">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <GoalGaugeCard
            label="내신"
            round={naesinKpi.round}
            // GoalGaugeCard.value는 number 필수 — 기록도 온보딩 베이스라인도 없으면 null이
            // 될 수 있는 기존 미처리 케이스다(고쳐 넣지 않고 타입만 통과, 보고 대상).
            value={naesinKpi.value!}
            unit="등급"
            delta={improvementDelta(naesinKpi.delta, true)}
            // exactOptionalPropertyTypes: 명시적 undefined를 못 받는 optional prop이라
            // 조건부 스프레드로 키 자체를 생략한다.
            {...(naesinCut != null
              ? {
                  targetLabel: `최소 목표 ${naesinCut} 등급`,
                  // naesinCut은 naesinKpi.value != null일 때만 만들어진다(위 계산부).
                  remaining: Math.max(0, round1(naesinKpi.value! - naesinCut)!),
                }
              : {})}
            lowerIsBetter
          />
          <GoalGaugeCard
            label="모의고사"
            round={mockKpi.round}
            // GoalGaugeCard.value는 number 필수 — 기록도 온보딩 베이스라인도 없으면 null이
            // 될 수 있는 기존 미처리 케이스다(고쳐 넣지 않고 타입만 통과, 보고 대상).
            value={mockKpi.value!}
            unit="백분위"
            delta={improvementDelta(mockKpi.delta, false)}
            // exactOptionalPropertyTypes: 명시적 undefined를 못 받는 optional prop이라
            // 조건부 스프레드로 키 자체를 생략한다.
            {...(mockCut != null
              ? {
                  targetLabel: `이상 목표 ${mockCut}`,
                  // mockCut은 mockKpi.value != null일 때만 만들어진다(위 계산부).
                  remaining: Math.max(0, round1(mockCut - mockKpi.value!)!),
                }
              : {})}
          />
        </div>

        <GoalTable
          title="내신・회차별 등급"
          baselineRow={naesinBaselineRow(scores.convertedGrade)}
          // GoalTable의 GoalTableRow는 미export라 여기서 컴포넌트 prop 타입으로 우회 단언한다.
          // exactOptionalPropertyTypes가 명시적 undefined 값을 막을 뿐 런타임 형태는 동일하다.
          rows={
            toTableRows(naesinRecords) as ComponentProps<
              typeof GoalTable
            >["rows"]
          }
          onAddRound={() => {
            setEditingNaesinTerm(null);
            setNaesinModalOpen(true);
          }}
          onEditRow={(term) => {
            setEditingNaesinTerm(term);
            setNaesinModalOpen(true);
          }}
          onDeleteRow={(term) => handleDeleteGrade("naesin", term)}
          lowerIsBetter={true}
        />
        <GoalTable
          title="모의고사・회차별 백분위"
          baselineRow={mockBaselineRow(scores.currentMogo, mockInput)}
          rows={
            toTableRows(mockRecords) as ComponentProps<typeof GoalTable>["rows"]
          }
          onAddRound={() => {
            setEditingMockTerm(null);
            setMockModalOpen(true);
          }}
          onEditRow={(term) => {
            setEditingMockTerm(term);
            setMockModalOpen(true);
          }}
          onDeleteRow={(term) => handleDeleteGrade("mock", term)}
          lowerIsBetter={false}
        />
      </div>

      <AddNaesinGradeModal
        open={naesinModalOpen}
        onClose={() => setNaesinModalOpen(false)}
        onSubmit={(entry) =>
          editingNaesinTerm
            ? handleUpdateGrade("naesin", editingNaesinTerm, entry)
            : handleSaveGrade("naesin", entry)
        }
        {...(editingNaesinRecord
          ? {
              initialEntry: editingNaesinRecord as unknown as NonNullable<
                ComponentProps<typeof AddNaesinGradeModal>["initialEntry"]
              >,
            }
          : {})}
      />
      <AddMockExamGradeModal
        open={mockModalOpen}
        onClose={() => setMockModalOpen(false)}
        onSubmit={(entry) =>
          editingMockTerm
            ? handleUpdateGrade("mock", editingMockTerm, entry)
            : handleSaveGrade("mock", entry)
        }
        {...(editingMockRecord
          ? {
              initialEntry: editingMockRecord as unknown as NonNullable<
                ComponentProps<typeof AddMockExamGradeModal>["initialEntry"]
              >,
            }
          : {})}
      />
    </>
  );
}
