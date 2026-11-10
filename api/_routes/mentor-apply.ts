// POST /api/mentor-apply
//
// 멘토 지원서 제출. mentor_applications insert 를 처리한다(명세
// docs/mentor-apply-spec.md §백엔드/데이터 3). 증빙 파일은 이 요청에 실리지
// 않는다 — 클라이언트가 이 요청 **이전에** api/_routes/mentor-apply-upload-url.js 로
// signed upload URL 을 받아 Supabase Storage 에 **직접** 올려두고, 이 요청은
// 그 결과 경로만 받아 실제로 존재하는지·크기/형식이 맞는지 재검증한다.
//
// 왜 base64 방식(구)에서 2단계 signed upload URL 방식(신)으로 바꿨나 —
//   Vercel 서버리스 함수(Node.js 런타임)의 요청 본문에는 **플랜과 무관하게 고정된
//   플랫폼 하드 리밋 4.5MB** 가 있다(vercel.json 으로 올릴 수 없음, 공식 문서
//   확인 완료). base64 오버헤드(+33%)까지 감안하면 실질 첨부 상한이 약 3.2MB 로
//   내려가는데, 시안 문구(FileDropzone.jsx HINT_TEXT)는 원래 `100MB 이하`였다.
//   본문에 파일을 싣지 않는 한 4.5MB 벽을 넘을 방법이 없으므로, 클라이언트가
//   Storage 로 직접 업로드하고 이 라우트는 텍스트 필드 + 경로만 받는 구조로
//   바꿨다. 대신 "업로드만 하고 이탈"이 만드는 고아 파일 문제가 새로 생기는데,
//   이는 파일 하단 "고아 파일" 절에 정리한다.
//   ※ 상한 수치 자체는 이후 50MB 로 재확정됐다 — 아래 MAX_FILE_BYTES 주석 참고.
//
// ⚠️ 이 라우트는 service_role 키를 쓴다 = RLS 를 통째로 우회한다
// (api/_lib/supabaseAdmin.js 파일 주석). mentor_applications 와
// mentor-applications 버킷에는 anon insert 정책이 **없으므로**, "누가 무엇을 할 수
// 있는지"의 판정을 DB 가 아니라 이 파일(과 api/_routes/mentor-apply-upload-url.js)이 전부
// 진다. 아래 7가지를 서버에서 직접 검사한다:
//   1) phone_verifications 의 verified_at 유효성 (미인증 제출 거부) + consumed_at 기록
//   2) 증빙 파일 경로 형식 검증 (경로 조작 차단) + Storage 에 실제 존재하는지 확인
//   3) 실제 업로드된 객체의 크기·MIME 을 서버가 직접 읽어 화이트리스트·상한 재검증
//      (클라이언트가 upload-url 발급 시 선언한 값은 믿지 않는다)
//   4) 저장 경로는 이 라우트가 아니라 api/_routes/mentor-apply-upload-url.js 가 서버에서
//      생성한다 (클라이언트 파일명을 경로에 쓰지 않는다)
//   5) 제출 rate limit (전화번호 기준 + IP 기준)
//   6) 필수 필드 존재·길이·허용값 재검증 (클라이언트 검증은 믿지 않는다)
//   7) 필수 동의 3종 true 확인
//
// ---------------------------------------------------------------------------
// 클라이언트 호출 규약 (폼 제출 코드는 이 주석대로 작성할 것) — 2단계 흐름
// ---------------------------------------------------------------------------
//
// ① POST /api/mentor-apply-upload-url  — signed upload URL 발급
//    요청 (application/json):
//      { phone, fileName, contentType, size }
//      · phone       — /api/verify-phone-code 로 이미 인증을 마친 번호(정규화된 숫자만).
//      · fileName    — 원본 파일명(확장자 판정용). 경로에는 쓰이지 않는다.
//      · contentType — file.type. 빈 문자열이어도 된다(NEUTRAL_MIME_TYPES).
//      · size        — file.size(바이트). **1차 필터일 뿐이다** — 실제 크기는 ③에서
//                      서버가 Storage 객체를 직접 읽어 재검증한다.
//    성공 응답: { ok: true, path, token, signedUrl }
//    실패 응답: { ok: false, reason, detail, field? }
//      reason 목록: invalid_phone · phone_not_verified · phone_verification_expired ·
//      file_required · file_type_not_allowed · invalid_payload · file_too_large ·
//      upload_url_failed · payload_too_large · method_not_allowed · invalid_content_type ·
//      cooldown · phone_hourly_limit · ip_hourly_limit(429, retry_after 포함) · unknown
//
// ② 클라이언트가 Storage 에 **직접** PUT — Supabase JS 클라이언트를 쓴다면
//      const { error } = await supabase.storage
//        .from('mentor-applications')
//        .uploadToSignedUrl(path, token, file);
//    이 단계는 Vercel 함수를 거치지 않으므로 4.5MB 본문 제한과 무관하다. 버킷은
//    비공개지만 ①에서 받은 token 이 그 경로 하나만 인가하므로 anon insert 정책 없이도
//    업로드된다.
//
// ③ POST /api/mentor-apply  — 실제 제출
//    요청 (application/json):
//      {
//        name, birth_date, gender, phone, email, residence_region,
//        university, major, admission_year, enrollment_status,
//        admission_history, final_admission_track, exam_results,
//        highschool_region, highschool_name, highschool_type,
//        gpa_average, csat_summary,                       // 선택 — 빈 값이면 '' 또는 생략
//        consult_fields, strongest_field_reason, consult_grades,
//        weekly_capacity, available_timeslot,
//        motivation, strengths, ineffective_method, situation_answer,
//        tutoring_experience,                             // 선택
//        agree_terms: true, agree_privacy: true, agree_identity: true,
//        agree_marketing, agree_ad,                       // 선택 (boolean)
//        proof_file_path: path,                           // ①의 응답 path 그대로
//        proof_file_name: file.name                        // 원본 파일명(표시·기록용, 선택)
//      }
//    성공: { ok: true, application_id }
//    실패: { ok: false, reason, detail, field?, retry_after? }  ← reason 으로 분기하고
//          화면 문구는 detail 을 그대로 노출하면 서버와 표현이 갈라지지 않는다.
//      reason 목록: invalid_phone · submit_cooldown · phone_daily_limit · ip_hourly_limit ·
//      ip_daily_limit(이상 429, retry_after 포함) · missing_field · too_long · invalid_field ·
//      invalid_option · agreement_required(이상 400) · phone_not_verified ·
//      phone_verification_expired(이상 403) · file_required · invalid_file_path ·
//      file_not_uploaded · file_type_not_allowed · file_too_large(이상 400/413/415,
//      field:'proof_file') · method_not_allowed(405) · invalid_content_type(415) ·
//      payload_too_large(413) · invalid_payload(400) · unknown(500)
//
// ⚠️ 첨부 상한은 **50MB**(MAX_FILE_BYTES) 다. 시안 원문은 100MB 였으나
//    Supabase Management API로 dev(gjowqdiopinhixfivnkx)·운영(ucjlcvqvinspmrasvsug)
//    프로젝트 전역 Storage 업로드 상한을 실측한 결과 두 프로젝트 모두
//    `fileSizeLimit: 52428800`(50MB) 이었다 — 버킷 file_size_limit 을 100MB 로
//    걸어도 전역 상한에서 먼저 막혀 100MB 문구는 애초에 지켜지지 않는 값이었다.
//    전역 상한 상향은 요금제에 걸리는 사안이고 증빙서류 용도로는 50MB 로
//    충분하다는 판단 하에, 상향 대신 50MB 정렬을 사용자 승인 하에 택했다
//    (2026-08-10, docs/mentor-apply-spec.md §0-1 결정 로그). 이 값은
//    api/_routes/mentor-apply-upload-url.js 의 1차(선언값) 필터와 이 파일의 2차(실측값)
//    필터가 같은 상수를 재사용한다(아래 export).
//
// ⚠️ 휴대폰 인증은 이 요청 **이전에** /api/send-phone-code(purpose:'mentor_apply')
//    → /api/verify-phone-code 로 끝나 있어야 한다. ①·③ 모두 그 결과(verified_at)를
//    조회할 뿐이고, consumed_at 소비는 ③에서만 일어난다(findValidPhoneVerification
//    함수 주석 참고).
//
// ---------------------------------------------------------------------------
// 고아 파일
// ---------------------------------------------------------------------------
// ①에서 업로드 URL을 발급받고 ②로 실제 업로드까지 했지만 ③(제출)까지 가지 않고
// 이탈하면 mentor-applications 버킷에 아무도 참조하지 않는 객체가 남는다. ③이
// 도달했더라도 phone_not_verified/phone_verification_expired 나 rate limit 으로
// 거절되면 마찬가지다(이 경우들은 이 라우트가 능동적으로 지우지 않는다 — 아직
// 유효한 재시도 경로일 수 있어서다). 반대로 ③에서 크기·형식이 위반된 객체는
// verifyUploadedProof 가 그 자리에서 지운다.
//
// 정리 배치는 **지금 만들지 않는다**(작업 범위 밖, 후속 과제). 권장 전략:
// mentor-applications 버킷을 날짜 폴더(`YYYY-MM-DD/`)로 순회하며 `created_at` 이
// N시간(예: 24h) 이상 지났고 mentor_applications.proof_file_path 어디에도 없는
// 객체를 지운다. cron(Vercel Cron 또는 Supabase Edge Function)으로 하루 1회면
// 충분한 규모다.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { VercelResponse } from "@vercel/node";
import { defineHandler } from "../_lib/handler.js";
import {
  getClientIp,
  isValidMobile,
  maskPhone,
  normalizePhone,
} from "../_lib/phoneCode.js";
import { createSupabaseAdmin } from "../_lib/supabaseAdmin.js";

