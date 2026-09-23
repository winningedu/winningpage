// 서버 PDF 다운로드 트리거(QA 2차 시트 행39·56) — 카카오톡 인앱 등에서는
// fetch+blob으로 받은 PDF가 0바이트 파일로 저장된다(카카오 인앱 웹뷰의 blob URL
// 다운로드 제약). 반드시 숨김 <form> 최상위 내비게이션(POST submit)으로 요청해야
// 서버의 Content-Disposition: attachment 응답이 실제 다운로드로 이어진다. 응답이
// 첨부 다운로드라 브라우저는 현재 페이지를 벗어나지 않는다 — 제출 뒤 폼만 정리한다.
import { supabase } from "@/lib/supabase";

const REPORT_PDF_ENDPOINT = "/api/report-pdf";

export interface DownloadReportPdfInput {
  html: string;
  filename: string;
  accessToken: string;
}

function appendHiddenField(form: HTMLFormElement, name: string, value: string) {
  const input = document.createElement("input");
  input.type = "hidden";
  input.name = name;
  input.value = value;
  form.appendChild(input);
}

export function downloadReportPdf({
  html,
  filename,
  accessToken,
}: DownloadReportPdfInput): void {
  const form = document.createElement("form");
  form.method = "post";
  form.action = REPORT_PDF_ENDPOINT;
  form.enctype = "application/x-www-form-urlencoded";
  form.style.display = "none";

  appendHiddenField(form, "html", html);
  appendHiddenField(form, "filename", filename);
  appendHiddenField(form, "token", accessToken);
  appendHiddenField(form, "baseUrl", window.location.origin);

  document.body.appendChild(form);
  form.submit();
  form.remove();
}

/** apiFetch.ts의 getAuthHeader()와 같은 세션 조회 관례 — 여기서는 Authorization
 * 헤더가 아니라 폼 필드에 실을 원문 토큰이 필요해 access_token을 직접 반환한다.
 * 세션이 없으면 null(호출부가 '로그인이 필요합니다' 등으로 처리). */
export async function getReportAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token ?? null;
}
