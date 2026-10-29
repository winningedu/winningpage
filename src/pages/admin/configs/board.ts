import { FAQ_CATEGORIES } from "@/data/faqCategories";
import { blocksToPlainText } from "@/lib/blockToPlainText";
import type { FieldOption } from "@/pages/admin/shared/csvExport";

interface BoardColumn {
  key: string;
  label: string;
  type?: "boolean" | "imageList" | "fileList" | "date" | "truncate";
}

interface BoardImageSpec {
  maxMB?: number;
}

interface BoardField {
  key: string;
  label: string;
  type:
    | "radioBoolean"
    | "text"
    | "select"
    | "checkbox"
    | "textarea"
    | "multiImage"
    | "multiFile"
    | "number"
    | "blockEditor";
  required?: boolean;
  readOnly?: boolean;
  options?: FieldOption[];
  accept?: string;
  folder?: string;
  compress?: boolean;
  imageSpec?: BoardImageSpec;
  placeholder?: string;
}

interface BoardCrudConfig {
  title: string;
  table: string;
  searchPlaceholder?: string;
  order: string;
  orderBy?: [string, boolean][];
  homepage?: boolean;
  noCreate?: boolean;
  guideText?: string;
  previewTitleKey?: string;
  previewLabel?: string;
  columns: BoardColumn[];
  fields: BoardField[];
  defaults: Record<string, unknown>;
  rowToForm?: (row: Record<string, unknown>) => Record<string, unknown>;
  formToPayload?: (form: Record<string, unknown>) => Record<string, unknown>;
  validate?: (form: Record<string, unknown>) => string | null;
}

// learningDiagnosis: custom:true 도메인 컴포넌트(LearningDiagnosisAdmin, 다른 배치 소유)
// 전용 — columns/fields 없이 customComponentKey로만 연결된다.
interface BoardCustomConfig {
  title: string;
  custom: true;
  customComponentKey: string;
  searchPlaceholder: string;
}

type BoardConfig = BoardCrudConfig | BoardCustomConfig;

