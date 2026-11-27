// /api/admin/invite-member 아래 관리자 초대 라우트. 관리자 앱(api/_routes/admin/app.ts)이 .route("/invite-member", inviteMember) 로 붙인다.
// 요청 검증과 응답 모양은 shared/invite-member/contract.ts 를 따른다.
//
// POST /api/admin/invite-member
// Authorization: Bearer <supabase access token>   (최고 관리자 전용)
//
// 관리자 초대: 기획 문서 「관리자 권한 체계 안내」의 "새 관리자 등록 절차".
//   최고 관리자가 이메일로 초대하고, 그 자리에서 받을 권한 묶음도 함께 정한다.
//   받은 사람이 링크를 눌러 비밀번호를 설정하면 계정이 활성화된다.
//
// 왜 서버 라우트인가
//   Supabase Auth 의 초대(auth.admin.inviteUserByEmail)는 service_role 로만
//   호출된다. 브라우저에서 못 한다. 그리고 service_role 은 RLS 를 통째로
//   우회하므로, "누가 초대할 수 있는가"는 이 라우트가 막아야 한다. 최고 관리자
//   전용 메뉴(adminMembers)라 admin() 가드의 permission 이 fn_is_super_admin 으로
//   판정하고, QA 계정 쓰기 차단도 같은 가드가 한다.
//
// ⚠️ profiles 행을 이 라우트가 직접 넣는다
//   dev와 로컬에는 auth.users 에서 profiles 로 가는 자동 생성 트리거가 있지만 **prod 에는
//   의도적으로 없다**(supabase/README.md). 트리거에 기대면 prod 에서만 profiles
//   가 비어 직원 목록에 이름이 안 뜬다. 그래서 여기서 명시적으로 upsert 한다.
//
// 응답 규격 (오류는 problem+json, 항상 code 가 있다)
//   200 { profileId, resent, emailed }
//         emailed=true  신규 계정을 만들고 초대 메일을 보냈다.
//         emailed=false 이미 있는 계정을 관리자로 올렸다. 메일은 가지 않는다.
//                       호출부가 "직접 알려주세요"를 안내해야 한다(아래 ⚠️ 참고).
//   400 VALIDATION_FAILED                 email, name, roleId 누락이나 형식 오류.
//   403 FORBIDDEN, QA_ACCOUNT_READ_ONLY   최고 관리자 아님, QA 계정.
//   409 ALREADY_ACTIVE_ADMIN              이미 활성 관리자다.
//   409 NEEDS_CONFIRM                     서비스 회원이라 확인이 필요하다(existingMemberType, existingName).
//   500 INTERNAL_ERROR                    Auth 초대 실패, 서버 설정 누락 등.

import {
  INVITE_MEMBER_ERROR,
  type InviteResult,
  inviteBody,
  type NeedsConfirmExtra,
} from "../../../shared/invite-member/contract.js";
import { admin } from "../../_lib/hono/admin.js";
import { adminFactory } from "../../_lib/hono/factory.js";
import { methodNotAllowed, ProblemError } from "../../_lib/hono/problem.js";
import { validate } from "../../_lib/hono/validate.js";
import { getEnv } from "../../_lib/supabaseAdmin.js";

// createSupabaseAdmin() 설정 오류(500)는 admin 가드가 던지고 handleError(api/_lib/hono/error.ts)가
// "서버 설정이 올바르지 않습니다."로 복원한다.
const guard = admin({
  permission: { key: "adminMembers" },
  unhandledMessage: "관리자 초대 처리 중 오류가 발생했습니다.",
  logLabel: "admin/invite-member",
});

