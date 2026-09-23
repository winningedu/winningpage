import PriorityTable from "./PriorityTable";
import RadarChart6 from "./RadarChart6";
import ReportSection from "./ReportSection";
import ReportSheetA4 from "./ReportSheetA4";
import StudentInfoBlock from "./StudentInfoBlock";
import SummaryCards from "./SummaryCards";
import TraitNarratives from "./TraitNarratives";

type LearningAxis = {
  name: string;
  score: number;
  tone?: string;
  area?: string;
  badge?: string;
  status?: string;
  need?: string;
};

type ReportPageOneData = {
  student: {
    nameLine?: string;
    name?: string;
    grade?: string;
    schoolType?: string;
    desiredMajor?: string;
    /** 표지(ReportCoverPage) 전용 원본값 — "미입력" 표시용 폴백을 거치지 않는다
     * (diagnosisReport.ts 주석 참고). */
    desiredMajorRaw?: string | null;
    gpa?: string;
    gradeTrend?: string;
    diagnosedAt?: string;
    diagnosedAtRaw?: string | null;
    [key: string]: unknown;
  };
  headlineLines: string[];
  learningAxes: LearningAxis[];
  summaryCards: Array<{ label: string; value?: string; sub?: string }>;
  traits: Array<{ title: string; body: string }>;
  traitsHeading?: string;
  urgency?: {
    level?: string;
    levelLabel?: string | null;
    score?: number;
    lowAreaCount?: number;
    areaThreshold?: number | string;
    message?: string | null;
  };
  notices?: {
    traitIntro?: string | null;
    hexCaption?: string | null;
    goalCompare?: string | null;
    reportBasis?: string | null;
    reportLimit?: string | null;
    probNote?: string | null;
    admissionNote?: string | null;
    serviceLimit?: string | null;
    skipNote?: string | null;
    sincerityBanner?: string | null;
    sincerityAct?: string | null;
  };
  typeDetail?: string | null;
};

type ReportPageOneProps = {
  data: ReportPageOneData;
  // ReportSheetA4 totalPages 계약(2026-08-21) — 부록 렌더 여부(hasReportExtras)로
  // FreeDiagnosisReport 가 한 번만 계산해 전 시트·부록 페이지에 동일한 값을 내려보낸다.
  totalPages: number;
};

