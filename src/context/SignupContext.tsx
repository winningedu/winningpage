// 다단계 회원가입 플로우 상태 컨텍스트 — docs/login-signup-renewal-spec.md §5.3.
// 라우트 분할(유형 선택 → 생년월일 → 분기 폼 → 완료 → 학부모 온보딩) 간 데이터(memberType/
// birthDate/isUnder14/폼데이터/인증플래그)를 유지하기 위해 sessionStorage('signup-flow')로
// 동기화한다. 새로고침 시 자동 복구되며, hasFlow로 "진행 중이던 가입 흐름이 있었는지"를
// 노출해 각 페이지가 단계 강제 이동(예: memberType 없이 폼 단계 직접 진입 시 /signup으로
// redirect) 정책을 스스로 구현할 수 있게 한다. resetSignup()은 가입 완료·이탈 시 호출한다.
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

const STORAGE_KEY = "signup-flow";

type MemberType = "student" | "parent" | null;

interface SignupFormData {
  name: string;
  phone: string;
  phoneCode: string;
  noOwnPhone: boolean;
  email: string;
  emailCode: string;
  password: string;
  region: string;
  schoolType: string;
  schoolName: string;
  guardianPhone: string;
  guardianConsent: boolean;
  // T8(QA 2026-08-22): 성별(SelectField '남'/'여')·소속코드(선택)는 학생·학부모 공통
  // 필드로 formData에 둔다. 학부모는 생년월일 입력칸이 따로 필요한데 상위 birthDate는
  // 학생 흐름(StudentBirth 단계 → isUnder14 분기)이 이미 점유하고 있어 재사용하면
  // 학부모가 학생 판정 로직을 오염시킨다 — parentBirthDate로 분리한다.
  gender: string;
  orgCode: string;
  parentBirthDate: string; // 'YYYYMMDD' 8자리
  // 스쿨멘토 학교 가입(2026-11-06): 아이디 로그인, 학급 편성, 학부모 정보 칸.
  username: string;
  passwordConfirm: string;
  grade: string;
  groupName: string;
  className: string;
  classNumber: string;
  guardianName: string;
  guardianRelation: string;
}

interface SignupAgreements {
  service: boolean;
  privacyRequired: boolean;
  identityRequired: boolean;
  privacyOptional: boolean;
  marketing: boolean;
  ads: boolean;
  dbTransfer: boolean; // 스쿨멘토: 서비스 전환 시 위닝에듀로 정보를 옮기는 것에 관한 안내
}

// 소속 확인 결과. isCatchAll이면 코드를 비운 '기타 소속'이라 id/name/orgType이 없다.
export type SignupTenant =
  | { isCatchAll: false; id: string; name: string; orgType: string }
  | { isCatchAll: true };

// 아이디 중복 확인 결과. 값을 고치면 버려야 하므로 확인한 아이디를 함께 둔다.
interface UsernameCheck {
  value: string;
  available: boolean;
}

export type SchoolStep = 1 | 2 | 3 | 4 | 5;

interface SignupVerification {
  phone: { requested: boolean; verified: boolean };
  email: {
    requested: boolean;
    verified: boolean;
    checked: boolean;
    available: boolean;
    mode: string | null;
    resumed: boolean;
  };
  // Under14Verify(D-1)가 본인확인 성공 시 requestId를 함께 남긴다. 가입 RPC가
  // 이 값으로 identity_verifications 행을 찾아 검증·소비한다(sql/84_under14_signup.sql).
  // 그때까지는 requestId를 쓰는 곳이 없어 { verified }만 선언돼 있었다.
  // mobile: T9(2026-09-03) — PASS가 돌려준 법정대리인 휴대폰 번호(숫자만). D-2가
  // 학부모 전화번호 필드 프리필·잠금에 쓴다. 콜백이 즉시 실어 보내면 채워지고,
  // 새로고침으로 비어 있으면 D-2가 requestId로 다시 조회해(fetchIdentityMobile)
  // 채운다.
  pass: {
    verified: boolean;
    requestId?: string;
    verifiedAt?: number;
    mobile?: string;
  };
  // T3(2026-09-03): 14세 이상 학생이 "학생 명의의 핸드폰이 없어요"를 체크했을 때
  // 학부모 핸드폰을 SMS로 인증하는 별도 플로우 — 학생 본인 phone 섹션과 동일한
  // shape을 그대로 재사용한다(purpose만 'guardian_signup'으로 다르다).
  guardianPhone: { requested: boolean; verified: boolean };
}

