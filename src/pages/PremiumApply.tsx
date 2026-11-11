import { ChevronDown } from "lucide-react";
import {
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { useLocation } from "react-router";
import { PREMIUM_APPLY_FORM_ANCHOR_ID } from "@/components/premium/premiumRoutesPaths";
import BookViewer from "@/components/premiumBook/BookViewer";
import { usePremiumBookPages } from "@/components/premiumBook/usePremiumBookPages";
import { getAuthHeader } from "@/lib/apiFetch";
import { formatPhoneInput } from "@/lib/phoneVerification";

// 이용신청 > 프리미엄 이용 (node 1882:11190) 정식 페이지.
// 러프 구현 목표 — 픽셀 재현 아님, 섹션 구조·카피·컬러 위계만 재현한다.
// 자세한 미결 사항은 docs/figma-ready-for-dev-spec.md §4-6 참고(수정·커밋 대상 아님, 읽기 전용).
//
// 책자 뷰어는 premium_book_pages를 읽는 usePremiumBookPages 훅 + 표현 전용 BookViewer가
// 전담한다(명세 §5.1). BookViewer는 components/premiumBook/ 공용 컴포넌트로 이관됐다 —
// 어드민 미리보기가 두 번째 소비자가 되면서 자체 DB 조회 전제가 깨졌기 때문이다. 이 파일에
// 있던 하드코딩 BOOK_SPREADS는 그 자리를 채우던 껍데기라 제거했다.
//
// 상담 신청 폼은 /api/create-consult-request 로 실제 저장된다. 검증은 브라우저 기본
// required 대신 자체 규칙(validateForm)으로 처리한다 — 브라우저 말풍선은 스타일을
// 맞출 수 없고 한국어 문구도 제어가 안 되기 때문에, noValidate로 끄고 필드별 오류를
// 화면에 직접 그린다.

// 셀렉트 옵션 — 시안에 목록이 없어(B-13) 헤더·푸터 「프리미엄」 6개 프로그램 라벨
// (src/data/navigation.js FALLBACK_NAV_GROUPS)을 정본으로 그대로 쓴다.
const SERVICE_OPTIONS = [
  "대입컨설팅 프로그램",
  "특목고입학 프로그램",
  "대학원입학 프로그램",
  "해외명문대 진학컨설팅",
  "국제학교 학습관리",
  "국제・해외고 국내대 입학컨설팅",
];

type FormState = {
  name: string;
  phone: string;
  email: string;
  service: string;
  message: string;
  agree: boolean;
};

const INITIAL_FORM: FormState = {
  name: "",
  phone: "",
  email: "",
  service: "",
  message: "",
  agree: false,
};

type FormErrors = Partial<Record<keyof FormState, string>>;

// DOM 순서와 동일 — 첫 오류 필드로 포커스를 옮길 때 이 순서대로 훑는다.
const FIELD_ORDER: (keyof FormState)[] = [
  "name",
  "phone",
  "email",
  "service",
  "message",
  "agree",
];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_ALLOWED_PATTERN = /^[0-9-]+$/;

// 서버(api/_routes/create-consult-request.js)와 동일한 규칙. 클라이언트에서 먼저 걸러 왕복을
// 줄이되, 최종 검증은 서버가 다시 한다.
function validateForm(form: FormState): FormErrors {
  const errors: FormErrors = {};

  const name = form.name.trim();
  if (!name) {
    errors.name = "이름을 입력해주세요.";
  } else if (name.length > 40) {
    errors.name = "이름은 40자 이내로 입력해주세요.";
  }

  const phone = form.phone.trim();
  const phoneDigits = phone.replace(/[^0-9]/g, "");
  if (!phone) {
    errors.phone = "연락처를 입력해주세요.";
  } else if (!PHONE_ALLOWED_PATTERN.test(phone)) {
    errors.phone = "연락처는 숫자와 하이픈(-)만 입력할 수 있습니다.";
  } else if (phoneDigits.length < 9 || phoneDigits.length > 13) {
    errors.phone = "연락처 자릿수를 확인해주세요.";
  }

  const email = form.email.trim();
  if (email && !EMAIL_PATTERN.test(email)) {
    errors.email = "이메일 형식을 확인해주세요.";
  }

  if (!form.service || !SERVICE_OPTIONS.includes(form.service)) {
    errors.service = "이용하고 싶으신 서비스를 선택해주세요.";
  }

  if (form.message.length > 1000) {
    errors.message = "문의사항은 1000자 이내로 입력해주세요.";
  }

  if (!form.agree) {
    errors.agree = "개인정보 수집·이용에 동의해주세요.";
  }

  return errors;
}

// controlId를 주면(서비스 선택처럼 <select>가 아이콘과 함께 <div>로 한 겹
// 감싸여 있어 children을 직접 복제할 수 없는 경우) 그 id를 label htmlFor로
// 쓰고, 호출부가 실제 컨트롤에 같은 id를 직접 단다. 안 주면 children이 바로
// 그 컨트롤이라는 뜻이라 cloneElement로 id를 꽂는다. label이 children까지
// 감싸면(중첩 연결) flex-col gap-2가 한 아이템으로 합쳐져 라벨·입력 사이
// 간격이 사라지므로 형제 구조를 유지한다.
function FormField({
  label,
  error,
  children,
  controlId,
}: {
  label: string;
  // 호출부가 errors.xxx(string | undefined)를 그대로 넘기므로
  // exactOptionalPropertyTypes 대응으로 undefined를 명시한다.
  error?: string | undefined;
  children: ReactNode;
  controlId?: string;
}) {
  const generatedId = useId();
  const isSingleControl = controlId === undefined && isValidElement(children);
  const inputId = controlId ?? (isSingleControl ? generatedId : undefined);
  // cloneElement props 타입은 담당 파일이 아니라 수정할 수 없다 —
  // exactOptionalPropertyTypes 때문에 값이 undefined면 id 키 자체를 생략한다.
  const resolvedId =
    (children as ReactElement<{ id?: string }>)?.props?.id ?? inputId;
  const control = isSingleControl
    ? cloneElement(children as ReactElement<{ id?: string }>, {
        ...(resolvedId !== undefined && { id: resolvedId }),
      })
    : children;
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={inputId} className="text-sm font-normal text-black">
        {label}
      </label>
      {control}
      {error ? (
        <p className="text-xs font-normal text-red-600">{error}</p>
      ) : null}
    </div>
  );
}

