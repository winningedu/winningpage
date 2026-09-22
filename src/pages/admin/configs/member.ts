import type { FieldOption } from "@/pages/admin/shared/csvExport";
import { MENTOR_APPLICATION_STATUS_OPTIONS } from "@/pages/admin/shared/formFields";

interface MemberColumn {
  key: string;
  label: string;
  type?: "date" | "money" | "maskedPhone";
  options?: FieldOption[];
}

interface MemberField {
  key: string;
  label: string;
  type:
    | "text"
    | "date"
    | "number"
    | "select"
    | "radioBoolean"
    | "checkbox"
    | "textarea";
  required?: boolean;
  options?: FieldOption[];
  placeholder?: string;
}

interface MemberCrudConfig {
  title: string;
  table: string;
  searchPlaceholder: string;
  order: string;
  excel?: boolean;
  // 목록만 조인 뷰에서 읽는다(AdminConfig.listTable 과 같은 뜻) — QA 272.
  listTable?: string;
  listOnlyColumns?: string[];
  // 목록 상단 드롭다운 필터(AdminConfig.listFilter 와 같은 뜻) — QA 227.
  listFilter?: { key: string; allLabel: string };
  // 목록 툴바 「초기화」 버튼 숨김(AdminConfig.hideReset 과 같은 뜻) — QA 272.
  hideReset?: boolean;
  noCreate?: boolean;
  columns: MemberColumn[];
  fields: MemberField[];
  defaults: Record<string, unknown>;
}

// mentorApplications: custom:true 컴포넌트(MentorApplicationsAdmin)가 목록만 AdminTable로
// 재사용하고 상세/폼은 자체 렌더한다 — fields/defaults가 없는 게 정상 형태다.
interface MemberCustomConfig {
  title: string;
  table: string;
  searchPlaceholder: string;
  order: string;
  readOnly: true;
  custom: true;
  customComponentKey: string;
  columns: MemberColumn[];
}

type MemberConfig = MemberCrudConfig | MemberCustomConfig;

