import type { ComponentType } from "react";
import KnowledgeWritingGuide from "@/pages/admin/knowledge/KnowledgeWritingGuide";
import { formatLastReviewed } from "@/pages/admin/knowledge/reviewCycle";
import { contentLengthHelp } from "@/pages/admin/knowledge/writingGuide";
import type { FieldOption } from "@/pages/admin/shared/csvExport";

interface WinningColumn {
  key: string;
  label: string;
  type?: "boolean" | "date";
  // 표 셀 전용 렌더(AdminEngine column.render). CSV 는 type 으로만 포맷한다.
  render?: (row: Record<string, unknown>) => string;
}

interface WinningField {
  key: string;
  label: string;
  type: "radioBoolean" | "select" | "text" | "textarea" | "number";
  required?: boolean;
  options?: FieldOption[];
  // 폼 값에 따라 안내 문구만 바꾼다(AdminEngine field.resolve).
  resolve?: (form: Record<string, unknown>) => { help: string };
}

interface WinningCrudConfig {
  title: string;
  table: string;
  searchPlaceholder: string;
  order: string;
  excel?: boolean;
  // fixedValues: knowledge_type 컬럼처럼 폼에 노출하지 않고 항상 같은 값으로
  // 고정 저장하는 필드 — winning_assessment_knowledge_items 테이블을 4개
  // knowledge_type으로 나눠 쓰는 이 파일 전용 관용구다.
  fixedValues?: Record<string, unknown>;
  // knowledgeBulk: 목록 상단에 엑셀 일괄 등록 패널(KnowledgeBulkPanel)을 켠다.
  // fixedValues.knowledge_type 이 있는 지식 DB 메뉴에만 둔다.
  knowledgeBulk?: boolean;
  // knowledgeSearchPreview: 목록 상단에 검색 테스트(KnowledgeSearchPreview)를 켠다.
  knowledgeSearchPreview?: boolean;
  // knowledgeReview: 목록에 "검토 완료" 행 버튼과 "미검토만 보기" 필터를 켠다.
  // 테이블에 last_reviewed_at 컬럼이 있는 지식 DB 메뉴에만 둔다.
  knowledgeReview?: boolean;
  // FormIntro: 편집 폼 필드 위에 그리는 안내. 지식 DB 메뉴는 작성 안내를 둔다.
  FormIntro?: ComponentType;
  columns: WinningColumn[];
  fields: WinningField[];
  defaults: Record<string, unknown>;
}

// winningSetukDb/winningDeepReportDb: 아직 테이블이 없는 준비중 메뉴 — table/columns/fields가
// 없는 게 정상 형태다(comingSoon 전용 분기, Admin.jsx가 이 config를 만나면 안내문만 그린다).
interface WinningComingSoonConfig {
  title: string;
  comingSoon: true;
  description: string;
}

type WinningConfig = WinningCrudConfig | WinningComingSoonConfig;

// 지식 DB 두 메뉴의 "마지막 검토" 컬럼. 기록이 없는 행은 안내 문구를 보인다.
const LAST_REVIEWED_COLUMN: WinningColumn = {
  key: "last_reviewed_at",
  label: "마지막 검토",
  type: "date",
  render: (row) =>
    formatLastReviewed(row.last_reviewed_at as string | null | undefined),
};

// 지식 DB 내용 필드 옆 글자 수 안내.
const contentHelp = (form: Record<string, unknown>) => ({
  help: contentLengthHelp(form.content),
});

