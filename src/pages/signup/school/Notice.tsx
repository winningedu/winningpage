// 가입 오류 안내 상자. 같은 문제를 풀 수 있는 곳(아이디 찾기, 온라인문의)으로 이어 준다.
import { Link } from "react-router";
import { site } from "@/config/site";
import { NOTICE_MESSAGES } from "./copy";

interface NoticeProps {
  message: string;
  hint?: "findId" | "inquiry" | "login";
}

export default function Notice({ message, hint }: NoticeProps) {
  const inquiryUrl = site.company.kakaoChannelUrl;

  return (
    <div
      role="alert"
      className="mt-2 flex flex-col gap-1 break-keep text-xs text-error"
    >
      <p>{message}</p>

      {hint === "findId" && (
        <Link to="/login/find-id" className="underline underline-offset-2">
          {NOTICE_MESSAGES.findIdLink}
        </Link>
      )}

      {hint === "login" && (
        <Link to="/login" className="underline underline-offset-2">
          {NOTICE_MESSAGES.loginLink}
        </Link>
      )}

      {hint === "inquiry" && (
        <p>
          {NOTICE_MESSAGES.inquiryBefore}
          {inquiryUrl ? (
            <a
              href={inquiryUrl}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2"
            >
              {NOTICE_MESSAGES.inquiryLink}
            </a>
          ) : (
            NOTICE_MESSAGES.inquiryLink
          )}
          {NOTICE_MESSAGES.inquiryAfter}
        </p>
      )}
    </div>
  );
}