interface SignupState {
  memberType: MemberType;
  birthDate: string;
  isUnder14: boolean | null;
  formData: SignupFormData;
  agreements: SignupAgreements;
  verification: SignupVerification;
  linkCode: string | null;
  signupCompleted: boolean;
  parentSignupCompleted: boolean;
  tenant: SignupTenant | null;
  schoolStep: SchoolStep;
  usernameCheck: UsernameCheck | null;
}

// 학생(9필드: 이름/전화/전화인증코드/이메일/이메일인증코드/비밀번호/지역/재학구분/학교명)과
// 학부모(6필드: 이름/전화/전화인증코드/이메일/이메일인증코드/비밀번호) + 14세 미만 부가 필드
// (noOwnPhone/guardianPhone/guardianConsent)를 하나의 평평한 폼데이터로 통합 관리한다.
// 화면별로 필요한 키만 골라 쓰면 되고, 안 쓰는 키는 초기값 그대로 남는다.
const INITIAL_FORM_DATA: SignupFormData = {
  name: "",
  phone: "",
  phoneCode: "",
  noOwnPhone: false, // D-2: '학생 명의의 핸드폰이 없어요'
  email: "",
  emailCode: "",
  password: "",
  region: "",
  schoolType: "",
  schoolName: "",
  guardianPhone: "", // D-2 학부모 정보 섹션
  guardianConsent: false, // D-2: '법정대리인 정보를 학부모 정보로 수집합니다'
  gender: "", // T8: 성별(학생·학부모 공통, 14세 미만은 PASS 값이 정본이라 입력칸 없음)
  orgCode: "", // T8: 소속코드(선택, 학생·학부모·14세 미만 공통)
  parentBirthDate: "", // T8: 학부모 생년월일 8자리(학생 birthDate와 별개)
  username: "",
  passwordConfirm: "",
  grade: "",
  groupName: "",
  className: "",
  classNumber: "",
  guardianName: "",
  guardianRelation: "",
};

// 학생 폼(C-1) 6항목 기준 — 학부모 폼(E-1)은 4항목(identityRequired/ads 미사용)만 쓰면 된다.
const INITIAL_AGREEMENTS: SignupAgreements = {
  service: false, // 필수: 위닝에듀 이용약관
  privacyRequired: false, // 필수: 개인정보 수집 및 이용
  identityRequired: false, // 필수(학생만): 본인 인증을 위한 정보 수집
  privacyOptional: false, // 선택(레거시 호환용 — 시안엔 없으나 기존 스키마 대응)
  marketing: false, // 선택: 마케팅 목적의 개인정보 수집 및 이용
  ads: false, // 선택(학생만): 광고성 정보 수신 동의
  dbTransfer: false, // 필수(스쿨멘토): DB 전환 안내
};

const INITIAL_VERIFICATION: SignupVerification = {
  phone: { requested: false, verified: false },
  // mode/resumed: 인증코드를 어떤 API로 보냈는지 기억한다. 신규 가입은 signUp
  // (verifyOtp type 'signup'), 중단된 가입 이어가기는 signInWithOtp(type 'email')라
  // 검증 호출이 달라진다. src/lib/signupEmailAuth.js 참고.
  email: {
    requested: false,
    verified: false,
    checked: false,
    available: false,
    mode: null,
    resumed: false,
  },
  pass: { verified: false }, // 법정대리인 PASS 본인인증(D-1)
  guardianPhone: { requested: false, verified: false }, // T3: 14세 이상 학생의 학부모 핸드폰 SMS 인증
};