export const winningConfigs: Record<string, WinningConfig> = {
  winningSuhaengTopicDb: {
    title: "위닝 수행 주제 DB",
    table: "winning_assessment_knowledge_items",
    searchPlaceholder:
      "학년, 교과군, 진로, 주제 패턴명, 관련 자료를 검색하세요",
    order: "created_at",
    excel: true,
    fixedValues: { knowledge_type: "topic_pattern" },
    knowledgeBulk: true,
    knowledgeSearchPreview: true,
    knowledgeReview: true,
    FormIntro: KnowledgeWritingGuide,
    columns: [
      { key: "grade", label: "학년" },
      { key: "subject", label: "교과군" },
      { key: "career_field", label: "진로분야" },
      { key: "title", label: "주제 패턴명 / 관련 자료" },
      { key: "source", label: "출처" },
      { key: "is_active", label: "사용", type: "boolean" },
      { key: "created_at", label: "등록일", type: "date" },
      LAST_REVIEWED_COLUMN,
    ],
    fields: [
      {
        key: "is_active",
        label: "사용 여부",
        type: "radioBoolean",
        required: true,
      },
      {
        key: "grade",
        label: "학년",
        type: "select",
        options: ["고1", "고2", "고3", "공통", "전체", "확인 필요"],
        required: true,
      },
      {
        key: "subject",
        label: "교과군",
        type: "select",
        options: [
          "국어",
          "수학",
          "영어",
          "사회역사",
          "과학",
          "정보",
          "공통",
          "전체",
          "확인 필요",
        ],
        required: true,
      },
      { key: "career_field", label: "진로분야", type: "text" },
      {
        key: "title",
        label: "주제 패턴명 / 관련 자료",
        type: "text",
        required: true,
      },
      {
        key: "content",
        label: "주제 추천 패턴 내용",
        type: "textarea",
        required: true,
        resolve: contentHelp,
      },
      { key: "source", label: "출처", type: "text" },
      { key: "source_link", label: "출처 링크", type: "text" },
      {
        key: "memo",
        label: "메모",
        type: "textarea",
      },
    ],
    defaults: {
      is_active: true,
      grade: "확인 필요",
      subject: "확인 필요",
      knowledge_type: "topic_pattern",
      career_field: "",
      title: "",
      content: "",
      source: "선배 생기부 PDF / 내부 우수사례",
      source_link: "",
      memo: "",
    },
  },

  winningSuhaengResourceDb: {
    title: "위닝 수행 자료 DB",
    table: "winning_assessment_knowledge_items",
    searchPlaceholder:
      "학년, 교과군, 진로, 실제 자료명, 검색 키워드, 출처를 검색하세요",
    order: "created_at",
    excel: true,
    fixedValues: { knowledge_type: "verified_resource" },
    knowledgeBulk: true,
    knowledgeSearchPreview: true,
    knowledgeReview: true,
    FormIntro: KnowledgeWritingGuide,
    columns: [
      { key: "grade", label: "학년" },
      { key: "subject", label: "교과군" },
      { key: "career_field", label: "진로분야" },
      { key: "title", label: "실제 자료명 / 검색 키워드" },
      { key: "source", label: "저자·기관·링크·출처" },
      { key: "is_active", label: "사용", type: "boolean" },
      { key: "created_at", label: "등록일", type: "date" },
      LAST_REVIEWED_COLUMN,
    ],
    fields: [
      {
        key: "is_active",
        label: "사용 여부",
        type: "radioBoolean",
        required: true,
      },
      {
        key: "grade",
        label: "학년",
        type: "select",
        options: ["고1", "고2", "고3", "공통", "전체", "확인 필요"],
        required: true,
      },
      {
        key: "subject",
        label: "교과군",
        type: "select",
        options: [
          "국어",
          "수학",
          "영어",
          "사회역사",
          "과학",
          "정보",
          "공통",
          "전체",
          "확인 필요",
        ],
        required: true,
      },
      { key: "career_field", label: "진로분야", type: "text" },
      {
        key: "title",
        label: "실제 자료명 / 검색 키워드",
        type: "text",
        required: true,
      },
      {
        key: "content",
        label: "자료 핵심 내용 / 활용 방식 / 주의점",
        type: "textarea",
        required: true,
        resolve: contentHelp,
      },
      {
        key: "source",
        label: "저자·기관·링크·출처 정보",
        type: "text",
      },
      { key: "source_link", label: "출처 링크", type: "text" },
      { key: "memo", label: "메모", type: "textarea" },
    ],
    defaults: {
      is_active: true,
      grade: "확인 필요",
      subject: "확인 필요",
      knowledge_type: "verified_resource",
      career_field: "",
      title: "",
      content: "",
      source: "",
      source_link: "",
      memo: "",
    },
  },

  winningSetukDb: {
    title: "위닝 세특 DB",
    comingSoon: true,
    description:
      "추후 별도 Supabase와 연동 예정입니다. 현재는 메뉴명만 선반영했습니다.",
  },

  winningDeepReportDb: {
    title: "위닝 심화보고서 DB",
    comingSoon: true,
    description:
      "추후 별도 Supabase와 연동 예정입니다. 현재는 메뉴명만 선반영했습니다.",
  },

  winningBaseData: {
    title: "기초데이터추출",
    table: "winning_base_data",
    searchPlaceholder: "자료명을 검색하세요",
    order: "sort_order",
    excel: true,
    columns: [
      { key: "data_type", label: "자료구분" },
      { key: "title", label: "자료명" },
      { key: "source", label: "출처" },
      { key: "is_active", label: "사용", type: "boolean" },
    ],
    fields: [
      {
        key: "is_active",
        label: "사용 여부",
        type: "radioBoolean",
        required: true,
      },
      { key: "data_type", label: "자료구분", type: "text" },
      { key: "title", label: "자료명", type: "text", required: true },
      { key: "source", label: "출처", type: "text" },
      { key: "content", label: "내용", type: "textarea" },
      { key: "memo", label: "메모", type: "textarea" },
      { key: "sort_order", label: "순서", type: "number" },
    ],
    defaults: {
      is_active: true,
      data_type: "",
      title: "",
      content: "",
      source: "",
      sort_order: 1,
    },
  },

  winningDbInputs: {
    title: "위닝DB입력",
    table: "winning_db_inputs",
    searchPlaceholder: "입력 자료명을 검색하세요",
    order: "created_at",
    excel: true,
    columns: [
      { key: "input_type", label: "입력구분" },
      { key: "title", label: "자료명" },
      { key: "memo", label: "메모" },
      { key: "created_at", label: "등록일", type: "date" },
    ],
    fields: [
      { key: "input_type", label: "입력구분", type: "text" },
      { key: "title", label: "자료명", type: "text", required: true },
      { key: "raw_data", label: "원본 데이터", type: "textarea" },
      { key: "memo", label: "메모", type: "textarea" },
    ],
    defaults: { input_type: "", title: "", raw_data: "", memo: "" },
  },
};
