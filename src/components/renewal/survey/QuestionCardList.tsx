import {
  GRADE_SYSTEM_INPUT_RULES,
  getOptionCode,
} from "@/data/renewalSurveyQuestions";
import { surveyEmbeddedByParent } from "@/lib/renewalSurvey";
import AnswerField from "./AnswerField";
import type { CascadeLevel } from "./CascadingSelect";
import EmbeddedField from "./EmbeddedField";
import type { GradeGroup, GradeInputRule } from "./GradeInputGrid";
import QuestionCard from "./QuestionCard";

type SurveyQuestion = {
  id: string;
  number?: number;
  category?: string;
  title?: string;
  helper?: string;
  type?: string;
  maxSelect?: number;
  extra?: {
    validationDependsOn?: string;
    statements?: Array<
      string | { key?: string; id?: string; text?: string; label?: string }
    >;
    scale?: string[];
    groups?: GradeGroup[];
    levels?: CascadeLevel[];
    placeholder?: string;
  };
  [key: string]: unknown;
};

type Answers = Record<string, unknown>;

type QuestionCardListProps = {
  questions: SurveyQuestion[];
  answers: Answers;
  onAnswer: (questionId: string, value: unknown) => void;
  // exactOptionalPropertyTypes 대응: 호출부가 옵셔널 필드를 그대로 넘긴다.
  highlightedId?: string | number | null | undefined;
  cascadeLevels?: CascadeLevel[] | undefined;
};

/**
 * 카드 스택 gap 40. 스텝 페이지는 getStepQuestions(step) 결과를,
 * preview 는 17문항 전부를 넘긴다 — 렌더 코드는 한 벌뿐이다.
 *
 * `highlightedId`는 하단 CTA의 "미완료" 클릭으로 스크롤된 첫 미응답 문항 id
 * (useUnansweredNavigation) — 해당 카드에만 일시 하이라이트를 켠다.
 */

/**
 * 형제 문항 응답에 종속된 입력 규격을 해석한다(명세 §3.4 · §6.3 B-12).
 *
 * q6(성적 입력)의 마스크·범위·표시 칸은 q4(등급 체계)가 정하는데, AnswerField 는 `{question,value,onChange}`
 * 만 받아 형제 응답을 볼 수 없다. answers 전체를 가진 곳은 이 컴포넌트뿐이므로 여기서 규격 1개로 접어
 * `constraint` prop 하나만 내린다 — answers 전체를 하위로 뿌리면 무관한 응답 변경마다 입력칸이 리렌더된다.
 * q4 미응답·미지 라벨은 UNKNOWN(= 9등급제와 동일 규격, 채점은 값 무시)으로 떨어진다.
 */
function resolveConstraint(
  question: SurveyQuestion,
  answers: Answers,
): GradeInputRule | undefined {
  const dependsOn = question.extra?.validationDependsOn;
  if (!dependsOn) return undefined;
  const code = getOptionCode(dependsOn, answers?.[dependsOn]);
  // code가 null이면 기존에도 인덱싱이 매치되지 않아 UNKNOWN으로 폴백되던 것과 동일한 동작.
  return code == null
    ? GRADE_SYSTEM_INPUT_RULES.UNKNOWN
    : (GRADE_SYSTEM_INPUT_RULES[code] ?? GRADE_SYSTEM_INPUT_RULES.UNKNOWN);
}

// cascadeLevels: q15(cascade 타입) 전용 fetch 상태(options/loading/error) — SurveyStepShell 의
// useAdmissionCascade 가 소유하고 여기를 거쳐 AnswerField 로 내려간다(B-1 확정). 다른 문항 타입은
// 이 prop 을 받지 않는다 — AnswerField 가 question.type === 'cascade' 일 때만 소비한다.
function QuestionCardList({
  questions,
  answers,
  onAnswer,
  highlightedId,
  cascadeLevels,
}: QuestionCardListProps) {
  return (
    <div className="flex w-full flex-col items-start gap-10">
      {questions.map((question) => {
        const value = answers[question.id];
        const children = surveyEmbeddedByParent[question.id] || [];
        const selectedCount = Array.isArray(value) ? value.length : 0;
        const constraint = resolveConstraint(question, answers);
        const highlighted = question.id === highlightedId;

        return (
          <QuestionCard
            key={question.id}
            number={question.number}
            category={question.category}
            title={question.title}
            helper={question.helper}
            maxSelect={question.maxSelect}
            selectedCount={selectedCount}
            questionId={question.id}
            highlighted={highlighted}
          >
            <AnswerField
              question={question}
              value={value}
              constraint={constraint}
              highlighted={highlighted}
              cascadeLevels={
                question.type === "cascade" ? cascadeLevels : undefined
              }
              onChange={(nextValue) => onAnswer(question.id, nextValue)}
            />

            {/* 1차 스펙은 무분기 — 하위 블록은 부모 응답 여부와 무관하게 항상 노출한다.
                시안 1889:8893 선택지 컨테이너와 같은 컬럼 · gap 12 · 구분선 없음. */}
            {children.length > 0 && (
              <div className="flex w-full flex-col items-start gap-3">
                {children.map((embedded) => (
                  <EmbeddedField
                    key={embedded.id}
                    question={embedded}
                    value={answers[embedded.id]}
                    onChange={(nextValue) => onAnswer(embedded.id, nextValue)}
                  />
                ))}
              </div>
            )}
          </QuestionCard>
        );
      })}
    </div>
  );
}