// service_role 클라이언트·타이밍에 민감한 인증 소비 로직 등 Node 전용 API 를 쓰는
// 이 저장소 api/* 형제 파일들과 런타임을 맞춘다.
export const config = { runtime: "nodejs" };

// ---------------------------------------------------------------------------
// 상수
//
// 이 중 export 된 것들은 api/_routes/mentor-apply-upload-url.js 가 그대로 import 해
// 재사용한다 — 화이트리스트·상한이 두 파일에서 따로 갱신되며 어긋나는 것을
// 막기 위해서다(이 저장소에 화이트리스트 전용 공유 모듈이 없어, 새 파일을
// 만드는 대신 이미 두 라우트 중 "정본"격인 이 파일에서 명명 export 했다).
// ---------------------------------------------------------------------------

export const BUCKET = "mentor-applications";

// 인증 목적. send-phone-code.js:36 ALLOWED_PURPOSES 와 같은 값이어야 한다.
// 이 값으로 걸러야 회원가입용으로 받은 인증 레코드를 지원서 제출에 돌려쓰지 못한다.
export const PHONE_PURPOSE = "mentor_apply";

// 인증 완료 후 제출까지 허용하는 시간. **명세에 수치가 없어 잡은 값이다.**
// 폼이 길어(30개 필드) 인증을 먼저 하고 한참 뒤 제출하는 흐름이 정상이라 3분(코드
// TTL)보다 훨씬 길게 잡았다. 너무 길면 인증 직후 자리를 뜬 사이 남이 제출하는 창이
// 넓어지므로 30분에서 시작한다. api/_routes/mentor-apply-upload-url.js 의 업로드 URL 발급도
// findValidPhoneVerification 을 통해 같은 TTL 을 쓴다 — 별도로 맞출 필요가 없다.
const VERIFIED_TTL_SECONDS = 30 * 60;

