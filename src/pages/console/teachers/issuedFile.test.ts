// 발급 계정 안내 파일(교 #125). 이름, 전화번호 뒷 4자리, 학년, 반, 아이디, 임시 비밀번호 여섯 칸이고 학년과 반이 없는 교사는 빈 칸이다.

import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadIssuedFile, issuedSheet } from "./issuedFile";

afterEach(() => {
  vi.restoreAllMocks();
});

const ROWS = [
  {
    name: "이수민",
    phoneLast4: "1234",
    grade: "1학년",
    className: "2반",
    loginId: "SM26HB83W5ZQ7H",
    tempPassword: "Ab3!xYz9Qk",
  },
  {
    name: "최민정",
    phoneLast4: "5678",
    grade: "",
    className: "",
    loginId: "SM26HB83R4TXW9",
    tempPassword: "Zz9?mmNn2P",
  },
];

describe("issuedSheet", () => {
  it("머리글 한 줄 뒤에 교사마다 한 줄을 둔다", () => {
    expect(issuedSheet(ROWS)).toEqual([
      ["이름", "전화번호 뒷 4자리", "학년", "반", "아이디", "임시 비밀번호"],
      ["이수민", "1234", "1학년", "2반", "SM26HB83W5ZQ7H", "Ab3!xYz9Qk"],
      ["최민정", "5678", "", "", "SM26HB83R4TXW9", "Zz9?mmNn2P"],
    ]);
  });
});

describe("downloadIssuedFile", () => {
  it("엑셀 파일을 만들어 한 번 내려받고 주소는 내려받기가 시작된 뒤에 푼다", async () => {
    const create = vi.fn(() => "blob:issued");
    const revoke = vi.fn();
    vi.stubGlobal("URL", { createObjectURL: create, revokeObjectURL: revoke });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    vi.useFakeTimers();
    try {
      await downloadIssuedFile(ROWS);

      // 하나뿐인 임시 비밀번호 파일이라 click 직후에 풀면 내려받기가 끊길 수 있다.
      expect(revoke).not.toHaveBeenCalled();
      vi.runAllTimers();
    } finally {
      vi.useRealTimers();
    }

    expect(create).toHaveBeenCalledTimes(1);
    const blob = (create.mock.calls[0] as unknown as [Blob])[0];
    expect(blob.type).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(click).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledWith("blob:issued");
  });
});
