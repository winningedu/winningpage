// 입결정보 상단 안내 문구(사 #69) - 스쿨멘토만 검색/상세 화면 맨 위에 늘 보인다.
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";

const NOTICE =
  "입결은 지난 입시 결과일 뿐이며 올해 합격을 예측하는 값이 아니에요.";

const siteState = vi.hoisted(() => ({ notice: true }));
vi.mock("@/config/site", () => ({
  site: {
    features: {
      get admissionResultsNotice() {
        return siteState.notice;
      },
    },
  },
}));

vi.mock("./admissionResults/useSusiIndexes", () => ({
  useSusiUniversities: () => ({
    universities: [],
    loading: false,
    error: null,
    retry: () => {},
  }),
  useSusiDepartments: () => ({
    departments: [],
    departmentsKey: "",
    loading: false,
    error: null,
    retry: () => {},
  }),
  useTrendingDepartments: () => ({ trending: [] }),
}));

vi.mock("./admissionResults/DetailView", () => ({
  default: () => <div data-testid="detail-view" />,
}));

const { default: AdmissionResults } = await import("./AdmissionResults");

function renderPage(search = "") {
  return render(
    <MemoryRouter initialEntries={[`/admission/results${search}`]}>
      <AdmissionResults />
    </MemoryRouter>,
  );
}

beforeAll(() => {
  Element.prototype.scrollIntoView = () => {};
});

afterEach(() => {
  siteState.notice = true;
});

describe("AdmissionResults 상단 안내", () => {
  test("스쿨멘토는 조회 전에도 안내 문구를 보여준다", () => {
    renderPage();
    expect(screen.getByRole("note")).toHaveTextContent(NOTICE);
  });

  test("스쿨멘토는 상세 화면에서도 안내 문구를 검색 폼 위에 보여준다", async () => {
    renderPage("?u=A대&d=B학과");
    const note = screen.getByRole("note");
    expect(note).toHaveTextContent(NOTICE);
    expect(note.className).not.toMatch(/sticky|fixed/);
    expect(await screen.findByTestId("detail-view")).toBeInTheDocument();
    const main = note.closest("main");
    expect(main?.firstElementChild).toBe(note);
  });

  test("위닝은 안내 문구를 그리지 않는다", () => {
    siteState.notice = false;
    renderPage();
    expect(screen.queryByText(NOTICE)).toBeNull();
    expect(screen.queryByRole("note")).toBeNull();
  });
});