// 요청 본문 상한. 첨부 파일이 더 이상 이 요청에 실리지 않으므로(위 "왜 2단계
// 방식으로 바꿨나" 참고) Vercel 함수 본문 하드 리밋(4.5MB)을 역산할 이유가 없다.
// FIELD_SPECS 30여 개 필드가 전부 한글로 꽉 찬 최악의 경우도 문자 수 합 ≈8천자 ×
// UTF-8 한글 3바이트 ≈24KB 라, JSON 키·구조 오버헤드를 감안해도 8배(≈192KB) 여유면
// 충분하다.
const MAX_BODY_BYTES = 192 * 1024;

// 첨부 상한. (구)버전은 base64 본문이 Vercel 4.5MB 벽에 걸려 이 값을 3.2MB 로
// 낮춰야 했지만, 파일이 Storage 로 직접 업로드되는 지금은 그 제약이 없다.
//
// 값은 100MB(시안 원문)가 아니라 **50MB** 다 — Supabase 프로젝트 전역 Storage
// 업로드 상한을 실측(Management API `/v1/projects/{ref}/config/storage`)한
// 결과 dev·운영 둘 다 `fileSizeLimit: 52428800`(50MB) 였고, 버킷
// file_size_limit 을 얼마로 걸든 그보다 먼저 전역 상한이 막는다. 100MB 를
// 쓰려면 요금제 확인 + 전역 상한 상향이 선행돼야 하므로, 증빙서류 용도로는
// 50MB 로 충분하다는 판단 하에 상향 대신 50MB 정렬을 사용자 승인 하에 택했다
// (2026-08-10 확정, docs/mentor-apply-spec.md §0-1 결정 로그 / §미해결 42·44).
// FileDropzone.jsx 의 DEFAULT_MAX_SIZE_BYTES(클라이언트 UX 용, 번들 분리로
// 이 상수를 import 하지 않고 별도로 든다)와 반드시 같은 값을 유지할 것.
export const MAX_FILE_BYTES = 50 * 1024 * 1024;
export const MAX_FILE_MB_LABEL = "50";

// 확장자 → 허용 MIME. 확장자만 보면 파일명을 바꿔 우회되고, MIME 만 보면 브라우저가
// 값을 안 채워주는 경우(특히 .hwp)를 전부 막게 되므로 둘 다 본다.
export const ALLOWED_FILE_TYPES = {
  pdf: ["application/pdf"],
  png: ["image/png"],
  jpg: ["image/jpeg"],
  jpeg: ["image/jpeg"],
  // 한컴오피스는 OS·브라우저마다 MIME 이 제각각이다. 어느 것도 표준이 아니라 알려진
  // 값을 모두 받는다.
  hwp: [
    "application/x-hwp",
    "application/haansofthwp",
    "application/vnd.hancom.hwp",
    "application/hwp",
  ],
};

// 브라우저가 MIME 을 판정하지 못하면 '' 또는 octet-stream 을 준다. 이때는 확장자
// 판정만으로 통과시킨다 — 여기서 막으면 정상 .hwp 제출이 통째로 거절된다.
export const NEUTRAL_MIME_TYPES = ["", "application/octet-stream"];

// 증빙 파일 저장 경로 형식. api/_routes/mentor-apply-upload-url.js 가 만드는 형식과 정확히
// 일치해야 한다 — `YYYY-MM-DD/<uuid>.<확장자>`. 클라이언트가 이 값을 그대로 돌려
// 보내므로, 전체 문자열이 이 패턴과 정확히 일치하지 않으면 무조건 거부한다 — 이
// 정규식 자체가 `../`·슬래시 삽입 같은 경로 조작의 차단선이다.
const PROOF_PATH_PATTERN = new RegExp(
  `^\\d{4}-\\d{2}-\\d{2}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(${Object.keys(
    ALLOWED_FILE_TYPES,
  ).join("|")})$`,
);

// 제출 한도. api/_lib/phoneCode.js 의 checkSendLimits 상수 패턴을 그대로 따른다.
// 발송과 달리 외부 요금이 나가지 않으므로 전역 상한은 두지 않았고, 대신 번호·IP
// 기준만 건다. 지원서는 한 사람이 여러 번 낼 이유가 없어 수치가 훨씬 빡빡하다.
const SUBMIT_COOLDOWN_SECONDS = 60;
const MAX_SUBMITS_PER_PHONE_DAY = 3;
const MAX_SUBMITS_PER_IP_HOUR = 5;
const MAX_SUBMITS_PER_IP_DAY = 10;

// ---------------------------------------------------------------------------
// 허용값 화이트리스트
//
// src/data/mentorApply.js 의 옵션 상수와 **같은 값의 사본**이다. api/ 는 클라이언트
// 번들과 분리된 서버리스 함수라 src/ 를 import 하지 않는 것이 이 저장소의 구조이므로
// 어쩔 수 없이 복제했다. 값의 정본은 DB CHECK 제약(sql, mentor_applications_*_check)
// 이고, 셋 중 하나만 고치면 조용히 어긋나므로 **셋을 항상 함께** 고칠 것.
// ---------------------------------------------------------------------------