const INITIAL_STATE: SignupState = {
  memberType: null, // 'student' | 'parent' | null
  birthDate: "", // 8자리 문자열, 예: '20120101'
  isUnder14: null, // birthDate로부터 계산(null=미입력)
  formData: INITIAL_FORM_DATA,
  agreements: INITIAL_AGREEMENTS,
  verification: INITIAL_VERIFICATION,
  linkCode: null, // 학생 가입 완료 후 발급되는 학부모 연동 코드(C-2)
  signupCompleted: false, // 가입 성공(complete_signup_profile RPC 성공) 직후 true — C-2 진입 가드용
  parentSignupCompleted: false, // 학부모 가입 성공 직후 true — signupCompleted와 동일 패턴의 학부모 온보딩 진입 가드용
  tenant: null, // 스쿨멘토 가입 2단계 결과
  schoolStep: 1, // 스쿨멘토 가입 현재 단계
  usernameCheck: null,
};

// 만 나이 계산: 생일이 이미 지났으면 연도 차, 아직 안 지났으면 연도 차 - 1.
// (§3.3 B-2: "연령 확인은 회원가입 시 입력하는 생년월일을 기준으로 하며, 생일이 지나지
// 않은 경우 만 14세 미만으로 처리합니다" — 통상적인 만 나이 계산 규칙 그대로 적용)
// 유효하지 않은 입력(파싱 불가/Date 롤오버로 실제 날짜가 바뀐 경우/미래 날짜/1900년 이전
// 비상식적인 연도)은 null을 반환하므로, 호출부는 null을 "계산 불가 → 에러 표시"로 다뤄야
// 한다. StudentBirth 등 다른 화면에서 동일 로직을 중복 구현하지 않도록 export한다.
export function computeIsUnder14(birthDate8: string): boolean | null {
  if (birthDate8?.length !== 8) return null;

  const year = Number(birthDate8.slice(0, 4));
  const month = Number(birthDate8.slice(4, 6));
  const day = Number(birthDate8.slice(6, 8));

  if (!year || !month || !day) return null;
  if (year < 1900) return null; // 비상식적인 연도 거부

  const birth = new Date(year, month - 1, day);
  if (Number.isNaN(birth.getTime())) return null;

  // Date는 month=13, day=32처럼 범위를 벗어난 값을 다음 달/해로 조용히 롤오버시켜
  // 전혀 다른 날짜를 만들어낸다(예: 2024-02-30 → 2024-03-01). 역검증으로 이런
  // 입력을 걸러낸다.
  if (
    birth.getFullYear() !== year ||
    birth.getMonth() !== month - 1 ||
    birth.getDate() !== day
  ) {
    return null;
  }

  const today = new Date();
  if (birth.getTime() > today.getTime()) return null; // 미래 날짜 거부

  let age = today.getFullYear() - birth.getFullYear();

  const hasHadBirthdayThisYear =
    today.getMonth() > birth.getMonth() ||
    (today.getMonth() === birth.getMonth() &&
      today.getDate() >= birth.getDate());

  if (!hasHadBirthdayThisYear) age -= 1;

  return age < 14;
}

function readStoredFlow(): Partial<SignupState> | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (error) {
    console.error("signup-flow 세션 저장소 읽기 오류:", error);
    return null;
  }
}

// 민감 필드(비밀번호/인증코드)는 sessionStorage에 평문으로 남기지 않는다 — 새로고침 복구
// 시에는 사용자가 다시 입력해야 하며, 이 필드들은 저장 대상에서 제외한다.
const SENSITIVE_FORM_KEYS: (keyof SignupFormData)[] = [
  "password",
  "passwordConfirm",
  "phoneCode",
  "emailCode",
];

function writeStoredFlow(state: SignupState) {
  try {
    const sanitizedFormData: Partial<SignupFormData> = { ...state.formData };
    SENSITIVE_FORM_KEYS.forEach((key) => {
      delete sanitizedFormData[key];
    });

    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...state, formData: sanitizedFormData }),
    );
  } catch (error) {
    console.error("signup-flow 세션 저장소 쓰기 오류:", error);
  }
}

function clearStoredFlow() {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error("signup-flow 세션 저장소 초기화 오류:", error);
  }
}

