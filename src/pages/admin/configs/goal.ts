import type { FieldOption } from "@/pages/admin/shared/csvExport";
import { GOAL_CUT_SOURCE_OPTIONS } from "@/pages/admin/shared/formFields";
import { GOAL_CUT_RANGE } from "./goalUniversityCutsBulkXlsx";

// ---------------------------------------------------------------------
// 목표관리 도메인 상수 (docs/figma-goal/goal-admin-spec.md §4-1-2)
// DB 저장값은 영문 키 그대로 두고 화면 표기만 한글로 바꾼다(다른 select 옵션과 동일 관례).
// ---------------------------------------------------------------------

// sql/55_goal_management.sql 의 goal_university_cuts_cut_type_check 와 동일 집합.
// 여기 없는 값을 넣으면 저장 시 23514로 죽는다.
const GOAL_CUT_TYPE_OPTIONS: FieldOption[] = [
  { value: "normal", label: "수시 일반고 (내신 등급)" },
  { value: "special", label: "수시 특목·자사고 (내신 등급)" },
  { value: "jungsi", label: "정시 (백분위)" },
];

// GOAL_CUT_RANGE(sql/55 의 goal_university_cuts_avg_cut_check 미러)는 여기서
// 선언하지 않고 같은 디렉토리의 goalUniversityCutsBulkXlsx.ts 에서 import 한다 —
// 폼(config.validate)과 엑셀 파서가 **같은 상수**를 봐야 두 입력 경로의
// 스케일 판정이 갈라지지 않기 때문이다. CHECK 는 "1~9 범위 안의 정시
// 백분위"(예: 3.5) 같은 혼입을 잡지 못하므로 그 상수가 실질 방어선이다
// (명세 §3-D4). 수시는 작을수록 우세(등급), 정시는 클수록 우세(백분위)다.

// row(goal_university_cuts 행)는 AdminForm(AdminEngine.jsx, 미변환)이 소유하는
// 제네릭 폼 상태라 구체 타입이 없다 — 이 파일이 실제로 읽고 쓰는 키만 얕게 좁힌다.
interface GoalCutRow {
  cut_type?: string;
  avg_cut?: number | string | null;
  university_name?: string;
  department_name?: string;
  source?: string;
  [key: string]: unknown;
}

interface GoalColumn {
  key: string;
  label: string;
  type?: "boolean" | "datetime";
  options?: FieldOption[];
  render?: (row: GoalCutRow) => string;
}

interface GoalFieldResolveResult {
  readOnly?: boolean;
  help?: string;
  label?: string;
  min?: number;
  max?: number;
  step?: string;
  placeholder?: string;
}

interface GoalField {
  key: string;
  label: string;
  type: "radioBoolean" | "select" | "text" | "number" | "textarea";
  required?: boolean;
  nullable?: boolean;
  options?: FieldOption[];
  help?: string;
  resolve?: (
    form: GoalCutRow,
    row?: GoalCutRow | null,
  ) => GoalFieldResolveResult;
}

interface GoalUniversityCutsConfig {
  title: string;
  table: string;
  searchPlaceholder: string;
  orderBy: [string, boolean][];
  serverPaginate: boolean;
  searchColumns: string[];
  homepage: boolean;
  guideText: string;
  listSummaryKey: string;
  columns: GoalColumn[];
  fields: GoalField[];
  rowToForm: (row: GoalCutRow) => GoalCutRow;
  formToPayload: (form: GoalCutRow) => Record<string, unknown>;
  validate: (form: GoalCutRow, row?: GoalCutRow | null) => string | null;
  defaults: Record<string, unknown>;
}

// goalStudents: custom:true 컴포넌트(GoalStudentsAdmin, 다른 배치 소유)가 4~6소스
// 합성 목록/상세를 전부 그린다 — CONFIGS는 문서용 플래그(readOnly/noCreate)만 갖는다.
interface GoalStudentsConfig {
  title: string;
  custom: true;
  customComponentKey: string;
  searchPlaceholder: string;
  readOnly: true;
  noCreate: true;
}

