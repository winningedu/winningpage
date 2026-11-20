import { Download, ExternalLink, RefreshCw, Search } from "lucide-react";
import { useEffect, useEffectEvent, useMemo, useState } from "react";
import { useSensitiveActionGate } from "@/components/admin/SensitiveActionGate";
import { supabase } from "@/lib/supabase";
import { AdminTable } from "@/pages/admin/shared/AdminEngine";
import { reportAdminError } from "@/pages/admin/shared/adminErrors";
import { toastSuccess, toastWarning } from "@/pages/admin/shared/adminToast";
import {
  downloadCsv,
  normalizeArray,
  searchable,
} from "@/pages/admin/shared/csvExport";
import {
  ActionButton,
  Field,
  MENTOR_APPLICATION_STATUS_OPTIONS,
  Select,
} from "@/pages/admin/shared/formFields";
import { useAdminDetailBack } from "@/pages/admin/shared/useAdminDetailBack";

// ---------------------------------------------------------------------------
// 멘토 신청 내역(mentorApplications) — CONFIGS.mentorApplications 참고.
// 목록만 AdminTable을 재사용하고, 상세/상태변경/증빙파일 열람은 이 파일 안에서 전부
// bespoke로 그린다(제네릭 AdminForm은 필드를 전부 자유 편집 가능하게 만들어 이 화면의
// "상태만 변경 가능, 나머지는 읽기전용" 요구와 맞지 않는다).
// ---------------------------------------------------------------------------

// mentor_applications row. AdminTable(AdminEngine.tsx, 미변환 영역)이 소유하는
// 제네릭 목록 데이터라 구체 타입이 없다 — 이 파일이 실제로 읽고 쓰는 키만 얕게 좁힌다.
interface MentorApplicationRow {
  id: string;
  status?: string;
  proof_file_path?: string;
  proof_file_name?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

// 섹션 구분은 sql/52_mentor_applications.sql 컬럼 주석의 1~5절 순서를 그대로 따른다.
//   array: true       → text[] 컬럼(normalizeArray로 콤마 나열)
//   boolean: true     → boolean 컬럼('동의'/'미동의')
//   type: 'datetime'  → timestamptz 컬럼(formatDateTime)
//   proof: true        → proof_file_name(사용자 입력 원본 파일명) 전용 — 아래 렌더에서 이스케이프됨
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
      { key: "major", label: "학과·학부" },
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

// 증빙 파일이 "없다"고 안내하는 단일 문구 — 경로 자체가 비었을 때와 스토리지에
// 객체가 없을 때가 어드민 입장에선 같은 상황이라 문구를 하나로 묶는다(QA 318).
const PROOF_FILE_MISSING_MESSAGE = "등록된 증빙 파일이 없습니다.";

// createSignedUrl 이 "객체 없음"으로 실패했는지 판정한다.
//
// dev 실측 응답(2026-08-31, HTTP 400):
//   { statusCode: "404", error: "not_found", message: "Object not found", code: "NoSuchKey" }
// supabase-js 는 이걸 StorageError 로 감싸는데, 그 클래스가 노출하는 필드는
// message / status(number) / statusCode(string) 뿐이라(@supabase/storage-js
// lib/common/errors.ts) code("NoSuchKey")로는 판정할 수 없다. statusCode 를 1순위로
// 보고, 문구 매칭은 스토리지가 필드 구성을 바꿀 때를 대비한 폴백이다.
export function isObjectNotFound(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { statusCode, message } = error as {
    statusCode?: unknown;
    message?: unknown;
  };
  if (String(statusCode ?? "") === "404") return true;
  return String(message ?? "")
    .toLowerCase()
    .includes("not found");
}

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
    // proof_file_name은 지원자가 올린 원본 파일명 — 사용자 입력이다. React의 기본 텍스트
    // 렌더링(자동 이스케이프)만 쓴다. dangerouslySetInnerHTML은 절대 쓰지 않는다.
    return (value as string) || (app.proof_file_path ? "(파일명 없음)" : "-");
  }

  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

interface MentorApplicationsAdminProps {
  config: {
    title: string;
    searchPlaceholder?: string;
    // 목록 렌더(AdminTable)와 QA 270·228 다운로드가 함께 읽는다.
    columns: { key: string; label: string; type?: string | undefined }[];
    [key: string]: unknown;
  };
}