export const memberConfigs: Record<string, MemberConfig> = {
  // 소속(테넌트) 관리(2026-09-22) — profiles/products/coupons.org_code(자유
  // 입력 text)를 대체하는 마스터 테이블 화면. tenants 테이블엔 insert 정책이
  // 없다(신설은 fn_create_tenant RPC 전용, WC067 최고 관리자 게이트) — 목록·
  // 등록 폼 모두 custom 컴포넌트가 직접 다룬다(src/components/admin/TenantsAdmin.tsx).
  // columns 는 목록에서만 쓰인다(members 와 같은 관례).
  tenants: {
    title: "소속(테넌트) 관리",
    table: "tenants",
    searchPlaceholder: "소속명 검색",
    order: "created_at",
    readOnly: true,
    custom: true,
    customComponentKey: "tenants",
    columns: [
      { key: "name", label: "이름" },
      { key: "region", label: "지역" },
      { key: "org_type", label: "기업형태" },
      { key: "code", label: "소속 코드" },
      // 정산·영업 우선순위 등 내부 판단 재료라 회원에게는 어떤 경로로도
      // 노출되지 않는다(tenants.tier 코멘트, 20260922002929) — 노출 여부가
      // 불확실해 일단 어드민 화면에만 라벨로 구분해 보여준다(판단 근거는
      // TenantsAdmin.tsx 주석 참고).
      { key: "tier", label: "등급(내부용)" },
      { key: "created_at", label: "생성일", type: "date" },
    ],
  },

  // 회원 목록 + 고객 상세 — QA 182 의 「고객조회상담」 메인메뉴를 별도로 만들지
  // 않고 이 화면에 통합한다(사용자 확정 2026-08-22). 상세는 탭 6개(고객상세정보/
  // 이용서비스/결제내역/상담/알림톡·문자/서비스이용내역)이고, profiles 한 테이블이
  // 아니라 parent_child_links·program_access·orders 를 함께 읽으며 개인정보 마스킹
  // 토글이 필요해 제네릭 AdminForm 으로는 표현할 수 없다. mentorApplications 와 같은
  // 방식으로 목록만 AdminTable 을 재사용한다(src/components/admin/MembersAdmin.tsx).
  //
  // ⚠️ 이 전환으로 **제네릭 편집 폼이 사라진다.** 이전에는 이 탭에서 회원 정보를
  //    자유 편집할 수 있었는데, 와이어프레임의 고객 상세는 조회 화면이라 편집
  //    수단을 두지 않았다. 회원 정보 수정이 실제로 필요하면 어떤 필드를 누가 고칠
  //    수 있는지부터 정하고 다시 붙인다(권한 체계와 함께 가는 게 맞다).
  //
  // columns 는 목록에서만 쓰인다 — 와이어프레임 목록의
  // "번호 | 회원명 | 가입 유형 | 이메일 | 전화번호 | 가입일 | 더보기" 순서를 따른다.
  // 전화번호에 maskedPhone 을 쓰는 이유는 목록이 한 화면에 수십 명을 늘어놓기
  // 때문이다 — 상세에서만 마스킹 해제 버튼으로 원본을 본다.
  members: {
    title: "회원 목록",
    table: "profiles",
    searchPlaceholder: "회원명, 아이디, 이메일, 연락처 검색",
    order: "created_at",
    readOnly: true,
    custom: true,
    customComponentKey: "members",
    columns: [
      { key: "name", label: "회원명" },
      { key: "member_type", label: "가입 유형" },
      { key: "email", label: "이메일" },
      { key: "phone", label: "전화번호", type: "maskedPhone" },
      // 학부모 핸드폰 — 학생 계정의 연락·복구 채널로 승격된 값(2026-09-03). 값이
      // 없는 회원이 대부분이라 formatValue가 "-"로 채운다(전화번호 컬럼과 같은
      // maskedPhone 마스킹 규칙을 따른다).
      { key: "guardian_phone", label: "학부모 핸드폰", type: "maskedPhone" },
      // 회원구분 — dev 에서 QA 186 으로 추가된 관리자 전용 컬럼(20260822000011).
      // 회원은 못 보고 관리자만 본다. 값은 고정 목록이 아니라 자유 텍스트다
      // (일반회원 / OO학교 / OO기관 / OO캠퍼스 / OO기업 / 기타).
      //
      // ⚠️ 이 config 가 custom 으로 바뀌면서 제네릭 편집 폼이 사라졌다. 그래서
      //    회원구분 **편집**은 MembersAdmin 상세의 「고객 상세 정보」 탭이 맡는다
      //    (src/components/admin/MembersAdmin.tsx) — 목록에서 값만 보이고 고칠
      //    데가 없으면 QA 186 요구가 반쪽이 된다.
      { key: "member_category", label: "회원구분" },
      // QA G4 — 생년월일/소속코드/학교명/지역/이용서비스 5열 추가(2026-08-27).
      // service_labels 는 profiles 테이블 컬럼이 아니라 MembersAdmin.loadRows()가
      // program_access 를 별도로 묶어 각 행에 얹어주는 파생 필드다(active 상태만,
      // 콤마 조인). 값이 없으면 formatValue가 "-"로 채운다.
      { key: "birth_date", label: "생년월일", type: "date" },
      // 2026-09-22 — org_code(자유 입력 text) → tenant_name(tenants FK 조인,
      // MembersAdmin.loadRows()가 program_access 와 같은 방식으로 얹는 파생
      // 필드다) 로 교체.
      { key: "tenant_name", label: "소속" },
      { key: "school_name", label: "학교명" },
      { key: "region", label: "지역" },
      { key: "service_labels", label: "이용서비스" },
      { key: "created_at", label: "가입일", type: "date" },
    ],
  },

  enrollments: {
    title: "수강 신청 내역",
    table: "enrollments",
    // 목록은 **온라인 결제 + 오프라인 장부 합집합** 뷰에서 읽는다(20260831062100).
    //
    // 왜 합집합인가 — enrollments 는 오프라인 수강 장부인데 dev·운영 모두 0행이고
    // 위닝측이 오프라인 접수를 하지 않는다(서비스 미런칭, 2026-08-31 확인). 실제
    // 수강 신청은 전부 온라인 결제(orders)로 들어온다. QA 272 가 요구한 항목이
    // 결제방식·승인번호라는 점, 이 메뉴가 매출·결제관리 그룹이라는 점 모두
    // "여기서 결제한 사람을 본다"를 가리킨다. 「매출 및 결제」가 수기 장부를
    // orders 기반 뷰로 갈아끼운 것과 같은 처방이다.
    listTable: "admin_enrollment_entries",
    // 합집합이라 id 가 두 원장에서 오고, 온라인 건은 어드민이 고칠 대상이 아니다
    // (주문을 손으로 고치면 매출과 어긋난다). 오프라인 접수 등록 화면은 실제로
    // 접수를 시작할 때 별도로 만든다.
    readOnly: true,
    noCreate: true,
    // 뷰에만 있는 파생 컬럼. 지금은 readOnly 라 저장 경로가 없지만, 나중에 오프라인
    // 등록을 이 화면에 되살리면 이걸 걷어내지 않는 순간 42703 이 난다.
    listOnlyColumns: ["payment_method", "approval_no", "source"],
    // QA 227 — 상단 서비스 선택 필터. 종목(category_name)이 곧 서비스 구분이고,
    // 선택지는 실제 등록된 값에서 뽑으므로 종목이 늘어도 여기를 고칠 필요가 없다.
    listFilter: { key: "category_name", allLabel: "전체 서비스" },
    searchPlaceholder: "수강생, 보호자, 프로그램 검색",
    order: "created_at",
    excel: true,
    // QA 272 — 좌측 상단 「초기화」 버튼 삭제 요청. 재조회 버튼인데 "입력한 검색
    // 조건을 지우는 버튼"으로 읽혀 오조작을 부른다는 지적이었다.
    hideReset: true,
    columns: [
      { key: "created_at", label: "신청일", type: "date" },
      // 온라인 결제분과 오프라인 접수분이 한 표에 섞이므로 출처를 밝힌다.
      { key: "source", label: "구분" },
      { key: "category_name", label: "종목" },
      { key: "program_name", label: "프로그램" },
      { key: "class_name", label: "클래스" },
      { key: "guardian_name", label: "보호자" },
      { key: "student_name", label: "수강생" },
      // QA 272 — 목록에서 바로 연락이 되게 전화번호를 노출한다. 값은 이미 있고
      // 편집 폼(fields)에도 있었는데 목록 컬럼에만 빠져 있었다.
      { key: "phone", label: "연락처", type: "maskedPhone" },
      { key: "payment_status", label: "납부상태" },
      // QA 272 — 연결된 주문(order_id)이 있을 때만 값이 실린다. 오프라인 현금
      // 수납처럼 대응 주문이 없는 건은 빈 칸이 정상이다.
      { key: "payment_method", label: "결제방식" },
      { key: "approval_no", label: "승인번호" },
      { key: "price", label: "수강료", type: "money" },
      { key: "discount_amount", label: "감면액", type: "money" },
      { key: "paid_amount", label: "납부액", type: "money" },
    ],
    fields: [
      { key: "term_name", label: "학기", type: "text" },
      { key: "category_name", label: "종목", type: "text" },
      { key: "program_name", label: "프로그램", type: "text" },
      { key: "class_name", label: "클래스", type: "text" },
      { key: "guardian_name", label: "보호자", type: "text" },
      { key: "student_name", label: "수강생", type: "text", required: true },
      { key: "phone", label: "연락처", type: "text" },
      { key: "grade", label: "학년", type: "text" },
      { key: "school_name", label: "학교명", type: "text" },
      // QA 272 — 이 수강 건에 대응하는 온라인 주문번호. 넣으면 목록의 결제방식·
      // 승인번호가 그 주문에서 자동으로 따라온다. 대응 주문이 없으면 비워 둔다.
      {
        key: "order_id",
        label: "연결 주문번호",
        type: "text",
        placeholder: "토스 주문번호 (없으면 비워 두세요)",
      },
      {
        key: "payment_status",
        label: "납부상태",
        type: "select",
        options: ["납부대기", "납부완료", "미납", "취소요청", "환불완료"],
      },
      { key: "price", label: "수강료", type: "number" },
      { key: "discount_amount", label: "감면액", type: "number" },
      { key: "paid_amount", label: "납부액", type: "number" },
      { key: "memo", label: "비고", type: "textarea" },
    ],
    defaults: {
      payment_status: "납부대기",
      price: 0,
      discount_amount: 0,
      paid_amount: 0,
    },
  },

  // 멘토(콜멘토) 지원서 조회 — 30여 개 필드 + 동의 5종 + 비공개 버킷 증빙 파일이라
  // columns/fields 기반 제네릭 AdminTable/AdminForm에 그대로 얹기 어렵다(특히 파일 열람은
  // createSignedUrl이 필요해 제네릭 image/file 필드의 getPublicUrl 관용구를 쓸 수 없다).
  // custom: true + customComponentKey로 premiumBookPages와 동일한 패턴을 따르되, 목록만은
  // AdminTable을 재사용한다(파일 하단 MentorApplicationsAdmin 참고). columns는 그 목록에서만
  // 쓰인다 — 상세/상태변경은 컴포넌트 내부 bespoke 렌더링.
  mentorApplications: {
    title: "멘토 신청 내역",
    table: "mentor_applications",
    searchPlaceholder: "이름, 대학교, 휴대폰 검색",
    order: "created_at",
    readOnly: true,
    custom: true,
    customComponentKey: "mentorApplications",
    columns: [
      { key: "created_at", label: "제출일", type: "date" },
      { key: "name", label: "이름" },
      { key: "university", label: "대학교" },
      { key: "major", label: "학과·학부" },
      { key: "phone", label: "휴대폰", type: "maskedPhone" },
      {
        key: "status",
        label: "상태",
        options: MENTOR_APPLICATION_STATUS_OPTIONS,
      },
    ],
  },
};