export const boardConfigs: Record<string, BoardConfig> = {
  notices: {
    title: "공지사항",
    table: "notices",
    searchPlaceholder: "공지사항 제목을 검색하세요",
    order: "sort_order",
    // 공개면(게시판)과 동일한 정렬을 어드민 목록에도 적용해 "보이는 순서 = 노출 순서"를 맞춘다
    orderBy: [
      ["is_pinned", false],
      ["sort_order", true],
      ["created_at", false],
    ],
    homepage: true,
    columns: [
      { key: "title", label: "제목" },
      { key: "category", label: "메인 배지" },
      { key: "is_pinned", label: "중요(상단 고정)", type: "boolean" },
      { key: "image_urls", label: "본문 이미지", type: "imageList" },
      { key: "attachments", label: "첨부파일", type: "fileList" },
      { key: "is_active", label: "노출", type: "boolean" },
      { key: "created_at", label: "작성일", type: "date" },
      { key: "view_count", label: "조회수" },
    ],
    fields: [
      {
        key: "is_active",
        label: "노출 여부",
        type: "radioBoolean",
        required: true,
      },
      { key: "title", label: "제목", type: "text", required: true },
      {
        key: "category",
        label: "메인페이지 소식 배지",
        type: "select",
        options: ["보도자료", "파트너십", "공지"],
      },
      { key: "is_pinned", label: "중요(상단 고정)", type: "checkbox" },
      { key: "content", label: "내용", type: "textarea" },
      { key: "image_urls", label: "본문 이미지", type: "multiImage" },
      {
        key: "attachments",
        label: "첨부파일",
        type: "multiFile",
        accept:
          ".pdf,.hwp,.hwpx,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.png,.jpg,.jpeg",
      },
      { key: "sort_order", label: "순서", type: "number" },
      // 조회수는 공개면에서만 증가하는 값이라 원칙적으로 이 폼으로 편집하지 않는다
      // (saveRow의 delete payload.view_count 참고). 이 필드는 어드민이 명시적으로
      // 값을 강제 조정하려는 경우만을 위한 예외 통로다 — fields에 view_count가
      // 있는 표에 한해 saveRow가 그 값을 그대로 저장한다.
      { key: "view_count", label: "조회수 조정", type: "number" },
    ],
    defaults: {
      is_active: true,
      is_pinned: false,
      title: "",
      category: "",
      content: "",
      image_url: "",
      file_url: "",
      file_name: "",
      image_urls: [],
      attachments: [],
      sort_order: 1,
    },
  },

  companyNews: {
    title: "회사소식",
    table: "company_news",
    searchPlaceholder: "회사소식 제목을 검색하세요",
    order: "sort_order",
    // 공개면(게시판)과 동일한 정렬을 어드민 목록에도 적용해 "보이는 순서 = 노출 순서"를 맞춘다
    orderBy: [
      ["is_pinned", false],
      ["sort_order", true],
      ["created_at", false],
    ],
    homepage: true,
    guideText: `회사소식 페이지 하단 게시판과 메인 페이지 우측 미리보기에 함께 노출됩니다. 회사소개 상단 내용은 '세부 페이지 관리'의 company-intro 항목을 사용합니다.`,
    columns: [
      { key: "title", label: "제목" },
      { key: "category", label: "메인 배지" },
      { key: "is_pinned", label: "중요(상단 고정)", type: "boolean" },
      { key: "image_urls", label: "본문 이미지", type: "imageList" },
      { key: "attachments", label: "첨부파일", type: "fileList" },
      { key: "is_active", label: "노출", type: "boolean" },
      { key: "created_at", label: "작성일", type: "date" },
      { key: "view_count", label: "조회수" },
    ],
    fields: [
      {
        key: "is_active",
        label: "노출 여부",
        type: "radioBoolean",
        required: true,
      },
      { key: "title", label: "제목", type: "text", required: true },
      {
        key: "category",
        label: "메인페이지 소식 배지",
        type: "select",
        options: ["보도자료", "파트너십", "공지"],
      },
      { key: "is_pinned", label: "중요(상단 고정)", type: "checkbox" },
      { key: "content", label: "내용", type: "textarea" },
      { key: "image_urls", label: "본문 이미지", type: "multiImage" },
      {
        key: "attachments",
        label: "첨부파일",
        type: "multiFile",
        accept:
          ".pdf,.hwp,.hwpx,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.png,.jpg,.jpeg",
      },
      { key: "sort_order", label: "순서", type: "number" },
      // 조회수 강제 조정 예외 통로 — notices 설정의 동일 필드 주석 참고.
      { key: "view_count", label: "조회수 조정", type: "number" },
    ],
    defaults: {
      is_active: true,
      is_pinned: false,
      title: "",
      category: "",
      content: "",
      image_url: "",
      file_url: "",
      file_name: "",
      image_urls: [],
      attachments: [],
      sort_order: 1,
    },
  },

  galleries: {
    title: "교육칼럼",
    table: "galleries",
    searchPlaceholder: "교육칼럼 제목을 검색하세요",
    order: "created_at",
    homepage: true,
    guideText: `교육칼럼 썸네일 이미지: 1200px × 900px / 비율: 4:3 / 형식: JPG 또는 PNG / 권장 용량: 1~2MB 이하 / 목록 썸네일은 4:3 기준으로 중앙 크롭됩니다.`,
    columns: [
      { key: "title", label: "제목" },
      { key: "image_urls", label: "이미지", type: "imageList" },
      { key: "content", label: "본문", type: "truncate" },
      { key: "category", label: "카테고리" },
      { key: "is_featured", label: "인기", type: "boolean" },
      { key: "is_active", label: "노출", type: "boolean" },
      { key: "created_at", label: "작성일", type: "date" },
      { key: "view_count", label: "조회수" },
    ],
    fields: [
      {
        key: "is_active",
        label: "노출 여부",
        type: "radioBoolean",
        required: true,
      },
      { key: "title", label: "제목", type: "text", required: true },
      {
        key: "content",
        label: "본문",
        type: "blockEditor",
        required: true,
        folder: "column-body",
        compress: true,
        imageSpec: { maxMB: 3 },
      },
      { key: "image_urls", label: "이미지", type: "multiImage" },
      {
        key: "link_url",
        label: "연결주소",
        type: "text",
        placeholder: "https:// 로 시작하는 주소 또는 유튜브 링크",
      },
      {
        key: "category",
        label: "카테고리",
        type: "select",
        // = columnData.js COLUMN_CATEGORIES
        options: [
          "학습관리 방법",
          "수시 및 정시 전략",
          "특목고 입학",
          "해외 및 대학원",
          "입시제도 변화",
          "대학 입시 제로",
          "학생부•수행평가•세특",
        ],
      },
      { key: "is_featured", label: "이번주 인기 노출", type: "radioBoolean" },
      // 조회수 강제 조정 예외 통로 — notices 설정의 동일 필드 주석 참고.
      { key: "view_count", label: "조회수 조정", type: "number" },
    ],
    defaults: {
      is_active: true,
      title: "",
      content: "",
      image_url: "",
      image_urls: [],
      category: "학습관리 방법",
      is_featured: false,
    },
    // 연결주소는 비어 있거나 http(s):// 로 시작해야 한다(javascript: 등 차단).
    validate: (form) => {
      const linkUrl = String(form.link_url ?? "").trim();
      if (linkUrl && !/^https?:\/\//i.test(linkUrl)) {
        return "연결주소는 http:// 또는 https:// 로 시작해야 합니다.";
      }
      return null;
    },
    // ref pull(blockEditor)은 form.__blocks_<key>에 임시로 실린다 — 정본(content_json)과
    // 평문 미러(content)로 분리해 저장하고 임시 키는 페이로드에서 제거한다.
    formToPayload: (form) => {
      const { __blocks_content, ...rest } = form;
      const blocks = (__blocks_content as unknown[]) || [];
      return {
        ...rest,
        link_url: String(rest.link_url ?? "").trim() || null,
        content_json: { v: 1, editor: "blocknote@0.52.1", blocks },
        content: blocksToPlainText(blocks),
      };
    },
  },

  faqs: {
    title: "자주하는질문",
    table: "faqs",
    searchPlaceholder: "질문을 검색하세요",
    order: "sort_order",
    previewTitleKey: "question",
    previewLabel: "FAQ",
    columns: [
      { key: "category", label: "카테고리" },
      { key: "question", label: "질문" },
      { key: "answer", label: "답변", type: "truncate" },
      { key: "is_active", label: "노출", type: "boolean" },
    ],
    fields: [
      {
        key: "is_active",
        label: "노출 여부",
        type: "radioBoolean",
        required: true,
      },
      {
        key: "category",
        label: "카테고리",
        type: "select",
        options: FAQ_CATEGORIES,
      },
      { key: "question", label: "질문", type: "text", required: true },
      {
        key: "answer",
        label: "답변",
        type: "blockEditor",
        required: true,
        folder: "faq-body",
        compress: true,
        imageSpec: { maxMB: 3 },
      },
      { key: "sort_order", label: "순서", type: "number" },
    ],
    defaults: {
      is_active: true,
      category: "",
      question: "",
      answer: "",
      sort_order: 1,
    },
    // blockEditor(field.key='answer')는 initialContent를 form[`${field.key}_json`]에서 읽는다(관례).
    // 그런데 FAQ의 정본 컬럼명은 answer_json이 아니라 content_json(계약 §2)이라 이름이 어긋난다 —
    // 편집 진입 시 row.content_json을 answer_json으로 옮겨 관례 코드가 그대로 맞물리게 한다.
    rowToForm: (row) => ({ ...row, answer_json: row.content_json }),
    // ref pull(blockEditor)은 form.__blocks_<key>에 임시로 실린다 — 정본(content_json)과
    // 평문 미러(answer)로 분리해 저장하고 임시 키는 페이로드에서 제거한다.
    // 주의: 교육칼럼/합격사례 선례는 평문 미러 컬럼이 content지만 FAQ는 answer다.
    formToPayload: (form) => {
      const { __blocks_answer, answer_json, ...rest } = form;
      const blocks = (__blocks_answer as unknown[]) || [];
      return {
        ...rest,
        content_json: { v: 1, editor: "blocknote@0.52.1", blocks },
        answer: blocksToPlainText(blocks),
      };
    },
  },

  // 정본: sql/53_mentor_apply_faq_admin.sql. 공개 소비처는
  // src/components/mentorApply/MentorFaq.jsx이며, DB가 비어 있으면
  // src/data/mentorApply.js 상수로 폴백한다. 위 faqs(자주하는질문)와는
  // 완전히 별개 테이블 — /mentor-apply 페이지 전용 FAQ다.
  mentorApplyFaqs: {
    title: "멘토신청 FAQ",
    table: "mentor_apply_faqs",
    searchPlaceholder: "질문을 검색하세요",
    order: "sort_order",
    homepage: true,
    guideText: `답변은 서식 없는 평문이며 줄바꿈만 그대로 반영됩니다. 초기 답변 5개에 붙은 '[예시]'는 확정되지 않은 임시 문구라는 표식입니다 — 실제 문구로 교체하면서 '[예시]' 접두어도 함께 지워 주세요. 문항을 전부 지우면 공개 페이지는 코드에 내장된 기본 문구로 되돌아갑니다(빈 화면이 되지 않습니다). '공지'로 표시한 문항은 노출 순서와 무관하게 항상 맨 위에 모입니다.`,
    columns: [
      { key: "sort_order", label: "노출 순서" },
      { key: "question", label: "질문" },
      { key: "answer", label: "답변", type: "truncate" },
      { key: "is_active", label: "노출", type: "boolean" },
      { key: "is_notice", label: "공지", type: "boolean" },
    ],
    fields: [
      {
        key: "is_active",
        label: "노출 여부",
        type: "radioBoolean",
        required: true,
      },
      {
        key: "is_notice",
        label: "구분",
        type: "radioBoolean",
        required: true,
      },
      { key: "sort_order", label: "노출 순서", type: "number", required: true },
      { key: "question", label: "질문", type: "text", required: true },
      { key: "answer", label: "답변", type: "textarea" },
    ],
    defaults: {
      is_active: true,
      is_notice: false,
      sort_order: 1,
      question: "",
      answer: "",
    },
  },

  // 정본: sql/53_mentor_apply_faq_admin.sql. 공개 소비처는
  // src/components/mentorApply/MentorFaq.jsx의 FAQ 섹션 헤더이며, DB가
  // 비어 있으면 src/data/mentorApply.js 상수로 폴백한다. 키(copy_key)가
  // 정해져 있는 화면이라 행 추가는 막는다(noCreate) — 위 mentorApplyFaqs와
  // 짝을 이루지만 대상 테이블이 다르다.
  mentorApplyCopy: {
    title: "멘토신청 문구",
    table: "mentor_apply_copy",
    order: "sort_order",
    noCreate: true,
    homepage: true,
    guideText: `여기 값은 멘토신청 페이지 FAQ 섹션의 제목 영역에 그대로 나갑니다. 'FAQ 제목(앞부분)' 값 끝의 공백 1칸은 의도된 것입니다 — 지우면 공개 화면에서 뒷 단어와 붙어 '지원 전궁금한 점'으로 보입니다. 행을 삭제하면 해당 항목은 코드 내장 기본값으로 되돌아갑니다.`,
    columns: [
      { key: "label", label: "항목" },
      { key: "copy_value", label: "값" },
      { key: "copy_key", label: "키" },
    ],
    fields: [
      { key: "label", label: "항목", type: "text", readOnly: true },
      { key: "copy_key", label: "키", type: "text", readOnly: true },
      { key: "copy_value", label: "값", type: "text", required: true },
    ],
    defaults: {},
  },

  learningDiagnosis: {
    title: "학습진단 관리",
    custom: true,
    customComponentKey: "learningDiagnosis",
    searchPlaceholder: "",
  },

  // sql/72_learning_diagnosis_v2_survey_copy.sql — ver2 설문(renewalSurveyQuestions.js) 문항의
  // 표시 문구만 어드민화한 것. scoringId/optionCodes 등 채점 구조는 이 화면에 없다 — 있으면 안 된다
  // (라벨 문자열 1자 수정이 채점을 조용히 깨는 걸 막으려고 코드/문구를 애초에 분리했다).
  learningDiagnosisV2SurveyCopy: {
    title: "학습진단(ver2) 문항 문구",
    table: "learning_diagnosis_v2_survey_copy",
    order: "sort_order",
    noCreate: true,
    homepage: true,
    guideText: `여기 값은 서비스 > 학습진단 설문(문항 제목·안내문구·선택지·리커트 문장)에 그대로 나갑니다. 행을 삭제하면 해당 항목은 코드 내장 기본값으로 되돌아갑니다. 채점 방식(어떤 답이 몇 점인지, 어떤 서비스로 이어지는지)은 이 화면에서 바꿀 수 없습니다 — 문구만 바뀌고 채점은 그대로입니다.`,
    columns: [
      { key: "label", label: "항목" },
      { key: "copy_value", label: "값" },
      { key: "copy_key", label: "키" },
    ],
    fields: [
      { key: "label", label: "항목", type: "text", readOnly: true },
      { key: "copy_key", label: "키", type: "text", readOnly: true },
      { key: "copy_value", label: "값", type: "text", required: true },
    ],
    defaults: {},
  },
};