const inputClass =
  "h-12 w-full rounded-[0.625rem] border border-line bg-white px-5 py-4 text-sm font-medium text-[#1e293b] placeholder:text-[#767676] focus:border-primary focus:outline-hidden";

// <select>는 <input>과 달리 브라우저가 세로 padding을 텍스트 라인 안쪽으로 그대로
// 적용한다(input처럼 넘치는 만큼 자동으로 다시 중앙 정렬하지 않음) — h-12(48px)에
// inputClass의 py-4(32px)를 그대로 쓰면 남는 높이(16px)가 text-sm 줄 높이(20px)보다
// 작아 선택된 값의 아래쪽이 잘려 보인다("이용하고 싶으신 서비스" 드롭다운 QA 지적).
// 세로 padding 없이 h-12만으로 중앙 정렬하는 다른 네이티브 select 관례
// (SelectField.tsx SIZE_CLASSES)를 따라 이 select만 별도 클래스를 쓴다.
const selectClass =
  "h-12 w-full rounded-[0.625rem] border border-line bg-white px-5 text-sm font-medium focus:border-primary focus:outline-hidden";

const inputErrorClass = "border-red-400 focus:border-red-500";

export default function PremiumApply() {
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const { pages, loading, error, retry } = usePremiumBookPages();
  const location = useLocation();

  // 대입A・S 히어로 CTA(/premium-apply#premium-apply-form, QA 행251)로 들어왔을 때 상담
  // 신청 섹션까지 스크롤한다. React Router 데이터 라우터(ScrollToTop, src/App.tsx)는 해시가
  // 있으면 스크롤을 건드리지 않고 물러나는데, 이건 페이지 내 앵커 클릭(브라우저 네이티브
  // 스크롤)만 전제한 것이라 크로스 라우트 진입에는 아무도 스크롤을 옮기지 않는다 — 이 훅이
  // 그 빈틈을 채운다. BookViewer 로딩이 끝나기 전에 스크롤하면 플립북 높이가 나중에
  // 자리잡으며 목표 위치가 밀리므로 loading이 꺼진 다음에만 시도한다.
  useEffect(() => {
    if (loading) return;
    if (location.hash !== `#${PREMIUM_APPLY_FORM_ANCHOR_ID}`) return;

    const target = document.getElementById(PREMIUM_APPLY_FORM_ANCHOR_ID);
    if (!target) return;

    const prefersReduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    target.scrollIntoView({
      behavior: prefersReduced ? "auto" : "smooth",
      block: "start",
    });
  }, [loading, location.hash]);

  const fieldRefs: Record<
    keyof FormState,
    React.RefObject<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null
    >
  > = {
    name: useRef(null),
    phone: useRef(null),
    email: useRef(null),
    service: useRef(null),
    message: useRef(null),
    agree: useRef(null),
  };

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return; // 중복 클릭으로 두 번 신청되는 것을 막는다.

    const nextErrors = validateForm(form);
    setErrors(nextErrors);
    setSubmitError("");

    const firstErrorKey = FIELD_ORDER.find((key) => nextErrors[key]);
    if (firstErrorKey) {
      fieldRefs[firstErrorKey].current?.focus();
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/create-consult-request", {
        method: "POST",
        // 로그인 상태면 토큰을 함께 보낸다. 서버가 QA 계정의 접수를 걸러내는 데만 쓴다.
        headers: {
          "Content-Type": "application/json",
          ...(await getAuthHeader()),
        },
        body: JSON.stringify({
          name: form.name.trim(),
          phone: form.phone.trim(),
          email: form.email.trim(),
          service: form.service,
          message: form.message.trim(),
          agree: form.agree,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok) {
        setSubmitError(
          data.error ||
            "상담 신청 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
        );
        return;
      }

      setForm(INITIAL_FORM);
      setErrors({});
      setSubmitted(true);
    } catch {
      setSubmitError(
        "네트워크 오류로 상담 신청에 실패했습니다. 잠시 후 다시 시도해주세요.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-white pt-16 text-[#0d1b2a]">
      {/* 히어로 */}
      <section className="mx-auto max-w-content px-6 pt-20 pb-10 text-center">
        <p className="text-base font-semibold leading-7 text-accent">
          프리미엄 이용
        </p>
        <h1 className="mx-auto mt-2 max-w-225 text-3xl font-semibold leading-tight text-ink md:text-[3.125rem] md:leading-17.5">
          위닝에듀만의 프리미엄 서비스를 확인해보세요
        </h1>
      </section>

      {/* 플립북 뷰어 — 섹션 래퍼까지 BookViewer가 렌더한다 */}
      <BookViewer
        pages={pages}
        loading={loading}
        error={error}
        onRetry={retry}
      />

      {/* 상담 신청 섹션 — id/scroll-mt는 대입A・S 히어로 CTA 앵커 타깃이다(위 useEffect,
          BoardListPage.jsx:198 scroll-mt-24 선례와 동일하게 fixed 헤더 h-16을 보정한다). */}
      <section
        id={PREMIUM_APPLY_FORM_ANCHOR_ID}
        className="scroll-mt-24 bg-[#f7f7f7] py-20"
      >
        <div className="mx-auto flex max-w-content flex-col gap-10 px-6 lg:flex-row lg:items-start lg:justify-between lg:gap-16">
          <div className="max-w-130 shrink-0 lg:pt-4">
            <p className="text-sm font-medium leading-5 text-primary">문의</p>
            <h2 className="mt-2 text-2xl font-semibold leading-10.25 text-ink md:text-[2rem]">
              프리미엄 서비스 상담 신청하기
            </h2>
            <p className="mt-2 text-base font-normal leading-6.5 text-ink">
              문의사항을 남겨주시면 위닝에듀 팀이 확인 후 연락드립니다.
            </p>
          </div>

          <div className="w-full max-w-199.75 rounded-4xl bg-white p-6 shadow-[0_0.25rem_2rem_rgba(0,0,0,0.16)] md:p-10">
            {submitted ? (
              <div className="flex min-h-80 flex-col items-center justify-center gap-3 text-center">
                <p className="text-xl font-semibold text-ink">
                  상담 신청이 접수되었습니다.
                </p>
                <p className="text-sm font-normal text-[#767676]">
                  확인 후 입력하신 연락처로 안내드리겠습니다.
                </p>
              </div>
            ) : (
              // noValidate: 브라우저 기본 검증 말풍선 대신 validateForm 결과로 필드별 오류를 직접 그린다.
              <form
                onSubmit={handleSubmit}
                noValidate
                className="flex flex-col gap-9"
              >
                <div className="flex flex-col gap-1.5">
                  <p className="text-xl font-medium leading-8.25 text-ink">
                    문의사항을 남겨주세요
                  </p>
                  <p className="text-sm font-normal leading-5.5 text-ink">
                    이용하고 싶으신 서비스와 문의사항을 남기면 상담을 시작할 수
                    있습니다.
                  </p>
                </div>

                <div className="flex flex-col gap-6">
                  <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                    <FormField label="이름 *" error={errors.name}>
                      <input
                        ref={
                          fieldRefs.name as React.RefObject<HTMLInputElement>
                        }
                        type="text"
                        value={form.name}
                        onChange={(e) => updateField("name", e.target.value)}
                        placeholder="예 : 홍길동"
                        className={`${inputClass} ${errors.name ? inputErrorClass : ""}`}
                      />
                    </FormField>
                    <FormField label="연락처 *" error={errors.phone}>
                      <input
                        ref={
                          fieldRefs.phone as React.RefObject<HTMLInputElement>
                        }
                        type="tel"
                        inputMode="numeric"
                        value={form.phone}
                        // 자동 하이픈 포맷(QA 지시 2026-08-21) — src/lib/phoneVerification.ts
                        // formatPhoneInput, 멘토신청 지원서와 공유하는 유틸이다.
                        onChange={(e) =>
                          updateField("phone", formatPhoneInput(e.target.value))
                        }
                        placeholder="010-0000-0000"
                        maxLength={13}
                        className={`${inputClass} ${errors.phone ? inputErrorClass : ""}`}
                      />
                    </FormField>
                  </div>

                  <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                    <FormField label="이메일" error={errors.email}>
                      <input
                        ref={
                          fieldRefs.email as React.RefObject<HTMLInputElement>
                        }
                        type="email"
                        value={form.email}
                        onChange={(e) => updateField("email", e.target.value)}
                        placeholder="example@winningedu.com"
                        className={`${inputClass} ${errors.email ? inputErrorClass : ""}`}
                      />
                    </FormField>
                    <FormField
                      label="이용하고 싶으신 서비스 *"
                      error={errors.service}
                      controlId="premium-apply-service"
                    >
                      <div className="relative">
                        <select
                          id="premium-apply-service"
                          ref={
                            fieldRefs.service as React.RefObject<HTMLSelectElement>
                          }
                          value={form.service}
                          onChange={(e) =>
                            updateField("service", e.target.value)
                          }
                          className={`${selectClass} appearance-none pr-10 ${
                            form.service ? "text-[#1e293b]" : "text-[#767676]"
                          } ${errors.service ? inputErrorClass : ""}`}
                        >
                          <option value="" disabled>
                            이용 서비스 선택
                          </option>
                          {SERVICE_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#767676]" />
                      </div>
                    </FormField>
                  </div>

                  <FormField label="문의사항" error={errors.message}>
                    <textarea
                      ref={
                        fieldRefs.message as React.RefObject<HTMLTextAreaElement>
                      }
                      value={form.message}
                      onChange={(e) => updateField("message", e.target.value)}
                      rows={5}
                      className={`w-full resize-none rounded-[0.625rem] border border-line bg-white px-5 py-4 text-sm font-medium text-[#1e293b] focus:border-primary focus:outline-hidden ${
                        errors.message ? inputErrorClass : ""
                      }`}
                    />
                  </FormField>

                  <div className="flex flex-col gap-1.5">
                    {/* 동의 문구에 수집 항목·이용 목적·보유 기간을 모두 명시 — 개인정보처리방침(terms.privacy_policy) 「4. 개인정보의 보유 및 이용기간」과 표현 일치 */}
                    <label className="flex items-start gap-2 text-sm font-normal leading-5 text-ink">
                      <input
                        ref={
                          fieldRefs.agree as React.RefObject<HTMLInputElement>
                        }
                        type="checkbox"
                        checked={form.agree}
                        onChange={(e) => updateField("agree", e.target.checked)}
                        className="mt-0.5 h-4 w-4 shrink-0 rounded-sm border-line text-primary focus:ring-primary"
                      />
                      <span>
                        이름, 연락처, 이메일, 문의 내용을 상담 진행 및 안내를
                        위해 수집하며 상담 종료 후 2년간 보관합니다. 동의하지
                        않으실 수 있으나 이 경우 상담 신청이 제한됩니다.{" "}
                        {/* 새 탭으로 열어 작성 중인 폼(이름·연락처·문의 내용)이 리로드로 날아가지 않게 한다 */}
                        <a
                          href="/privacy"
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="font-medium text-primary underline"
                        >
                          내용 보기
                        </a>
                      </span>
                    </label>
                    {errors.agree ? (
                      <p className="text-xs font-normal text-red-600">
                        {errors.agree}
                      </p>
                    ) : null}
                  </div>
                </div>

                {submitError ? (
                  <p className="text-center text-sm font-medium text-red-600">
                    {submitError}
                  </p>
                ) : null}

                <button
                  type="submit"
                  disabled={submitting}
                  className="flex h-13 w-full items-center justify-center rounded-[0.625rem] bg-primary text-sm font-semibold text-white transition hover:bg-[#012347] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? "접수 중…" : "상담 신청하기"}
                </button>
              </form>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
