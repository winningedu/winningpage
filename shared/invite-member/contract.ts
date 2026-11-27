// 관리자 초대 API 계약. 서버(api/_routes/admin/invite-member.ts)가 요청 스키마로 검증하고, 브라우저(직원 화면 초대 패널)가 응답 스키마로 검증한다.

import { z } from "zod";

/** 초대 라우트의 도메인 problem code. 공통 코드는 shared/http/codes.ts 다. */
export const INVITE_MEMBER_ERROR = {
  ALREADY_ACTIVE_ADMIN: "ALREADY_ACTIVE_ADMIN",
  NEEDS_CONFIRM: "NEEDS_CONFIRM",
} as const;

export type InviteMemberErrorCode =
  (typeof INVITE_MEMBER_ERROR)[keyof typeof INVITE_MEMBER_ERROR];

export const INVITE_EMAIL_MESSAGE = "이메일을 확인해 주세요.";
// ⚠️ 이름은 필수다. 초대로 만든 계정은 profiles.name 이 비는데, 그러면
//   ① 직원 목록의 「직원명」이 '-' 로 남고
//   ② 헤더가 로그인 상태를 이름 유무로 판정해서(Header.tsx) 그 사람에게는
//      이름 칩, 마이 메뉴, 「관리자」 버튼이 통째로 사라진다. 로그인은 됐는데
//      화면만 비로그인처럼 보인다(2026-08-23 실측).
//   헤더 쪽 판정은 다른 담당 영역이라, 이름을 처음부터 채워 원인을 없앤다.
export const INVITE_NAME_MESSAGE = "이름을 입력해 주세요.";
export const INVITE_ROLE_MESSAGE = "권한 묶음을 선택해 주세요.";

/** POST 본문. 모르는 키는 400 이다. */
export const inviteBody = z.strictObject({
  email: z
    .string({ error: INVITE_EMAIL_MESSAGE })
    .trim()
    .toLowerCase()
    .refine((value) => value.includes("@"), INVITE_EMAIL_MESSAGE),
  name: z
    .string({ error: INVITE_NAME_MESSAGE })
    .trim()
    .min(1, INVITE_NAME_MESSAGE),
  roleId: z
    .string({ error: INVITE_ROLE_MESSAGE })
    .trim()
    .min(1, INVITE_ROLE_MESSAGE),
  department: z
    .string()
    .trim()
    .nullish()
    .transform((value) => value || null),
  // 기존 서비스 회원을 관리자로 올릴 때 화면이 되묻고 다시 보내는 확인 플래그.
  confirmExisting: z.boolean().optional(),
});

/** 브라우저가 보내는 모양. */
export type InviteInput = z.input<typeof inviteBody>;

/**
 * 200 응답. emailed 가 true 면 신규 계정을 만들고 초대 메일을 보냈고,
 * false 면 이미 있는 계정을 관리자로 올렸다(메일은 가지 않아 호출부가 직접 알리도록 안내한다).
 */
export const inviteResultSchema = z.object({
  profileId: z.string(),
  resent: z.boolean(),
  emailed: z.boolean(),
});

export type InviteResult = z.output<typeof inviteResultSchema>;

/** 409 NEEDS_CONFIRM problem 이 detail 곁에 싣는 확장 멤버. */
export const needsConfirmExtraSchema = z.object({
  existingMemberType: z.string(),
  existingName: z.string().nullable(),
});

export type NeedsConfirmExtra = z.output<typeof needsConfirmExtraSchema>;
