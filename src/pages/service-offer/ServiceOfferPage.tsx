import {
  AccessLogIcon,
  ArrowRightIcon,
  BannerIllustration,
  MinimalDataIcon,
  ParentAvatar,
  SeparationIcon,
  StudentAvatar,
  TeacherAvatar,
  UsageGuideQr,
} from "./illustrations";

// 이용신청 > 서비스제공 (스쿨멘토). 고객사가 준 정적 화면(HTML 시안)의 main 을 옮겼다.
// 시안은 900px 아래에서 한 열로 접는다. 가까운 기존 구간이 없어 lg(64rem)에서 접는다.

const PACKAGE_CHIPS = [
  { label: "학습진단", color: "#E5484D" },
  { label: "목표관리", color: "#2C6BE8" },
  { label: "성장설계", color: "#C9973F" },
  { label: "수행평가", color: "#7C5CFC" },
  { label: "자기평가", color: "#1FA971" },
  { label: "심화탐구", color: "#D98A1E" },
];

const VOICES = [
  {
    who: "선생님",
    Avatar: TeacherAvatar,
    title: "학급 관리가 한결 가벼워져요.",
    body: "학생별 학습진단과 목표관리 현황을 교사용 통합관리 화면에서 한눈에 확인할 수 있습니다. 학생종합코칭 기능이 있어서, 학생의 학습상담과 진로진학에 대한 코칭이 수월하고, 선생님의 업무가 줄어듭니다.",
    rowClass: "lg:flex-row",
    bubbleClass: "bg-[#EDEFF3]",
  },
  {
    who: "학생",
    Avatar: StudentAvatar,
    title: "나만의 학습 매니저가 생겨요.",
    body: "진단으로 나를 알고, 목표를 정해 매일 기록하고, 수행평가, 자기평가, 심화탐구까지 한곳에서 준비합니다. 학습 기록이 쌓일수록 진로와 입시 전략이 더 또렷해집니다.",
    rowClass: "lg:flex-row-reverse",
    bubbleClass: "bg-[#FDF0DD] lg:text-right",
  },
  {
    who: "학부모",
    Avatar: ParentAvatar,
    title: "아이의 학습 현황을 믿고 확인할 수 있어요.",
    body: "학부모 연락처를 연결하면 주간과 월간 리포트로 자녀의 학습 흐름을 받아볼 수 있습니다.",
    rowClass: "lg:flex-row",
    bubbleClass: "bg-[#DDF0FA]",
  },
];

const SAFETY_CARDS = [
  {
    Icon: MinimalDataIcon,
    title: "개인정보 최소 수집",
    lines: [
      "서비스 이용에 꼭 필요한 항목만",
      "수집하며, 항목을 늘릴 때는",
      "약관과 동의서를 함께 개정합니다.",
    ],
  },
  {
    Icon: SeparationIcon,
    title: "소속코드 기반 회원 분리",
    lines: [
      "교육기관별 소속코드로 회원을",
      "나누어 관리하며, 서비스 제공 여부도",
      "교육기관 단위로 통제합니다.",
    ],
  },
  {
    Icon: AccessLogIcon,
    title: "권한별 접근관리와 기록",
    lines: [
      "담임교사, 학교관리자, 본사 권한을",
      "구분하고, 개인정보 접근은",
      "기록으로 남겨 관리합니다.",
    ],
  },
];

const STEPS = [
  {
    step: "STEP 01",
    title: "도입 상담",
    lines: [
      "하단의 도입 상담 문의로",
      "도입 상담을 무료로",
      "신청하실 수 있습니다.",
    ],
    barClass:
      "bg-[#4F86DB] [clip-path:polygon(0_0,calc(100%_-_1.25rem)_0,100%_50%,calc(100%_-_1.25rem)_100%,0_100%)]",
    underlineClass: "bg-[#4F86DB]",
  },
  {
    step: "STEP 02",
    title: "협약 및 서비스 신청",
    lines: [
      "상담을 통해 우리 교육기관에 맞는",
      "조건을 협의한 뒤 협약을 맺고",
      "소속코드를 발급해 드립니다.",
    ],
    barClass:
      "bg-[#3D5EB8] [clip-path:polygon(0_0,calc(100%_-_1.25rem)_0,100%_50%,calc(100%_-_1.25rem)_100%,0_100%,1.25rem_50%)]",
    underlineClass: "bg-[#3D5EB8]",
  },
  {
    step: "STEP 03",
    title: "교사 안내 및 이용 시작",
    lines: [
      "선생님 계정 발급과 학생 일괄 등록,",
      "이용 방법 안내를 지원해",
      "바로 시작하실 수 있습니다.",
    ],
    barClass:
      "bg-[#1F2A5E] [clip-path:polygon(0_0,calc(100%_-_1.25rem)_0,100%_50%,calc(100%_-_1.25rem)_100%,0_100%,1.25rem_50%)]",
    underlineClass: "bg-[#1F2A5E]",
  },
];

const WRAP = "mx-auto w-full max-w-[70rem] px-6";
const SECTION_HEADING =
  "text-center text-[1.85rem] font-extrabold tracking-[-0.035em] text-[#0B2545]";
