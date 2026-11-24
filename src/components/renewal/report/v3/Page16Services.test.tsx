import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { p16 } from "./laterPagesFixture";
import Page16Services from "./Page16Services";
import { SERVICE_LABELS as SL } from "./parts/labels";

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
const CLOSED_NSU =
  "재수\u00b7반수 과정에서는 목표관리가 추천 대상입니다. 나머지 서비스는 재학 중 활동을 전제로 하므로 안내에서 제외했습니다.";
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
      "P16 lead",
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

  it("heads the preference chips, the agenda and the reading notes like PDF p17", () => {
    render(<Page16Services page={p16} />);
    for (const [heading, item] of [
      [SL.preferences, "PREF1"],
      [SL.agenda, "AGENDA1"],
      [SL.reading, "READ1"],
    ]) {
      const section = screen.getByText(heading as string).closest("section");
      expect(section).toHaveTextContent(item as string);
    }
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

  it("shows the closed-site N수 notice without a callmentor mention", () => {
    mockSite.features.callmentor = false;
    render(<Page16Services page={withCallCard("NSU")} />);
    expect(screen.getByText(CLOSED_NSU)).toBeInTheDocument();
    expect(screen.queryByText("SCOPE note")).toBeNull();
  });

  it("shows the scope notice for a single-card page on a closed site", () => {
    mockSite.features.callmentor = false;
    const single = {
      ...p16,
      scope: "G3LATE" as const,
      services: [p16.services[0]] as unknown as typeof p16.services,
    };
    render(<Page16Services page={single} />);
    expect(screen.getAllByRole("article")).toHaveLength(1);
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