function buildInitialState(stored: Partial<SignupState> | null): SignupState {
  if (!stored) return { ...INITIAL_STATE };

  const formData = { ...INITIAL_FORM_DATA, ...(stored.formData || {}) };
  const verification = {
    ...INITIAL_VERIFICATION,
    phone: {
      ...INITIAL_VERIFICATION.phone,
      ...(stored.verification?.phone || {}),
    },
    email: {
      ...INITIAL_VERIFICATION.email,
      ...(stored.verification?.email || {}),
    },
    pass: {
      ...INITIAL_VERIFICATION.pass,
      ...(stored.verification?.pass || {}),
    },
    guardianPhone: {
      ...INITIAL_VERIFICATION.guardianPhone,
      ...(stored.verification?.guardianPhone || {}),
    },
  };

  // SENSITIVE_FORM_KEYS(password 포함)는 세션 저장소에 절대 남지 않으므로, 복구 직후
  // formData.password는 항상 빈 문자열이다. signUp 시 서버에 등록한 비밀번호와 새로고침
  // 후 사용자가 다시 입력할 비밀번호가 서로 다를 수 있는데, phone/email 인증 완료 플래그만
  // 그대로 복구되면 "인증은 완료됐지만 그 인증이 보장하는 비밀번호는 알 수 없다"는 불일치
  // 상태가 된다. 이를 막기 위해 비밀번호가 비어 있으면 인증 상태를 INITIAL로 리셋해
  // 재-signUp(재인증)을 강제한다.
  if (!formData.password) {
    verification.phone = { ...INITIAL_VERIFICATION.phone };
    verification.email = { ...INITIAL_VERIFICATION.email };
    verification.guardianPhone = { ...INITIAL_VERIFICATION.guardianPhone };
  }

  return {
    ...INITIAL_STATE,
    ...stored,
    formData,
    agreements: { ...INITIAL_AGREEMENTS, ...(stored.agreements || {}) },
    verification,
  };
}

interface SignupContextValue extends SignupState {
  hasFlow: boolean;
  setMemberType: (memberType: MemberType) => void;
  setBirthDate: (birthDate: string) => void;
  updateFormData: (partial: Partial<SignupFormData>) => void;
  updateAgreements: (partial: Partial<SignupAgreements>) => void;
  setAllAgreements: (value: boolean, keys?: string[]) => void;
  updateVerification: (
    section: keyof SignupVerification,
    partial: Partial<SignupVerification[keyof SignupVerification]>,
  ) => void;
  setLinkCode: (linkCode: string | null) => void;
  setSignupCompleted: (signupCompleted: boolean) => void;
  setParentSignupCompleted: (parentSignupCompleted: boolean) => void;
  setTenant: (tenant: SignupTenant | null) => void;
  setSchoolStep: (schoolStep: SchoolStep) => void;
  setUsernameCheck: (usernameCheck: UsernameCheck | null) => void;
  resetForMemberType: (memberType: MemberType) => void;
  resetSignup: () => void;
}

const SignupContext = createContext<SignupContextValue | null>(null);