// QA 지시(2026-08-21)로 신설 — src/data/mentorApply.ts GENDER_OPTIONS 와 값이 같아야 한다.
// mentor_applications.gender 컬럼의 CHECK 제약(supabase/migrations/
// 20260821000006_mentor_apply_gender.sql)과도 반드시 함께 고칠 것 — 셋 중 하나만 바뀌면
// 조용히 어긋난다(파일 상단 "허용값 화이트리스트" 주석과 같은 사정).
const GENDERS = ["남", "여"];
const RESIDENCE_REGIONS = [
  // QA 지시(2026-08-21)로 "서울"을 추가했다 — src/data/mentorApply.ts MENTOR_REGION_OPTIONS
  // 와 반드시 함께 고칠 것(파일 상단 "허용값 화이트리스트" 주석 참고).
  // QA 시트 행93(2026-09-07)으로 "수도권"→"경기". 위 데이터 파일과 항상 동일해야 한다.
  "서울",
  "부산·경남",
  "경기",
  "대구·경북",
  "충청·강원",
  "호남·제주",
  "해외",
];
const ENROLLMENT_STATUSES = ["재학", "휴학", "졸업"];
const ADMISSION_HISTORIES = ["현역", "재수", "삼수+"];
const FINAL_TRACKS = ["수시", "정시"];
const HIGHSCHOOL_TYPES = [
  "일반고",
  "자율형 사립고",
  "자율형 공립고",
  "외국어고",
  "국제고",
  "과학고",
  "영재학교",
  "예술고·체육고",
  "특성화·마이스터",
  "검정고시",
  "대안학교",
  "해외고",
];
const CONSULT_FIELDS = [
  "공부 방법",
  "계획·시간관리",
  "내신·시험 대비",
  "진로·학과",
  "대학·입시전략",
  "수행평가·학생부",
];
const CONSULT_GRADES = ["중1~중2", "중3", "고1", "고2", "고3", "N수생"];
const WEEKLY_CAPACITIES = ["1~2회", "3~5회", "6~9회", "10회 이상"];
const AVAILABLE_TIMESLOTS = [
  "평일 오후",
  "평일 저녁",
  "주말 오전",
  "주말 오후",
  "주말 저녁",
];

// 입학년도 범위. src/lib/validators.js 의 isValidAdmissionYear 와 같은 규칙이다
// (하한 1990, 상한 현재연도 + 1). 클라이언트에서 통과한 값이 서버에서 거절되면 안 된다.
const MIN_ADMISSION_YEAR = 1990;

// 이메일 정규식도 src/lib/validators.js 와 동일하게 맞춘다.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---------------------------------------------------------------------------
// 필드 스펙
//
// 30개 필드를 if 문으로 나열하면 검사 하나가 빠져도 눈에 띄지 않는다. 표로 두면
// 명세 §폼 명세의 표와 1:1로 대조할 수 있다.
//   kind: 'text' | 'enum' | 'enumArray' | 'year' | 'decimal'
//   max : 문자열 길이 상한. 텍스트영역 4종의 값(600/800/1000/2000)은 명세 확정값이고,
//         한 줄 입력의 상한은 **명세 미정의라 서버 방어용으로 잡은 값**이다.
// 길이는 JS 문자열 length(UTF-16 코드유닛) 기준 — validators.js 의 isWithinMaxLength
// 와 같은 기준이라야 클라이언트 통과분이 서버에서 거절되지 않는다.
// ---------------------------------------------------------------------------

/** 30개 필드 검증 표. kind별로 필요한 옵션 필드가 갈리므로 전부 선택 필드로 둔다. */
type FieldSpec = {
  key: string;
  kind: "text" | "birthDate" | "year" | "decimal" | "enum" | "enumArray";
  required: boolean;
  max?: number;
  min?: number;
  regex?: RegExp;
  options?: string[];
  errorField?: string;
  emptyReason?: string;
  emptyDetail?: string;
  regexReason?: string;
  regexDetail?: string;
};

const FIELD_SPECS: FieldSpec[] = [
  // 1. 지원자 정보
  { key: "name", kind: "text", required: true, max: 50 },
  { key: "birth_date", kind: "birthDate", required: true },
  // QA 지시(2026-08-21) 신설 필드. supabase/migrations/20260821000006_mentor_apply_gender.sql
  // 참고.
  { key: "gender", kind: "enum", required: true, options: GENDERS },
  { key: "email", kind: "text", required: true, max: 254, regex: EMAIL_REGEX },
  {
    key: "residence_region",
    kind: "enum",
    required: true,
    options: RESIDENCE_REGIONS,
  },
  // 2. 대학 및 합격 전형
  { key: "university", kind: "text", required: true, max: 100 },
  { key: "major", kind: "text", required: true, max: 100 },
  { key: "admission_year", kind: "year", required: true },
  {
    key: "enrollment_status",
    kind: "enum",
    required: true,
    options: ENROLLMENT_STATUSES,
  },
  {
    key: "admission_history",
    kind: "enum",
    required: true,
    options: ADMISSION_HISTORIES,
  },
  {
    key: "final_admission_track",
    kind: "enum",
    required: true,
    options: FINAL_TRACKS,
  },
  { key: "exam_results", kind: "text", required: true, max: 2000 },
  // 3. 출신 고등학교
  { key: "highschool_region", kind: "text", required: true, max: 100 },
  { key: "highschool_name", kind: "text", required: true, max: 100 },
  {
    key: "highschool_type",
    kind: "enum",
    required: true,
    options: HIGHSCHOOL_TYPES,
  },
  { key: "gpa_average", kind: "decimal", required: false, min: 0, max: 9.99 },
  { key: "csat_summary", kind: "text", required: false, max: 200 },
  // 4. 멘토 역량
  {
    key: "consult_fields",
    kind: "enumArray",
    required: true,
    options: CONSULT_FIELDS,
  },
  { key: "strongest_field_reason", kind: "text", required: true, max: 600 },
  {
    key: "consult_grades",
    kind: "enumArray",
    required: true,
    options: CONSULT_GRADES,
  },
  {
    key: "weekly_capacity",
    kind: "enum",
    required: true,
    options: WEEKLY_CAPACITIES,
  },
  {
    key: "available_timeslot",
    kind: "enum",
    required: true,
    options: AVAILABLE_TIMESLOTS,
  },
  { key: "motivation", kind: "text", required: true, max: 1000 },
  { key: "strengths", kind: "text", required: true, max: 1000 },
  { key: "ineffective_method", kind: "text", required: true, max: 600 },
  { key: "situation_answer", kind: "text", required: true, max: 800 },
  { key: "tutoring_experience", kind: "text", required: false, max: 500 },
  // 5. 증빙 서류 — 파일 자체가 아니라 api/_routes/mentor-apply-upload-url.js 가 발급한 경로다.
  // 화면 필드 하나(증빙 서류 첨부)에 대응하므로 에러는 이 두 필드 모두 'proof_file'로
  // 흘려보낸다(MentorApplyForm.jsx SERVER_REASON_TO_FIELD 와 맞춘다).
  {
    key: "proof_file_path",
    kind: "text",
    required: true,
    max: 300,
    regex: PROOF_PATH_PATTERN,
    errorField: "proof_file",
    emptyReason: "file_required",
    emptyDetail: "재학 증빙 서류를 첨부해 주세요.",
    regexReason: "invalid_file_path",
    regexDetail:
      "증빙 파일 정보가 올바르지 않습니다. 처음부터 다시 시도해 주세요.",
  },
  // 원본 파일명(표시·기록용). 사용자가 지어 붙인 값이라 XSS 방지를 위해 화면
  // 렌더링 시 반드시 이스케이프해야 한다(sql/52_mentor_applications.sql 컬럼 주석).
  {
    key: "proof_file_name",
    kind: "text",
    required: false,
    max: 255,
    errorField: "proof_file",
  },
];

