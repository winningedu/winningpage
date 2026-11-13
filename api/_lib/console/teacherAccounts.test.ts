// 교사 계정 발급 도우미 계약 검증(임시 비밀번호, scrypt 해시, Auth 사용자 생성).

import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, test, vi } from "vitest";
import {
  ensureAuthUser,
  generateTempPassword,
  hashTempPassword,
  issueTeacherAccount,
  parseClassRows,
  verifyTempPassword,
} from "./teacherAccounts.js";

describe("parseClassRows", () => {
  test("a null grade is a mixed-grade class and keeps the name and group", () => {
    expect(
      parseClassRows([{ grade: null, name: "A", groupId: "g-1" }]),
    ).toEqual([{ grade: null, name: "A", group_id: "g-1" }]);
  });

  test("a missing grade, a blank grade or a blank name is still rejected", () => {
    expect(parseClassRows([{ name: "A" }])).toBeNull();
    expect(parseClassRows([{ grade: "", name: "A" }])).toBeNull();
    expect(parseClassRows([{ grade: null, name: " " }])).toBeNull();
    expect(parseClassRows([{ grade: 3, name: "A" }])).toBeNull();
  });

  test("a graded row is unchanged", () => {
    expect(parseClassRows([{ grade: "고1", name: "3반" }])).toEqual([
      { grade: "고1", name: "3반" },
    ]);
  });
});

describe("generateTempPassword", () => {
  test("10자이고 영문자, 숫자, 기호를 모두 포함한다", () => {
    for (let i = 0; i < 200; i++) {
      const password = generateTempPassword();
      expect(password).toHaveLength(10);
      expect(password).toMatch(/[A-Za-z]/);
      expect(password).toMatch(/[0-9]/);
      expect(password).toMatch(/[^A-Za-z0-9]/);
    }
  });
});

describe("hashTempPassword", () => {
  test("평문을 담지 않은 salted scrypt 해시이고 같은 비밀번호도 매번 다르다", async () => {
    const first = await hashTempPassword("Abc12345!x");
    const second = await hashTempPassword("Abc12345!x");

    expect(first).toMatch(/^scrypt\$/);
    expect(first).not.toContain("Abc12345!x");
    expect(first).not.toBe(second);
  });

  test("verifyTempPassword 는 같은 비밀번호만 맞다고 한다", async () => {
    const stored = await hashTempPassword("Abc12345!x");

    expect(await verifyTempPassword("Abc12345!x", stored)).toBe(true);
    expect(await verifyTempPassword("Abc12345!y", stored)).toBe(false);
    expect(await verifyTempPassword("Abc12345!x", "garbage")).toBe(false);
  });
});

function fakeAuthAdmin(opts: {
  createResult: { data: unknown; error: unknown };
  existingUserId?: string | null;
}) {
  const createUser = vi.fn().mockResolvedValue(opts.createResult);
  const listUsers = vi.fn();
  const updateUserById = vi.fn().mockResolvedValue({ data: {}, error: null });
  const rpc = vi
    .fn()
    .mockResolvedValue({ data: opts.existingUserId ?? null, error: null });
  return {
    createUser,
    listUsers,
    updateUserById,
    rpc,
    admin: {
      rpc,
      auth: { admin: { createUser, listUsers, updateUserById } },
    } as unknown as SupabaseClient,
  };
}

describe("ensureAuthUser", () => {
  test("합성 이메일(소문자)과 임시 비밀번호로 확인된 사용자를 만들고 id 를 돌려준다", async () => {
    const { admin, createUser } = fakeAuthAdmin({
      createResult: { data: { user: { id: "user-1" } }, error: null },
    });

    const id = await ensureAuthUser(admin, "ABCD2345XY7Z9K", "Pw1!abcdef");

    expect(id).toBe("user-1");
    expect(createUser).toHaveBeenCalledWith({
      email: "abcd2345xy7z9k@teacher.schoolmentor.kr",
      password: "Pw1!abcdef",
      email_confirm: true,
    });
  });

  test("이미 있는 합성 이메일(재시도)이면 그 사용자를 찾아 새 임시 비밀번호로 맞춘다", async () => {
    const { admin, updateUserById, listUsers, rpc } = fakeAuthAdmin({
      createResult: {
        data: { user: null },
        error: { status: 422, code: "email_exists" },
      },
      existingUserId: "user-9",
    });

    const id = await ensureAuthUser(admin, "ABCD2345XY7Z9K", "Pw1!abcdef");

    expect(id).toBe("user-9");
    expect(rpc).toHaveBeenCalledWith("fn_auth_user_id_by_email", {
      p_email: "abcd2345xy7z9k@teacher.schoolmentor.kr",
    });
    expect(listUsers).not.toHaveBeenCalled();
    expect(updateUserById).toHaveBeenCalledWith("user-9", {
      password: "Pw1!abcdef",
    });
  });

  test("그 밖의 생성 실패는 예외로 알린다", async () => {
    const { admin } = fakeAuthAdmin({
      createResult: { data: { user: null }, error: { status: 500 } },
    });

    await expect(
      ensureAuthUser(admin, "ABCD2345XY7Z9K", "Pw1!abcdef"),
    ).rejects.toThrow("teacher auth user create failed");
  });
});