export const goalConfigs: {
  goalUniversityCuts: GoalUniversityCutsConfig;
  goalStudents: GoalStudentsConfig;
} = {
  // -------------------------------------------------------------------
  // 목표관리 (docs/figma-goal/goal-admin-spec.md §4-2 / §4-3)
  // 탭 2개다 — 대학 컷 관리(§4-2, 표준 CRUD + ListSummary 3블록)와
  // 학생 현황(§4-3, custom 컴포넌트). 두 config 는 서로 아무것도 공유하지
  // 않으므로 각각 독립적으로 읽고 고칠 수 있다.
  // -------------------------------------------------------------------

  goalUniversityCuts: {
    title: "목표관리 대학 컷",
    table: "goal_university_cuts",
    searchPlaceholder: "대학명 또는 학과명을 검색하세요",
    // 동점 처리축 id 필수. 없으면 .range() 페이지 경계에서 행이 중복·누락된다
    // (같은 논리를 admissionResults가 이미 쓴다 — 이 파일의 orderBy 주석 참고).
    orderBy: [
      ["university_name", true],
      ["department_name", true],
      ["cut_type", true],
      ["id", true],
    ],
    // 백필 후 13,000행 이상. PostgREST 기본 1,000행 상한을 크게 넘는다.
    serverPaginate: true,
    searchColumns: ["university_name", "department_name"],
    homepage: true,
    // excel / rowCapWarning은 선언하지 않는다 — 엑셀 버튼 2개 공존 금지(2026-08-07
    // 사용자 지시), serverPaginate를 켰으므로 행수 경고도 불필요.
    guideText: `학생 온보딩의 목표 대학 확률 산출에 쓰이는 컷 기준표입니다. 이 표에 있는 조합만 학생이 고를 수 있습니다 — 여기서 지우거나 노출을 끄면 온보딩 대학 목록에서도 사라집니다.
⚠ 컷 값의 단위가 종류에 따라 다릅니다. 수시(일반고/특목·자사고)는 내신 등급 1~9(작을수록 우세), 정시는 백분위 0~100(클수록 우세)입니다. 섞여 들어가면 합격 확률의 우열이 통째로 뒤집힙니다.
🔴 학과명은 반드시 채워 주세요. 학과명이 빈 행은 어떤 학생에게도 매칭되지 않습니다 — 온보딩이 학과를 필수로 요구하고, 확률 조회가 학과명 완전일치로 이뤄지기 때문입니다.
🔴 정시 컷은 같은 (대학, 학과)의 수시 컷과 글자 하나까지 같아야 정시 확률이 산출됩니다. 수시 컷 행의 대학명·학과명을 그대로 복사해 넣어 주세요.
컷을 고쳐도 이미 온보딩을 마친 학생의 확률은 바뀌지 않습니다 — 학생의 확률은 온보딩 시점의 컷으로 확정됩니다.
🔵 단, 온보딩 시점에 정시 컷이 없어 "정시 미산출"로 뜨던 학생은 예외입니다 — 정시 컷을 여기서 새로 등록하면 그 학생이 다음에 목표관리 대시보드를 조회할 때 자동으로 정시 확률이 채워집니다(온보딩 재실행 불필요).`,
    listSummaryKey: "goalCutsListSummary",
    columns: [
      { key: "cut_type", label: "컷 종류", options: GOAL_CUT_TYPE_OPTIONS },
      { key: "university_name", label: "대학" },
      // department_name은 공용 formatValue 그대로 둔다 — 빈 값은 '-'로 나오고,
      // 빈 학과명 행은 정상 운영에서 생기지 않는다(폼·엑셀·백필 모두 필수).
      { key: "department_name", label: "학과" },
      {
        key: "avg_cut",
        label: "컷 값",
        // 🔴 목록에서 2.35(등급)와 87.5(백분위)가 단위 없이 섞여 보이면 스케일
        // 혼입을 눈으로 잡을 수 없다. formatValue는 (value, type, options)만 받아
        // 같은 행의 cut_type을 볼 수 없으므로 공용 훅 column.render(row)를 쓴다.
        render: (row) => {
          const value = row?.avg_cut;
          if (value === null || value === undefined || value === "") return "-";
          const unit =
            GOAL_CUT_RANGE[row?.cut_type as keyof typeof GOAL_CUT_RANGE]
              ?.unit || "";
          return `${value}${unit}`;
        },
      },
      { key: "source", label: "출처", options: GOAL_CUT_SOURCE_OPTIONS },
      { key: "source_year", label: "기준 연도" },
      { key: "is_active", label: "노출", type: "boolean" },
      { key: "updated_at", label: "수정일", type: "datetime" },
    ],
    fields: [
      {
        key: "is_active",
        label: "노출 여부",
        type: "radioBoolean",
        required: true,
      },
      {
        key: "cut_type",
        label: "컷 종류",
        type: "select",
        required: true,
        options: GOAL_CUT_TYPE_OPTIONS,
        // 편집 모드(row 있음)에서는 읽기 전용 텍스트로 렌더한다 —
        // AdminForm이 readOnly 필드에는 AdminInput을 아예 호출하지 않고
        // formatValue로 정적 텍스트를 그린다(options 라벨 매핑 포함).
        // ⚠ 이건 사용성 개선일 뿐 방어가 아니다. 실질 차단은 validate 규칙 0이다.
        resolve: (_form, row) =>
          row
            ? {
                readOnly: true,
                help: '기존 행의 컷 종류는 바꿀 수 없습니다. 종류를 바꾸려면 이 행을 삭제한 뒤 새로 등록해 주세요 — 등급 3.2짜리 행을 정시로 바꾸면 "백분위 3.2"로 읽혀 합격 확률의 우열이 통째로 뒤집힙니다.',
              }
            : {},
      },
      {
        key: "university_name",
        label: "대학명",
        type: "text",
        required: true,
        help: "학생 온보딩에 그대로 노출되고, 확률 조회 키로도 쓰입니다(api/_lib/goal/repo.ts fetchUniversityCut). 오타 1건이 그 조합의 온보딩을 전부 막습니다.",
      },
      {
        key: "department_name",
        label: "학과명",
        type: "text",
        required: true,
        help: "온보딩이 학과를 필수로 요구하고 확률 조회가 학과명 완전일치라, 비워 두면 어떤 학생에게도 매칭되지 않습니다.",
      },
      // nullable: true 필수 — 비우면 0이 아니라 null로 저장돼야 한다. null은
      // "컷 미확보"이고 API가 422로 응답한다. 0은 jungsi 스케일에서 합법 값이라
      // 의미가 완전히 다르다.
      {
        key: "avg_cut",
        label: "컷 값",
        type: "number",
        nullable: true,
        // cut_type에 따라 라벨·단위·범위·placeholder가 통째로 달라진다(§3-D4 ①).
        // cut_type 미선택 상태에서는 readOnly로 두어 입력 자체를 막는다 —
        // AdminInput에 disabled 속성을 새로 뚫는 것보다(공용 경로 추가 변경)
        // 이미 승인된 훅만으로 같은 효과를 낸다.
        resolve: (form) => {
          const range =
            GOAL_CUT_RANGE[form?.cut_type as keyof typeof GOAL_CUT_RANGE];
          if (!range) {
            return {
              readOnly: true,
              help: "컷 종류를 먼저 선택해 주세요 — 종류에 따라 값의 단위(등급/백분위)가 달라집니다.",
            };
          }
          return {
            label: `컷 값 (${range.unit})`,
            min: range.min,
            max: range.max,
            // 🔴 step:'any' 없이 min만 주면 소수 컷이 통째로 저장 불가가 된다.
            //   내신 컷은 2.35, 정시 백분위는 87.5 처럼 소수가 정상값이고
            //   백필 13,282행 중 96%가 소수다. 근거는 AdminInput의 step 주석.
            step: "any",
            placeholder: `${range.min} ~ ${range.max}`,
            help: `${range.label}. 비워 두면 "컷 미확보"(null)로 저장되고 그 조합은 온보딩에서 422로 막힙니다 — 0은 정시 백분위에서 합법 값이라 의미가 완전히 다릅니다.`,
          };
        },
      },
      {
        key: "source",
        label: "출처",
        type: "select",
        options: GOAL_CUT_SOURCE_OPTIONS,
      },
      {
        key: "source_year",
        label: "기준 연도",
        type: "number",
        nullable: true,
      },
      { key: "note", label: "운영 메모", type: "textarea" },
    ],
    // university_key / department_key는 폼에 노출하지 않는다 — 어드민은 항상
    // 표시명과 동일하게 강제한다(명세 §3-D5). 강제는 formToPayload가 한다.
    //
    // rowToForm이 원본 avg_cut을 __origAvgCut에 실어 두는 이유: formToPayload는
    // row를 받지 못해서, "관리자가 컷 값을 손으로 고쳤는가"를 알 방법이 이것뿐이다.
    // 그 판정이 없으면 백필 보존 술어(source='manual')의 첫 항이 영원히 비어
    // 있게 되어, 관리자의 수정이 백필 재실행마다 덮어써진다(명세 §4-2-H-2 7단계).
    rowToForm: (row) => ({ ...row, __origAvgCut: row.avg_cut }),
    formToPayload: (form) => {
      const universityName = String(form.university_name ?? "").trim();
      // department_name은 NOT NULL DEFAULT ''라 null을 보내면 저장이 거부된다.
      // 폼에서는 필수라 빈 문자열이 오지 않지만, ?? ''는 엑셀·백필 경로와
      // payload 형태를 맞추기 위한 방어다.
      const departmentName = String(form.department_name ?? "").trim();
      const payload: Record<string, unknown> = {
        ...form,
        university_key: universityName,
        university_name: universityName,
        department_key: departmentName,
        department_name: departmentName,
        // 유도 행을 관리자가 손으로 고치면 '수기 입력'으로 승격시킨다.
        source:
          form.__origAvgCut !== undefined && form.avg_cut !== form.__origAvgCut
            ? "manual"
            : form.source,
      };
      // saveRow는 created_at/updated_at/view_count만 자동으로 지운다 —
      // __ 접두 키는 여기서 직접 지워야 42703으로 죽지 않는다.
      delete payload.__origAvgCut;
      delete payload.created_at;
      delete payload.updated_at;
      return payload;
    },
    // 🔴 스케일 이원성의 정본 방어선(§3-D4 층 ②). DB CHECK는 jungsi에 2.5(등급)를
    // 넣어도 통과시킨다 — 1~9 구간은 두 스케일 모두 합법이라 DB가 구분할 수 없다.
    validate: (form, row) => {
      // 규칙 0 — 기존 행의 컷 종류 변경 차단. 이 탭이 막아야 할 1순위 사고다.
      if (row?.cut_type && form.cut_type !== row.cut_type) {
        return "컷 종류는 변경할 수 없습니다. 이 행을 삭제한 뒤 새로 등록해 주세요.";
      }
      const range =
        GOAL_CUT_RANGE[form.cut_type as keyof typeof GOAL_CUT_RANGE];
      if (!range) return "컷 종류를 선택해 주세요.";
      if (!String(form.university_name ?? "").trim())
        return "대학명을 입력해 주세요.";
      if (!String(form.department_name ?? "").trim()) {
        return "학과명을 입력해 주세요. 학과명이 빈 행은 어떤 학생에게도 매칭되지 않습니다.";
      }
      // 컷 미확보(null/빈 값)는 통과시킨다.
      if (
        form.avg_cut === null ||
        form.avg_cut === undefined ||
        form.avg_cut === ""
      )
        return null;
      const avgCut = Number(form.avg_cut);
      if (!Number.isFinite(avgCut)) return "컷 값은 숫자로 입력해 주세요.";
      if (avgCut < range.min || avgCut > range.max) {
        return `선택한 컷 종류(${range.label})의 범위를 벗어났습니다 — ${range.min} ~ ${range.max} 사이로 입력해 주세요.`;
      }
      // 거부가 아니라 확인 — 백분위 9 이하가 불가능하진 않지만 실무상
      // 스케일 혼입일 확률이 압도적이다. validate는 동기 함수이고 호출부가
      // 반환값을 무조건 alert하므로, 취소를 누르면 경고창이 한 번 더 뜬다.
      // 그래서 반환 문구를 alert로 읽어도 자연스러운 문장으로 확정했다.
      if (form.cut_type === "jungsi" && avgCut <= 9) {
        const ok = window.confirm(
          "정시 컷에 9 이하 값을 넣으셨습니다. 내신 등급을 잘못 입력하신 것은 아닌가요? 백분위 값이 맞다면 [확인]을 눌러 주세요.",
        );
        if (!ok) return "저장하지 않았습니다. 정시 컷 값을 다시 확인해 주세요.";
      }
      return null;
    },
    // ⚠ 명세 §4-2-F 는 cut_type 기본값을 'normal' 로 적었으나 ''(미선택)로 둔다.
    //    'normal' 로 두면 §4-2-C 가 요구하는 "cut_type 미선택 시 avg_cut 입력
    //    disabled" 상태에 신규 등록이 절대 도달하지 못해 그 방어가 죽는다.
    //    관리자가 종류를 고르지 않고 컷 값부터 치는 것이 스케일 혼입의 시작이다.
    //    AdminInput 의 select 는 <option value="">선택</option> 을 항상 먼저
    //    렌더하므로 ''는 "선택" 으로 정상 표시되고, 저장은 required 검사와
    //    validate 규칙 1이 함께 막는다.
    defaults: {
      is_active: true,
      cut_type: "",
      university_name: "",
      department_name: "",
      avg_cut: null,
      source: "manual",
      source_year: null,
      note: "",
    },
  },

  goalStudents: {
    title: "목표관리 학생 현황",
    // 명세 §4-3. 목록 컬럼이 4소스(goal_student_state 뷰 + goal_students +
    // profiles + 파생 riskFlags) 합성이고 상세가 6소스 합성이라 CONFIGS로
    // 표현할 수 없다. custom: true로 공용 목록·폼·검색·페이지네이션을 통째로
    // 끄고(Admin.jsx의 loadRows custom 분기 / 렌더 custom 삼항) 컴포넌트가
    // 전부 그린다. table을 선언하지 않는 이유도 같다 — loadRows가 custom이면
    // 즉시 rows=[]로 빠져나가 이 값을 읽지 않는다(learningDiagnosis 선례).
    //
    // CustomComponent 직접 참조 대신 customComponentKey 문자열만 갖는다 —
    // 실제 컴포넌트 바인딩은 CUSTOM_COMPONENT_REGISTRY(렌더 시점 조회)가 진다.
    // CONFIGS는 이제 GoalStudentsAdmin 값을 전혀 평가하지 않으므로, CONFIGS가
    // 나중에 별도 파일로 분리돼도(4단계) 도메인 컴포넌트를 import할 필요가 없다.
    custom: true,
    customComponentKey: "goalStudents",
    searchPlaceholder: "이름 또는 연락처로 검색하세요",
    // 학생 데이터는 어드민이 한 글자도 고칠 수 없다(명세 §3-D6 / §3-D7).
    // custom: true라 공용 CRUD 경로 자체가 닿지 않으므로 이 두 플래그는 실행에
    // 영향을 주지 않는다 — 선언 의도를 config에 남겨두는 문서 역할이다
    // (mentorApplications가 같은 조합을 쓴다). RLS도 sql/57이 for select로
    // 좁혀 브라우저 콘솔 직접 UPDATE까지 막는다.
    readOnly: true,
    noCreate: true,
  },
};
