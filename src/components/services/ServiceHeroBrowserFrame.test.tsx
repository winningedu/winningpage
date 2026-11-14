import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ homeUrl: "https://www.winningedu.com" }));

vi.mock("@/config/site", () => ({
  site: {
    get homeUrl() {
      return state.homeUrl;
    },
  },
}));

import ServiceHeroBrowserFrame from "./ServiceHeroBrowserFrame";

describe("ServiceHeroBrowserFrame 주소창", () => {
  beforeEach(() => {
    state.homeUrl = "https://www.winningedu.com";
  });

  it("위닝은 위닝에듀 주소를 그대로 보인다", () => {
    render(<ServiceHeroBrowserFrame />);
    expect(screen.getByText("https://www.winningedu.com")).toBeInTheDocument();
  });

  it("스쿨멘토는 스쿨멘토 주소를 보이고 위닝 주소는 없다", () => {
    state.homeUrl = "https://www.schoolmentor.kr";
    render(<ServiceHeroBrowserFrame />);
    expect(screen.getByText("https://www.schoolmentor.kr")).toBeInTheDocument();
    expect(screen.queryByText(/winningedu\.com/)).toBeNull();
  });
});