describe("issueTeacherAccount", () => {
  function fakeIssueClient() {
    const rpc = vi.fn(
      async (
        name: string,
      ): Promise<{ data: string | null; error: { code: string } | null }> => ({
        data: name === "fn_teacher_issue_claim" ? claim : null,
        error: null,
      }),
    );
    let claim = "claimed";
    const createUser = vi
      .fn()
      .mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq"]) chain[m] = () => chain;
    chain.maybeSingle = async () => ({
      data: { temp_password_issued_at: "2026-11-05T05:00:00Z" },
      error: null,
    });
    return {
      rpc,
      createUser,
      setClaim: (value: string) => {
        claim = value;
      },
      admin: {
        rpc,
        from: () => chain,
        auth: { admin: { createUser } },
      } as unknown as SupabaseClient,
    };
  }

  test("Auth 사용자를 만든 뒤 scrypt 해시만 attach 에 넘기고 임시 비밀번호를 돌려준다", async () => {
    const { admin, rpc, createUser } = fakeIssueClient();

    const issued = await issueTeacherAccount(
      admin,
      "teacher-1",
      "ABCD2345XY7Z9K",
      "tenant-1",
    );

    const password = createUser.mock.calls[0]?.[0].password as string;
    expect(issued?.tempPassword).toBe(password);
    expect(issued?.profileId).toBe("user-1");
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[0]).toEqual([
      "fn_teacher_issue_claim",
      { p_teacher_id: "teacher-1", p_tenant: "tenant-1" },
    ]);
    const [name, args] = rpc.mock.calls[1] as unknown as [
      string,
      Record<string, string>,
    ];
    expect(name).toBe("fn_teacher_attach_account");
    expect(args).toMatchObject({
      p_teacher_id: "teacher-1",
      p_profile_id: "user-1",
      p_login_id: "ABCD2345XY7Z9K",
    });
    expect(args.p_temp_hash).toMatch(/^scrypt\$/);
    expect(JSON.stringify(args)).not.toContain(password);
  });

  test.each(["busy", "attached"])(
    "claim 이 %s 이면 Auth 를 건드리지 않고 null 을 돌려준다(동시 요청의 비밀번호 덮어쓰기 방지)",
    async (claimResult) => {
      const { admin, rpc, createUser, setClaim } = fakeIssueClient();
      setClaim(claimResult);

      const issued = await issueTeacherAccount(
        admin,
        "teacher-1",
        "ABCD2345XY7Z9K",
        "tenant-1",
      );

      expect(issued).toBeNull();
      expect(createUser).not.toHaveBeenCalled();
      expect(rpc).toHaveBeenCalledTimes(1);
    },
  );

  test("발송 중복 방지 열쇠는 교사 id 와 임시 비밀번호 발급 시각으로 만든다", async () => {
    const { admin } = fakeIssueClient();

    const issued = await issueTeacherAccount(
      admin,
      "teacher-1",
      "ABCD2345XY7Z9K",
      "tenant-1",
    );

    expect(issued?.dedupeKey).toBe(
      "teacherIssue:teacher-1:2026-11-05T05:00:00Z",
    );
  });

  test("attach 가 실패하면 예외로 알린다", async () => {
    const { admin, rpc } = fakeIssueClient();
    rpc.mockImplementation(async (name: string) =>
      name === "fn_teacher_issue_claim"
        ? { data: "claimed", error: null }
        : { data: null, error: { code: "WC089" } },
    );

    await expect(
      issueTeacherAccount(admin, "teacher-1", "ABCD2345XY7Z9K", "tenant-1"),
    ).rejects.toMatchObject({ code: "WC089" });
  });
});
