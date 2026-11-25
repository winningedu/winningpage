import { ExternalLink } from "lucide-react";
import { useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { ApiError } from "@/lib/http/client";
import { MENTOR_APPLICATION_STATUS_OPTIONS } from "@/lib/mentor-application/status";
import { toastSuccess, toastWarning } from "@/pages/admin/shared/adminToast";
import { normalizeArray } from "@/pages/admin/shared/csvExport";
import { ActionButton, Field, Select } from "@/pages/admin/shared/formFields";
import { AdminDetailSkeleton } from "@/pages/admin/shared/skeletons/AdminDetailSkeleton";
import {
  type MentorApplicationRow,
  reportMentorError,
  useLoadErrorToast,
  useMentorApplication,
  useMentorProofUrl,
  useSaveMentorStatus,
} from "./api";
import type { MentorApplicationsAdminProps } from "./MentorApplicationsAdmin";
import { MENTOR_APPLICATIONS_PATH } from "./paths";

// 멘토 신청 상세. 상태 변경과 증빙 파일 열람만 하고 나머지는 읽기 전용이라
// 제네릭 AdminForm 대신 이 파일에서 그린다.

// 증빙 파일이 "없다"고 안내하는 단일 문구. 경로가 비었을 때와 스토리지에 객체가 없을 때가
// 어드민 입장에선 같은 상황이라 서버가 같은 PROOF_NOT_FOUND 로 보내고 문구도 하나다(QA 318).
const PROOF_FILE_MISSING_MESSAGE = "등록된 증빙 파일이 없습니다.";

// 섹션 구분은 sql/52_mentor_applications.sql 컬럼 주석의 1~5절 순서를 그대로 따른다.
//   array: true: text[] 컬럼(normalizeArray로 콤마 나열)
//   boolean: true: boolean 컬럼('동의'/'미동의')
//   type: 'datetime': timestamptz 컬럼(formatDateTime)
//   proof: true: proof_file_name(사용자 입력 원본 파일명) 전용, 아래 렌더에서 이스케이프됨
interface MentorApplicationDetailField {
  key: string;
  label: string;
  array?: boolean;
  boolean?: boolean;
  type?: "datetime";
  proof?: boolean;
}

interface MentorApplicationDetailSection {
  title: string;
  fields: MentorApplicationDetailField[];
}

const MENTOR_APPLICATION_DETAIL_SECTIONS: MentorApplicationDetailSection[] = [
  {
    title: "1. 지원자 정보",
    fields: [
      { key: "name", label: "이름" },
      { key: "birth_date", label: "생년월일" },
      { key: "phone", label: "휴대폰" },
      { key: "email", label: "이메일" },
      { key: "residence_region", label: "거주지역" },
    ],
  },
  {
    title: "2. 대학 및 합격 전형",
    fields: [
      { key: "university", label: "대학교" },
      { key: "major", label: "학과, 학부" },
      { key: "admission_year", label: "입학년도" },
      { key: "enrollment_status", label: "재학상태" },
      { key: "admission_history", label: "입시이력" },
      { key: "final_admission_track", label: "최종전형" },
      { key: "exam_results", label: "입시 성적" },
    ],
  },
  {
    title: "3. 출신 고등학교",
    fields: [
      { key: "highschool_region", label: "고교 지역" },
      { key: "highschool_name", label: "고교명" },
      { key: "highschool_type", label: "고교 유형" },
      { key: "gpa_average", label: "내신 평균" },
      { key: "csat_summary", label: "수능 요약" },
    ],
  },
  {
    title: "4. 멘토 역량",
    fields: [
      { key: "consult_fields", label: "상담 가능 분야", array: true },
      { key: "strongest_field_reason", label: "가장 자신있는 분야 이유" },
      { key: "consult_grades", label: "상담 가능 학년", array: true },
      { key: "weekly_capacity", label: "주당 가능 횟수" },
      { key: "available_timeslot", label: "가능 시간대" },
      { key: "motivation", label: "지원 동기" },
      { key: "strengths", label: "강점" },
      { key: "ineffective_method", label: "비효율적 지도 경험" },
      { key: "situation_answer", label: "상황 대응" },
      { key: "tutoring_experience", label: "과외 경험" },
    ],
  },
  {
    title: "5. 증빙 및 동의",
    fields: [
      { key: "proof_file_name", label: "증빙 파일명", proof: true },
      { key: "phone_verified_at", label: "휴대폰 인증 시각", type: "datetime" },
      { key: "request_ip", label: "제출 IP" },
      { key: "agree_terms", label: "이용약관 동의", boolean: true },
      { key: "agree_privacy", label: "개인정보 수집 동의", boolean: true },
      { key: "agree_identity", label: "본인인증 동의", boolean: true },
      { key: "agree_marketing", label: "마케팅 수신 동의", boolean: true },
      { key: "agree_ad", label: "광고성 정보 수신 동의", boolean: true },
    ],
  },
];

// 섹션 필드 전부와 제출 메타 3줄(제출일, 수정일, 신청 ID)이 상세 행이다.
const DETAIL_ROW_COUNT =
  MENTOR_APPLICATION_DETAIL_SECTIONS.reduce(
    (sum, section) => sum + section.fields.length,
    0,
  ) + 3;

function formatDateTime(value: unknown): string {
  if (!value) return "-";
  const date = new Date(value as string | number | Date);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("ko-KR");
}

function renderMentorApplicationDetailValue(
  app: MentorApplicationRow,
  field: MentorApplicationDetailField,
): string {
  const value = app[field.key];

  if (field.array) {
    const list = normalizeArray(value);
    return list.length > 0 ? list.join(", ") : "-";
  }

  if (field.boolean) return value ? "동의" : "미동의";

  if (field.type === "datetime") return formatDateTime(value);

  if (field.proof) {
    // proof_file_name은 지원자가 올린 원본 파일명, 사용자 입력이다. React의 기본 텍스트
    // 렌더링(자동 이스케이프)만 쓴다. dangerouslySetInnerHTML은 절대 쓰지 않는다.
    return (value as string) || (app.proof_file_path ? "(파일명 없음)" : "-");
  }

  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

export default function MentorApplicationDetail({
  config,
}: MentorApplicationsAdminProps) {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const query = useMentorApplication(id);
  const saveStatus = useSaveMentorStatus(id);
  const proofUrl = useMentorProofUrl(id);
  // null 이면 서버 값을 그대로 보인다. 관리자가 고른 값만 여기에 담는다.
  const [statusDraft, setStatusDraft] = useState<string | null>(null);
  useLoadErrorToast(`${config.title} 조회 실패`, query.error);

  // 상세에서 돌아오면 목록의 검색어와 쪽 번호가 살아 있도록 search 를 그대로 둔다.
  const goList = () =>
    navigate({ pathname: MENTOR_APPLICATIONS_PATH, search: location.search });

  const selected = query.data;

  if (query.isPending) {
    return (
      <AdminDetailSkeleton
        rows={DETAIL_ROW_COUNT}
        label="멘토 신청 상세를 불러오는 중입니다."
      />
    );
  }

  if (!selected) {
    const notFound =
      query.error instanceof ApiError && query.error.status === 404;
    return (
      <div className="bg-white p-10 shadow-sm">
        <p className="mb-4 text-sm font-medium">
          {notFound
            ? "멘토 신청을 찾을 수 없습니다."
            : "멘토 신청을 불러오지 못했습니다."}
        </p>
        <ActionButton variant="light" onClick={goList}>
          목록으로
        </ActionButton>
      </div>
    );
  }

  const statusValue = statusDraft ?? (selected.status || "submitted");

  async function saveStatusDraft() {
    if (saveStatus.isPending) return;

    if (statusValue === selected?.status) {
      toastWarning("변경된 상태가 없습니다.");
      return;
    }

    try {
      await saveStatus.mutateAsync(statusValue);
    } catch (error) {
      reportMentorError("상태 변경 실패", error);
      return;
    }
    setStatusDraft(null);
    toastSuccess("상태를 변경했습니다.");
  }

  // 비공개 버킷이라 서버가 60초짜리 서명 URL 을 만들어 준다. 증빙 파일에 개인정보(성적표 등)가
  // 담겨 있어 길게 잡을 이유가 없다. 받는 즉시 새 탭으로 연다.
  async function openProofFile() {
    try {
      const { url } = await proofUrl.mutateAsync();
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      // 경로는 있는데 객체가 없는 경우를 "없음"으로 흡수한다. 어드민에게 원문
      // "Object not found"를 그대로 던지면 시스템 장애처럼 읽힌다(QA 318).
      if (error instanceof ApiError && error.code === "PROOF_NOT_FOUND") {
        toastWarning(PROOF_FILE_MISSING_MESSAGE);
      } else {
        reportMentorError("증빙 파일 열람 실패", error);
      }
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">
          {config.title} 상세
        </h1>
        <ActionButton variant="light" onClick={goList}>
          목록으로
        </ActionButton>
      </div>

      <div className="mb-6 flex flex-wrap items-end gap-3 bg-white p-6 shadow-sm">
        <Field label="상태">
          <Select value={statusValue} onChange={setStatusDraft}>
            {MENTOR_APPLICATION_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>

        <ActionButton onClick={saveStatusDraft} disabled={saveStatus.isPending}>
          {saveStatus.isPending ? "저장 중..." : "상태 저장"}
        </ActionButton>

        <ActionButton
          variant="light"
          onClick={openProofFile}
          disabled={proofUrl.isPending}
        >
          <ExternalLink aria-hidden="true" />
          증빙 파일 열람
        </ActionButton>
      </div>
      {MENTOR_APPLICATION_DETAIL_SECTIONS.map((section) => (
        <div key={section.title} className="mb-6 bg-white shadow-sm">
          <div className="border-b border-border bg-muted px-5 py-3 text-sm font-semibold">
            {section.title}
          </div>

          {section.fields.map((field) => (
            <div
              key={field.key}
              className="grid grid-cols-[13.75rem_1fr] border-b border-border last:border-b-0"
            >
              <div className="bg-muted px-5 py-3 text-sm font-semibold">
                {field.label}
              </div>
              <div className="whitespace-pre-line px-5 py-3 text-sm">
                {renderMentorApplicationDetailValue(selected, field)}
              </div>
            </div>
          ))}
        </div>
      ))}

      <div className="mb-6 bg-white shadow-sm">
        <div className="border-b border-border bg-muted px-5 py-3 text-sm font-semibold">
          제출 메타
        </div>

        <div className="grid grid-cols-[13.75rem_1fr] border-b border-border">
          <div className="bg-muted px-5 py-3 text-sm font-semibold">제출일</div>
          <div className="px-5 py-3 text-sm">
            {formatDateTime(selected.created_at)}
          </div>
        </div>

        <div className="grid grid-cols-[13.75rem_1fr] border-b border-border">
          <div className="bg-muted px-5 py-3 text-sm font-semibold">수정일</div>
          <div className="px-5 py-3 text-sm">
            {formatDateTime(selected.updated_at)}
          </div>
        </div>

        <div className="grid grid-cols-[13.75rem_1fr]">
          <div className="bg-muted px-5 py-3 text-sm font-semibold">
            신청 ID
          </div>
          <div className="px-5 py-3 font-mono text-xs">{selected.id}</div>
        </div>
      </div>
    </div>
  );
}
