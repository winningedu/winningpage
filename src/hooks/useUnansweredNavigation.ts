import { useCallback, useEffect, useState } from "react";
// 완료 판정(getStepUnansweredCount)과 반드시 같은 술어를 써야 한다 — isAnswered 를 직접 쓰면
// requiredFields 미충족 문항이 "미완료지만 스크롤 대상은 없음"이 되어 CTA 가 죽은 버튼이 된다.
import { isQuestionAnswered } from "@/lib/renewalSurvey";

/**
 * 하단 CTA가 "미완료"일 때 클릭하면 첫 미응답 문항으로 스크롤 + 일시 하이라이트한다.
 * 문항 카드는 `id={`q-${question.id}`}` 앵커를 갖는다는 전제(QuestionCard 참고).
 *
 * requiredQuestions: 이 뷰의 완료 판정에 들어가는 문항 배열(optional 문항은 호출부에서 제외).
 * answers: 스텝/preview 공용 answers 맵.
 */
type SurveyQuestion = {
  id: string | number;
  title: string;
  [key: string]: unknown;
};

const HIGHLIGHT_AUTO_DISMISS_MS = 3000;

function useUnansweredNavigation(
  requiredQuestions: SurveyQuestion[],
  answers: Record<string | number, unknown> | null | undefined,
) {
  const [highlightedId, setHighlightedId] = useState<string | number | null>(
    null,
  );
  const [announcement, setAnnouncement] = useState("");

  // 하이라이트 중인 문항이 응답되면 즉시 해제한다(사용자가 답을 입력한 순간이 가장 자연스러운 해제 시점).
  useEffect(() => {
    if (highlightedId == null) return;
    const question = requiredQuestions.find(
      (item) => item.id === highlightedId,
    );
    if (question && isQuestionAnswered(question, answers?.[question.id])) {
      setHighlightedId(null);
    }
  }, [answers, highlightedId, requiredQuestions]);

  // 응답하지 않아도 3초 내외로 자동 해제한다(오류가 아니라 안내이므로 계속 남아있지 않는다).
  useEffect(() => {
    if (highlightedId == null) return undefined;
    const timer = setTimeout(
      () => setHighlightedId(null),
      HIGHLIGHT_AUTO_DISMISS_MS,
    );
    return () => clearTimeout(timer);
  }, [highlightedId]);

  const scrollToFirstUnanswered = useCallback(() => {
    const target = requiredQuestions.find(
      (question) => !isQuestionAnswered(question, answers?.[question.id]),
    );
    if (!target) return;

    setHighlightedId(target.id);
    // 같은 문항으로 다시 이동해도(연타) 스크린리더가 재안내하도록 매번 텍스트를 바꾼다
    // (보이지 않는 zero-width space 토글 — 시각/음성 내용에는 영향 없음).
    setAnnouncement(
      (prev) =>
        `${target.title} 문항에 응답해주세요.${prev.endsWith("​") ? "" : "​"}`,
    );

    const node = document.getElementById(`q-${target.id}`);
    if (!node) return;
    const prefersReducedMotion = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    node.scrollIntoView({
      behavior: prefersReducedMotion ? "auto" : "smooth",
      block: "center",
    });
  }, [requiredQuestions, answers]);

  return { highlightedId, announcement, scrollToFirstUnanswered };
}
