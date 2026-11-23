import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { p10 } from "./laterPagesFixture";
import Page10TempAdmission from "./Page10TempAdmission";

vi.mock("@/config/site", () => ({ site: { brandName: "TEST" } }));

describe("Page10TempAdmission (22 r96-r99)", () => {
  it("renders title, intro, rule texts per area and methods", () => {
    render(<Page10TempAdmission page={p10} />);
    for (const t of [
      "P10 title",
      "ADMIT intro",
      "RULE hs1",
      "RULE hs2",
      "RULE pace",
      "METHOD1",
      "10 / 16",
    ]) {
      expect(screen.getByText(t)).toBeInTheDocument();
    }
  });

  it("heads each area with its name and lists the basis values from the payload (22 r97 D)", () => {
    render(<Page10TempAdmission page={p10} />);
    expect(
      screen.getByRole("heading", { level: 3, name: "AREA hs" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 3, name: "AREA pace" }),
    ).toBeInTheDocument();
    expect(screen.getByText("BASIS a 50")).toBeInTheDocument();
    expect(screen.getByText("BASIS b 75")).toBeInTheDocument();
  });

  it("shows the hidden notice instead of rules when admission is hidden (22 r98)", () => {
    render(
      <Page10TempAdmission
        page={{ ...p10, admission: { kind: "hidden", text: "HIDDEN notice" } }}
      />,
    );
    expect(screen.getByText("HIDDEN notice")).toBeInTheDocument();
    expect(screen.queryByText("RULE hs1")).toBeNull();
    expect(screen.getByText("METHOD1")).toBeInTheDocument();
  });
});