// 결과 리포트 1페이지(A4-3) — 헤드라인+레이더 / 학생 기본정보 / 주요 학습 특성 섹션
// (§타이틀 → 요약 카드 3장 → 우선순위 표 6행 → 서술 3블록).
// 전 섹션 static 카피 없음 — data prop 하나에서 하향 주입(props 계약 준수).
export default function ReportPageOne({
  data,
  totalPages,
}: ReportPageOneProps) {
  const {
    student,
    headlineLines,
    learningAxes,
    summaryCards,
    traits,
    traitsHeading,
    urgency,
    notices,
    typeDetail,
  } = data;

  // 우선순위 표 = 학습 6축을 점수 오름차순 정렬(정렬 결과가 곧 시안 행 순서와 일치).
  const priorityRows = [...learningAxes].sort((a, b) => a.score - b.score);
  // 섹션 제목은 buildReport 가 문구집 템플릿(section_traits)으로 완성해 내린다 — 이름 미수집(Q-01)
  // 시 '{name} 학생의' 접두를 제거한 축약형까지 거기서 결정한다(§5.2). 여기서 조립하면 폴백이
  // 두 곳이 되어 한쪽만 고쳐진다.

  return (
    <ReportSheetA4 page={1} totalPages={totalPages}>
      {/*
        R3(2026-08-11) — 데스크톱은 헤드라인 옆에 레이더를 절대배치로 겹쳐 올리는 2단 구성이다.
        모바일은 겹칠 폭이 없으므로 relative/absolute 를 끄고 세로로 쌓는다(헤드라인 → 레이더).
      */}
      {/* fd-headline 자체 마진(구 mt-6 lg:mt-11.5) 제거(2026-08-21) — 라벨→첫 콘텐츠 간격은
          이제 ReportSheetA4가 소유한다(46px 캐노니컬, ReportSheetA4.tsx 주석 참고). 이 값과
          우연히 같았을 뿐 이중 소유였다. */}
      <div className="relative">
        <p className="fd-headline w-full text-[1.5rem] font-semibold leading-[1.4] tracking-[-0.02rem] text-ink lg:w-143.5 lg:text-[2rem] lg:tracking-[-0.04rem]">
          {headlineLines.map((line, index) => (
            <span key={line}>
              {line}
              {index < headlineLines.length - 1 && <br />}
            </span>
          ))}
        </p>

        {/*
          F-03 배선(2026-08-13) — TYPE_COPY.detail(유형별 상세 설명 1문단)을 헤드라인 바로 아래에
          화면 전용(fd-screen-only)으로 싣는다. head 의 부연이라 다른 자리가 없고, 데스크톱에서
          헤드라인 오른쪽은 절대배치 레이더가 차지해 이 아래로 약 20rem 의 화면 전용 여백이 비어
          있다(레이더는 flow 에 기여하지 않는다). 폭은 헤드라인과 같은 lg:w-143.5 재사용,
          fd-screen-only 라 인쇄 훅 불필요. typeDetail 이 null(판정 불가·직선응답)이면 접힌다.
        */}
        {typeDetail && (
          <p className="fd-screen-only mt-4 w-full break-keep text-base leading-normal text-ink-sub lg:mt-5 lg:w-143.5">
            {typeDetail}
          </p>
        )}

        {/* fd-radar-overlay — 인쇄 훅(BLOCK 수정). 데스크톱은 헤드라인 옆에 레이더를
            절대배치로 겹쳐 올리는 2단 구성이다; 인쇄에서 lg: 가 꺼지면 모바일처럼 세로로
            쌓여 헤드라인 블록 높이만큼 페이지가 더 길어진다. report-print.css 가 기존
            lg: 리터럴과 동일한 값(35.875rem/2.5625rem)으로 강제한다. */}
        <RadarChart6
          axes={learningAxes}
          className="fd-radar-overlay relative mx-auto mt-6 lg:absolute lg:left-[30.4375rem] lg:-top-[2.4375rem] lg:mx-0 lg:mt-0"
        />
      </div>

      {/*
        notices.hexCaption(F-05) — 레이더 범례.

        결정문은 "레이더가 절대배치라 flow 를 소비하지 않으니 캡션을 그 박스 안에 넣고 인쇄에도
        싣는다"였다. flow 계산은 맞지만 **겹침**을 빠뜨렸다 — 실측(1440 화면·794 인쇄 양쪽)에서
        절대배치 박스 안의 캡션이 아래 요약 카드 3장 위로 올라타 카드 테두리와 글자가 겹쳤다.
        레이더 하단(컨테이너 기준 27.5rem)과 요약 카드 상단 사이 여유가 1줄분도 없다.

        그래서 캡션만 flow 로 내리고 **화면 전용**으로 강등했다(결정문 가드레일이 지정한 폴백:
        "1px라도 줄면 fd-screen-only 로 강등한다"). 자리는 헤드라인 블록 바로 아래다 —
        모바일에서는 레이더가 flow 라 캡션이 정확히 차트 밑에 오고, 데스크톱에서는 차트와 같은
        가로 밴드 왼쪽에 놓인다. 폭은 헤드라인과 같은 값 재사용(새 매직넘버 아님).
        인쇄에서 display:none 이라 A4 2장은 그대로이고 별도 인쇄 훅도 필요 없다.
      */}
      {/* G-3(NIT 3) — 화면 전용 문단, 모바일 text-base(16px) · 데스크톱 기존 text-sm(14px) 유지. */}
      {notices?.hexCaption && (
        <p className="fd-screen-only mt-3 w-full break-keep text-base leading-[1.4] text-ink-sub lg:mt-4 lg:w-143.5 lg:text-sm">
          {notices.hexCaption}
        </p>
      )}

      <div className="fd-mt-student mt-8 lg:mt-16.75">
        <StudentInfoBlock student={student} />
      </div>

      {/* mt-12(2026-08-21) — 섹션 상단 마진 통일(완료 보고 표 근거)로 종전 mt-8 lg:mt-14.25
          대신 다른 섹션과 같은 값 하나 — print CSS의 fd-mt-traits-heading 강제 규칙도
          제거했다. traitsHeading(§타이틀)은 아래 SummaryCards·PriorityTable·TraitNarratives
          전부와 공용이라 이 ReportSection 하나가 그 묶음 전체를 감싼다. */}
      <ReportSection title={traitsHeading} className="mt-12">
        <SummaryCards cards={summaryCards} />

        {/*
          R3(2026-08-11) — urgency(§4.4 E)는 buildReport 가 이미 조립해 두고도 렌더 슬롯이 없어
          죽어 있던 값이다(diagnosisReport.js buildUrgency 주석 참고). "가장 시급한 영역" 카드
          바로 아래 각주로 붙인다 — 위 카드와 같은 화제(긴급도)를 다루면서도 경고성 문구라
          카드 자체보다 한 단계 낮은 위계(text-sm)로 분리한다.
        */}
        {/* WARN-2(2026-08-11) — 본문(#525252)과 동일 색이면 위계가 크기(14px)로만 구분돼
            약하다. #808080(대비 3.95:1)은 14px 본문 기준(WCAG AA ≥4.5:1)에 미달해 되돌린다 —
            StudentInfoBlock 모바일 라벨이 이미 쓰는 #6b6b6b(대비 ≈5.34:1)를 재사용한다
            (새 색상값 도입 아님, 팀리드 재조정 지시 2026-08-11). */}
        {urgency?.message && (
          <p className="fd-mt-urgency mt-3 text-sm leading-[1.4] text-ink-sub lg:mt-2">
            {urgency.message}
          </p>
        )}

        <div className="fd-mt-priority mt-8 lg:mt-15.75">
          <PriorityTable rows={priorityRows} />
        </div>

        {/*
          notices.goalCompare(F-05) — 이 문장이 설명하는 대상은 바로 위 표의 '현재 수준/목표 수준'
          열과 요약 카드의 '목표 75점'이다. 확장 영역으로 보내면 두 화면만큼 떨어져 연결이 끊긴다.
          인쇄에 넣지 않는 이유: 1페이지 flow 여유가 71.0px 뿐인데 이건 hexCaption 과 달리
          flow 요소라 그 여유를 직접 갉아먹는다(절대배치 공짜 공간이 없다).
        */}
        {/* G-3(NIT 3) — 화면 전용 문단, 모바일 text-base(16px) · 데스크톱 기존 text-sm(14px) 유지. */}
        {notices?.goalCompare && (
          <p className="fd-screen-only mt-3 break-keep text-base leading-[1.4] text-ink-sub lg:text-sm">
            {notices.goalCompare}
          </p>
        )}

        <div className="fd-mt-traits mt-10 lg:mt-23.5">
          {/* notices.traitIntro — TraitNarratives 3블록을 소개하는 리드 문장(§5.1 고정 안내).
              traitsHeading(§타이틀)은 SummaryCards·PriorityTable 과 공용이라 "특성 세 가지"를
              특정하지 않는다 — 이 블록 바로 위에서만 좁혀 소개한다. */}
          {/* WARN-2 — urgency.message 와 동일 사유로 #6b6b6b(대비 ≈5.34:1) 재사용. */}
          {notices?.traitIntro && (
            <p className="mb-3 text-sm leading-[1.4] text-ink-sub">
              {notices.traitIntro}
            </p>
          )}
          {/* exactOptionalPropertyTypes 대응 — undefined일 때 heading 키 생략(TraitNarratives 미수정 범위). */}
          <TraitNarratives
            items={traits}
            {...(traitsHeading !== undefined ? { heading: traitsHeading } : {})}
          />
        </div>
      </ReportSection>
    </ReportSheetA4>
  );
}
