import type { ComponentType } from "react";
import type { FieldOption } from "@/pages/admin/shared/csvExport";
import {
  MentorCardFormPreview,
  mentorFormToPayload,
  mentorFormValidate,
  mentorRowToForm,
} from "./mentorStrategiesForm";

// DB 저장값은 영문 키 그대로 유지하고 화면 표기만 한글로 바꾼다(다른 select 옵션과 동일 관례).
const PREMIUM_CONSULT_STATUS_OPTIONS: FieldOption[] = [
  { value: "new", label: "신규" },
  { value: "contacted", label: "연락함" },
  { value: "done", label: "완료" },
  { value: "cancelled", label: "취소" },
];

interface MainImageSpec {
  width?: number;
  height?: number;
  maxMB?: number;
  aspectOnly?: boolean;
}

interface MainColumn {
  key: string;
  label: string;
  type?: "image" | "date" | "datetime" | "boolean" | "imageList" | "truncate";
  showFileName?: boolean;
  options?: FieldOption[];
}

interface MainField {
  key: string;
  label: string;
  type:
    | "radioBoolean"
    | "text"
    | "checkbox"
    | "image"
    | "date"
    | "datetime"
    | "number"
    | "textarea"
    | "select"
    | "multiImage";
  required?: boolean;
  readOnly?: boolean;
  help?: string;
  hideUrlInput?: boolean;
  compress?: boolean;
  imageSpec?: MainImageSpec;
  folder?: string;
  cacheControl?: string;
  rows?: number;
  options?: FieldOption[];
  showIf?: (form: Record<string, unknown>) => boolean;
}

interface MainCrudConfig {
  title: string;
  table: string;
  searchPlaceholder: string;
  order: string;
  homepage?: boolean;
  noCreate?: boolean;
  rowCapWarning?: boolean;
  retentionNotice?: string;
  guideText?: string;
  // 목록 위 패널 슬롯 키(Admin.tsx LIST_SUMMARY_REGISTRY 조회).
  listSummaryKey?: string;
  // 엑셀 다운로드 버튼 노출(Admin.tsx 렌더부 config.excel 판정).
  excel?: boolean;
  // 개인정보 반출 게이트 대상(AdminConfig.sensitiveDownload 와 같은 뜻).
  sensitiveDownload?: boolean;
  // 저장 직전 재확인 문구(QA A13, 2026-08-27) — 값이 있으면 Admin.tsx saveRow 가
  // window.confirm 으로 한 번 더 묻고, 취소하면 저장하지 않는다.
  confirmBeforeSave?: string;
  columns: MainColumn[];
  fields: MainField[];
  defaults: Record<string, unknown>;
  rowToForm?: (row: Record<string, unknown>) => Record<string, unknown>;
  formToPayload?: (form: Record<string, unknown>) => Record<string, unknown>;
  validate?: (
    form: Record<string, unknown>,
    row?: Record<string, unknown> | null,
  ) => string | null;
  // FormPreview: AdminForm(AdminEngine.jsx)이 xl 화면 폭에서 폼 옆에 얹는 사이드 프리뷰
  // 컴포넌트. mentorStrategies 하나만 이 훅을 쓴다.
  FormPreview?: ComponentType<{
    form: Record<string, unknown>;
    onPatch: (patch: Record<string, unknown>) => void;
    locked?: boolean;
  }>;
}

// premiumBookPages: custom:true 도메인 컴포넌트(PremiumBookAdmin, 다른 배치 소유)가
// PDF 일괄 변환 패널 + 개별 페이지 CRUD(내부에서 AdminTable/AdminForm 재사용)를
// 함께 그린다 — columns/fields는 그 내부 제네릭 편집에 쓰인다.
interface MainCustomConfig
  extends Pick<MainCrudConfig, "columns" | "fields" | "defaults"> {
  title: string;
  table: string;
  searchPlaceholder: string;
  order: string;
  homepage: boolean;
  custom: true;
  customComponentKey: string;
  guideText?: string;
}