// 5. 동의. 앞의 3개는 반드시 true 여야 하고, 뒤의 2개는 값만 받는다.
const REQUIRED_AGREEMENTS = ["agree_terms", "agree_privacy", "agree_identity"];
const OPTIONAL_AGREEMENTS = ["agree_marketing", "agree_ad"];

// ---------------------------------------------------------------------------
// 유틸
// ---------------------------------------------------------------------------

// api/_routes/mentor-apply-upload-url.js 도 같은 트림 규칙으로 phone/fileName/contentType 을
// 다뤄야 두 라우트의 "빈 값" 판정이 어긋나지 않는다.
export function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function fail(
  res: VercelResponse,
  status: number,
  reason: string | undefined,
  detail: string,
  extra: Record<string, unknown> = {},
) {
  return void res.status(status).json({ ok: false, reason, detail, ...extra });
}

/** 생년월일 8자리 + 실제 존재하는 날짜인지. src/lib/validators.js isValidBirthDate 와 동일 규칙. */
function isValidBirthDate(digits: string): boolean {
  if (!/^\d{8}$/.test(digits)) return false;

  const year = Number(digits.slice(0, 4));
  const month = Number(digits.slice(4, 6));
  const day = Number(digits.slice(6, 8));

  if (year < 1900) return false;

  const birth = new Date(year, month - 1, day);

  if (Number.isNaN(birth.getTime())) return false;
  if (
    birth.getFullYear() !== year ||
    birth.getMonth() !== month - 1 ||
    birth.getDate() !== day
  ) {
    return false;
  }

  return birth.getTime() <= Date.now();
}

/** 필드/업로드/인증 검증 실패 공통 형태. */
type FieldError = {
  status: number;
  reason: string;
  detail: string;
  field?: string;
};

/**
 * FIELD_SPECS 대로 본문을 검사해 insert 에 쓸 값으로 바꾼다.
 * @returns {{ error?: {status:number, reason:string, detail:string, field:string}, values?: object }}
 */
function validateFields(body: Record<string, unknown>): {
  error?: FieldError;
  values?: Record<string, unknown>;
} {
  const values: Record<string, unknown> = {};

  for (const spec of FIELD_SPECS) {
    const raw = body[spec.key];
    const isArrayKind = spec.kind === "enumArray";
    const text = isArrayKind ? "" : clean(raw);
    const empty = isArrayKind
      ? !Array.isArray(raw) || raw.length === 0
      : text === "";

    if (empty) {
      if (spec.required) {
        return {
          error: {
            status: 400,
            reason: spec.emptyReason || "missing_field",
            detail: spec.emptyDetail || "필수 항목이 비어 있습니다.",
            field: spec.errorField || spec.key,
          },
        };
      }

      // 선택 항목의 빈 값은 null 로 저장한다. 빈 문자열을 넣으면 "입력했는데 공백"과
      // "입력 안 함"이 구분되지 않는다.
      values[spec.key] = null;
      continue;
    }

    if (spec.kind === "text") {
      if (text.length > spec.max!) {
        return {
          error: {
            status: 400,
            reason: "too_long",
            detail: `${spec.max}자 이내로 입력해 주세요.`,
            field: spec.errorField || spec.key,
          },
        };
      }

      if (spec.regex && !spec.regex.test(text)) {
        return {
          error: {
            status: 400,
            reason: spec.regexReason || "invalid_field",
            detail: spec.regexDetail || "형식이 올바르지 않습니다.",
            field: spec.errorField || spec.key,
          },
        };
      }

      values[spec.key] = text;
      continue;
    }

    if (spec.kind === "birthDate") {
      if (!isValidBirthDate(text)) {
        return {
          error: {
            status: 400,
            reason: "invalid_field",
            detail: "생년월일을 숫자 8자리로 정확히 입력해 주세요.",
            field: spec.key,
          },
        };
      }

      values[spec.key] = text;
      continue;
    }

    if (spec.kind === "year") {
      const maxYear = new Date().getFullYear() + 1;

      if (
        !/^\d{4}$/.test(text) ||
        Number(text) < MIN_ADMISSION_YEAR ||
        Number(text) > maxYear
      ) {
        return {
          error: {
            status: 400,
            reason: "invalid_field",
            detail: `입학년도는 ${MIN_ADMISSION_YEAR}~${maxYear} 사이의 4자리 연도여야 합니다.`,
            field: spec.key,
          },
        };
      }

      values[spec.key] = Number(text);
      continue;
    }

    if (spec.kind === "decimal") {
      const parsed = Number(text);

      // numeric(4,2) 컬럼이라 소수 둘째 자리까지만 받는다. 범위를 넘기면 DB 가
      // 22003 을 던지고 그건 프론트가 해석할 수 없는 에러가 된다.
      if (
        !Number.isFinite(parsed) ||
        parsed < spec.min! ||
        parsed > spec.max!
      ) {
        return {
          error: {
            status: 400,
            reason: "invalid_field",
            detail: `${spec.min}~${spec.max} 사이의 숫자로 입력해 주세요.`,
            field: spec.key,
          },
        };
      }

      values[spec.key] = Math.round(parsed * 100) / 100;
      continue;
    }

    if (spec.kind === "enum") {
      if (!spec.options!.includes(text)) {
        return {
          error: {
            status: 400,
            reason: "invalid_option",
            detail: "선택할 수 없는 값입니다.",
            field: spec.key,
          },
        };
      }

      values[spec.key] = text;
      continue;
    }

    if (spec.kind === "enumArray") {
      const picked = [
        ...new Set((raw as unknown[]).map((item) => clean(item))),
      ];

      const hasUnknown = picked.some((item) => !spec.options!.includes(item));

      if (picked.length > spec.options!.length || hasUnknown) {
        return {
          error: {
            status: 400,
            reason: "invalid_option",
            detail: "선택할 수 없는 값이 포함되어 있습니다.",
            field: spec.key,
          },
        };
      }

      values[spec.key] = picked;
    }
  }

  for (const key of REQUIRED_AGREEMENTS) {
    if (body[key] !== true) {
      return {
        error: {
          status: 400,
          reason: "agreement_required",
          detail: "필수 약관에 모두 동의해야 제출할 수 있습니다.",
          field: key,
        },
      };
    }

    values[key] = true;
  }

  for (const key of OPTIONAL_AGREEMENTS) {
    values[key] = body[key] === true;
  }

  return { values };
}

