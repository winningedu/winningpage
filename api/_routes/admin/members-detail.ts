// /api/admin/members 아래 회원 상세 라우트. 관리자 앱(api/_routes/admin/app.ts)이 .route("/members", membersDetail) 로 붙인다.
// 루트 경로(GET /)는 members.ts 가 받고 여기는 /:id 와 그 아래만 맡는다. 요청 검증과 응답 모양은 shared/members/detail.ts 를 따른다.
//
// GET, PATCH /:id: 회원 한 명(profiles 전체 열 + 소속 이름)을 읽고, 회원 구분과 보호자 연락처만 고친다.
//   예전에는 브라우저가 profiles 를 직접 읽고 고쳤고(profiles_admin_update_all), 화면이 쓰는 열은 이 둘뿐이었다.
//   서비스 롤은 RLS 를 우회하므로 쓰는 열을 여기서 둘로 못 박고, 다른 키는 400 으로 막는다(role 등 권한 열 보호).
//   소속(tenant_id)은 fn_admin_set_profile_tenant 전용이라 /:id/tenant 로 간다.
// PUT /:id/tenant: 소속 배정과 해제. profiles.tenant_id 는 트리거(WC070)가 직접 UPDATE 를 막아 fn_admin_set_profile_tenant 로만 바꾼다.
//   그 함수가 auth.uid() 로 members 수정 권한(WC072)을 보고 변경자를 남기므로, 서비스 롤이 아니라 관리자 본인 토큰 클라이언트로 부른다.
//   스쿨멘토의 학생은 소속만 비우면 학적이 옛 기관에 남아 막는다(「기타」로 옮기게 한다). 위닝은 소속 없음이 개인 회원이다.
// GET /:id/messages: 회원에게 간 알림톡과 문자 이력(최근 100건). 크론과 수동 발송이 같은 표(alimtalk_send_logs)에 남는다.
// GET /:id/orders: 회원이 학생으로 또는 학부모로 걸린 주문. user_id 는 결제한 학부모라 학생 상세가 비므로 두 축을 OR 로 건다.
//   id 는 .or() 필터 문자열에 들어가므로 uuid 검증을 통과한 값만 쓴다.
// GET /:id/services: 회원의 이용권(program_access, id 가 회원 id 다). 상세 화면의 이용서비스 표가 쓴다.
// GET /:id/links: 회원에게 묶인 학부모, 학생(대기, 승인)과 상대 프로필. 학부모면 parent_id 쪽, 아니면 student_id 쪽을 본다.
//   상대 프로필은 한 번에 읽어 id 로 맞춘다(없으면 null).
// 권한: 메뉴 members. GET 은 view, 쓰기는 edit.

import { PROBLEM_CODE } from "../../../shared/http/codes.js";
import {
  MEMBER_ERROR,
  MEMBER_MESSAGES_LIMIT,
  type MemberLinks,
  type MemberMessages,
  type MemberOrders,
  type MemberServices,
  memberIdParams,
  memberPatchBody,
  memberTenantBody,
} from "../../../shared/members/detail.js";
import { SITES } from "../../../src/config/sites.js";
import { admin, userClient } from "../../_lib/hono/admin.js";
import { adminFactory } from "../../_lib/hono/factory.js";
import { methodNotAllowed, ProblemError } from "../../_lib/hono/problem.js";
import { validate } from "../../_lib/hono/validate.js";
import {
  canViewTenantNames,
  findMemberStub,
  memberNotFound,
  withTenantName,
} from "../../_lib/members/member.js";
import { getSiteKey } from "../../_lib/site.js";

// 다듬은 뒤 빈 문자열은 null 이다(화면이 비운 칸을 지운다는 뜻).
const cleaned = (value: string | null): string | null =>
  value?.trim() ? value.trim() : null;

