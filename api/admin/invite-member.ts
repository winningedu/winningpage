// POST /api/admin/invite-member
// Authorization: Bearer <supabase access token>   (최고 관리자 전용)
//
// 관리자 초대 — 기획 문서 「관리자 권한 체계 안내」의 "새 관리자 등록 절차".
//   최고 관리자가 이메일로 초대하고, 그 자리에서 받을 권한 묶음도 함께 정한다.
//   받은 사람이 링크를 눌러 비밀번호를 설정하면 계정이 활성화된다.
//
// 왜 서버 라우트인가
//   Supabase Auth 의 초대(auth.admin.inviteUserByEmail)는 service_role 로만
//   호출된다 — 브라우저에서 못 한다. 그리고 service_role 은 RLS 를 통째로
//   우회하므로, "누가 초대할 수 있는가"는 이 라우트가 직접 검사해야 한다
//   (api/_lib/supabaseAdmin.ts 상단 주석).
//
// 왜 resolveAdmin() 이 아니라 최고 관리자 판정인가
//   resolveAdmin 은 profiles.role='admin' 을 미러한다. 관리자 등록·권한 조정은
//   기획 문서상 최고 관리자 전용이라 판정 축이 다르다 — admin_members 에
//   is_super 묶음을 활성 상태로 갖고 있는지로 본다(fn_is_super_admin 과 같은 술어).
//
// ⚠️ profiles 행을 이 라우트가 직접 넣는다
//   dev·로컬에는 auth.users → profiles 자동 생성 트리거가 있지만 **prod 에는
//   의도적으로 없다**(supabase/README.md). 트리거에 기대면 prod 에서만 profiles
//   가 비어 직원 목록에 이름이 안 뜬다. 그래서 여기서 명시적으로 upsert 한다.
//
// 응답 규격
//   200 { ok: true, profileId, resent, emailed }
//         emailed=true  신규 계정을 만들고 초대 메일을 보냈다.
//         emailed=false 이미 있는 계정을 관리자로 올렸다 — 메일은 가지 않는다.
//                       호출부가 "직접 알려주세요"를 안내해야 한다(아래 ⚠️ 참고).
//   400 { detail }                        email/name/roleId 누락·형식 오류.
//   401 { detail }                        토큰 없음/무효.
//   403 { detail }                        최고 관리자 아님.
//   409 { detail }                        이미 활성 관리자다.
//   405 { detail }                        POST 아님.
//   500 { detail }                        Auth 초대 실패, 서버 설정 누락 등.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { VercelRequest } from "@vercel/node";
import { getBearerToken } from "../_lib/adminAuth.js";
import { defineHandler } from "../_lib/handler.js";
import { sendError } from "../_lib/httpResponse.js";
import { assertQaAdminMayWrite } from "../_lib/qaAccount.js";
import { getEnv } from "../_lib/supabaseAdmin.js";

export const config = { runtime: "nodejs" };

type SuperAdminResult =
  | { ok: true; userId: string }
  | { ok: false; status: number; detail: string };

// ⚠ auth:"admin"(공통 계층의 resolveAdmin, is_admin() 미러)을 쓰지 않는다.
//   이 라우트는 애초에 resolveAdmin을 호출한 적이 없다 — 위 "왜 resolveAdmin()
//   이 아니라 최고 관리자 판정인가" 절이 설명하듯 판정 축 자체가 다르다
//   (admin_members.is_super, uid∨email이 아니라 uid 단일 + role='admin' 단일도
//   아닌 별도 술어). defineHandler의 auth:"admin" 게이트를 추가로 얹으면
//   최고 관리자가 아닌 일반 사용자의 403 문구가 "관리자 권한이 필요합니다."로
//   바뀌어(원래는 "최고 관리자만 초대할 수 있습니다.") 동작 보존 철칙을
//   깬다 — api/docs/refactor-plan.md 대조표는 이 파일을 auth:admin(3)에
//   넣었지만 실제 코드 기준으로 auth:"none" + 로컬 resolveSuperAdmin 유지가
//   맞다(api/docs/batch-5-issues.md 기록, nice-identity-start와 같은 패턴).
/**
 * Bearer 토큰 → 최고 관리자 판정. SQL fn_is_super_admin() 과 같은 술어다
 * (admin_members 활성 행 + 그 role 이 is_super).
 */
async function resolveSuperAdmin(
  supabaseAdmin: SupabaseClient,
  req: VercelRequest,
): Promise<SuperAdminResult> {
  const token = getBearerToken(req);
  if (!token) {
    return { ok: false, status: 401, detail: "로그인이 필요합니다." };
  }

  const { data: userData, error: userError } =
    await supabaseAdmin.auth.getUser(token);
  if (userError || !userData?.user?.id) {
    return { ok: false, status: 401, detail: "로그인이 필요합니다." };
  }

  const userId = userData.user.id;

  const { data, error } = await supabaseAdmin
    .from("admin_members")
    .select("profile_id, status, admin_roles!inner(is_super)")
    .eq("profile_id", userId)
    .eq("status", "active")
    .maybeSingle();

  // 조회 실패를 "권한 없음"으로 뭉개면 원인이 안 보인다(adminAuth.ts 와 같은 원칙).
  if (error) {
    console.error("admin/invite-member 권한 조회 실패:", error);
    return { ok: false, status: 500, detail: "권한 확인에 실패했습니다." };
  }

  const roles = data?.admin_roles as unknown;
  const isSuper = Array.isArray(roles)
    ? roles.some((row) => (row as { is_super?: boolean })?.is_super)
    : Boolean((roles as { is_super?: boolean } | null)?.is_super);

  if (!data || !isSuper) {
    return {
      ok: false,
      status: 403,
      detail: "최고 관리자만 초대할 수 있습니다.",
    };
  }

  return { ok: true, userId };
}

