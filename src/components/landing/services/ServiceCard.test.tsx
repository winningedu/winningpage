import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, test } from "vitest";
import ServiceCard, { type Service } from "./ServiceCard";

function renderCard(service: Service) {
  return render(
    <MemoryRouter>
      <ServiceCard service={service} />
    </MemoryRouter>,
  );
}

describe("ServiceCard", () => {
  test("link 가 내부 경로면 Link 로 렌더한다", () => {
    renderCard({
      id: "svc-1",
      name: "학습진단",
      link: "/services/learning-diagnosis",
      icon_image_url: "/images/landing/services/learning-diagnosis.png",
    });

    const link = screen.getByRole("link", { name: "학습진단 바로가기" });
    expect(link).toHaveAttribute("href", "/services/learning-diagnosis");
  });

  test("link 가 외부 URL이면 새 탭 a 태그로 렌더한다", () => {
    renderCard({
      id: "svc-5",
      name: "외부 서비스",
      link: "https://example.com/service",
    });

    const link = screen.getByRole("link", { name: "외부 서비스 바로가기" });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  // 어드민이 link 를 아직 안 채운 신규 서비스 — 클릭 영역 없이 카드만 보여준다(현행 유지).
  test("link 가 없으면 클릭 불가능한 div 로 렌더한다", () => {
    renderCard({ id: "svc-6", name: "미배선 서비스" });

    expect(
      screen.queryByRole("link", { name: /바로가기/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("미배선 서비스")).toBeInTheDocument();
  });

  // 죽은 레거시 링크('/services') — 링크 없음과 동일하게 취급(현행 유지).
  test("죽은 레거시 링크(/services)는 링크 없음으로 취급한다", () => {
    renderCard({ id: "svc-7", name: "레거시 서비스", link: "/services" });

    expect(
      screen.queryByRole("link", { name: /바로가기/ }),
    ).not.toBeInTheDocument();
  });

  test("icon_image_url 이 없으면 일러스트 영역에 이미지를 렌더하지 않는다(폴백 아이콘 없음)", () => {
    // alt=""(장식용 이미지)라 접근성 트리에 role="img"로 노출되지 않는다(queryByRole은
    // 이미지 유무와 무관하게 항상 통과) — querySelector로 실제 DOM 존재 여부를 확인한다.
    const { container } = renderCard({
      id: "svc-8",
      name: "아이콘 없는 서비스",
      link: "/page/services-etc",
    });

    expect(container.querySelector("img")).not.toBeInTheDocument();
  });

  test("설명이 없으면 설명 텍스트 노드를 렌더하지 않는다", () => {
    const { container } = renderCard({
      id: "svc-9",
      name: "설명 없는 서비스",
      link: "/page/services-etc",
    });

    expect(container.querySelectorAll(".text-ink-natural")).toHaveLength(0);
  });

  // 사용자 확정 최종 사이징 규칙 — 컨테이너 쿼리 기준점(@container)은 카드가 아니라
  // ServicesSection의 그리드 li(별도 테스트). 카드 자체는 gap 없이 justify-between만
  // 쓰고(gap이 텍스트 공간을 잠식해 긴 제목이 넘쳤던 실측 버그), 텍스트는 카드 폭
  // ≥21rem일 때만 nowrap/pre(자동 줄바꿈 없음)로 전환된다.
  test("카드는 gap 없이 justify-between만 쓰고 텍스트에 @[21rem]: 줄바꿈 억제 클래스가 붙는다", () => {
    renderCard({
      id: "svc-10",
      name: "국제·해외 프리미엄",
      description: "국제고 해외고 국내대입 컨설팅",
      link: "/page/premium/global-university",
    });

    const card = screen.getByRole("link", {
      name: "국제·해외 프리미엄 바로가기",
    });
    expect(card).toHaveClass("justify-between");
    expect(card.className).not.toMatch(/(?:^|\s)gap-4(?:\s|$)/);
    // 카드 자체는 상하 패딩이 없다(시안: 일러스트가 카드 전체 높이를 거의 다 씀) —
    // 필요한 상하 여유는 카드가 아니라 텍스트 묶음(ServiceCardText)이 직접 갖는다.
    expect(card.className).not.toMatch(/(?:^|\s)py-6(?:\s|$)/);

    expect(screen.getByText("국제·해외 프리미엄")).toHaveClass(
      "break-keep",
      "@[21rem]:whitespace-nowrap",
    );
    expect(screen.getByText("국제고 해외고 국내대입 컨설팅")).toHaveClass(
      "whitespace-pre-line",
      "@[21rem]:whitespace-pre",
    );

    const textGroup = screen.getByText("국제·해외 프리미엄").parentElement;
    expect(textGroup).toHaveClass("py-6");
  });

  // 사용자 확정 최종 사이징 규칙 — 일러스트 프레임은 뷰포트 breakpoint가 아니라 카드
  // 폭(cqw)에 비례해 줄어들고(min(8.4375rem,38cqw)), 비율은 3:4로 고정된다.
  test("일러스트 프레임은 카드 폭 비례 컨테이너 쿼리 크기(min(8.4375rem,38cqw))를 쓴다", () => {
    const { container } = renderCard({
      id: "svc-11",
      name: "학습진단",
      link: "/services/learning-diagnosis",
      icon_image_url: "/images/landing/services/learning-diagnosis.png",
    });

    // alt=""(장식용 이미지)라 접근성 트리에서 role="img"로 노출되지 않는다 — querySelector로 조회.
    const img = container.querySelector("img");
    const frame = img?.parentElement;
    expect(frame).toHaveClass(
      "aspect-3/4",
      "w-[min(8.4375rem,38cqw)]",
      "shrink-0",
    );
  });
});

describe("ServiceCard variant", () => {
  const service: Service = {
    id: "svc-1",
    name: "학습진단",
    link: "/services/learning-diagnosis",
  };

  test("b2b는 B2B 카드 면과 hover 면 클래스를 쓴다", () => {
    render(
      <MemoryRouter>
        <ServiceCard service={service} variant="b2b" />
      </MemoryRouter>,
    );
    const className = screen.getByRole("link", {
      name: "학습진단 바로가기",
    }).className;
    expect(className).toContain("rounded-b2b-card");
    expect(className).toContain("shadow-card-b2b");
    expect(className).toContain("hover:bg-surface-callout");
    expect(className).toContain("hover:shadow-card-hover");
    expect(className).not.toContain("rounded-[1.55rem]");
  });

  test("variant가 없으면 지금 카드 클래스 그대로다", () => {
    renderCard(service);
    const className = screen.getByRole("link", {
      name: "학습진단 바로가기",
    }).className;
    expect(className).toContain("rounded-[1.55rem]");
    expect(className).toContain("hover:bg-surface-03");
    expect(className).not.toContain("b2b");
  });
});
