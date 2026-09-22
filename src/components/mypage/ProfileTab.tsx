// 마이페이지 "내 정보 수정" 탭 — 이번 범위는 학생 화면만이다(사용자 지시로 학부모 변형
// 3762:20390은 범위 제외). memberType prop은 받되 분기하지 않는다(팀 리더 지시).
//
// 레이아웃·필드 라벨·순서는 team-lead가 전달한 시안 PNG(profile-20170.png, 3762:20170)를
// 직접 판독해 반영했다. 정확한 여백·폰트 스케일까지 픽셀 재현하지는 않았다(러프 구현 지시).

import { ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import type { SignupProfileRpcResult } from "@/lib/parentLink";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/types/database.types";
import ChangeEmailModal from "./ChangeEmailModal";
import ChangePasswordModal from "./ChangePasswordModal";
import ChangePhoneModal from "./ChangePhoneModal";
import OrgCodeModal from "./OrgCodeModal";
import ProfileField from "./ProfileField";
import ToggleRow from "./ToggleRow";
import UnlinkParentModal from "./UnlinkParentModal";
import WithdrawModal from "./WithdrawModal";

// `profiles.school_type`의 실제 값 집합 — 이 필드는 코드값이 아니라 한글 원문을 그대로
// 저장한다(정본). `PerformanceChatPage`가 STEP1 요약에서 오염값 방어용 화이트리스트로
// 재사용한다(export, 새 매핑 만들지 말 것).
export const SCHOOL_TYPES = ["초등학교", "중학교", "고등학교", "N수생", "기타"];

// 과도 입력으로 인한 UI 깨짐 방지(QA 행266) — 학교명은 실제 학교 정식 명칭 최대
// 길이 여유를 두고 50자로 제한한다.
const SCHOOL_NAME_MAX_LENGTH = 50;

// 이용안내(chevron 링크) — PNG 라벨 그대로, 라우트는 src/App.jsx에 실제 등록된 것만
// 사용(읽기로 확인). "마케팅 목적의 개인정보 수집 및 이용"/"광고성 정보 수신 동의"는 PNG상
// 별도 링크가 아니라 토글 행이라 여기 목록에는 넣지 않는다(아래 ToggleRow 2개로 별도 렌더).
//
// 학부모는 본인인증 약관 라우트가 없다 — /terms/parent/* 에 등록된 것은 service·
// privacy·marketing 3개뿐이고 identity 는 학생 전용이다(App.jsx:287-294). 없는
// 라우트를 링크하면 404 로 떨어지므로 2개만 노출한다.
const STUDENT_GUIDE_LINKS = [
  { label: "서비스 이용약관", to: "/terms/student/service" },
  { label: "개인정보처리방침", to: "/terms/student/privacy" },
  { label: "본인 인증을 위한 정보 수집 약관", to: "/terms/student/identity" },
];

const PARENT_GUIDE_LINKS = [
  { label: "서비스 이용약관", to: "/terms/parent/service" },
  { label: "개인정보처리방침", to: "/terms/parent/privacy" },
];

const ROW_BOX_CLASS =
  "flex h-13 items-center rounded-xl border border-line px-5 text-base text-ink";

function cleanText(value) {
  return String(value || "").trim();
}

function formatLinkDate(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
}

// 생년월일 표시 — profiles.birth_date는 date 컬럼이라 "YYYY-MM-DD" 문자열로 온다.
// new Date()로 재파싱하지 않는다(문자열을 UTC 자정으로 해석해 로컬 표시가 하루
// 밀릴 수 있는 흔한 함정을 피하기 위해 문자열을 직접 쪼갠다).
function formatBirthDate(value: string | null | undefined) {
  if (!value) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;
  return `${match[1]}.${match[2]}.${match[3]}`;
}

// 성별 표시 — profiles.gender는 NICE 본인인증 API 응답을 가공 없이 그대로 저장한
// 값이다(api/nice-identity-callback.ts:242 `gender: result.gender || null`,
// supabase/migrations/20260821000006_mentor_apply_gender.sql 주석: "profiles.gender는
// 외부 본인인증 API 응답을 그대로 흘려받는 컬럼이라 CHECK이 없다" — 그 파일이 정의한
// '남'/'여' 자체 폼 규약과는 성격이 다르다). 이 값의 숫자 코드 규약(1/2인지 1/0인지)을
// 확정할 근거가 코드베이스 안에 없어 숫자 코드는 매핑하지 않는다 — 잘못 매핑하면
// 성별이 뒤바뀌어 보이는 사고가 더 크다. 명확한 텍스트 표기만 한글로 바꾸고, 그 밖의
// 값은 원문 그대로 노출한다(폴백 문구 없음).
function formatGender(value: string) {
  const trimmed = value.trim();
  const upper = trimmed.toUpperCase();
  if (upper === "M" || upper === "MALE" || trimmed === "남") return "남성";
  if (upper === "F" || upper === "FEMALE" || trimmed === "여") return "여성";
  return trimmed;
}

type ProfileUser = {
  id: string;
  email?: string;
};

// 생성 타입(Tables<"profiles">)에서 파생시켜 null 가능 여부가 실제 스키마와
// 어긋나지 않게 한다. 전부 optional인 이유 — 이 prop은 마이페이지 셸
// (useMyPageProfile.Profile, 컬럼 집합이 다름)이 넘겨주는데, 셸이 어떤 컬럼을
// select 했는지 이 컴포넌트가 강제할 수 없다(위 174번째 줄 주석과 동일한 사유로
// birth_date/gender는 이 컴포넌트가 직접 다시 읽어 보강한다. 소속은
// org_code가 아니라 fn_my_tenant() RPC로 별도 조회한다, 아래 myTenant 참고).
type Profile = Partial<
  Pick<
    Tables<"profiles">,
    | "id"
    | "name"
    | "email"
    | "phone"
    | "guardian_phone"
    | "school_type"
    | "school_name"
    | "birth_date"
    | "gender"
  >
>;

// 소속 — profiles.org_code는 죽은 컬럼(2026-09-22 tenant 전환)이라 더 이상
// select하지 않는다. 표시는 fn_my_tenant() RPC로만 한다(아래 useEffect). id는
// 이 화면이 쓰지 않아(표시는 name만) 담지 않는다.
type MyTenant = { name: string };

type ParentLink = {
  id: string;
  status: string;
  date?: string | null;
  name?: string | null;
};

type ProfileTabProps = {
  user: ProfileUser | null;
  profile: Profile | null;
  memberType?: string;
};

export default function ProfileTab({
  user,
  profile,
  memberType,
}: ProfileTabProps) {
  // 학부모 변형(Figma 3379:12569 외) — 이름/휴대폰/이메일/비밀번호/이용안내만 있고
  // 학교·학년, 학부모 연결, 내 연결코드가 없다. 그 셋은 전부 학생 계정의 개념이다
  // (학부모에겐 연결할 "학부모"도, 발급받을 연결코드도 없다 — 코드는 학생이 발급하고
  // 학부모가 입력한다, sql/40 issue_student_link_code).
  const isParent = memberType === "parent";
  const guideLinks = isParent ? PARENT_GUIDE_LINKS : STUDENT_GUIDE_LINKS;

  const profileId = profile?.id || user?.id;

  const [form, setForm] = useState({
    name: profile?.name || "",
    email: profile?.email || user?.email || "",
    phone: profile?.phone || "",
    guardian_phone: profile?.guardian_phone || "",
    school_type: profile?.school_type || "",
    school_name: profile?.school_name || "",
    birth_date: profile?.birth_date || "",
    gender: profile?.gender || "",
  });
  const [toggles, setToggles] = useState({
    marketing_agreed: false,
    ads_agreed: false,
  });
  const [errorMsg, setErrorMsg] = useState("");
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [phoneOpen, setPhoneOpen] = useState(false);
  // 학부모 핸드폰(guardian_phone) 변경 모달 — 학생이 본인 명의 휴대폰이 없어
  // 학부모 번호를 저장한 계정에만 노출된다(아래 렌더 조건 참고).
  const [guardianPhoneOpen, setGuardianPhoneOpen] = useState(false);
  const [orgCodeOpen, setOrgCodeOpen] = useState(false);
  // 소속 — undefined 로딩중, null 미설정(OrgCodeModal 진입 가능), {name} 설정됨
  // (읽기 전용, 진입 버튼 숨김 — 1회 입력 원칙, 2026-09-22 tenant 전환).
  const [myTenant, setMyTenant] = useState<MyTenant | null | undefined>(
    undefined,
  );

  // 학교·학년 인라인 편집.
  const [editingSchool, setEditingSchool] = useState(false);
  const [schoolDraft, setSchoolDraft] = useState({
    school_type: "",
    school_name: "",
  });
  const [savingSchool, setSavingSchool] = useState(false);

  // 학부모 연동 상태 — undefined 로딩중, null 연결 없음, {id,status,date} 연결/요청 있음.
  const [parentLink, setParentLink] = useState<ParentLink | null | undefined>(
    undefined,
  );
  // 연결 해제 재확인 모달(비밀번호 재인증 포함, UnlinkParentModal.tsx) 열림 여부.
  const [unlinkOpen, setUnlinkOpen] = useState(false);

  // 내 연결코드.
  const [linkCode, setLinkCode] = useState("");
  const [reissuing, setReissuing] = useState(false);

  // profile prop은 마이페이지 셸(다른 에이전트가 동시 작업 중)이 어떤 컬럼을 select 했는지에
  // 따라 형태가 달라질 수 있어, 이 탭에 필요한 컬럼(학교·수신동의 2종)을 user.id 기준으로
  // 직접 다시 읽어 보강한다. 실패해도 화면은 profile prop 값으로 그대로 동작한다.
  useEffect(() => {
    if (!profileId) return;
    let alive = true;

    (async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select(
          "name, email, phone, guardian_phone, school_type, school_name, birth_date, gender, marketing_agreed, ads_agreed",
        )
        .eq("id", profileId)
        .maybeSingle();

      if (!alive || error || !data) return;

      setForm((prev) => ({
        ...prev,
        name: data.name ?? prev.name,
        email: data.email ?? prev.email,
        phone: data.phone ?? prev.phone,
        guardian_phone: data.guardian_phone ?? prev.guardian_phone,
        school_type: data.school_type ?? prev.school_type,
        school_name: data.school_name ?? prev.school_name,
        birth_date: data.birth_date ?? prev.birth_date,
        gender: data.gender ?? prev.gender,
      }));
      setToggles({
        marketing_agreed: Boolean(data.marketing_agreed),
        ads_agreed: Boolean(data.ads_agreed),
      });
    })();

    return () => {
      alive = false;
    };
  }, [profileId]);

  // 학부모 연동 상태 — 승인/대기 중 연결만 읽기 전용으로 조회한다. profiles RLS가
  // 본인 행만 select 허용해(profiles_select_own) parent_child_links를 직접 읽어서는
  // 연결된 학부모의 이름을 못 가져온다 — fn_student_parent(sql/77, SECURITY DEFINER)가
  // 그 제약을 좁게 우회해 이름까지 함께 돌려준다(PaymentsTab.tsx가 이미 같은 RPC 사용 중).
  useEffect(() => {
    if (!profileId || isParent) return;
    let alive = true;

    (async () => {
      const { data, error } = await supabase.rpc("fn_student_parent");

      if (!alive) return;
      if (error || !Array.isArray(data) || data.length === 0) {
        setParentLink(null);
        return;
      }
      // RPC가 approved를 먼저 정렬해 돌려준다 — 첫 행만 쓴다.
      const row = data[0];
      if (!row) {
        setParentLink(null);
        return;
      }
      setParentLink({
        id: row.link_id,
        status: row.link_status,
        date: row.linked_at,
        name: row.parent_name,
      });
    })();

    return () => {
      alive = false;
    };
  }, [profileId, isParent]);

  // 내 연결코드 — student_link_codes 활성 코드 1건(RLS: 본인 조회만 허용).
  useEffect(() => {
    if (!profileId || isParent) return;
    let alive = true;

    (async () => {
      const { data, error } = await supabase
        .from("student_link_codes")
        .select("code")
        .eq("student_id", profileId)
        .eq("is_active", true)
        .maybeSingle();

      if (!alive || error) return;
      setLinkCode(data?.code || "");
    })();

    return () => {
      alive = false;
    };
  }, [profileId, isParent]);

  // 소속 — fn_my_tenant()(2026-09-22 tenant 전환)로 조회한다. profiles.org_code는
  // 죽은 컬럼이라 더 이상 직접 select하지 않는다. 1행이면 설정됨(읽기 전용),
  // 0행이면 미설정(OrgCodeModal로 1회 입력 가능) — 아래 렌더가 이 상태로 분기한다.
  useEffect(() => {
    if (!profileId || isParent) return;
    let alive = true;

    (async () => {
      const { data, error } = await supabase.rpc("fn_my_tenant");

      if (!alive) return;
      if (error || !Array.isArray(data) || data.length === 0) {
        setMyTenant(null);
        return;
      }
      const row = data[0];
      setMyTenant(row ? { name: row.name } : null);
    })();

    return () => {
      alive = false;
    };
  }, [profileId, isParent]);

  function updateForm(key: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // 공용 저장 헬퍼 — src/pages/MyPage.jsx handleSubmit의 upsert 흐름을 재사용한다.
  async function persistProfile(fields: Record<string, unknown>) {
    // profiles.id는 PK라 upsert onConflict("id")에 반드시 값이 있어야 한다.
    // 호출부는 전부 profileId가 로드된 뒤에만 노출되는 버튼이라 실질적으로는
    // 항상 참이지만, 생성 Update 타입이 string을 요구해(undefined 불가) 방어적으로 막는다.
    if (!profileId) return false;
    const payload = {
      id: profileId,
      updated_at: new Date().toISOString(),
      ...fields,
    };
    const { error } = await supabase
      .from("profiles")
      .upsert(payload, { onConflict: "id" });

    if (error) {
      console.error("프로필 저장 실패:", error);
      setErrorMsg("저장에 실패했습니다. 잠시 후 다시 시도해 주세요.");
      return false;
    }

    setErrorMsg("");
    window.dispatchEvent(new Event("winning-profile-updated"));
    return true;
  }

  function startEditSchool() {
    setSchoolDraft({
      school_type: form.school_type,
      school_name: form.school_name,
    });
    setEditingSchool(true);
  }

  async function saveSchool() {
    setSavingSchool(true);
    const school_name = cleanText(schoolDraft.school_name);
    const ok = await persistProfile({
      school_type: schoolDraft.school_type,
      school_name,
    });
    setSavingSchool(false);
    if (ok) {
      updateForm("school_type", schoolDraft.school_type);
      updateForm("school_name", school_name);
      setEditingSchool(false);
    }
  }

  // 수신 동의 토글 — profiles.marketing_agreed/ads_agreed는 이미 존재하는 컬럼이라
  // (sql/00_base_schema.sql) 스키마 변경 없이 바로 저장한다. 낙관적 업데이트 후 실패 시 롤백.
  async function persistToggle(key: keyof typeof toggles, value: boolean) {
    setToggles((prev) => ({ ...prev, [key]: value }));
    const ok = await persistProfile({ [key]: value });
    if (!ok) setToggles((prev) => ({ ...prev, [key]: !value }));
  }

  // 연결코드 재발급 — sql/40_auth_signup.sql의 reissue_link_code RPC를 그대로 호출한다.
  async function handleReissueCode() {
    if (reissuing) return;
    setReissuing(true);
    const { data, error } = await supabase.rpc("reissue_link_code");
    setReissuing(false);
    if (error) {
      console.error("연결코드 재발급 실패:", error);
      setErrorMsg(
        "연결코드 재발급에 실패했습니다. 잠시 후 다시 시도해 주세요.",
      );
      return;
    }
    // 생성 타입은 RPC 반환을 Json으로만 표현한다 — 실제 payload 모양은
    // SignupProfileRpcResult(src/lib/parentLink.ts, reissue_link_code도 { ok, link_code } 형태).
    const result = data as unknown as SignupProfileRpcResult;
    if (result?.link_code) setLinkCode(result.link_code);
  }

  const schoolSummary =
    [form.school_name, form.school_type].filter(Boolean).join(" · ") || "-";

  return (
    <div className="mx-auto w-full max-w-sm">
      {/* 학부모 연결 — 학생 전용(학부모에겐 연결할 상대가 이 축에 없다). */}
      {!isParent && (
        <div className="mb-5">
          <p className="mb-2 text-sm text-ink">학부모 연결</p>

          {parentLink ? (
            <div className="rounded-xl border border-line bg-surface-card px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-ink">
                    {parentLink.name || "학부모님"}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      parentLink.status === "approved"
                        ? "bg-surface-info text-accent"
                        : "bg-surface-footer text-ink-sub"
                    }`}
                  >
                    {parentLink.status === "approved"
                      ? "연결됨"
                      : "승인 대기중"}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setUnlinkOpen(true)}
                  className="text-xs text-ink-sub underline underline-offset-2 hover:text-ink"
                >
                  연결 해제
                </button>
              </div>
              {parentLink.date && (
                <p className="mt-1 text-xs text-ink-sub">
                  {formatLinkDate(parentLink.date)}{" "}
                  {parentLink.status === "approved" ? "연결" : "요청"}
                </p>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-line bg-surface-card px-4 py-3 text-sm text-ink-sub">
              연결된 학부모가 없습니다.
            </div>
          )}
        </div>
      )}

      {/* 이름 — 가입 시 본인인증으로 확정된 값이라 수정 불가(QA 2026-08-22). DB
          레벨 잠금은 supabase/migrations의 profile_identity_lock 트리거가 맡는다. */}
      <ProfileField label="이름" value={form.name} readOnly className="mb-5" />

      {/* 생년월일 · 성별 — 이름과 같은 이유로 읽기 전용, 값이 없으면 행 자체를
          렌더하지 않는다(폴백 문구 금지 — 데이터 없으면 렌더 안 함). */}
      {form.birth_date && (
        <ProfileField
          label="생년월일"
          value={formatBirthDate(form.birth_date)}
          readOnly
          className="mb-5"
        />
      )}
      {form.gender && (
        <ProfileField
          label="성별"
          value={formatGender(form.gender)}
          readOnly
          className="mb-5"
        />
      )}

      {/* 학교 · 학년 — 학생 전용(학부모 시안 3379:12569 에는 이 행이 없다). */}
      {!isParent && (
        <ProfileField label="학교 · 학년" className="mb-5">
          {/* 학년(숫자) 컬럼이 profiles에 없어 재학 구분(학교급)만 반영한다 — PNG의 "고1" 같은
            구체 학년은 스키마 확장이 필요하다(이 작업 범위 밖, DB 마이그레이션 금지 지시). */}
          {editingSchool ? (
            <div className="flex w-full flex-col gap-2">
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={schoolDraft.school_type}
                  onChange={(e) =>
                    setSchoolDraft((prev) => ({
                      ...prev,
                      school_type: e.target.value,
                    }))
                  }
                  className="h-13 w-full rounded-xl border border-line px-4 text-base text-ink outline-hidden focus:border-primary"
                >
                  <option value="">선택</option>
                  {SCHOOL_TYPES.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={schoolDraft.school_name}
                  onChange={(e) =>
                    setSchoolDraft((prev) => ({
                      ...prev,
                      school_name: e.target.value,
                    }))
                  }
                  placeholder="학교명 입력"
                  maxLength={SCHOOL_NAME_MAX_LENGTH}
                  className="h-13 w-full rounded-xl border border-line px-4 text-base text-ink outline-hidden focus:border-primary"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingSchool(false)}
                  className="h-9 rounded-lg border border-line px-3 text-xs text-ink-sub"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={saveSchool}
                  disabled={savingSchool}
                  className="h-9 rounded-lg bg-primary px-3 text-xs font-semibold text-white disabled:opacity-60"
                >
                  저장
                </button>
              </div>
            </div>
          ) : (
            <div className="flex w-full items-center gap-2">
              <div
                className={`${ROW_BOX_CLASS} flex-1 bg-surface-footer text-ink-sub`}
              >
                {schoolSummary}
              </div>
              <button
                type="button"
                onClick={startEditSchool}
                className="h-13 shrink-0 whitespace-nowrap rounded-xl border border-line px-4 text-sm text-ink transition hover:bg-surface-card"
              >
                변경
              </button>
            </div>
          )}
        </ProfileField>
      )}

      {/* 소속 — 학생 전용, 가입 시 안 넣은 경우 여기서 1회 입력한다(태스크5,
          2026-09-01, 2026-09-22 tenant 전환으로 fn_my_tenant/fn_set_my_tenant
          경유로 교체). 이미 설정돼 있으면(myTenant) 소속명만 읽기 전용으로
          보여주고 진입 버튼을 숨긴다 — 재설정은 셀프서비스가 아니라 어드민
          경로(fn_admin_set_profile_tenant) 전용이다. */}
      {!isParent && myTenant && (
        <ProfileField
          label="소속"
          value={myTenant.name}
          readOnly
          className="mb-5"
        />
      )}
      {!isParent && myTenant === null && (
        <ProfileField
          label="소속"
          value="-"
          readOnly
          actionLabel="입력"
          onAction={() => setOrgCodeOpen(true)}
          className="mb-5"
        />
      )}

      {/* 휴대폰 번호 — 변경은 모달(카카오 인증번호) 경유, 인라인 즉시저장 아님
          (Figma 3973:15330→16090→16297→16478, ChangePhoneModal.jsx). */}
      <ProfileField
        label="휴대폰 번호"
        value={form.phone || "-"}
        readOnly
        actionLabel="변경"
        onAction={() => setPhoneOpen(true)}
        className="mb-5"
      />

      {/* 학부모 핸드폰 — 학생이 본인 명의 휴대폰이 없어(14세 미만 전원 + 14세
          이상 무폰 학생) profiles.guardian_phone에 학부모 번호가 대신 저장된
          계정에만 노출한다. 이 번호가 아이디 찾기·비밀번호 재설정 채널이 된다.
          값이 없으면 행 자체를 렌더하지 않는다(폴백 문구 금지). 기존 휴대폰
          번호 행과 같은 컴포넌트·같은 스타일로, 그 바로 아래에 둔다. */}
      {form.guardian_phone && (
        <ProfileField
          label="학부모 핸드폰"
          value={form.guardian_phone || "-"}
          readOnly
          actionLabel="변경"
          onAction={() => setGuardianPhoneOpen(true)}
          className="mb-5"
        />
      )}

      {/* 이메일 — 변경 플로우(인증 메일 등) 백엔드 미구현. */}
      <ProfileField
        label="이메일"
        value={form.email}
        readOnly
        actionLabel="변경"
        onAction={() => setEmailOpen(true)}
        className="mb-5"
      />

      {/* 비밀번호 — 변경 플로우 백엔드 미구현. */}
      <ProfileField
        label="비밀번호"
        value="***********"
        readOnly
        actionLabel="변경"
        onAction={() => setPasswordOpen(true)}
        className="mb-5"
      />

      {errorMsg && (
        <div className="mb-5 rounded-xl bg-[#FCEAEE] px-4 py-3 text-xs text-[#D6336C]">
          {errorMsg}
        </div>
      )}

      {/* 이용안내 — chevron 링크 3종 + 토글 2종, 같은 박스 목록으로 렌더. */}
      <div className="mb-5">
        <p className="mb-2 text-sm text-ink">이용안내</p>
        <div className="flex flex-col gap-2">
          {guideLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={`${ROW_BOX_CLASS} justify-between transition hover:bg-surface-card`}
            >
              <span>{link.label}</span>
              <ChevronRight size={18} className="text-ink-sub" />
            </Link>
          ))}

          <ToggleRow
            label="마케팅 목적의 개인정보 수집 및 이용"
            checked={toggles.marketing_agreed}
            onChange={(v) => persistToggle("marketing_agreed", v)}
          />
          <ToggleRow
            label="광고성 정보 수신 동의"
            checked={toggles.ads_agreed}
            onChange={(v) => persistToggle("ads_agreed", v)}
          />
        </div>
      </div>

      {/* 내 연결코드 — 학생 전용. 코드는 학생이 발급하고 학부모가 입력하는 방향이라
          (sql/40 issue_student_link_code) 학부모 화면에는 존재하지 않는다. */}
      {!isParent && (
        <div className="mb-6">
          <p className="mb-2 text-sm text-ink">내 연결코드</p>
          <div className="flex items-center gap-2">
            <div
              className={`${ROW_BOX_CLASS} flex-1 tracking-[0.2em] bg-surface-footer text-ink-sub`}
            >
              {linkCode || "-"}
            </div>
            <button
              type="button"
              onClick={handleReissueCode}
              disabled={!linkCode || reissuing}
              className="shrink-0 whitespace-nowrap text-sm font-semibold text-accent underline underline-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {reissuing ? "재발급 중..." : "재발급"}
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setWithdrawOpen(true)}
        className="text-sm text-ink-sub underline underline-offset-2 hover:text-ink"
      >
        회원탈퇴
      </button>

      <WithdrawModal
        open={withdrawOpen}
        onClose={() => setWithdrawOpen(false)}
      />

      <ChangeEmailModal
        open={emailOpen}
        currentEmail={form.email}
        // profileId는 optional(exactOptionalPropertyTypes) — undefined면 키 자체를
        // 생략한다(ChangeEmailModal 내부도 `profileId &&`로 truthy 체크).
        {...(profileId !== undefined && { profileId })}
        onClose={() => setEmailOpen(false)}
        onChanged={(email) => {
          updateForm("email", email);
          // 헤더 등 다른 화면도 프로필을 다시 읽게 한다(persistProfile 과 같은 신호).
          window.dispatchEvent(new Event("winning-profile-updated"));
        }}
      />

      <ChangePasswordModal
        open={passwordOpen}
        email={form.email}
        onClose={() => setPasswordOpen(false)}
      />

      <ChangePhoneModal
        open={phoneOpen}
        currentPhone={form.phone}
        onClose={() => setPhoneOpen(false)}
        onChanged={(phone) => {
          updateForm("phone", phone);
          window.dispatchEvent(new Event("winning-profile-updated"));
        }}
      />

      <ChangePhoneModal
        open={guardianPhoneOpen}
        target="guardian"
        currentPhone={form.guardian_phone}
        onClose={() => setGuardianPhoneOpen(false)}
        onChanged={(phone) => {
          updateForm("guardian_phone", phone);
          window.dispatchEvent(new Event("winning-profile-updated"));
        }}
      />

      <UnlinkParentModal
        open={unlinkOpen}
        linkId={parentLink?.id ?? null}
        onClose={() => setUnlinkOpen(false)}
        onSuccess={() => setParentLink(null)}
      />

      <OrgCodeModal
        open={orgCodeOpen}
        {...(profileId !== undefined && { profileId })}
        onClose={() => setOrgCodeOpen(false)}
        onChanged={(tenantName) => {
          setMyTenant({ name: tenantName });
          window.dispatchEvent(new Event("winning-profile-updated"));
        }}
      />
    </div>
  );
}
