// 스쿨멘토 학생 가입 요청 본문 검증(순수 함수). DB 가 최종 판정하지만, 가입 확정을 부르기 전에
// 형식 오류를 걸러 내는 것이 목적이다. 이메일은 본문이 아니라 토큰의 Auth 사용자에서 온다.
// 선택 칸은 키가 없거나 null 이어도 같다. 소속코드는 null("기타")과 빈 값을 구분해야 해서 키가 있어야 한다.

import { isValidMobile, normalizePhone } from "../phoneCode.js";

export const MAX_PASSWORD_LENGTH = 256;
const MAX_TEXT_LENGTH = 100;
const MAX_NUMBER = 32767; // smallint

export interface SchoolStudentInput {
  name: string;
  /** 숫자만. 14세 미만은 본인 번호가 선택이라 없을 수 있다. */
  phone: string | null;
  /** 14세 미만은 본인확인(PASS)이 정본이라 없을 수 있다. */
  birthDate: string | null;
  gender: string | null;
  /** null 이면 기타(소속 없음). */
  tenantCode: string | null;
  grade: string;
  groupName: string | null;
  className: string | null;
  number: number | null;
  guardianName: string | null;
  guardianPhone: string | null;
  guardianRelation: string | null;
  guardianConsent: boolean;
  identityRequestId: string | null;
  agreeService: boolean;
  agreePrivacy: boolean;
  agreeDbTransfer: boolean;
  agreeMarketing: boolean;
}

export type ParseResult =
  | { ok: true; value: SchoolStudentInput }
  | { ok: false; field: string };

// 위닝 학생 가입 폼(src/pages/signup/StudentForm.tsx)과 같은 규칙: 영문, 숫자, 특수문자 포함 6자 이상.
export function isValidPassword(value: string): boolean {
  return (
    value.length <= MAX_PASSWORD_LENGTH &&
    /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{6,}$/.test(value)
  );
}

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

function optionalText(raw: unknown): string | null | undefined {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "string") return undefined;
  const text = raw.trim();
  if (text.length > MAX_TEXT_LENGTH) return undefined;
  return text === "" ? null : text;
}

export function parseSchoolStudentBody(body: unknown): ParseResult {
  const raw = (body && typeof body === "object" ? body : {}) as Record<
    string,
    unknown
  >;
  const fail = (field: string): ParseResult => ({ ok: false, field });

  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!name || name.length > MAX_TEXT_LENGTH) return fail("name");

  let phone: string | null = null;
  if (raw.phone !== undefined && raw.phone !== null && raw.phone !== "") {
    phone = normalizePhone(raw.phone);
    if (!isValidMobile(phone)) return fail("phone");
  }

  const identityRequestId = optionalText(raw.identityRequestId);
  if (identityRequestId === undefined) return fail("identityRequestId");

  // 본인확인(14세 미만)이 없으면 생년월일과 성별이 정본이라 필수다.
  let birthDate: string | null = null;
  if (raw.birthDate !== undefined && raw.birthDate !== null) {
    if (typeof raw.birthDate !== "string" || !isValidDate(raw.birthDate)) {
      return fail("birthDate");
    }
    birthDate = raw.birthDate;
  } else if (!identityRequestId) {
    return fail("birthDate");
  }

  let gender: string | null = null;
  if (raw.gender !== undefined && raw.gender !== null) {
    if (raw.gender !== "남" && raw.gender !== "여") return fail("gender");
    gender = raw.gender;
  } else if (!identityRequestId) {
    return fail("gender");
  }

  let tenantCode: string | null;
  if (raw.tenantCode === null) {
    tenantCode = null;
  } else if (typeof raw.tenantCode === "string" && raw.tenantCode.trim()) {
    tenantCode = raw.tenantCode.trim();
  } else {
    return fail("tenantCode");
  }

  const grade = typeof raw.grade === "string" ? raw.grade.trim() : "";
  if (!grade || grade.length > MAX_TEXT_LENGTH) return fail("grade");

  const groupName = optionalText(raw.groupName);
  if (groupName === undefined) return fail("groupName");
  const className = optionalText(raw.className);
  if (className === undefined) return fail("className");

  let number: number | null = null;
  if (raw.number !== undefined && raw.number !== null) {
    if (
      typeof raw.number !== "number" ||
      !Number.isInteger(raw.number) ||
      raw.number < 1 ||
      raw.number > MAX_NUMBER
    ) {
      return fail("number");
    }
    number = raw.number;
  }

  const guardianName = optionalText(raw.guardianName);
  if (guardianName === undefined) return fail("guardianName");
  const guardianRelation = optionalText(raw.guardianRelation);
  if (guardianRelation === undefined) return fail("guardianRelation");

  let guardianPhone: string | null = null;
  if (
    raw.guardianPhone !== undefined &&
    raw.guardianPhone !== null &&
    raw.guardianPhone !== ""
  ) {
    guardianPhone = normalizePhone(raw.guardianPhone);
    if (!isValidMobile(guardianPhone)) return fail("guardianPhone");
  }

  if (raw.agreeService !== true) return fail("agreeService");
  if (raw.agreePrivacy !== true) return fail("agreePrivacy");
  if (raw.agreeDbTransfer !== true) return fail("agreeDbTransfer");

  return {
    ok: true,
    value: {
      name,
      phone,
      birthDate,
      gender,
      tenantCode,
      grade,
      groupName,
      className,
      number,
      guardianName,
      guardianPhone,
      guardianRelation,
      guardianConsent: raw.guardianConsent === true,
      identityRequestId,
      agreeService: true,
      agreePrivacy: true,
      agreeDbTransfer: true,
      agreeMarketing: raw.agreeMarketing === true,
    },
  };
}
