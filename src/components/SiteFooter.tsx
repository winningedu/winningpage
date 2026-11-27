import { Fragment, type ReactNode } from "react";
import { Link } from "react-router";
import InstagramIcon from "@/components/icons/InstagramIcon";
import NaverClipIcon from "@/components/icons/NaverClipIcon";
import NaverIcon from "@/components/icons/NaverIcon";
import YoutubeIcon from "@/components/icons/YoutubeIcon";
import { site } from "@/config/site";
import { useFooterOperatorImage } from "@/hooks/useFooterOperatorImage";

// 시안: 항목을 " | "로 잇고 값이 없는 항목은 뺀다(빈 값을 그리지 않는다). 항목은 안에서 줄이
// 바뀌지 않고 " | " 자리에서만 줄이 바뀐다. prefix 는 첫 항목 안에 붙는다.
function PipeItems({
  items,
  prefix,
}: {
  items: (string | undefined)[];
  prefix?: ReactNode;
}) {
  const present = items.filter((item): item is string => Boolean(item));
  return present.map((item, index) => (
    <Fragment key={item}>
      {index > 0 && " | "}
      <span className="whitespace-nowrap">
        {index === 0 && prefix}
        {item}
      </span>
    </Fragment>
  ));
}

// 주소는 도로명까지만 보인다. 괄호 뒤 동, 단지명은 시안에 없다.
function roadAddress(address: string) {
  const detailStart = address.indexOf(" (");
  return detailStart < 0 ? address : address.slice(0, detailStart);
}

// 통신판매업자 정보 공개 페이지(공정거래위원회). 사업자등록번호는 숫자만 넣는다.
function ftcBizInfoUrl(bizRegNo: string) {
  return `https://www.ftc.go.kr/bizCommPop.do?wrkr_no=${bizRegNo.replaceAll("-", "")}`;
}

// 소셜 아이콘: 순서 고정(네이버 블로그, 네이버 클립, 유튜브, 인스타그램). URL이 설정에 없으면 그
// 아이콘은 렌더하지 않는다.
function SocialLinks({
  company,
  className,
}: {
  company: typeof site.company;
  className: string;
}) {
  const items = [
    {
      label: "네이버 블로그",
      href: company.naverBlogUrl,
      Icon: NaverIcon,
      badgeClassName: "bg-[#03c75a] text-white",
    },
    {
      label: "네이버 클립",
      href: company.naverClipUrl,
      Icon: NaverClipIcon,
      badgeClassName: "bg-[#6f4dce] text-[#adff5f]",
    },
    {
      label: "유튜브",
      href: company.youtubeUrl,
      Icon: YoutubeIcon,
      badgeClassName: "bg-[#ff0000] text-white",
    },
    {
      label: "인스타그램",
      href: company.instagramUrl,
      Icon: InstagramIcon,
      badgeClassName: "text-white",
      style: {
        background:
          "linear-gradient(45deg, #f9ce34 0%, #ee2a7b 50%, #6228d7 100%)",
      },
    },
  ].filter((item) => item.href);

  return (
    <div className={`items-center gap-4 ${className}`}>
      {items.map(({ label, href, Icon, badgeClassName, style }) => (
        <a
          key={label}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={label}
          style={style}
          className={`inline-flex size-8 items-center justify-center rounded-full transition hover:opacity-90 ${badgeClassName}`}
        >
          <Icon className="size-4" aria-hidden="true" />
        </a>
      ))}
    </div>
  );
}

// 두 사이트 공용 푸터. 브랜드 자리, 운영 형태, 저작권 문구는 site.footer, 회사 정보는 site.company 를 따른다.
// 저작권보호정책 링크는 문서와 라우트가 생길 때 추가한다(결정 26).
export default function SiteFooter() {
  const { company, footer, features } = site;
  const operatorImage = useFooterOperatorImage();
  const nameItems = [
    `상호명: ${company.name}`,
    `대표: ${company.ceo}`,
    company.businessType,
  ];
  const registrationItems = [
    `사업자 등록번호: ${company.bizRegNo}`,
    company.patentNo ? `특허등록: ${company.patentNo}` : undefined,
    company.mailOrderNo
      ? `통신판매업 신고번호: ${company.mailOrderNo}`
      : undefined,
  ];
  const addressItems = [
    `주소: ${roadAddress(company.address)}`,
    company.supportChannelLabel
      ? `온라인고객센터 : ${company.supportChannelLabel}`
      : undefined,
  ];

  const legalLinks = (
    <div className="flex shrink-0 gap-[1.6625rem] text-[0.8125rem] leading-5 font-semibold text-footer-b2b-link lg:pt-[0.4375rem]">
      <Link
        to="/privacy"
        className="relative whitespace-nowrap font-bold text-footer-b2b-privacy after:absolute after:left-0 after:top-1/2 after:h-11 after:w-full after:-translate-y-1/2 lg:after:hidden"
      >
        개인정보처리방침
      </Link>
      <Link
        to="/terms"
        className="relative whitespace-nowrap after:absolute after:left-0 after:top-1/2 after:h-11 after:w-full after:-translate-y-1/2 lg:after:hidden"
      >
        이용약관
      </Link>
    </div>
  );

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
              {"logo" in footer.brand ? (
                <img
                  src={footer.brand.logo}
                  alt={site.brandName}
                  className="h-6 w-auto"
                />
              ) : (
                <p className="text-[1.4375rem] leading-7 font-extrabold tracking-[0.01875rem] text-white">
                  {footer.brand.text}
                </p>
              )}
              {features.footerSocialLinks && (
                <SocialLinks
                  company={company}
                  className="mt-4 flex lg:hidden"
                />
              )}
              <div className="mt-[1.031rem] break-keep text-[0.8125rem] leading-[1.675rem] text-footer-b2b-info">
                <p>
                  <PipeItems
                    items={nameItems}
                    prefix={
                      footer.operatorLabel && (
                        <span className="text-white">
                          ({footer.operatorLabel}){" "}
                        </span>
                      )
                    }
                  />
                </p>
                <p>
                  <PipeItems items={registrationItems} />
                </p>
                <p>
                  <PipeItems items={addressItems} />
                </p>
                {company.hostingProvider && (
                  <p>
                    <span className="whitespace-nowrap">
                      호스팅서비스 제공자: {company.hostingProvider}
                    </span>
                    {company.mailOrderNo && (
                      <>
                        {" | "}
                        <a
                          href={ftcBizInfoUrl(company.bizRegNo)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="whitespace-nowrap underline"
                        >
                          사업자정보 확인
                        </a>
                      </>
                    )}
                  </p>
                )}
              </div>
            </div>
            {features.footerSocialLinks ? (
              <div className="flex shrink-0 flex-col items-start gap-6 lg:items-end lg:gap-4">
                <SocialLinks company={company} className="hidden lg:flex" />
                {legalLinks}
              </div>
            ) : (
              legalLinks
            )}
          </div>
        </div>

        <p className="text-[0.78125rem] leading-5 text-footer-b2b-copyright lg:mt-[0.675rem]">
          {footer.copyright}
        </p>
      </div>
    </footer>
  );
}
