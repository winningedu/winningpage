// 교사 계정 발급 도우미 계약 검증(임시 비밀번호, scrypt 해시, Auth 사용자 생성).

import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, test, vi } from "vitest";
import {
  ensureAuthUser,
  generateTempPassword,
  hashTempPassword,
  issueTeacherAccount,
  verifyTempPassword,
} from "./teacherAccounts.js";

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
  pages?: { id: string; email: string }[][];
}) {
  const createUser = vi.fn().mockResolvedValue(opts.createResult);
  const pages = opts.pages ?? [];
  const listUsers = vi.fn(async ({ page }: { page: number }) => ({
    data: { users: pages[page - 1] ?? [] },
    error: null,
  }));
  const updateUserById = vi.fn().mockResolvedValue({ data: {}, error: null });
  return {
    createUser,
    listUsers,
    updateUserById,
    admin: {
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
    const { admin, updateUserById, listUsers } = fakeAuthAdmin({
      createResult: {
        data: { user: null },
        error: { status: 422, code: "email_exists" },
      },
      pages: [
        [{ id: "other", email: "x@example.com" }],
        [{ id: "user-9", email: "abcd2345xy7z9k@teacher.schoolmentor.kr" }],
      ],
    });

    const id = await ensureAuthUser(admin, "ABCD2345XY7Z9K", "Pw1!abcdef");

    expect(id).toBe("user-9");
    expect(listUsers).toHaveBeenCalledTimes(2);
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
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
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
    );

    const password = createUser.mock.calls[0]?.[0].password as string;
    expect(issued.tempPassword).toBe(password);
    expect(issued.profileId).toBe("user-1");
    expect(rpc).toHaveBeenCalledTimes(1);
    const [name, args] = rpc.mock.calls[0] as [string, Record<string, string>];
    expect(name).toBe("fn_teacher_attach_account");
    expect(args).toMatchObject({
      p_teacher_id: "teacher-1",
      p_profile_id: "user-1",
      p_login_id: "ABCD2345XY7Z9K",
    });
    expect(args.p_temp_hash).toMatch(/^scrypt\$/);
    expect(JSON.stringify(args)).not.toContain(password);
  });

  test("발송 중복 방지 열쇠는 교사 id 와 임시 비밀번호 발급 시각으로 만든다", async () => {
    const { admin } = fakeIssueClient();

    const issued = await issueTeacherAccount(
      admin,
      "teacher-1",
      "ABCD2345XY7Z9K",
    );

    expect(issued.dedupeKey).toBe(
      "teacherIssue:teacher-1:2026-11-05T05:00:00Z",
    );
  });

  test("attach 가 실패하면 예외로 알린다", async () => {
    const { admin, rpc } = fakeIssueClient();
    rpc.mockResolvedValue({ data: null, error: { code: "WC089" } });

    await expect(
      issueTeacherAccount(admin, "teacher-1", "ABCD2345XY7Z9K"),
    ).rejects.toMatchObject({ code: "WC089" });
  });
});