/**
 * 클라이언트가 이미 Storage 에 올려둔 증빙 파일을 서버가 직접 재검증한다.
 *
 * proof_file_path 는 FIELD_SPECS(PROOF_PATH_PATTERN)에서 형식이 이미 걸러진
 * 뒤라 여기 도달한 시점엔 경로 조작 여지가 없다. 이 함수가 하는 일은 그
 * 경로에 실제로 객체가 있는지, 그리고 **클라이언트가 upload-url 발급 시 선언한
 * size/contentType 이 아니라 Storage 가 실제로 들고 있는 값**으로 상한·화이트
 * 리스트를 다시 검사하는 것이다 — 선언값은 거짓말할 수 있어 믿지 않는다.
 *
 * 위반(크기 초과·형식 불일치)이면 그 객체를 지운다. 존재하지 않으면(=업로드
 * URL만 받고 실제 업로드는 안 한 경우) 지울 것이 없으니 그냥 거절한다.
 */
async function verifyUploadedProof(
  supabase: SupabaseClient,
  path: string,
): Promise<{ error?: FieldError }> {
  const extension = path.split(".").pop()!.toLowerCase();
  const allowedMimes = ALLOWED_FILE_TYPES[extension];

  const { data: info, error: infoError } = await supabase.storage
    .from(BUCKET)
    .info(path);

  if (infoError || !info) {
    return {
      error: {
        status: 400,
        reason: "file_not_uploaded",
        detail: "첨부파일 업로드가 확인되지 않았습니다. 다시 첨부해 주세요.",
        field: "proof_file",
      },
    };
  }

  const size = Number(info.size ?? info.metadata?.size ?? 0);
  const contentType = String(
    info.contentType ?? info.metadata?.mimetype ?? "",
  ).toLowerCase();

  const sizeOk = Number.isFinite(size) && size > 0 && size <= MAX_FILE_BYTES;
  const typeOk =
    NEUTRAL_MIME_TYPES.includes(contentType) ||
    allowedMimes.includes(contentType);

  if (sizeOk && typeOk) {
    return {};
  }

  const { error: removeError } = await supabase.storage
    .from(BUCKET)
    .remove([path]);

  if (removeError) {
    console.error("[mentor-apply] 위반 첨부파일 정리 실패:", path, removeError);
  }

  if (!sizeOk) {
    return {
      error: {
        status: 413,
        reason: "file_too_large",
        detail: `첨부파일은 ${MAX_FILE_MB_LABEL}MB 이하만 올릴 수 있습니다.`,
        field: "proof_file",
      },
    };
  }

  return {
    error: {
      status: 415,
      reason: "file_type_not_allowed",
      detail: "파일 형식이 확장자와 일치하지 않습니다.",
      field: "proof_file",
    },
  };
}

function isoAgo(seconds: number): string {
  return new Date(Date.now() - seconds * 1000).toISOString();
}

async function countSubmitsSince(
  supabase: SupabaseClient,
  column: string,
  value: string,
  seconds: number,
): Promise<number> {
  const { count, error } = await supabase
    .from("mentor_applications")
    .select("id", { count: "exact", head: true })
    .eq(column, value)
    .gte("created_at", isoAgo(seconds));

  if (error) throw error;
  return count || 0;
}

/**
 * mentor_applications 는 insert 가 **성공**한 건만 담는다 — 필드 검증 실패·업로드
 * 실패로 끝난 시도는 countSubmitsSince 어디에도 잡히지 않는다. 반면
 * consumePhoneVerification 은 성공이든 실패든 시도 시작 시점에 무조건 phone_verifications
 * 행을 소비한다(그 함수 주석 참고). 그래서 이 목적(purpose)으로 "소비된" 행 수가
 * 실패 포함 실제 시도 수에 더 가깝다 — 새 테이블 없이 기존 자산(phone_verifications)
 * 으로 실패 요청까지 세는 근사치다. 완벽히 하려면 전용 시도 로그 테이블이 필요하다
 * (리포트 참고).
 */
async function countAttemptsSince(
  supabase: SupabaseClient,
  column: string,
  value: string,
  seconds: number,
): Promise<number> {
  const { count, error } = await supabase
    .from("phone_verifications")
    .select("id", { count: "exact", head: true })
    .eq("purpose", PHONE_PURPOSE)
    .not("consumed_at", "is", null)
    .eq(column, value)
    .gte("consumed_at", isoAgo(seconds));

  if (error) throw error;
  return count || 0;
}

