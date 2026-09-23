// 서버 PDF 다운로드 트리거 — 숨김 <form> 최상위 내비게이션으로 /api/report-pdf 에
// 제출한다(카카오 인앱에서 fetch+blob 은 0바이트 파일이 되므로 fetch 를 쓰지 않는다).
import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadReportPdf } from "./downloadReportPdf";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("downloadReportPdf", () => {
  it("html/filename/token/baseUrl 을 hidden input 으로 담은 폼을 만들어 /api/report-pdf 에 POST 제출한다", () => {
    const submitSpy = vi
      .spyOn(HTMLFormElement.prototype, "submit")
      .mockImplementation(() => {});

    downloadReportPdf({
      html: "<html></html>",
      filename: "리포트.pdf",
      accessToken: "test-token",
    });

    expect(submitSpy).toHaveBeenCalledTimes(1);

    const form = submitSpy.mock.instances[0] as HTMLFormElement;
    expect(form.method).toBe("post");
    expect(form.getAttribute("action")).toBe("/api/report-pdf");
    expect(form.getAttribute("enctype")).toBe(
      "application/x-www-form-urlencoded",
    );

    const fieldValue = (name: string) =>
      (form.querySelector(`input[name="${name}"]`) as HTMLInputElement).value;
    expect(fieldValue("html")).toBe("<html></html>");
    expect(fieldValue("filename")).toBe("리포트.pdf");
    expect(fieldValue("token")).toBe("test-token");
    expect(fieldValue("baseUrl")).toBe(window.location.origin);

    // 제출 후 폼은 문서에서 제거된다.
    expect(document.body.contains(form)).toBe(false);

    submitSpy.mockRestore();
  });
});