type MainConfig = MainCrudConfig | MainCustomConfig;

export const mainConfigs: Record<string, MainConfig> = {
  popups: {
    title: "팝업 관리",
    table: "popups",
    searchPlaceholder: "팝업 제목을 검색하세요",
    order: "sort_order",
    homepage: true,
    guideText: `PC 팝업 이미지: 900px × 1200px/ 비율: 3:4/ 형식: JPG 또는 PNG/ 권장 용량: 1~2MB 이하/ 모바일 팝업 이미지(선택): 실제 표시 폭 320px, 비율 3:4 기준 640px × 853px 권장(고밀도 화면 대응)/ 비워두면 PC 이미지가 그대로 축소 표시됨/ 동시 노출: 최대 3개(순서 오름차순 상위 3개만 노출)`,
    columns: [
      { key: "title", label: "제목" },
      { key: "image_url", label: "PC 이미지", type: "image" },
      { key: "mobile_image_url", label: "모바일 이미지", type: "image" },
      { key: "url", label: "URL" },
      { key: "start_date", label: "시작일", type: "date" },
      { key: "end_date", label: "종료일", type: "date" },
      { key: "sort_order", label: "순서" },
      { key: "is_active", label: "노출", type: "boolean" },
    ],
    fields: [
      { key: "is_active", label: "사용", type: "radioBoolean", required: true },
      { key: "title", label: "제목", type: "text", required: true },
      { key: "url", label: "URL", type: "text" },
      { key: "open_new_window", label: "새창으로열기", type: "checkbox" },
      { key: "image_url", label: "PC 이미지", type: "image" },
      { key: "mobile_image_url", label: "모바일 이미지", type: "image" },
      { key: "start_date", label: "시작일", type: "date" },
      { key: "end_date", label: "종료일", type: "date" },
      { key: "sort_order", label: "순서", type: "number" },
    ],
    defaults: {
      is_active: true,
      title: "",
      url: "",
      image_url: "",
      mobile_image_url: "",
      open_new_window: false,
      sort_order: 1,
    },
  },

  banners: {
    title: "배너 관리",
    table: "banners",
    searchPlaceholder: "배너 제목을 검색하세요",
    order: "sort_order",
    homepage: true,
    guideText: `활성 배너가 sort_order 순으로 캐러셀 자동 전환되며, 각 배너의 노출 시간(초)만큼 머뭅니다. 969×429px 통이미지(헤드라인·버튼 텍스트 포함)를 업로드하세요. 이동 URL을 입력하면 배너 전체가 클릭됩니다. 형식: JPG 또는 PNG / 2MB 이하`,
    columns: [
      { key: "image_url", label: "이미지", type: "image" },
      { key: "title", label: "제목" },
      { key: "button_link", label: "배너 클릭 시 이동 URL" },
      { key: "sort_order", label: "순서" },
      { key: "display_seconds", label: "노출 시간(초)" },
      { key: "is_active", label: "노출", type: "boolean" },
    ],
    fields: [
      {
        key: "is_active",
        label: "노출 여부",
        type: "radioBoolean",
        required: true,
      },
      { key: "title", label: "제목", type: "text", required: true },
      // 통이미지 전환으로 highlight/button_text 오버레이 입력은 제거.
      // button_link는 배너 전체 클릭 URL로 용도 변경 (HeroSection.jsx 참조)
      { key: "button_link", label: "배너 클릭 시 이동 URL", type: "text" },
      {
        key: "image_url",
        label: "배너 이미지",
        type: "image",
        compress: true,
        imageSpec: { width: 969, height: 429, maxMB: 2 },
        folder: "landing/hero",
        cacheControl: "31536000, immutable",
      },
      { key: "sort_order", label: "순서", type: "number" },
      {
        key: "display_seconds",
        label: "노출 시간(초)",
        type: "number",
        required: true,
      },
    ],
    defaults: {
      is_active: true,
      title: "",
      // highlight/button_text: 렌더되지 않는 레거시 컬럼 — NOT NULL 대비 빈 값만 유지
      highlight: "",
      button_text: "",
      button_link: "",
      image_url: "",
      sort_order: 1,
      display_seconds: 10,
    },
  },

  sideBanners: {
    title: "우측 소형 배너",
    table: "home_side_banners",
    searchPlaceholder: "배너 제목을 검색하세요",
    order: "sort_order",
    homepage: true,
    guideText: `PC 권장: 321px × 429px / 형식: PNG / 2MB 이하 / 여러 장 등록 시 각 배너의 노출 시간(초)만큼 머문 뒤 자동 전환되며 이미지 하단 인디케이터로 이동할 수 있습니다`,
    columns: [
      { key: "image_url", label: "PC 이미지", type: "image" },
      { key: "title", label: "제목" },
      { key: "subtitle", label: "설명" },
      { key: "link_url", label: "연결 주소" },
      { key: "sort_order", label: "순서" },
      { key: "display_seconds", label: "노출 시간(초)" },
      { key: "is_active", label: "노출", type: "boolean" },
    ],
    fields: [
      {
        key: "is_active",
        label: "노출 여부",
        type: "radioBoolean",
        required: true,
      },
      { key: "title", label: "제목", type: "text", required: true },
      { key: "subtitle", label: "설명", type: "textarea" },
      { key: "link_url", label: "연결 주소", type: "text" },
      { key: "open_new_window", label: "새창으로 열기", type: "checkbox" },
      {
        key: "image_url",
        label: "PC 이미지",
        type: "image",
        compress: true,
        imageSpec: { width: 321, height: 429, maxMB: 2 },
        folder: "landing/hero",
        cacheControl: "31536000, immutable",
      },
      {
        key: "mobile_image_url",
        label: "모바일 이미지",
        type: "image",
        help: "모바일(≤768px) 전용 — 없으면 PC 이미지 사용",
        imageSpec: { maxMB: 2 },
        folder: "landing/hero",
        cacheControl: "31536000, immutable",
      },
      { key: "start_date", label: "노출 시작일", type: "date" },
      { key: "end_date", label: "노출 종료일", type: "date" },
      { key: "sort_order", label: "순서", type: "number" },
      {
        key: "display_seconds",
        label: "노출 시간(초)",
        type: "number",
        required: true,
      },
    ],
    defaults: {
      is_active: true,
      title: "",
      subtitle: "",
      link_url: "",
      open_new_window: false,
      image_url: "",
      mobile_image_url: "",
      start_date: null,
      end_date: null,
      sort_order: 1,
      display_seconds: 5,
    },
  },

  universityAcceptances: {
    title: "합격생 대학 관리",
    table: "university_acceptances",
    listSummaryKey: "acceptanceCopyPanel",
    searchPlaceholder: "대학명을 검색하세요",
    order: "sort_order",
    homepage: true,
    guideText: `메인 화면 '합격생' 영역 카드입니다. 엠블럼: 정방형 200px 이상 권장, PNG(투명 배경) / 1MB 이하. 표시 문구는 학과·과정명을 입력하세요(예: 컴퓨터공학과, 의예과, 84기). 합격 인원 입력은 더 이상 사용하지 않습니다.`,
    columns: [
      { key: "emblem_url", label: "엠블럼", type: "image" },
      { key: "name", label: "대학명" },
      { key: "subtitle", label: "표시 문구" },
      { key: "track", label: "계열" },
      { key: "sort_order", label: "순서" },
      { key: "is_active", label: "노출", type: "boolean" },
    ],
    fields: [
      {
        key: "is_active",
        label: "노출 여부",
        type: "radioBoolean",
        required: true,
      },
      { key: "name", label: "대학명", type: "text", required: true },
      {
        key: "emblem_url",
        label: "엠블럼 이미지",
        type: "image",
        required: true,
        hideUrlInput: true,
        compress: true,
        help: "정방형 200px 이상 권장",
        imageSpec: { width: 1, height: 1, aspectOnly: true, maxMB: 1 },
        folder: "landing/acceptance",
        cacheControl: "31536000, immutable",
      },
      {
        key: "subtitle",
        label: "표시 문구(예: 컴퓨터공학과, 의예과, 84기)",
        type: "text",
      },
      {
        key: "track",
        label: "계열",
        type: "select",
        options: [
          { value: "general", label: "일반계열" },
          { value: "medical_special", label: "의약학 · 특수계열" },
        ],
      },
      { key: "sort_order", label: "순서", type: "number" },
    ],
    defaults: {
      is_active: true,
      name: "",
      emblem_url: "",
      subtitle: "",
      count: null,
      track: "general",
      sort_order: 1,
    },
  },

  programCategories: {
    title: "핵심 서비스",
    table: "program_categories",
    listSummaryKey: "servicesCopyPanel",
    searchPlaceholder: "핵심 서비스명을 검색하세요",
    order: "sort_order",
    homepage: true,
    guideText: `랜딩 '핵심 서비스'는 사용 중 항목이 9개(3×3)까지 노출을 권장합니다. 10개 이상이면 다음 행으로 자연히 이어집니다. 설명 입력 시 줄바꿈(Enter)한 위치가 랜딩 카드에 그대로 반영됩니다. 카드 1개당 2~3줄 배치를 권장합니다. '프리미엄 배지'를 켜면 카드에 PREMIUM 배지가 표시됩니다.`,
    columns: [
      { key: "name", label: "명칭" },
      { key: "description", label: "설명" },
      { key: "link", label: "연결 페이지" },
      { key: "icon_image_url", label: "카드 일러스트", type: "image" },
      { key: "icon", label: "아이콘" },
      { key: "sort_order", label: "순서" },
      { key: "is_premium", label: "프리미엄 배지", type: "boolean" },
      { key: "is_active", label: "사용", type: "boolean" },
    ],
    fields: [
      {
        key: "is_active",
        label: "사용 여부",
        type: "radioBoolean",
        required: true,
      },
      { key: "name", label: "명칭", type: "text", required: true },
      {
        key: "description",
        label: "설명",
        type: "textarea",
        help: "줄바꿈이 랜딩 카드에 그대로 반영",
      },
      { key: "link", label: "연결 페이지", type: "text" },
      {
        key: "icon_image_url",
        label: "카드 일러스트 이미지",
        type: "image",
        compress: true,
        imageSpec: { maxMB: 1 },
        folder: "landing/services",
        cacheControl: "31536000, immutable",
      },
      {
        key: "icon",
        label: "아이콘",
        type: "select",
        options: [
          "target",
          "brain",
          "file",
          "graduation",
          "chart",
          "users",
          "clipboard",
          "edit",
          "star",
          "default",
        ],
      },
      { key: "sort_order", label: "순서", type: "number" },
      {
        key: "is_premium",
        label: "프리미엄 배지",
        type: "radioBoolean",
        help: "켜면 카드 일러스트 하단 우측에 PREMIUM 배지가 표시됩니다.",
      },
    ],
    defaults: {
      is_active: true,
      name: "",
      description: "",
      link: "/services",
      icon: "default",
      icon_image_url: "",
      sort_order: 1,
      is_premium: false,
    },
  },

  mentorStrategies: {
    title: "멘토 성공전략 카드",
    table: "home_mentor_strategies",
    listSummaryKey: "mentorCopyPanel",
    searchPlaceholder: "멘토 이름·배지를 검색하세요",
    order: "sort_order",
    homepage: true,
    guideText: `메인 '멘토' 영역 카드입니다. 배지(기수)·소개 문구 텍스트 + 투명 배경 인물사진(PNG, 1MB 이하)을 조합해 카드를 만들며, 라이브 프리뷰가 실제 노출과 동일합니다. 프리셋 버튼으로 사진 배치를 잡은 뒤 좌표(px)로 미세 조정하세요. 배지·소개 문구·인물 사진·사진 배치를 모두 입력해야 랜딩에 카드가 노출됩니다. 신규 등록은 노출 '미사용'으로 저장 → 프리뷰 확인 → '사용' 전환을 권장합니다.`,
    rowToForm: mentorRowToForm,
    formToPayload: mentorFormToPayload,
    validate: mentorFormValidate,
    FormPreview: MentorCardFormPreview,
    columns: [
      {
        key: "photo_url",
        label: "인물 사진",
        type: "image",
        showFileName: true,
      },
      { key: "mentor_name", label: "멘토 이름" },
      { key: "badge", label: "배지(기수)" },
      { key: "card_width", label: "카드 너비(px)" },
      { key: "sort_order", label: "순서" },
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
        key: "mentor_name",
        label: "멘토 이름",
        type: "text",
        required: true,
        help: '사진 대체 텍스트("○○○ 멘토")로 사용됩니다',
      },
      {
        key: "badge",
        label: "배지(기수)",
        type: "text",
        help: "카드 상단 진한 글씨 (예: 위닝 8기)",
      },
      {
        key: "title_lines",
        label: "소개 문구(줄 단위)",
        type: "textarea",
        rows: 3,
        help: '한 줄에 하나씩 입력 — 1줄: "김무경 멘토", 2줄: "연세대 응용통계학과"',
      },
      {
        key: "photo_url",
        label: "인물 사진",
        type: "image",
        hideUrlInput: true,
        compress: true,
        help: "투명 배경 PNG 권장 / 1MB 이하",
        imageSpec: { aspectOnly: true, maxMB: 1 },
        folder: "landing/mentors/photos",
        cacheControl: "31536000, immutable",
      },
      {
        key: "card_width",
        label: "카드 너비(px)",
        type: "number",
        help: "기본 210 / 와이드 카드만 230",
      },
      {
        key: "photo_top",
        label: "사진 top(px)",
        type: "number",
        help: "카드 좌상단 기준 세로 오프셋",
      },
      {
        key: "photo_left",
        label: "사진 left(px)",
        type: "number",
        help: "카드 좌상단 기준 가로 오프셋",
      },
      { key: "photo_width", label: "사진 너비(px)", type: "number" },
      { key: "photo_height", label: "사진 높이(px)", type: "number" },
      {
        key: "photo_crop_enabled",
        label: "사진 내부 크롭 사용",
        type: "checkbox",
        help: "사진 높이가 카드(360px)를 넘어 상단을 잘라야 할 때만 사용",
      },
      {
        key: "photo_crop_top",
        label: "크롭 top",
        type: "text",
        help: "CSS 값 그대로 입력 (예: -16.26%)",
        showIf: (form) => !!form.photo_crop_enabled,
      },
      {
        key: "photo_crop_height",
        label: "크롭 height",
        type: "text",
        help: "CSS 값 그대로 입력 (예: 116.12%)",
        showIf: (form) => !!form.photo_crop_enabled,
      },
      { key: "sort_order", label: "순서", type: "number" },
    ],
    defaults: {
      is_active: true,
      mentor_name: "",
      badge: "",
      title_lines: "",
      photo_url: "",
      card_width: 210,
      photo_top: 106,
      photo_left: 0,
      photo_width: 210,
      photo_height: 270,
      photo_crop_enabled: false,
      photo_crop_top: "",
      photo_crop_height: "",
      sort_order: 1,
    },
  },

  pageContents: {
    title: "세부 페이지 관리",
    table: "page_contents",
    searchPlaceholder: "메뉴명, 페이지명, 주소를 검색하세요",
    order: "sort_order",
    homepage: true,
    // QA A13(2026-08-27): 메뉴 위치·주소 변경이 랜딩 헤더/푸터에 즉시 반영되므로 저장 전 재확인.
    confirmBeforeSave:
      "저장하면 랜딩 메뉴 구성(상위/하위 메뉴, 순서, 주소)이 즉시 변경됩니다. 저장할까요?",
    guideText: `페이지 주소가 일반 문자이면 /page/주소로 연결됩니다. 예: services-record-analysis → /page/services-record-analysis / 페이지 주소가 /로 시작하면 실제 기능 페이지로 바로 연결됩니다. 예: /admission/results / 프리미엄 페이지는 premium/<이름> 형식으로 입력하세요. 예: premium/graduate-school → /page/premium/graduate-school`,
    columns: [
      { key: "menu_group_order", label: "상위 순서" },
      { key: "menu_group", label: "상위 메뉴" },
      { key: "sort_order", label: "하위 순서" },
      { key: "menu_label", label: "하위 메뉴" },
      { key: "slug", label: "페이지 주소" },
      { key: "title", label: "제목" },
      { key: "is_active", label: "노출", type: "boolean" },
      { key: "image_urls", label: "하단 이미지", type: "imageList" },
    ],
    fields: [
      { key: "menu_group_order", label: "상위 메뉴 순서", type: "number" },
      {
        key: "menu_group",
        label: "상위 메뉴명",
        type: "text",
        required: true,
      },
      { key: "sort_order", label: "하위 메뉴 순서", type: "number" },
      { key: "menu_label", label: "하위 메뉴명", type: "text", required: true },
      { key: "slug", label: "페이지 주소", type: "text", required: true },
      {
        key: "is_active",
        label: "노출 여부",
        type: "radioBoolean",
        required: true,
      },

      { key: "title", label: "제목", type: "text", required: true },
      { key: "subtitle", label: "부제목", type: "textarea" },

      { key: "image_url", label: "상단 이미지", type: "image" },

      { key: "body", label: "본문 내용", type: "textarea" },

      { key: "image_urls", label: "하단 이미지", type: "multiImage" },

      { key: "button_text", label: "버튼명", type: "text" },
      { key: "button_link", label: "버튼 링크", type: "text" },
    ],
    defaults: {
      menu_group_order: 1,
      menu_group: "서비스",
      sort_order: 1,
      menu_label: "",
      slug: "",
      is_active: true,
      title: "",
      subtitle: "",
      body: "",
      image_url: "",
      image_urls: [],
      button_text: "",
      button_link: "",
    },
  },

  // 프리미엄 이용(BOOK) 책자 페이지. 입수 경로 2개(명세 §6 A):
  //   ① PDF 1개 업로드 → 브라우저에서 16장 WebP로 변환 → 미리보기 → [적용] 일괄 upsert (bespoke 패널)
  //   ② 개별 페이지 1장만 고칠 때는 아래 fields/columns 기반 제네릭 편집(PremiumBookAdmin 내부에서
  //      AdminTable/AdminForm을 그대로 재사용)
  // custom: true 는 저장소에 1건뿐이던 하드코딩 삼항(learningDiagnosis → LearningDiagnosisAdmin)을
  // config.customComponentKey로 일반화한 것이다 — 아래 Admin() 렌더 분기,
  // CUSTOM_COMPONENT_REGISTRY, PremiumBookAdmin 참고.
  premiumBookPages: {
    title: "프리미엄 책자 관리",
    table: "premium_book_pages",
    searchPlaceholder: "",
    // 정정(spec B-1): CONFIGS가 실제로 읽는 키는 order다 — orderColumn은 쿼리 조립부의
    // 지역변수 이름일 뿐이다(Admin.jsx:buildListQuery, `const orderColumn = config.order || 'created_at'`).
    order: "sort_order",
    homepage: true,
    custom: true,
    customComponentKey: "premiumBookPages",
    guideText: `PDF 1개를 올리면 자동으로 각 페이지가 이미지로 변환되어 미리보기 후 [적용]으로 일괄 반영됩니다. 개별 페이지 1장만 교체할 때는 아래 목록에서 해당 행을 수정하세요. 행 단위 교체라 전량 교체 시 신판/구판 혼재 구간이 생길 수 있습니다 — 트래픽이 적은 시간대 작업을 권장합니다. 이미 페이지를 열어둔 사용자는 새로고침 전까지 구 이미지를 봅니다. 페이지 번호(sort_order)는 UNIQUE가 아니라 자유롭게 재배치할 수 있으나, 중복 시 목록 상단에 경고가 표시됩니다.`,
    columns: [
      { key: "sort_order", label: "페이지 번호" },
      { key: "image_url", label: "이미지", type: "image" },
    ],
    fields: [
      {
        key: "sort_order",
        label: "페이지 번호",
        type: "number",
        required: true,
      },
      {
        key: "image_url",
        label: "이미지",
        type: "image",
        imageSpec: { maxMB: 2 },
        folder: "premium-book",
      },
    ],
    // create 모드는 config.defaults만으로 폼을 초기화한다(Admin.jsx AdminForm,
    // `return { ...(config.defaults || {}) }`) — 없으면 sort_order NOT NULL이 23502 raw alert를 띄운다.
    defaults: { sort_order: 1, image_url: "" },
  },

  // 프리미엄 상담 신청 내역 — sql/48_premium_consult.sql(premium_consult_requests)이 정본.
  // 신청자 원본(이름/연락처/이메일/서비스/문의내용)은 운영자가 고칠 이유가 없어 읽기 전용으로 두고
  // status·admin_note만 편집 가능하게 한다. 신규 상담 생성 경로는 공개 신청폼(PremiumApply.jsx)
  // 하나뿐이라 noCreate로 어드민의 수기 생성 자체를 막는다.
  premiumConsults: {
    title: "프리미엄 상담 신청 내역",
    table: "premium_consult_requests",
    searchPlaceholder: "이름, 연락처, 이메일 검색",
    // loadRows: orderColumn이 'sort_order'가 아니면 내림차순 정렬이라(Admin.jsx:loadRows 참고)
    // created_at을 그대로 지정하면 최신 신청이 목록 맨 위로 온다.
    order: "created_at",
    noCreate: true,
    // 개인정보(이름·연락처·이메일)가 파일로 통째로 빠져나가는 섹션이라 원래 CSV 내보내기를
    // 비활성으로 뒀다. QA G2(2026-08-27)가 "받게 해달라"로 그걸 열었고, QA 223 이 뒤이어
    // "대신 게이트를 걸어라"를 요구했다 — 그래서 excel 은 켠 채로 두고 sensitiveDownload
    // 로 비밀번호 재확인 + 사유 기재 + 로그 적재를 통과해야 실제로 내려받게 한다.
    excel: true,
    sensitiveDownload: true,
    rowCapWarning: true, // PostgREST 기본 1000행 상한 — 닿으면 목록 상단에 경고 노출
    retentionNotice:
      "상담 신청 정보(이름·연락처·이메일 등)는 상담 종료 후 2년간 보관합니다. 보관기간이 지난 건은 확인 후 삭제해 주세요.",
    columns: [
      { key: "created_at", label: "신청일시", type: "datetime" },
      { key: "name", label: "이름" },
      { key: "phone", label: "연락처" },
      { key: "email", label: "이메일" },
      { key: "service", label: "상담 서비스" },
      { key: "message", label: "문의 내용", type: "truncate" },
      { key: "status", label: "상태", options: PREMIUM_CONSULT_STATUS_OPTIONS },
    ],
    fields: [
      {
        key: "created_at",
        label: "신청일시",
        type: "datetime",
        readOnly: true,
      },
      { key: "name", label: "이름", type: "text", readOnly: true },
      { key: "phone", label: "연락처", type: "text", readOnly: true },
      { key: "email", label: "이메일", type: "text", readOnly: true },
      { key: "service", label: "상담 서비스", type: "text", readOnly: true },
      { key: "message", label: "문의 내용", type: "textarea", readOnly: true },
      {
        key: "status",
        label: "상태",
        type: "select",
        options: PREMIUM_CONSULT_STATUS_OPTIONS,
        required: true,
      },
      { key: "admin_note", label: "운영 메모", type: "textarea" },
    ],
    defaults: { status: "new", admin_note: "" },
  },
};