const detailGuard = admin({
  permission: { key: "members" },
  unhandledMessage: "회원 정보를 처리하지 못했습니다.",
  logLabel: "[admin/members/id]",
});
const tenantGuard = admin({
  permission: { key: "members" },
  unhandledMessage: "소속을 바꾸지 못했습니다.",
  logLabel: "[admin/members/id/tenant]",
});
const messagesGuard = admin({
  permission: { key: "members" },
  unhandledMessage: "발송 이력을 불러오지 못했습니다.",
  logLabel: "[admin/members/id/messages]",
});
const ordersGuard = admin({
  permission: { key: "members" },
  unhandledMessage: "주문을 불러오지 못했습니다.",
  logLabel: "[admin/members/id/orders]",
});
const servicesGuard = admin({
  permission: { key: "members" },
  unhandledMessage: "이용권을 불러오지 못했습니다.",
  logLabel: "[admin/members/id/services]",
});
const linksGuard = admin({
  permission: { key: "members" },
  unhandledMessage: "연결 관계를 불러오지 못했습니다.",
  logLabel: "[admin/members/id/links]",
});

export const membersDetail = adminFactory
  .createApp()
  .get("/:id", detailGuard, validate("param", memberIdParams), async (c) => {
    const db = c.var.supabaseAdmin;
    const { id } = c.req.valid("param");
    const canViewTenants = await canViewTenantNames(db, c.var.userId as string);

    const { data, error } = await db
      .from("profiles")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error("profile read failed");
    if (!data) throw memberNotFound();
    return c.json(await withTenantName(db, data, canViewTenants));
  })
  .patch(
    "/:id",
    detailGuard,
    validate("param", memberIdParams),
    validate("json", memberPatchBody),
    async (c) => {
      const db = c.var.supabaseAdmin;
      const { id } = c.req.valid("param");
      const canViewTenants = await canViewTenantNames(
        db,
        c.var.userId as string,
      );
      const body = c.req.valid("json");
      const values: Record<string, string | null> = {};
      if (body.member_category !== undefined) {
        values.member_category = cleaned(body.member_category);
      }
      if (body.guardian_phone !== undefined) {
        values.guardian_phone = cleaned(body.guardian_phone);
      }

      const { data, error } = await db
        .from("profiles")
        .update(values)
        .eq("id", id)
        .select("*")
        .maybeSingle();
      if (error) throw new Error("profile update failed");
      if (!data) throw memberNotFound();
      return c.json(await withTenantName(db, data, canViewTenants));
    },
  )
  .all("/:id", methodNotAllowed("GET", "PATCH"))
  .put(
    "/:id/tenant",
    tenantGuard,
    validate("param", memberIdParams),
    validate("json", memberTenantBody),
    async (c) => {
      const db = c.var.supabaseAdmin;
      const { id } = c.req.valid("param");
      const { tenantId } = c.req.valid("json");
      const member = await findMemberStub(db, id);
      // 쓰기 전에 조회해 둔다(쓴 뒤에 권한 조회가 실패해 500 이 되지 않게).
      const canViewTenants = await canViewTenantNames(
        db,
        c.var.userId as string,
      );

      const siteKey = getSiteKey();
      if (
        SITES[siteKey].features.studentEnrollment &&
        siteKey === "schoolmentor" &&
        member.member_type === "student" &&
        tenantId === null
      ) {
        throw new ProblemError(
          400,
          "학생은 소속 없음으로 바꿀 수 없어요. 「기타」로 옮겨 주세요.",
          MEMBER_ERROR.STUDENT_TENANT_REQUIRED,
        );
      }

      const { error } = await userClient(c).rpc("fn_admin_set_profile_tenant", {
        p_profile_id: id,
        // 생성 타입이 인자를 string 으로 좁혀 두었지만 실제 시그니처는 nullable uuid 다(null 은 해제).
        p_tenant_id: tenantId as string,
      });
      if (error) {
        if (error.code === "23505") {
          throw new ProblemError(
            409,
            "이 기관에 같은 휴대폰 번호의 회원이 이미 있어요. 확인 후 다시 옮겨 주세요.",
            MEMBER_ERROR.PHONE_TAKEN,
          );
        }
        if (error.code === "WC100") {
          throw new ProblemError(
            409,
            "이 학생은 올해 학적이 다른 기관에 있어요. 학생 기관 이동 화면에서 옮겨 주세요.",
            MEMBER_ERROR.OTHER_TENANT_ENROLLMENT,
          );
        }
        if (error.code === "WC072") {
          throw new ProblemError(
            403,
            "회원 관리 수정 권한이 없습니다.",
            PROBLEM_CODE.FORBIDDEN,
          );
        }
        if (error.message === "tenant_not_found") {
          throw new ProblemError(
            404,
            "기관을 찾을 수 없어요.",
            MEMBER_ERROR.TENANT_NOT_FOUND,
          );
        }
        throw new Error("set profile tenant failed");
      }

      const { data, error: readError } = await db
        .from("profiles")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (readError || !data) throw new Error("profile re-read failed");
      return c.json(await withTenantName(db, data, canViewTenants));
    },
  )
  .all("/:id/tenant", methodNotAllowed("PUT"))
  .get(
    "/:id/messages",
    messagesGuard,
    validate("param", memberIdParams),
    async (c) => {
      const db = c.var.supabaseAdmin;
      const { id } = c.req.valid("param");
      await findMemberStub(db, id);

      const { data, error } = await db
        .from("alimtalk_send_logs")
        .select(
          "id, template_key, channel, subject, message, status, provider_message, sent_at",
        )
        .eq("profile_id", id)
        .order("sent_at", { ascending: false })
        .limit(MEMBER_MESSAGES_LIMIT);
      if (error) throw new Error("alimtalk_send_logs read failed");
      return c.json({ items: data ?? [] } satisfies MemberMessages);
    },
  )
  .all("/:id/messages", methodNotAllowed("GET"))
  .get(
    "/:id/orders",
    ordersGuard,
    validate("param", memberIdParams),
    async (c) => {
      const db = c.var.supabaseAdmin;
      const { id } = c.req.valid("param");
      await findMemberStub(db, id);

      const { data, error } = await db
        .from("orders")
        .select(
          "id, status, order_name, amount, list_amount, discount_amount, method, paid_at, created_at, student_profile_id, parent_profile_id",
        )
        .or(`student_profile_id.eq.${id},parent_profile_id.eq.${id}`)
        .order("created_at", { ascending: false });
      if (error) throw new Error("orders read failed");
      return c.json({ items: data ?? [] } satisfies MemberOrders);
    },
  )
  .all("/:id/orders", methodNotAllowed("GET"))
  .get(
    "/:id/services",
    servicesGuard,
    validate("param", memberIdParams),
    async (c) => {
      const db = c.var.supabaseAdmin;
      const { id } = c.req.valid("param");
      await findMemberStub(db, id);

      const { data, error } = await db
        .from("program_access")
        .select(
          "id, program_key, payment_status, access_status, paid_amount, starts_at, expires_at, access_started_at, access_expires_at",
        )
        .eq("id", id);
      if (error) throw new Error("program_access read failed");
      return c.json({ items: data ?? [] } satisfies MemberServices);
    },
  )
  .all("/:id/services", methodNotAllowed("GET"))
  .get(
    "/:id/links",
    linksGuard,
    validate("param", memberIdParams),
    async (c) => {
      const db = c.var.supabaseAdmin;
      const { id } = c.req.valid("param");
      const member = await findMemberStub(db, id);

      // 저장된 member_type 원본 기준이다(화면의 분류 보정은 쓰지 않는다).
      const isParent = member.member_type === "parent";
      const { data: links, error } = await db
        .from("parent_child_links")
        .select("id, parent_id, student_id, status")
        .eq(isParent ? "parent_id" : "student_id", id)
        .in("status", ["pending", "approved"]);
      if (error) throw new Error("parent_child_links read failed");

      const counterpartOf = (link: {
        parent_id: string;
        student_id: string;
      }) => (isParent ? link.student_id : link.parent_id);
      const counterpartIds = (links ?? []).map(counterpartOf);

      type Counterpart = NonNullable<MemberLinks["items"][number]["profile"]>;
      const profiles = new Map<string, Counterpart>();
      if (counterpartIds.length > 0) {
        const { data, error: profileError } = await db
          .from("profiles")
          .select("id, name, email, phone")
          .in("id", counterpartIds);
        if (profileError) throw new Error("counterpart profiles read failed");
        for (const row of data ?? []) profiles.set(row.id, row);
      }

      return c.json({
        items: (links ?? []).map((link) => ({
          linkId: link.id,
          status: link.status,
          profile: profiles.get(counterpartOf(link)) ?? null,
        })),
      } satisfies MemberLinks);
    },
  )
  .all("/:id/links", methodNotAllowed("GET"));
