import { CARD, CARD_TITLE, SUB_TILE } from "./cardStyles";

// 리포트 구성(3부 37항목)은 명세 고정값이라 서버 응답에 없다. 문항 수만 응답에서 받는다.
export default function GuideCard({
  questionCount,
}: {
  questionCount: number;
}) {
  return (
    <section className={CARD}>
      <h2 className={CARD_TITLE}>무엇을 묻고 무엇이 나오는지</h2>
      <div className="mt-4 flex gap-3">
        <div className={`${SUB_TILE} flex-1`}>
          <p className="text-app-caption text-ink-sub">묻는 것</p>
          <p className="mt-1 text-app-body font-semibold text-ink-strong">
            학생 조사 {questionCount}문항, 현재 학년, 성적
          </p>
        </div>
        <div className={`${SUB_TILE} flex-1`}>
          <p className="text-app-caption text-ink-sub">나오는 것</p>
          <p className="mt-1 text-app-body font-semibold text-ink-strong">
            리포트 3부 37항목, 실행계획
          </p>
        </div>
      </div>
    </section>
  );
}
