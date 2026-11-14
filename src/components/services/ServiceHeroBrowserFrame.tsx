// 출처: InDepthResearch.jsx / SelfAssessment.jsx / PerformanceAssessment.jsx / GoalManagement.jsx
// 4개 HeroSection 안의 브라우저 크롬 프레임(래퍼 + 3중 그림자 프레임 + 신호등 3색 + 주소창)이
// children만 다를 뿐 바이트 단위로 동일해 추출했다. HeroSection 자체는 공통화 제외 대상이다
// (오라 회전 애니메이션・목업 위치값이 페이지마다 달라 통합 비용이 큼) — 이 조각만 4페이지가
// 완전히 일치해 뽑아냈다. 색상 변경 시 4곳 동시 수정을 놓친 이력이 있어 단일 소스로 관리한다.
// 주소창 도메인은 사이트 설정(site.homeUrl)에서 읽는다.
//
// children은 프레임 본문이다(3페이지는 빈 배경 div, 목표관리는 실제 대시보드 스크린샷
// <img>). 자식 쪽 클래스(md:object-cover 등)는 이 컴포넌트가 아니라 호출부가 그대로 소유한다.
import type { ReactNode } from "react";
import { site } from "@/config/site";

type ServiceHeroBrowserFrameProps = {
  children?: ReactNode;
};

export default function ServiceHeroBrowserFrame({
  children,
}: ServiceHeroBrowserFrameProps) {
  return (
    <div className="relative z-10 mx-auto mt-8 w-full max-w-267 sm:mt-10 md:mt-12.25 lg:mb-[-7.89375rem]">
      <div className="overflow-hidden rounded-[0.3125rem] bg-white shadow-[0_0_0.0625rem_rgba(0,0,0,0.7),0_1.25rem_1.875rem_rgba(0,0,0,0.3),0_0.625rem_3.125rem_rgba(0,0,0,0.2)] md:flex md:aspect-1280/553 md:flex-col">
        <div className="flex items-center gap-3 border-b border-[#E5E7EB] bg-[#DFE1E5] px-4 py-2.5 md:shrink-0">
          <span className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#ED6A5E]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#F6BE4F]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#62C554]" />
          </span>
          <span className="flex-1 truncate rounded-full bg-[#F1F3F4] px-4 py-1 text-center text-[0.75rem] text-[#767676]">
            {site.homeUrl}
          </span>
        </div>
        {children}
      </div>
    </div>
  );
}