export function SignupProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(() => buildInitialState(readStoredFlow()));
  // 마운트 시점에 이미 저장돼 있던 흐름이 있었는지(=새로고침/재방문 복구 여부)는 최초 1회만
  // 판정하면 되므로 state와 분리된 lazy useState로 고정한다.
  const [hasFlow] = useState(() => !!readStoredFlow());

  useEffect(() => {
    writeStoredFlow(state);
  }, [state]);

  const setMemberType = useCallback((memberType: MemberType) => {
    setState((prev) => ({ ...prev, memberType }));
  }, []);

  const setBirthDate = useCallback((birthDate: string) => {
    setState((prev) => ({
      ...prev,
      birthDate,
      isUnder14: computeIsUnder14(birthDate),
    }));
  }, []);

  const updateFormData = useCallback((partial: Partial<SignupFormData>) => {
    setState((prev) => ({
      ...prev,
      formData: { ...prev.formData, ...partial },
    }));
  }, []);

  const updateAgreements = useCallback((partial: Partial<SignupAgreements>) => {
    setState((prev) => ({
      ...prev,
      agreements: { ...prev.agreements, ...partial },
    }));
  }, []);

  // keys를 지정하면 그 키만 일괄 토글(예: 학생 6항목 vs 학부모 4항목 '모두 동의' 분리).
  const setAllAgreements = useCallback((value: boolean, keys?: string[]) => {
    setState((prev) => {
      const targetKeys = (keys ||
        Object.keys(prev.agreements)) as (keyof SignupAgreements)[];
      const nextAgreements = { ...prev.agreements };
      targetKeys.forEach((key) => {
        nextAgreements[key] = value;
      });
      return { ...prev, agreements: nextAgreements };
    });
  }, []);

  // section: 'phone' | 'email' | 'pass'
  const updateVerification = useCallback(
    (
      section: keyof SignupVerification,
      partial: Partial<SignupVerification[keyof SignupVerification]>,
    ) => {
      setState((prev) => ({
        ...prev,
        verification: {
          ...prev.verification,
          [section]: { ...prev.verification[section], ...partial },
        },
      }));
    },
    [],
  );

  const setLinkCode = useCallback((linkCode: string | null) => {
    setState((prev) => ({ ...prev, linkCode }));
  }, []);

  const setSignupCompleted = useCallback((signupCompleted: boolean) => {
    setState((prev) => ({ ...prev, signupCompleted }));
  }, []);

  // signupCompleted(학생)와 동일 패턴 — 학부모 가입 성공 직후 true, sessionStorage로 영속.
  const setParentSignupCompleted = useCallback(
    (parentSignupCompleted: boolean) => {
      setState((prev) => ({ ...prev, parentSignupCompleted }));
    },
    [],
  );

  const setTenant = useCallback((tenant: SignupTenant | null) => {
    setState((prev) => ({ ...prev, tenant }));
  }, []);

  const setSchoolStep = useCallback((schoolStep: SchoolStep) => {
    setState((prev) => ({ ...prev, schoolStep }));
  }, []);

  const setUsernameCheck = useCallback(
    (usernameCheck: UsernameCheck | null) => {
      setState((prev) => ({ ...prev, usernameCheck }));
    },
    [],
  );

  // 유형 선택(학생/학부모)을 되돌아가 다시 고를 때, 이전 유형에서 입력하던 폼데이터/동의/
  // 인증/완료 플래그가 새 유형 흐름에 그대로 남아있으면 상태가 오염된다(예: 학부모로
  // 전환했는데 학생 인증 플래그가 verified로 남는 등). memberType 설정과 동시에 관련
  // 상태를 전부 INITIAL로 되돌려 안전하게 유형을 전환한다. birthDate/isUnder14/linkCode는
  // 유형과 무관하게 유지한다.
  const resetForMemberType = useCallback((memberType: MemberType) => {
    setState((prev) => ({
      ...prev,
      memberType,
      formData: INITIAL_FORM_DATA,
      agreements: INITIAL_AGREEMENTS,
      verification: INITIAL_VERIFICATION,
      signupCompleted: false,
      parentSignupCompleted: false,
      tenant: null,
      schoolStep: 1,
      usernameCheck: null,
    }));
  }, []);

  const resetSignup = useCallback(() => {
    clearStoredFlow();
    setState({ ...INITIAL_STATE });
  }, []);

  const value = useMemo(
    () => ({
      ...state,
      hasFlow,
      setMemberType,
      setBirthDate,
      updateFormData,
      updateAgreements,
      setAllAgreements,
      updateVerification,
      setLinkCode,
      setSignupCompleted,
      setParentSignupCompleted,
      setTenant,
      setSchoolStep,
      setUsernameCheck,
      resetForMemberType,
      resetSignup,
    }),
    [
      state,
      hasFlow,
      updateVerification,
      setMemberType,
      setParentSignupCompleted,
      setSignupCompleted,
      updateAgreements,
      resetSignup,
      updateFormData,
      setLinkCode,
      setAllAgreements,
      setBirthDate,
      setTenant,
      setSchoolStep,
      setUsernameCheck,
      resetForMemberType,
    ],
  );

  return (
    <SignupContext.Provider value={value}>{children}</SignupContext.Provider>
  );
}

export function useSignup() {
  const ctx = useContext(SignupContext);

  if (!ctx) {
    throw new Error(
      "useSignup은 SignupProvider 내부에서만 사용할 수 있습니다.",
    );
  }

  return ctx;
}
