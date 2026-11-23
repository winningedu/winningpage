// 자기평가서 리포트 문서(표지 + 01~05장, 명세 No.133, 171). 값은 전부 payload 에서 읽고 학생명만 계정에서 받는다
// (No.90, 134, payload 에는 이름이 없다). 화면과 인쇄(A4 PDF)가 같은 문서를 쓴다.
// 04장은 확인한 수기 메모가 없으면 그리지 않고 목차에 해당 없음을 적는다(No.162, 198).
import { REPORT_COVER_PRESETS } from "@/components/report/coverPresets";
import ReportCoverPage from "@/components/report/ReportCoverPage";
import type { ReportPayload } from "@/lib/selfeval/reportTypes";
import ReportCh01 from "./ReportCh01";
import ReportChapterFrame from "./ReportChapterFrame";
import {
  ch01Intro,
  ch01SummaryLine,
  coverInfoItems,
  filledSteps,
} from "./reportFormat";

const TITLES = REPORT_COVER_PRESETS.selfevalReport.areas;
const NOT_APPLICABLE = "해당 없음";

type Props = {
  payload: ReportPayload;
  /** 계정에서 읽은 이름. 없으면 이름 칸과 바닥글 이름을 그리지 않는다. */
  studentName: string | null;
  /** 설명 칸이 비었을 때 다시 만들기(No.201). */
  onRebuild: () => void;
};

export default function SelfevalReportDocument({
  payload,
  studentName,
  onRebuild,
}: Props) {
  const { cover } = payload;
  const hasMemos = payload.ch04 !== null;
  const footer = [studentName, cover.subjectTitle].filter(Boolean).join(", ");
  // 쪽수는 표지가 1쪽이고 그려진 장 순서대로 이어진다.
  let page = 1;
  const nextPage = () => {
    page += 1;
    return page;
  };

  return (
    <div className="flex flex-col gap-6 print:gap-0">
      <ReportCoverPage
        kind="selfevalReport"
        variant="screen"
        title={cover.subjectTitle}
        tagline="근거 연계 리포트 포함"
        infoItems={coverInfoItems(cover, studentName)}
        areaNotes={hasMemos ? undefined : { 3: NOT_APPLICABLE }}
        filledSteps={filledSteps(cover)}
      />
      <ReportChapterFrame
        no="01"
        title={TITLES[0] as string}
        intro={ch01Intro(payload.ch01.targetChars)}
        page={nextPage()}
        footer={footer}
      >
        <ReportCh01
          ch={payload.ch01}
          title={cover.subjectTitle}
          summaryLine={ch01SummaryLine(cover.subjectTitle, payload.ch01)}
        />
      </ReportChapterFrame>
      <ReportChapterFrame
        no="02"
        title={TITLES[1] as string}
        intro=""
        page={nextPage()}
        footer={footer}
      >
        {null}
      </ReportChapterFrame>
      <ReportChapterFrame
        no="03"
        title={TITLES[2] as string}
        intro=""
        page={nextPage()}
        footer={footer}
      >
        {null}
      </ReportChapterFrame>
      {hasMemos && (
        <ReportChapterFrame
          no="04"
          title={TITLES[3] as string}
          intro=""
          page={nextPage()}
          footer={footer}
        >
          {null}
        </ReportChapterFrame>
      )}
      <ReportChapterFrame
        no="05"
        title={TITLES[4] as string}
        intro=""
        page={nextPage()}
        footer={footer}
      >
        {onRebuild && null}
      </ReportChapterFrame>
    </div>
  );
}