/**
 * 제출 한도. api/_lib/phoneCode.js checkSendLimits 와 같은 형태로 돌려준다.
 * @returns {Promise<{allowed: boolean, reason?: string, retryAfter?: number}>}
 */
async function checkSubmitLimits(
  supabase: SupabaseClient,
  { phone, ip }: { phone: string; ip: string | null },
): Promise<{ allowed: boolean; reason?: string; retryAfter?: number }> {
  // 1) 같은 번호의 직전 제출 — 더블클릭·재시도로 같은 지원서가 두 벌 쌓이는 걸 막는다.
  const { data: latest, error: latestError } = await supabase
    .from("mentor_applications")
    .select("created_at")
    .eq("phone", phone)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestError) throw latestError;

  if (latest) {
    const elapsed = (Date.now() - new Date(latest.created_at).getTime()) / 1000;

    if (elapsed < SUBMIT_COOLDOWN_SECONDS) {
      return {
        allowed: false,
        reason: "submit_cooldown",
        retryAfter: Math.ceil(SUBMIT_COOLDOWN_SECONDS - elapsed),
      };
    }
  }

  // 2) 번호 기준 일일. insert 성공 카운트와 소비된 인증(=시도) 카운트 중 큰 쪽을 쓴다
  // — 실패로 끝난 시도도 재시도를 막아야 하기 때문이다.
  const phoneDailyCount = Math.max(
    await countSubmitsSince(supabase, "phone", phone, 86400),
    await countAttemptsSince(supabase, "phone", phone, 86400),
  );

  if (phoneDailyCount >= MAX_SUBMITS_PER_PHONE_DAY) {
    return { allowed: false, reason: "phone_daily_limit", retryAfter: 86400 };
  }

  // 3) IP 기준 — 번호를 바꿔가며 도배하는 경우. 마찬가지로 두 카운트 중 큰 쪽.
  if (ip) {
    const ipHourlyCount = Math.max(
      await countSubmitsSince(supabase, "request_ip", ip, 3600),
      await countAttemptsSince(supabase, "request_ip", ip, 3600),
    );

    if (ipHourlyCount >= MAX_SUBMITS_PER_IP_HOUR) {
      return { allowed: false, reason: "ip_hourly_limit", retryAfter: 3600 };
    }

    const ipDailyCount = Math.max(
      await countSubmitsSince(supabase, "request_ip", ip, 86400),
      await countAttemptsSince(supabase, "request_ip", ip, 86400),
    );

    if (ipDailyCount >= MAX_SUBMITS_PER_IP_DAY) {
      return { allowed: false, reason: "ip_daily_limit", retryAfter: 86400 };
    }
  }

  return { allowed: true };
}

const NOT_VERIFIED_ERROR: { error: FieldError } = {
  error: {
    status: 403,
    reason: "phone_not_verified",
    detail: "휴대폰 본인인증을 다시 진행해 주세요.",
  },
};

/**
 * 유효한(= 소비되지 않았고 TTL 내인) 휴대폰 인증 레코드를 찾는다. **소비하지
 * 않는다** — api/_routes/mentor-apply-upload-url.js 가 이 함수를 그대로 가져다 쓴다.
 * upload-url 발급은 인증 여부만 확인하면 되고, 여기서 consumed_at 을 찍으면
 * 실제 제출(mentor-apply.js) 전에 인증이 소비돼 버려 정상 흐름이 막힌다
 * (team-lead 지시: "여기서 consumed_at 을 찍지는 마라").
 *
 * @returns {Promise<{error?: object, row?: {id: string, verified_at: string}}>}
 */
