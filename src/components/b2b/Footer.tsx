import { Link } from "react-router";
import { site } from "@/config/site";
import { useFooterOperatorImage } from "@/hooks/useFooterOperatorImage";

// 시안: 상호명 줄과 사업자 번호 줄은 값이 없는 조각을 빼고 " | "로 잇는다(빈 값을 그리지 않는다).
function joinPieces(pieces: (string | undefined)[]) {
  return pieces.filter(Boolean).join(" | ");
}

// 주소는 도로명까지만 보인다. 괄호 뒤 동, 단지명은 시안에 없다.
function roadAddress(address: string) {
  const detailStart = address.indexOf(" (");
  return detailStart < 0 ? address : address.slice(0, detailStart);
}

// 스쿨멘토 전용 푸터(b2bMenu 사이트). 위닝은 SiteFooter를 그대로 쓴다.
// 저작권보호정책 링크는 문서와 라우트가 생길 때 추가한다(결정 26).
export default function Footer() {
  const { company } = site;
  const operatorImage = useFooterOperatorImage();
  const nameLine = joinPieces([
    `상호명: ${company.name}`,
    `대표: ${company.ceo}`,
    company.businessType,
  ]);
  const registrationLine = joinPieces([
    `사업자 등록번호: ${company.bizRegNo}`,
    company.patentNo ? `특허등록: ${company.patentNo}` : undefined,
  ]);

  return (
    <footer className="bg-footer-b2b-bg">
      <div className="mx-auto flex max-w-content flex-col gap-6 px-8 py-10 lg:pb-[2.919rem] lg:pt-[2.7875rem]">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-12">
          {operatorImage && (
            <>
              <img
                src={operatorImage.imageUrl}
                alt={operatorImage.title}
                loading="lazy"
                className="max-h-[7.8125rem] max-w-full self-start object-contain lg:max-w-[20.625rem] lg:self-center"
              />
              <hr className="h-px w-full border-0 bg-footer-b2b-line lg:h-auto lg:w-px lg:self-stretch" />
            </>
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className="text-[1.4375rem] leading-7 font-extrabold tracking-[0.01875rem] text-white">
                WINNING LOGIC
              </p>
              <div className="mt-[1.031rem] text-[0.8125rem] leading-[1.675rem] text-footer-b2b-info">
                <p>
                  <span className="text-white">(운영위탁)</span> {nameLine}
                </p>
                <p>{registrationLine}</p>
                <p>{`주소: ${roadAddress(company.address)}`}</p>
              </div>
            </div>
            <div className="flex gap-[1.6625rem] text-[0.8125rem] leading-5 font-semibold text-footer-b2b-link lg:pt-[0.4375rem]">
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
        </div>

        <p className="text-[0.78125rem] leading-5 text-footer-b2b-copyright lg:mt-[0.675rem]">
          Copyright © WINNING LOGIC. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