export const inviteMember = adminFactory
  .createApp()
  .post("/", guard, validate("json", inviteBody), async (c) => {
    const supabaseAdmin = c.var.supabaseAdmin;
    const invitedBy = c.var.userId;
    if (!invitedBy) throw new Error("invite-member: admin context missing");
    const { email, name, roleId, department, confirmExisting } =
      c.req.valid("json");

    // 초대 링크가 돌아올 주소. 로컬은 5173(vite), 운영은 PUBLIC_SITE_URL.
    //
    // ⚠️ /admin 이 아니라 /login/reset-password 로 보낸다.
    //   초대받은 사람은 **비밀번호가 없는 계정**이다. 예전에는 /admin 으로 보냈는데,
    //   거기엔 비밀번호를 정하는 화면이 없어서 링크를 눌러도 세션만 생기고 아무것도
    //   할 수 없었다(2026-08-23 실측, 해시만 붙은 빈 화면).
    //   ResetPassword.tsx 는 getSession() 으로 **아무 세션이나** 잡아 비밀번호를
    //   설정하므로 recovery 든 invite 든 똑같이 동작하고, 끝나면 signOut 후
    //   /login 으로 보낸다, 초대 메일 문구("비밀번호를 설정하고 로그인해 주세요")와도
    //   맞는다. 로그인 후 /admin 으로 들어가면 된다.
    //
    // ⚠️ 이 주소는 Supabase 의 **Redirect URLs 허용 목록**에 있어야 한다. 없으면
    //   에러 없이 조용히 Site URL 로 떨어진다(루트에 #access_token 만 붙은 화면).
    const siteUrl = getEnv("PUBLIC_SITE_URL") || "http://localhost:5173";
    const redirectTo = `${siteUrl.replace(/\/+$/, "")}/login/reset-password`;

    // 이미 가입돼 있으면 초대가 422 로 떨어진다, 그건 오류가 아니라 "재발송"
    // 또는 "기존 회원을 관리자로 올리기" 경로다. 먼저 기존 사용자를 찾아본다.
    // 계정은 auth.users 의 확인된 이메일로만 찾는다. profiles.email 은 회원이 고칠 수 있던
    // 복사본이라, 그걸로 고르면 남의 주소를 적어 둔 계정이 관리자가 될 수 있다.
    const { data: authUserId, error: authLookupError } =
      await supabaseAdmin.rpc("fn_auth_user_id_by_email", { p_email: email });
    if (authLookupError) throw new Error("invite auth user lookup failed");
    const { data: authUser, error: authUserError } =
      typeof authUserId === "string"
        ? await supabaseAdmin.auth.admin.getUserById(authUserId)
        : { data: null, error: null };
    if (authUserError) throw new Error("invite auth user read failed");
    const confirmedId = authUser?.user?.email_confirmed_at
      ? authUser.user.id
      : null;
    const { data: existingProfile } = confirmedId
      ? await supabaseAdmin
          .from("profiles")
          .select("id, member_type, name")
          .eq("id", confirmedId)
          .maybeSingle()
      : { data: null };

    let profileId = existingProfile?.id as string | undefined;
    let resent = false;
    // 실제로 메일이 나갔는지. Supabase 가 메일을 보내주는 경로는
    // inviteUserByEmail(신규 계정) 하나뿐이다, 아래 ⚠️ 참고.
    let emailed = false;

    if (profileId) {
      const { data: member } = await supabaseAdmin
        .from("admin_members")
        .select("status")
        .eq("profile_id", profileId)
        .maybeSingle();

      if (member?.status === "active") {
        throw new ProblemError(
          409,
          "이미 활성 상태인 관리자입니다.",
          INVITE_MEMBER_ERROR.ALREADY_ACTIVE_ADMIN,
        );
      }

      // ⚠️ 서비스 이용자(학생, 학부모, 멘토)를 관리자로 올리는 건 되돌리기 어려운
      //   결정이라 한 번 되묻는다. 그냥 통과시키면 오타 하나로 고객 계정이
      //   관리자가 되고, 그 계정은 전 회원 정보를 볼 수 있게 된다.
      //   member_type 이 비어 있는 계정(초대만 받고 서비스는 안 쓰는 계정)은
      //   이 확인 없이 진행한다.
      if (existingProfile?.member_type && confirmExisting !== true) {
        throw new ProblemError(
          409,
          `이 이메일은 이미 서비스 회원(${existingProfile.member_type})으로 가입돼 있습니다. 그 계정을 관리자로 올리시겠습니까?`,
          INVITE_MEMBER_ERROR.NEEDS_CONFIRM,
          {
            existingMemberType: existingProfile.member_type,
            existingName: existingProfile.name ?? null,
          } satisfies NeedsConfirmExtra,
        );
      }

      resent = Boolean(member);
    } else {
      const { data: invited, error: inviteError } =
        await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
          redirectTo,
          // auth 메타데이터에도 남긴다, dev와 로컬의 handle_new_user 트리거가
          // profiles 를 먼저 만들 때 참고할 수 있고, Supabase 대시보드의 사용자
          // 목록에서도 누구인지 보인다.
          data: { name, full_name: name },
        });

      if (inviteError || !invited?.user?.id) {
        console.error("admin/invite-member 초대 실패:", inviteError);
        throw new ProblemError(
          500,
          "초대 메일 발송에 실패했습니다. 잠시 후 다시 시도해 주세요.",
          undefined,
        );
      }

      profileId = invited.user.id;
      emailed = true;
    }

    // prod 에는 auth 에서 profiles 로 가는 트리거가 없다(파일 상단 ⚠️ 참고). 그래서 **새로
    // 만든 계정에 한해** profiles 행을 직접 만든다. 기존 회원은 건드리지 않는다.
    // 여기서 upsert 하면 그 사람의 이름과 회원유형이 걸린 행에 role 을 덮어쓰게 된다.
    const { error: profileError } = existingProfile
      ? { error: null }
      : await supabaseAdmin
          .from("profiles")
          // ⚠️ insert 가 아니라 upsert 다, **dev와 로컬에는 auth 에서 profiles 로 가는 트리거가
          //   있다**(`on_auth_user_created` 가 `handle_new_user` 를 부름, 의도된 드리프트).
          //   그쪽에서는 inviteUserByEmail 이 계정을 만드는 순간 트리거가 profiles
          //   행을 먼저 넣어버려서, 뒤이은 insert 가 기본키 중복으로 죽는다.
          //   2026-08-23 에 실제로 이것 때문에 초대가 "프로필 설정에 실패했습니다"로
          //   끝났다, 메일은 이미 나간 뒤라, 관리자가 다시 누르면 이번엔 그 행이
          //   있으니 "기존 계정" 경로로 빠져 "메일이 나가지 않습니다"가 떴다.
          //
          //   onConflict 를 id 로 두는 게 안전한 이유: 이 분기는 existingProfile 이
          //   없을 때만 탄다. 즉 충돌할 수 있는 행은 방금 이 초대로 만들어진
          //   auth 계정의 행 하나뿐이고, 남의 이름과 회원유형을 덮을 일이 없다.
          .upsert(
            { id: profileId, email, name, role: "user" },
            { onConflict: "id" },
          );

    if (profileError) {
      console.error("admin/invite-member profiles upsert 실패:", profileError);
      throw new ProblemError(
        500,
        "프로필 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.",
        undefined,
      );
    }

    // 이미 있는 행이면 권한 묶음과 부서만 갱신하고 status 는 invited 로 되돌린다
    // (재발송 = 아직 활성화하지 않았다는 뜻이므로).
    const { error: memberError } = await supabaseAdmin
      .from("admin_members")
      .upsert(
        {
          profile_id: profileId,
          role_id: roleId,
          department,
          status: "invited",
          invited_by: invitedBy,
          invited_at: new Date().toISOString(),
        },
        { onConflict: "profile_id" },
      );

    if (memberError) {
      console.error(
        "admin/invite-member admin_members upsert 실패:",
        memberError,
      );
      throw new ProblemError(
        500,
        "관리자 등록에 실패했습니다. 잠시 후 다시 시도해 주세요.",
        undefined,
      );
    }

    // ⚠️ 기존 계정을 관리자로 올리는 경로에는 **메일을 보내지 않는다.**
    //   예전에는 여기서 auth.admin.generateLink({ type: 'magiclink' }) 를 불렀는데
    //   두 가지 이유로 아무 일도 하지 않는 코드였다:
    //     1. generateLink 는 링크를 **만들어 돌려주기만** 한다(커스텀 메일 발송기용
    //        API). 메일을 보내지 않는데 반환된 action_link 를 쓰지도 않았다.
    //     2. 설령 보내졌더라도 이 프로젝트의 Magic Link 템플릿은 `{{ .Token }}`
    //        (숫자 OTP)이고(Supabase 대시보드에서 그렇게 설정돼 있다), /admin 에는 그 번호를
    //        넣을 화면이 없다.
    //   그래서 "보낸 척"을 지우고 emailed=false 로 사실대로 돌려준다. 이미 비밀번호가
    //   있는 계정이라 링크 인증이 필요 없고, 필요한 건 "관리자로 등록됐다"는 통지뿐이다
    //   그건 호출부가 화면에서 안내한다(AdminMembersAdmin.sendInvite).
    //
    //   메일로 보내려면 발송기가 따로 있어야 한다(Supabase SMTP 는 Auth 템플릿
    //   경로로만 나간다). Resend API 를 붙이는 건 별건으로 남긴다.

    return c.json({ profileId, resent, emailed } satisfies InviteResult);
  })
  .all("/", methodNotAllowed("POST"));