export async function findValidPhoneVerification(
  supabase: SupabaseClient,
  phone: string,
): Promise<{
  error?: FieldError;
  row?: { id: string; verified_at: string };
}> {
  const { data: row, error: selectError } = await supabase
    .from("phone_verifications")
    .select("id, verified_at")
    .eq("phone", phone)
    .eq("purpose", PHONE_PURPOSE)
    .is("consumed_at", null)
    .not("verified_at", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (selectError) throw selectError;
  if (!row) return NOT_VERIFIED_ERROR;

  const verifiedAgo = (Date.now() - new Date(row.verified_at).getTime()) / 1000;

  if (verifiedAgo > VERIFIED_TTL_SECONDS) {
    return {
      error: {
        status: 403,
        reason: "phone_verification_expired",
        detail:
          "본인인증 후 시간이 오래 지났습니다. 인증을 다시 진행해 주세요.",
      },
    };
  }

  return { row };
}

/**
 * 휴대폰 인증 레코드를 찾아 **그 자리에서 소비한다.**
 *
 * 조회와 소비를 붙여둔 이유 — update 의 `.is('consumed_at', null)` 조건이 곧
 * 동시성 잠금이다. 같은 인증으로 두 요청이 동시에 들어오면 한쪽만 1행을 갱신하고
 * 다른 쪽은 0행이 되어 거절된다. 조회만 하고 나중에 소비하면 그 사이가 열려 있다.
 *
 * 소비를 insert **이전에** 하는 것은 의도된 트레이드오프다. 뒤에서 객체 검증이나
 * insert 가 실패하면 사용자는 인증을 다시 받아야 하지만(쿨타임 60초), 반대로
 * 하면 중복 제출을 막을 방법이 없다. 지원서가 두 벌 쌓이는 쪽이 더 나쁘다.
 *
 * 핸들러에서 이 함수는 **Storage 객체 재검증(verifyUploadedProof)보다 먼저**
 * 호출된다. phoneCode.js 의 발송 rate limit(전화번호·IP·전역 3중)을 거쳐야만
 * verified_at 이 채워지므로, 이 함수를 통과시키는 것 자체가 "인증 없는 Storage
 * 조회 시도"를 막는 방어선이다.
 *
 * @returns {Promise<{error?: object, verifiedAt?: string}>}
 */
async function consumePhoneVerification(
  supabase: SupabaseClient,
  phone: string,
): Promise<{ error?: FieldError; verifiedAt?: string }> {
  const found = await findValidPhoneVerification(supabase, phone);

  if (found.error) return found;

  const { data: consumed, error: consumeError } = await supabase
    .from("phone_verifications")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", found.row!.id)
    .is("consumed_at", null)
    .select("id");

  if (consumeError) throw consumeError;
  if (!consumed || consumed.length === 0) return NOT_VERIFIED_ERROR;

  return { verifiedAt: found.row!.verified_at };
}

// ---------------------------------------------------------------------------
// 핸들러
// ---------------------------------------------------------------------------

export default defineHandler({
  methods: ["POST"],
  auth: "none",
  errorShape: "okDetail",
  // dev 원본 405는 { ok:false, reason:"method_not_allowed", detail } 였다 —
  // methodNotAllowedExtra로 reason을 되살린다(batch-8, W7 해소).
  methodNotAllowedMessage: "Method not allowed",
  methodNotAllowedExtra: { reason: "method_not_allowed" },
  unhandledMessage:
    "지원서 제출 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
  logLabel: "mentor-apply",
  handler: async (req, res, ctx) => {
    const contentType = String(req.headers["content-type"] || "");

    if (!contentType.includes("application/json")) {
      return fail(
        res,
        415,
        "invalid_content_type",
        "application/json 으로 보내 주세요.",
      );
    }

    // 본문을 실제로 펼치기 전에 헤더로 먼저 거른다. 첨부가 더 이상 이 요청에
    // 실리지 않으므로(파일 상단 주석) 여기 걸리는 요청은 거의 항상 오작동·악용이다.
    const contentLength = Number(req.headers["content-length"] || 0);

    if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
      return fail(res, 413, "payload_too_large", "요청 크기가 너무 큽니다.");
    }

    const body = req.body;

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return fail(res, 400, "invalid_payload", "요청 본문을 읽을 수 없습니다.");
    }

    const phone = normalizePhone(body.phone);

    if (!isValidMobile(phone)) {
      return fail(
        res,
        400,
        "invalid_phone",
        "휴대폰 번호 형식이 올바르지 않습니다.",
        {
          field: "phone",
        },
      );
    }

    const ip = getClientIp(req);
    // verifyUploadedProof 가 위반 객체를 스스로 지우므로, 여기서 추적하는 건 "검증까지
    // 통과했는데 그 뒤(insert) 단계가 실패한" 경우뿐이다 — 이때만 고아가 남는다.
    let objectPath: string | undefined;
    let objectVerified = false;

    // 이 아래로는 값싼 검사부터 비싼 검사 순으로 배치한다:
    //   rate limit(DB 카운트 조회) → 필드 화이트리스트 검증(메모리) → 휴대폰 인증
    //   확인(DB, 성공/실패 불문 소비) → Storage 객체 재검증(외부 API 호출 2회 —
    //   info() 조회 + 위반 시 remove()) → insert.
    // 인증 확인을 객체 검증보다 앞에 두는 이유는 이전 버전(base64 디코딩)과 같다 —
    // 인증 없는 공개 엔드포인트에서 비싼 외부 호출을 반복시키는 값싼 공격 경로를
    // 막는다. consumePhoneVerification 을 통과해야만(=phoneCode.js 의 발송 rate
    // limit 을 거쳐 실제로 인증한 번호여야만) Storage 조회에 도달한다.
    try {
      const supabase = ctx.supabaseAdmin;

      const limits = await checkSubmitLimits(supabase, { phone, ip });

      if (!limits.allowed) {
        return fail(res, 429, limits.reason, "잠시 후 다시 시도해 주세요.", {
          retry_after: limits.retryAfter,
        });
      }

      const { error: fieldError, values } = validateFields(body);

      if (fieldError) {
        const { status, ...rest } = fieldError;
        return void res.status(status).json({ ok: false, ...rest });
      }

      const verification = await consumePhoneVerification(supabase, phone);

      if (verification.error) {
        const { status, ...rest } = verification.error;
        return void res.status(status).json({ ok: false, ...rest });
      }

      // 인증된 번호만 여기 도달한다. 이제부터 비싼 작업(Storage 조회)을 한다.
      objectPath = (values as Record<string, unknown>)
        .proof_file_path as string;

      const proof = await verifyUploadedProof(supabase, objectPath);

      if (proof.error) {
        const { status, ...rest } = proof.error;
        return void res.status(status).json({ ok: false, ...rest });
      }

      objectVerified = true;

      const { data: inserted, error: insertError } = await supabase
        .from("mentor_applications")
        .insert({
          ...values,
          phone,
          phone_verified_at: verification.verifiedAt,
          request_ip: ip,
        })
        .select("id")
        .single();

      if (insertError) throw insertError;

      return void res
        .status(200)
        .json({ ok: true, application_id: inserted.id });
    } catch (error) {
      // insert 가 실패했는데 검증까지 끝낸 파일만 남으면 아무도 참조하지 않는
      // 고아가 된다. 정리 자체가 또 실패할 수 있으므로 실패해도 원래 에러 응답은
      // 그대로 낸다.
      if (objectVerified) {
        const supabase = createSupabaseAdmin();
        const { error: removeError } = await supabase.storage
          .from(BUCKET)
          .remove([objectPath!]);

        if (removeError) {
          console.error(
            "[mentor-apply] 고아 파일 정리 실패:",
            objectPath,
            removeError,
          );
        }
      }

      // 로그에도 번호를 그대로 남기지 않는다(phoneCode.js maskPhone 관례).
      // 경로·파일명 같은 내부 식별자는 응답에 넣지 않는다.
      console.error("[mentor-apply] 제출 실패:", maskPhone(phone), error);

      return fail(
        res,
        500,
        "unknown",
        "지원서 제출 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
      );
    }
  },
});