const SECTION_SUB = "mt-2.5 text-center text-[0.95rem] text-[#55607A]";

// 줄바꿈이 있는 문구. 시안의 <br> 위치를 그대로 지킨다.
function Lines({ lines }: { lines: string[] }) {
  return lines.map((line, i) => (
    <span key={line}>
      {i > 0 && <br />}
      {line}
    </span>
  ));
}

export default function ServiceOfferPage() {
  return (
    <main className="pt-16 text-[#1A2333] antialiased tracking-[-0.01em]">
      <section className="bg-linear-to-b from-[#E6EEFB] via-[#F1F6FD] via-55% to-white pt-14 pb-7">
        <div className={WRAP}>
          <div className="flex flex-col items-start justify-between gap-[1.875rem] overflow-hidden rounded-[1.625rem] bg-linear-[115deg,#BDD0F1_0%,#A9C2EB_100%] px-[1.625rem] py-[1.875rem] shadow-[0_0.875rem_2.125rem_rgba(27,79,184,0.14)] lg:flex-row lg:items-center lg:px-16 lg:py-10">
            <div>
              <span className="inline-block text-[0.78rem] font-extrabold tracking-[0.02em] text-[#1B4FB8]">
                서비스제공과 이용신청
              </span>
              <h1 className="mt-3 text-left text-[1.7rem] leading-[1.35] font-extrabold tracking-[-0.04em] text-[#0B2545] lg:text-[2.15rem]">
                우리 교육기관에 맞는 서비스를
                <br />
                선택해주세요
              </h1>
              <p className="mt-3.5 text-[0.86rem] leading-[1.75] font-medium text-[#2d4a7a]">
                학교와 교육기관을 대상으로 서비스를 제공하고 있습니다.
                <br />
                세부문의는 하단의 도입 상담 문의를 이용하시면 담당자가 직접
                연락드립니다.
              </p>
            </div>
            <BannerIllustration className="-my-1.5 h-auto w-full lg:w-[21.25rem] lg:flex-none" />
          </div>

          <div className="mt-11">
            <h2 className="text-2xl font-extrabold tracking-[-0.03em] text-[#1A2333]">
              스쿨멘토 서비스 이용권
            </h2>
            <p className="mt-3 text-[0.78rem] leading-[1.7] font-medium text-[#5a6478]">
              스쿨멘토는 학습진단, 목표관리, 성장설계, 수행평가, 자기평가,
              심화탐구 6가지 서비스를 교육기관 단위로 제공하는 서비스입니다.
              협약기간 동안은 교육기관 패키지로 이용하며,
              <br />
              협약기간 이후에는 개인이용권으로도 연속 이용할 수 있습니다.
              이용료는 교육기관 조건에 따라 달라지므로 별도 문의를 통해 안내해
              드립니다.
            </p>
          </div>

          {/* biome-ignore lint/a11y/useSemanticElements: 시안처럼 눌러서 켜고 다시 눌러서 끄는 카드라 input radio 로 바꿀 수 없다 */}
          <div
            role="radio"
            aria-checked="false"
            tabIndex={0}
            className="mt-[1.375rem] flex cursor-pointer flex-col items-start justify-between gap-6 rounded-[1.125rem] border border-[#D3DBE8] bg-white px-8 py-[1.625rem] transition hover:border-[#aebfe0] lg:flex-row lg:items-center"
          >
            <div className="flex min-w-0 items-center gap-[1.125rem]">
              <span className="relative size-[1.375rem] flex-none rounded-full border-[1.5px] border-[#C4CCDA] bg-white transition" />
              <div>
                <div className="text-base font-bold">
                  [교육기관 패키지] 개인 이용권
                </div>
                <div className="mt-1.5 text-[0.88rem] font-extrabold">
                  교육기관과의 협약기간 이후에는 개인별로 선택하여 연속이용도
                  가능합니다
                </div>
              </div>
            </div>
            <div className="text-[0.95rem] font-light whitespace-nowrap lg:text-right">
              이용료<span className="ml-2.5 font-light">별도문의</span>
            </div>
          </div>

          <div className="mt-3.5 flex flex-wrap items-center gap-2">
            <span className="mr-1 text-[0.78rem] font-bold text-[#8A93A6]">
              패키지 구성
            </span>
            {PACKAGE_CHIPS.map(({ label, color }) => (
              <span
                key={label}
                className="inline-flex items-center gap-[0.4375rem] rounded-full border border-[#E1E7F0] bg-[#F7F9FC] px-[0.8125rem] py-1.5 text-[0.8rem] font-bold text-[#55607A]"
              >
                <i
                  className="size-2 rounded-full"
                  style={{ backgroundColor: color }}
                />
                {label}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="pt-[5.25rem]">
        <div className={WRAP}>
          <h2 className={SECTION_HEADING}>
            학교와 교육기관이 선택하는 이유,{" "}
            <b className="text-[#2C6BE8]">스쿨멘토!</b>
          </h2>
          <p className={SECTION_SUB}>
            선생님, 학생, 학부모 모두에게 쓰임이 분명한 학습관리 서비스입니다.
          </p>
          <div className="mt-11 flex flex-col gap-[1.375rem]">
            {VOICES.map(
              ({ who, Avatar, title, body, rowClass, bubbleClass }) => (
                <div
                  key={who}
                  className={`flex flex-col items-stretch gap-[1.125rem] lg:items-center ${rowClass}`}
                >
                  <div className="flex flex-col items-center gap-1.5 text-[1.02rem] font-extrabold lg:flex-none lg:basis-[6.75rem]">
                    <Avatar className="block size-[6.125rem] rounded-full drop-shadow-[0_0.5rem_0.875rem_rgba(11,37,69,0.18)]" />
                    {who}
                  </div>
                  <div
                    className={`flex-1 rounded-[1.625rem] px-[1.625rem] py-7 lg:px-[2.375rem] ${bubbleClass}`}
                  >
                    <h3 className="text-[1.06rem] font-extrabold">{title}</h3>
                    <p className="mt-2 text-[0.92rem] leading-[1.75] text-[#3d475b]">
                      {body}
                    </p>
                  </div>
                </div>
              ),
            )}
          </div>
        </div>
      </section>

      <section className="pt-[5.75rem]">
        <div className={WRAP}>
          <h2 className={SECTION_HEADING}>
            스쿨멘토는 학생 정보를 <b className="text-[#2C6BE8]">안전하게</b>{" "}
            관리합니다
          </h2>
          <p className={SECTION_SUB}>
            필요한 최소한의 정보만 받고, 소속과 권한에 따라 나누어 관리합니다.
          </p>
          <div className="mt-10 grid grid-cols-1 gap-5 lg:grid-cols-3">
            {SAFETY_CARDS.map(({ Icon, title, lines }) => (
              <div
                key={title}
                className="rounded-[1.25rem] border border-[#C9D8F2] bg-white px-[1.625rem] pt-[2.125rem] pb-8 text-center"
              >
                <div className="relative mx-auto mb-[1.125rem] size-[4.5rem] before:absolute before:-top-2 before:-left-1.5 before:size-10 before:rounded-full before:bg-[#D7ECFA]">
                  <Icon className="relative size-[4.5rem]" />
                </div>
                <h3 className="text-[1.18rem] font-extrabold">{title}</h3>
                <p className="mt-2.5 text-[0.88rem] leading-[1.7] text-[#55607A]">
                  <Lines lines={lines} />
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="pt-[5.75rem]">
        <div className={WRAP}>
          <h2 className={SECTION_HEADING}>
            선생님의 업무를 도와주는 맞춤 학습관리,
            <br />
            <b className="text-[#2C6BE8]">원스톱 프로세스</b>로 신청하세요!
          </h2>
          <div className="mt-10 grid grid-cols-1 gap-1.5 lg:grid-cols-3">
            {STEPS.map(({ step, title, lines, barClass, underlineClass }) => (
              <div key={step}>
                <div
                  className={`flex h-[3.125rem] items-center justify-center text-[0.9rem] font-extrabold tracking-[0.04em] text-white ${barClass}`}
                >
                  {step}
                </div>
                <div className="px-[1.125rem] py-[1.375rem] text-center">
                  <h3 className="text-[1.4rem] font-extrabold">{title}</h3>
                  <p className="mt-2.5 text-[0.88rem] leading-[1.7] text-[#55607A]">
                    <Lines lines={lines} />
                  </p>
                </div>
                <div className={`h-1 rounded-sm ${underlineClass}`} />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="pt-[5.25rem] pb-24">
        <div className={WRAP}>
          <div className="flex flex-col items-start justify-between gap-[1.875rem] rounded-[1.375rem] bg-linear-[165deg,#0B2545_0%,#1A3D75_70%,#0d2a52_100%] px-[1.625rem] py-[1.875rem] text-[#dfe8fb] shadow-[0_1.125rem_2.75rem_rgba(11,37,69,0.16)] transition hover:-translate-y-0.5 hover:shadow-[0_1.5rem_3.375rem_rgba(11,37,69,0.22)] lg:flex-row lg:items-center lg:px-12 lg:py-[1.625rem]">
            <div>
              <h3 className="text-[1.75rem] font-extrabold tracking-[-0.035em] text-white">
                도입 상담 문의
              </h3>
              <p className="mt-2 text-[0.95rem] leading-[1.75] text-[#b9c8e6]">
                우리 교육기관에 맞는 도입 방식이 궁금하시다면
                <br />
                스쿨멘토 이용안내 페이지에서 확인해 주세요.
              </p>
              <span className="mt-4 inline-flex items-center gap-2.5 rounded-xl bg-[#2C6BE8] px-[1.625rem] py-[0.6875rem] text-[0.98rem] font-extrabold text-white">
                상담신청 하기
                <ArrowRightIcon />
              </span>
            </div>
            <div className="flex flex-none flex-col items-center gap-2">
              <div className="size-28 rounded-[0.875rem] bg-white p-1">
                <UsageGuideQr className="block size-full" />
              </div>
              <span className="rounded-full bg-[#2C6BE8] px-4 py-1 text-[0.76rem] font-extrabold text-white">
                이용안내
              </span>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
