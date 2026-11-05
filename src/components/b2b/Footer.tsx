import { Link } from "react-router";
import { site } from "@/config/site";

// 모바일에서는 항목마다 줄을 바꾸고, 태블릿 이상에서는 " | "로 이어 두 줄로 보인다.
function Item({ children }: { children: string }) {
  return <span className="block sm:inline">{children}</span>;
}

function Bar() {
  return (
    <span aria-hidden="true" className="hidden sm:inline">
      {" | "}
    </span>
  );
}

// 스쿨멘토 전용 푸터(b2bMenu 사이트). 위닝은 SiteFooter를 그대로 쓴다.
// 저작권보호정책 링크는 문서와 라우트가 생길 때 추가한다(결정 26).
export default function Footer() {
  const { company } = site;
  const addressSplit = company.address.indexOf(" (");
  const road =
    addressSplit < 0 ? company.address : company.address.slice(0, addressSplit);
  const detail =
    addressSplit < 0 ? "" : company.address.slice(addressSplit + 1);

  return (
    <footer className="bg-footer-b2b-bg">
      <div className="mx-auto flex max-w-content flex-col gap-6 px-8 py-10 lg:gap-0 lg:pb-[2.919rem] lg:pt-[2.7875rem]">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <p className="text-[1.4375rem] leading-7 font-extrabold tracking-[0.01875rem] text-white">
            WINNING LOGIC
          </p>
          <div className="flex gap-[1.6625rem] text-[0.8125rem] leading-5 font-semibold text-footer-b2b-link">
            <Link
              to="/privacy"
              className="relative after:absolute after:left-0 after:top-1/2 after:h-11 after:w-full after:-translate-y-1/2 lg:after:hidden"
            >
              개인정보처리방침
            </Link>
            <Link
              to="/terms"
              className="relative after:absolute after:left-0 after:top-1/2 after:h-11 after:w-full after:-translate-y-1/2 lg:after:hidden"
            >
              이용약관
            </Link>
          </div>
        </div>

        <hr className="border-footer-b2b-line lg:mt-[1.644rem]" />

        <div className="text-[0.8125rem] leading-[1.675rem] text-footer-b2b-info lg:mt-[1.031rem]">
          <p>
            <Item>{`상호명: ${company.name} | 대표: ${company.ceo}`}</Item>
            <Bar />
            <Item>{`법인등록번호: ${company.corpRegNo}`}</Item>
            <Bar />
            <Item>{`사업자 등록번호: ${company.bizRegNo}`}</Item>
          </p>
          <p>
            <Item>{`주소: ${road}`}</Item>
            {detail && (
              <>
                <span className="hidden sm:inline"> </span>
                <Item>{detail}</Item>
              </>
            )}
          </p>
        </div>

        <p className="text-[0.78125rem] leading-5 text-footer-b2b-copyright lg:mt-[0.675rem]">
          Copyright © WINNING LOGIC. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
