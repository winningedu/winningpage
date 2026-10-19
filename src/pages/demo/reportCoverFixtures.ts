// 리포트 표지 실측 데모 샘플 값. 실제 호출부가 넘기는 형식(학년 원문, 날짜 표기, 제목 규칙)을
// 종류별로 그대로 흉내 낸다. 데모 전용 데이터다.
import type { ReportCoverKind } from "@/components/report/coverPresets";
import { formatGradeLabel } from "@/components/report/formatGradeLabel";
import type { ReportCoverInfoItem } from "@/components/report/ReportCoverPage";
import { site } from "@/config/site";

type CoverSample = {
  title: string;
  /** 학생 프로필에서 오는 학년 원문 */
  grade: string;
  /** 종류별 서비스가 쓰는 날짜 칸. 실제 페이지에 날짜가 없으면 null */
  date: { label: string; value: string } | null;
};

const SAMPLES: Record<ReportCoverKind, CoverSample> = {
  diagnosis: {
    title: `${site.brandName}\n학습진단 리포트`,
    grade: "고등학교 2학년",
    date: { label: "진단일", value: "2026-10-16" },
  },
  goalWeekly: {
    title: `${site.brandName}\n주간 성장 리포트`,
    grade: "고2",
    date: { label: "기간", value: "2026년 10월 2주차" },
  },
  goalMonthly: {
    title: `${site.brandName}\n월간 성장 리포트`,
    grade: "고2",
    date: { label: "기간", value: "2026년 10월" },
  },
  growth: {
    title: `${site.brandName}\n성장설계 리포트`,
    grade: "고2",
    date: { label: "발행일", value: "2026년 10월 14일" },
  },
  performance: {
    title: `${site.brandName}\n통합 설계 리포트`,
    grade: "고2",
    date: { label: "저장일", value: "2026.10.16" },
  },
  inquiryDesign: {
    title: `${site.brandName}\n심화탐구 설계 리포트`,
    grade: "고2",
    date: null,
  },
  inquiryFinal: {
    title: `${site.brandName}\n최종 심화탐구 리포트`,
    grade: "고2",
    date: { label: "확정일", value: "2026.10.16" },
  },
  inquiryRecord: {
    title: `${site.brandName}\n심화탐구 기록`,
    grade: "고2",
    date: null,
  },
  selfeval: {
    title: `${site.brandName}\n수학 자기평가서`,
    grade: "고2",
    date: { label: "저장일", value: "2026.10.16" },
  },
};

export type CoverFixtureOptions = {
  dropName: boolean;
  dropGrade: boolean;
  dropDate: boolean;
  longName: boolean;
  longTitle: boolean;
};

const NAME = "김민준";
const LONG_NAME = "남궁민준서연하윤지호예준도윤";
const LONG_TITLE_SUFFIX = " 종합 분석 및 맞춤 학습 설계 리포트";

export function buildCoverFixture(
  kind: ReportCoverKind,
  options: CoverFixtureOptions,
): { title: string; infoItems: ReportCoverInfoItem[] } {
  const sample = SAMPLES[kind];
  const [brandLine, titleLine] = sample.title.split("\n");
  const title = options.longTitle
    ? `${brandLine}\n${titleLine}${LONG_TITLE_SUFFIX}`
    : sample.title;

  const infoItems: ReportCoverInfoItem[] = [];
  if (!options.dropName) {
    infoItems.push({
      label: "학생명",
      value: options.longName ? LONG_NAME : NAME,
    });
  }
  if (!options.dropGrade) {
    infoItems.push({ label: "학년", value: formatGradeLabel(sample.grade) });
  }
  if (!options.dropDate && sample.date) {
    infoItems.push(sample.date);
  }
  return { title, infoItems };
}
