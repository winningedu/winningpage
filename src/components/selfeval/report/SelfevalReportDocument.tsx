// 자기평가서 리포트 문서(표지 + 01~05장, 명세 No.133, 171). 값은 전부 payload 에서 읽고 학생명만 계정에서 받는다
// (No.90, 134, payload 에는 이름이 없다). 화면과 인쇄(A4 PDF)가 같은 문서를 쓴다.
// 04장은 확인한 수기 메모가 없으면 그리지 않고 목차에 해당 없음을 적는다(No.162, 198).
import { REPORT_COVER_PRESETS } from "@/components/report/coverPresets";
import ReportCoverPage from "@/components/report/ReportCoverPage";
import { Button } from "@/components/ui/button";
import { site } from "@/config/site";
import type { ReportPayload } from "@/lib/selfeval/reportTypes";
import ReportCh01 from "./ReportCh01";
import ReportCh02 from "./ReportCh02";
import ReportCh03 from "./ReportCh03";
import ReportCh04 from "./ReportCh04";
import ReportCh05 from "./ReportCh05";
import ReportChapterFrame from "./ReportChapterFrame";
import {
  ch01Intro,
  ch01SummaryLine,
  coverInfoItems,
  filledSteps,
} from "./reportFormat";

const TITLES = REPORT_COVER_PRESETS.selfevalReport.areas as readonly string[];
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
  const { cover, ch04 } = payload;
  const footer = [studentName, cover.subjectTitle].filter(Boolean).join(", ");
  // 쪽수는 표지가 1쪽이고 그려진 장 순서대로 이어진다.
  let page = 1;
  const nextPage = () => {
    page += 1;
    return page;
  };

  return (
    <div className="flex flex-col gap-6 print:gap-0">
      {(payload.composeMissing || payload.composePartial) && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface-info px-4 py-3 text-app-label text-ink-strong print:hidden"
        >
          <p>
            {payload.composeMissing
              ? "설명 문장을 만들지 못해 비워 두었어요."
              : "일부 설명 문장을 만들지 못해 비워 두었어요."}
          </p>
          <Button type="button" variant="outline" onClick={onRebuild}>
            다시 만들기
          </Button>
        </div>
      )}
      <ReportCoverPage
        kind="selfevalReport"
        variant="screen"
        title={cover.subjectTitle}
        tagline="근거 연계 리포트 포함"
        infoItems={coverInfoItems(cover, studentName)}
        areaNotes={ch04 ? {} : { 3: NOT_APPLICABLE }}
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
        intro={`올해(${cover.academicYear}학년도) 제출한 수행평가, 심화탐구 보고서 전체와, 각 보고서가 자기평가에 얼마나 반영됐는지 보여줍니다.`}
        page={nextPage()}
        footer={footer}
      >
        <ReportCh02 ch={payload.ch02} />
      </ReportChapterFrame>
      <ReportChapterFrame
        no="03"
        title={TITLES[2] as string}
        intro="이미 제출한 보고서의 내용이 자기평가에서 어떻게 이어지고(계승), 깊어지고(심화), 새로 더해졌는지(보완) 정리했습니다."
        page={nextPage()}
        footer={footer}
      >
        <ReportCh03 ch={payload.ch03} />
      </ReportChapterFrame>
      {ch04 && (
        <ReportChapterFrame
          no="04"
          title={TITLES[3] as string}
          intro="자기평가 작성 시 학생이 직접 올린 수행 과정 메모(손글씨는 글자 인식 후 학생 확인)가 자기평가의 어느 문장과 이어지는지 1~2줄로 설명합니다."
          page={nextPage()}
          footer={footer}
        >
          <ReportCh04 ch={ch04} />
        </ReportChapterFrame>
      )}
      <ReportChapterFrame
        no="05"
        title={TITLES[4] as string}
        intro={`이번 자기평가가 ${site.brandName} 6단계 과정 안에서 어떻게 쌓여 왔는지 한눈에 정리했습니다.`}
        page={nextPage()}
        footer={footer}
      >
        <ReportCh05 ch={payload.ch05} />
      </ReportChapterFrame>
    </div>
  );
}