export default function MentorApplicationsAdmin({
  config,
}: MentorApplicationsAdminProps) {
  const [rows, setRows] = useState<MentorApplicationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<MentorApplicationRow | null>(null); // 상세로 연 행. null이면 목록.
  const [statusDraft, setStatusDraft] = useState("");
  const [savingStatus, setSavingStatus] = useState(false);

  // QA 317 — 상세에서 뒤로가기가 목록으로 돌아오게 한다.
  useAdminDetailBack(Boolean(selected), () => setSelected(null));

  // 개인정보 반출 게이트 (QA 270 · 228 — 228 이 먼저 요청, 270 이 재요청).
  const { requestAccess, gate } = useSensitiveActionGate();

  async function loadRows() {
    setLoading(true);

    const { data, error } = await supabase
      .from("mentor_applications")
      .select("*")
      .order("created_at", { ascending: false });

    setLoading(false);

    if (error) {
      reportAdminError(`${config.title} 조회 실패`, error);
      setRows([]);
      return;
    }

    setRows((data as MentorApplicationRow[]) || []);
  }

  const onMountLoadRows = useEffectEvent(() => {
    loadRows();
  });

  useEffect(() => {
    onMountLoadRows();
  }, []);

  const filteredRows = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => searchable(row).includes(q));
  }, [rows, keyword]);

  // QA 270·228 — 멘토 신청 내역 다운로드. 목록은 휴대폰을 maskedPhone 으로 가리지만
  // 게이트를 통과한 파일에는 원본을 담는다(MembersAdmin.exportMembers 와 같은 판단).
  function exportApplications() {
    const columns = config.columns.map((column) =>
      column.type === "maskedPhone" ? { ...column, type: undefined } : column,
    );

    downloadCsv(
      `${config.title}_${new Date().toISOString().slice(0, 10)}.csv`,
      filteredRows as unknown as Record<string, unknown>[],
      columns,
    );
  }

  function requestExport() {
    if (filteredRows.length === 0) {
      toastWarning("내보낼 데이터가 없습니다.");
      return;
    }

    requestAccess({
      action: "download",
      resourceKey: "mentorApplications",
      title: "멘토 신청 내역 다운로드",
      description: `멘토 지원자 ${filteredRows.length.toLocaleString()}건의 개인정보(이름·대학·휴대폰)가 CSV 파일로 저장됩니다.`,
      rowCount: filteredRows.length,
      onGranted: exportApplications,
    });
  }

  function openDetail(row: MentorApplicationRow) {
    setSelected(row);
    setStatusDraft(row.status || "submitted");
  }

  function closeDetail() {
    setSelected(null);
    setStatusDraft("");
  }

  async function saveStatus() {
    if (!selected || savingStatus) return;

    if (statusDraft === selected.status) {
      toastWarning("변경된 상태가 없습니다.");
      return;
    }

    setSavingStatus(true);

    const { error } = await supabase
      .from("mentor_applications")
      .update({ status: statusDraft })
      .eq("id", selected.id);

    setSavingStatus(false);

    if (error) {
      reportAdminError("상태 변경 실패", error);
      return;
    }

    const nextSelected = { ...selected, status: statusDraft };
    setSelected(nextSelected);
    setRows((prev) =>
      prev.map((row) => (row.id === selected.id ? nextSelected : row)),
    );
    toastSuccess("상태를 변경했습니다.");
  }

  // 비공개 버킷(mentor-applications)이라 getPublicUrl은 쓸 수 없다 — Admin.jsx의 기존
  // getPublicUrl 관용구(IMAGE_BUCKET/banners 버킷 대상, 이 파일의 다른 곳)와는 다른 경로다.
  // createSignedUrl로 단기 서명 URL을 받아 새 탭으로 연다. TTL 60초 — 어드민이 클릭 즉시
  // 여는 일회성 열람이고, 증빙 파일에 개인정보(성적표 등)가 담겨 있어 길게 잡을 이유가 없다.
  async function openProofFile() {
    if (!selected?.proof_file_path) {
      toastWarning(PROOF_FILE_MISSING_MESSAGE);
      return;
    }

    const { data, error } = await supabase.storage
      .from("mentor-applications")
      .createSignedUrl(selected.proof_file_path, 60);

    if (error || !data?.signedUrl) {
      // 경로는 있는데 객체가 없는 경우(행은 남고 파일만 사라졌거나, 업로드가 2단계
      // 흐름 중간에 끊긴 경우)를 "없음"으로 흡수한다 — 어드민에게 원문
      // "Object not found"를 그대로 던지면 시스템 장애처럼 읽힌다(QA 318).
      // 그 외 실패(권한, 네트워크)는 구분해서 reportAdminError 로 보낸다. 원문은 콘솔에만 남는다.
      if (isObjectNotFound(error)) {
        toastWarning(PROOF_FILE_MISSING_MESSAGE);
      } else {
        reportAdminError("증빙 파일 열람 실패", error);
      }
      return;
    }

    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  if (selected) {
    return (
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-black text-[#111827]">
            {config.title} 상세
          </h1>
          <ActionButton variant="light" onClick={closeDetail}>
            목록으로
          </ActionButton>
        </div>

        <div className="mb-6 flex flex-wrap items-end gap-3 bg-white p-6 shadow-sm">
          <Field label="상태">
            <Select value={statusDraft} onChange={setStatusDraft}>
              {MENTOR_APPLICATION_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>

          <ActionButton onClick={saveStatus} disabled={savingStatus}>
            {savingStatus ? "저장 중..." : "상태 저장"}
          </ActionButton>

          <ActionButton variant="light" onClick={openProofFile}>
            <ExternalLink size={14} />
            증빙 파일 열람
          </ActionButton>
        </div>

        {MENTOR_APPLICATION_DETAIL_SECTIONS.map((section) => (
          <div key={section.title} className="mb-6 bg-white shadow-sm">
            <div className="border-b border-[#edf0f4] bg-[#fafafa] px-5 py-3 text-sm font-black">
              {section.title}
            </div>

            {section.fields.map((field) => (
              <div
                key={field.key}
                className="grid grid-cols-[220px_1fr] border-b border-[#edf0f4] last:border-b-0"
              >
                <div className="bg-[#fafafa] px-5 py-3 text-sm font-black">
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
          <div className="border-b border-[#edf0f4] bg-[#fafafa] px-5 py-3 text-sm font-black">
            제출 메타
          </div>

          <div className="grid grid-cols-[220px_1fr] border-b border-[#edf0f4]">
            <div className="bg-[#fafafa] px-5 py-3 text-sm font-black">
              제출일
            </div>
            <div className="px-5 py-3 text-sm">
              {formatDateTime(selected.created_at)}
            </div>
          </div>

          <div className="grid grid-cols-[220px_1fr] border-b border-[#edf0f4]">
            <div className="bg-[#fafafa] px-5 py-3 text-sm font-black">
              수정일
            </div>
            <div className="px-5 py-3 text-sm">
              {formatDateTime(selected.updated_at)}
            </div>
          </div>

          <div className="grid grid-cols-[220px_1fr]">
            <div className="bg-[#fafafa] px-5 py-3 text-sm font-black">
              신청 ID
            </div>
            <div className="px-5 py-3 font-mono text-xs">{selected.id}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {gate}

      <div className="mb-6 bg-white px-6 py-5 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadRows}
              className="inline-flex h-9 items-center gap-2 border border-gray-500 bg-white px-4 text-sm font-bold"
            >
              <RefreshCw size={14} />
              초기화
            </button>

            <button
              type="button"
              onClick={requestExport}
              className="inline-flex h-9 items-center gap-2 border border-gray-500 bg-white px-4 text-sm font-bold"
            >
              <Download size={14} />
              엑셀 다운로드
            </button>
          </div>

          <div className="flex items-center">
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder={config.searchPlaceholder}
              className="h-9 w-[320px] border border-gray-400 px-3 text-sm outline-hidden"
            />
            <button
              type="button"
              className="inline-flex h-9 items-center gap-1 border border-l-0 border-gray-500 bg-white px-4 text-sm font-bold"
            >
              <Search size={14} />
              검색
            </button>
          </div>
        </div>

        <h1 className="mt-4 text-xl font-black">{config.title}</h1>
      </div>

      {loading ? (
        <div className="bg-white p-12 text-center text-sm font-bold text-gray-500 shadow-sm">
          데이터를 불러오는 중입니다.
        </div>
      ) : (
        <AdminTable
          config={config}
          rows={filteredRows}
          page={page}
          setPage={setPage}
          onEdit={openDetail}
          onDelete={() => {}}
        />
      )}
    </div>
  );
}
