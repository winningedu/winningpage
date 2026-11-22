// 저장 직전 검증(config.validate)이 묻는 확인창. window.confirm 대신 confirmAdmin 을 쓰므로
// 검증은 Promise 로 끝난다. 취소하면 저장을 막는 문구를, 확인하면 null 을 돌려준다.

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { ConfirmAdminHost } from "../shared/confirmAdmin";
import { admissionGuidelinesValidate } from "./admissionGuidelinesForm";
import { goalConfigs } from "./goal";

function renderHost() {
  render(<ConfirmAdminHost />);
}

async function answer(name: "취소" | "계속" | "확인") {
  const dialog = await screen.findByRole("alertdialog");
  fireEvent.click(within(dialog).getByRole("button", { name }));
}

describe("admissionGuidelinesValidate", () => {
  const row = { university_name: "가나대", selection_method_html: "<p>a</p>" };
  const form = { ...row, selection_method_html: "<p>b</p>" };

  test("공개 내용이 바뀌면 바뀌는 항목을 보여 주고, 취소하면 저장 취소 문구를 돌려준다", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderHost();

    const result = admissionGuidelinesValidate(form, row);
    expect(result).toBeInstanceOf(Promise);
    expect(await screen.findByRole("alertdialog")).toHaveTextContent(
      "다음 항목의 공개 페이지 내용이 변경됩니다:",
    );
    await answer("취소");

    await expect(result).resolves.toBe("저장이 취소되었습니다.");
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  test("확인하면 null 을 돌려주고, 바뀐 것이 없으면 묻지 않는다", async () => {
    renderHost();

    const result = admissionGuidelinesValidate(form, row);
    await answer("계속");
    await expect(result).resolves.toBeNull();

    await expect(admissionGuidelinesValidate(row, row)).resolves.toBeNull();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
});

describe("goalUniversityCuts validate", () => {
  const { validate } = goalConfigs.goalUniversityCuts;
  const form = {
    cut_type: "jungsi",
    university_name: "가나대",
    department_name: "국문",
    avg_cut: 5,
  };

  test("정시 컷이 9 이하이면 확인창을 띄우고, 취소하면 저장하지 않았다는 문구를 돌려준다", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderHost();

    const result = validate(form as never, null);
    expect(await screen.findByRole("alertdialog")).toHaveTextContent(
      "정시 컷에 9 이하 값을 넣으셨습니다.",
    );
    await answer("취소");

    await expect(result).resolves.toBe(
      "저장하지 않았습니다. 정시 컷 값을 다시 확인해 주세요.",
    );
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  test("정시 컷 확인창에서 계속하면 null 을 돌려준다", async () => {
    renderHost();

    const result = validate(form as never, null);
    await answer("확인");

    await expect(result).resolves.toBeNull();
  });

  test("확인이 필요 없는 값은 묻지 않고 곧바로 끝난다", async () => {
    await expect(
      validate({ ...form, avg_cut: 80 } as never, null),
    ).resolves.toBeNull();
  });
});