export default defineHandler({
  methods: ["POST"],
  auth: "none",
  errorShape: "detail",
  // createSupabaseAdmin() 설정 오류(500)는 defineHandler(api/_lib/handler.ts)
  // 최상위 catch가 식별해 "서버 설정이 올바르지 않습니다."로 복원한다 — 아래
  // unhandledMessage로 뭉개지던 문제는 batch-8에서 해소됐다.
  unhandledMessage: "관리자 초대 처리 중 오류가 발생했습니다.",
  logLabel: "admin/invite-member",
  handler: async (req, res, ctx) => {
    const supabaseAdmin = ctx.supabaseAdmin;

    const auth = await resolveSuperAdmin(supabaseAdmin, req);
    if (!auth.ok) {
      return void sendError(res, "detail", auth.status, auth.detail);
    }

    await assertQaAdminMayWrite(supabaseAdmin, auth.userId);

    const body = (req.body || {}) as {
      email?: string;
      name?: string;
      roleId?: string;
      department?: string;
      // 기존 서비스 회원을 관리자로 올릴 때 화면이 되묻고 다시 보내는 확인 플래그.
      confirmExisting?: boolean;
    };
    const email = String(body.email || "")
      .trim()
      .toLowerCase();
    const name = String(body.name || "").trim();
    const roleId = String(body.roleId || "").trim();
    const department = String(body.department || "").trim() || null;

    if (!email?.includes("@")) {
      return void sendError(res, "detail", 400, "이메일을 확인해 주세요.");
    }
    // ⚠️ 이름은 필수다. 초대로 만든 계정은 profiles.name 이 비는데, 그러면
    //   ① 직원 목록의 「직원명」이 '-' 로 남고
    //   ② 헤더가 로그인 상태를 이름 유무로 판정해서(Header.tsx) 그 사람에게는
    //      이름 칩·마이 메뉴·「관리자」 버튼이 통째로 사라진다 — 로그인은 됐는데
    //      화면만 비로그인처럼 보인다(2026-08-23 실측).
    //   헤더 쪽 판정은 다른 담당 영역이라, 이름을 처음부터 채워 원인을 없앤다.
    if (!name) {
      return void sendError(res, "detail", 400, "이름을 입력해 주세요.");
    }
    if (!roleId) {
      return void sendError(res, "detail", 400, "권한 묶음을 선택해 주세요.");
    }

    // 초대 링크가 돌아올 주소. 로컬은 5173(vite), 운영은 PUBLIC_SITE_URL.
    //
    // ⚠️ /admin 이 아니라 /login/reset-password 로 보낸다.
    //   초대받은 사람은 **비밀번호가 없는 계정**이다. 예전에는 /admin 으로 보냈는데,
    //   거기엔 비밀번호를 정하는 화면이 없어서 링크를 눌러도 세션만 생기고 아무것도
    //   할 수 없었다(2026-08-23 실측 — 해시만 붙은 빈 화면).
    //   ResetPassword.tsx 는 getSession() 으로 **아무 세션이나** 잡아 비밀번호를
    //   설정하므로 recovery 든 invite 든 똑같이 동작하고, 끝나면 signOut 후
    //   /login 으로 보낸다 — 초대 메일 문구("비밀번호를 설정하고 로그인해 주세요")와도
    //   맞는다. 로그인 후 /admin 으로 들어가면 된다.
    //
    // ⚠️ 이 주소는 Supabase 의 **Redirect URLs 허용 목록**에 있어야 한다. 없으면
    //   에러 없이 조용히 Site URL 로 떨어진다(루트에 #access_token 만 붙은 화면).
    const siteUrl = getEnv("PUBLIC_SITE_URL") || "http://localhost:5173";
    const redirectTo = `${siteUrl.replace(/\/+$/, "")}/login/reset-password`;

    // 이미 가입돼 있으면 초대가 422 로 떨어진다 — 그건 오류가 아니라 "재발송"
    // 또는 "기존 회원을 관리자로 올리기" 경로다. 먼저 기존 사용자를 찾아본다.
    const { data: existingProfile } = await supabaseAdmin
      .from("profiles")
      .select("id, member_type, name")
      .eq("email", email)
      .maybeSingle();

    let profileId = existingProfile?.id as string | undefined;
    let resent = false;
    // 실제로 메일이 나갔는지. Supabase 가 메일을 보내주는 경로는
    // inviteUserByEmail(신규 계정) 하나뿐이다 — 아래 ⚠️ 참고.
    let emailed = false;

    if (profileId) {
      const { data: member } = await supabaseAdmin
        .from("admin_members")
        .select("status")
        .eq("profile_id", profileId)
        .maybeSingle();

      if (member?.status === "active") {
        return void sendError(
          res,
          "detail",
          409,
          "이미 활성 상태인 관리자입니다.",
        );
      }

      // ⚠️ 서비스 이용자(학생·학부모·멘토)를 관리자로 올리는 건 되돌리기 어려운
      //   결정이라 한 번 되묻는다. 그냥 통과시키면 오타 하나로 고객 계정이
      //   관리자가 되고, 그 계정은 전 회원 정보를 볼 수 있게 된다.
      //   member_type 이 비어 있는 계정(초대만 받고 서비스는 안 쓰는 계정)은
      //   이 확인 없이 진행한다.
      if (existingProfile?.member_type && body.confirmExisting !== true) {
        return void sendError(
          res,
          "detail",
          409,
          `이 이메일은 이미 서비스 회원(${existingProfile.member_type})으로 가입돼 있습니다. 그 계정을 관리자로 올리시겠습니까?`,
          undefined,
          {
            needsConfirm: true,
            existingMemberType: existingProfile.member_type,
            existingName: existingProfile.name ?? null,
          },
        );
      }

      resent = Boolean(member);
    } else {
      const { data: invited, error: inviteError } =
        await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
          redirectTo,
          // auth 메타데이터에도 남긴다 — dev·로컬의 handle_new_user 트리거가
          // profiles 를 먼저 만들 때 참고할 수 있고, Supabase 대시보드의 사용자
          // 목록에서도 누구인지 보인다.
          data: { name, full_name: name },
        });

      if (inviteError || !invited?.user?.id) {
        console.error("admin/invite-member 초대 실패:", inviteError);
        return void sendError(
          res,
          "detail",
          500,
          `초대 메일 발송에 실패했습니다: ${inviteError?.message || "알 수 없는 오류"}`,
        );
      }

      profileId = invited.user.id;
      emailed = true;
    }

    // prod 에는 auth → profiles 트리거가 없다(파일 상단 ⚠️ 참고). 그래서 **새로
    // 만든 계정에 한해** profiles 행을 직접 만든다. 기존 회원은 건드리지 않는다 —
    // 여기서 upsert 하면 그 사람의 이름·회원유형이 걸린 행에 role 을 덮어쓰게 된다.
    const { error: profileError } = existingProfile
      ? { error: null }
      : await supabaseAdmin
          .from("profiles")
          // ⚠️ insert 가 아니라 upsert 다 — **dev·로컬에는 auth → profiles 트리거가
          //   있다**(`on_auth_user_created` → `handle_new_user`, 의도된 드리프트).
          //   그쪽에서는 inviteUserByEmail 이 계정을 만드는 순간 트리거가 profiles
          //   행을 먼저 넣어버려서, 뒤이은 insert 가 기본키 중복으로 죽는다.
          //   2026-08-23 에 실제로 이것 때문에 초대가 "프로필 설정에 실패했습니다"로
          //   끝났다 — 메일은 이미 나간 뒤라, 관리자가 다시 누르면 이번엔 그 행이
          //   있으니 "기존 계정" 경로로 빠져 "메일이 나가지 않습니다"가 떴다.
          //
          //   onConflict 를 id 로 두는 게 안전한 이유: 이 분기는 existingProfile 이
          //   없을 때만 탄다. 즉 충돌할 수 있는 행은 방금 이 초대로 만들어진
          //   auth 계정의 행 하나뿐이고, 남의 이름·회원유형을 덮을 일이 없다.
          .upsert(
            { id: profileId, email, name, role: "user" },
            { onConflict: "id" },
          );

    if (profileError) {
      console.error("admin/invite-member profiles upsert 실패:", profileError);
      return void sendError(
        res,
        "detail",
        500,
        `프로필 생성에 실패했습니다: ${profileError.message}`,
      );
    }

    // 이미 있는 행이면 권한 묶음·부서만 갱신하고 status 는 invited 로 되돌린다
    // (재발송 = 아직 활성화하지 않았다는 뜻이므로).
    const { error: memberError } = await supabaseAdmin
      .from("admin_members")
      .upsert(
        {
          profile_id: profileId,
          role_id: roleId,
          department,
          status: "invited",
          invited_by: auth.userId,
          invited_at: new Date().toISOString(),
        },
        { onConflict: "profile_id" },
      );

    if (memberError) {
      console.error(
        "admin/invite-member admin_members upsert 실패:",
        memberError,
      );
      return void sendError(
        res,
        "detail",
        500,
        `관리자 등록에 실패했습니다: ${memberError.message}`,
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
    //   — 그건 호출부가 화면에서 안내한다(AdminMembersAdmin.sendInvite).
    //
    //   메일로 보내려면 발송기가 따로 있어야 한다(Supabase SMTP 는 Auth 템플릿
    //   경로로만 나간다). Resend API 를 붙이는 건 별건으로 남긴다.

    return void res.status(200).json({ ok: true, profileId, resent, emailed });
  },
});
