import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { p16 } from "./laterPagesFixture";
import Page16Services from "./Page16Services";

const mockSite = vi.hoisted(() => ({
  brandName: "TEST",
  features: { callmentor: true },
}));
vi.mock("@/config/site", () => ({ site: mockSite }));

beforeEach(() => {
  mockSite.features.callmentor = true;
});

// Legacy notices of src/lib/diagnosisReport.ts CALLMENTOR_CLOSED_NOTICE (judge R1).
const LEGACY_M3 =
  "중학교 3학년은 목표관리가 추천 대상입니다. 나머지 서비스는 고등학교 활동을 전제로 하므로 진학 이후에 안내드립니다.";
const LEGACY_H3_LATE =
  "고등학교 3학년 6월 이후에는 남은 기간 안에 바로 실행할 수 있는 목표관리를 우선 안내드립니다.";
const withCallCard = (scope: "ALL" | "M3" | "NSU" | "G3LATE") => ({
  ...p16,
  scope,
  services: [
    p16.services[0],
    { ...p16.services[1], code: "CALL" as const, name: "CALL name" },
  ] as typeof p16.services,
});

describe("Page16Services (22 r115-r121)", () => {
  it("renders chips, 2 cards with prefix and tags, scope note, agenda, reading and footer", () => {
    render(<Page16Services page={p16} />);
    for (const t of [
      "P16 title",
      "PREF1",
      "PREF2",
      "SVC name1",
      "SVC name2",
      "RANK1",
      "RANK2",
      "SVC text1",
      "SVC text2",
      "TAG1",
      "TAG2",
      "SCOPE note",
      "AGENDA1",
      "AGENDA2",
      "AGENDA3",
      "READ1",
      "FOOT basis",
      "FOOT limit",
      "16 / 16",
    ]) {
      expect(screen.getByText(t)).toBeInTheDocument();
    }
    expect(screen.getAllByRole("article")).toHaveLength(2);
  });

  it("keeps the callmentor card on sites where callmentor is open", () => {
    render(<Page16Services page={withCallCard("M3")} />);
    expect(screen.getByText("CALL name")).toBeInTheDocument();
    expect(screen.getByText("SCOPE note")).toBeInTheDocument();
  });

  it("drops the callmentor card and shows the legacy M3 notice when callmentor is closed (R1)", () => {
    mockSite.features.callmentor = false;
    render(<Page16Services page={withCallCard("M3")} />);
    expect(screen.queryByText("CALL name")).toBeNull();
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(screen.getByText(LEGACY_M3)).toBeInTheDocument();
    expect(screen.queryByText("SCOPE note")).toBeNull();
  });

  it("shows the legacy H3_LATE notice for the late grade 3 scope when closed", () => {
    mockSite.features.callmentor = false;
    render(<Page16Services page={withCallCard("G3LATE")} />);
    expect(screen.getByText(LEGACY_H3_LATE)).toBeInTheDocument();
  });

  it("shows no notice for the other scopes when closed (legacy had none)", () => {
    mockSite.features.callmentor = false;
    const { scopeNote: _drop, ...rest } = withCallCard("ALL");
    render(<Page16Services page={rest} />);
    expect(screen.queryByText(LEGACY_M3)).toBeNull();
    expect(screen.queryByText(LEGACY_H3_LATE)).toBeNull();
    expect(screen.getAllByRole("article")).toHaveLength(1);
  });

  it("omits the scope note when absent (22 r118)", () => {
    const { scopeNote: _omitted, ...page } = p16;
    render(<Page16Services page={page} />);
    expect(screen.queryByText("SCOPE note")).toBeNull();
  });
});
