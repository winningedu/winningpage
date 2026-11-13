import { describe, expect, test } from "vitest";
import {
  formatDuration,
  pickHomeColumns,
  toHomeColumnBox,
} from "./homeColumns";

const row = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  title: `글 ${id}`,
  created_at: "2026-10-01T00:00:00.000Z",
  ...extra,
});

describe("pickHomeColumns", () => {
  test("교육청소식 카테고리 글은 빼고 추천 먼저, 그다음 최신순으로 4건만 남긴다", () => {
    const rows = [
      row("a", { created_at: "2026-10-01T00:00:00.000Z" }),
      row("b", { created_at: "2026-10-05T00:00:00.000Z" }),
      row("c", { category: "교육청소식", is_featured: true }),
      row("d", { created_at: "2026-10-03T00:00:00.000Z", is_featured: true }),
      row("e", {
        created_at: "2026-10-02T00:00:00.000Z",
        category: "교육칼럼",
      }),
      row("f", { created_at: "2026-09-01T00:00:00.000Z" }),
    ];
    expect(pickHomeColumns(rows).map((r) => r.id)).toEqual([
      "d",
      "b",
      "e",
      "a",
    ]);
  });
});

describe("formatDuration", () => {
  test("초를 mm:ss로 바꾸고 값이 없거나 0 이하이면 null", () => {
    expect(formatDuration(760)).toBe("12:40");
    expect(formatDuration(902)).toBe("15:02");
    expect(formatDuration(5)).toBe("00:05");
    expect(formatDuration(null)).toBeNull();
    expect(formatDuration(0)).toBeNull();
  });
});

describe("toHomeColumnBox", () => {
  test("유튜브 링크는 영상 박스로 만들고 썸네일이 없으면 유튜브 기본 썸네일을 쓴다", () => {
    expect(
      toHomeColumnBox(
        row("v", {
          link_url: "https://youtu.be/abcDEF12345",
          video_duration_seconds: 760,
        }),
      ),
    ).toEqual({
      id: "v",
      kind: "video",
      title: "글 v",
      date: "2026.10.01",
      thumbnailUrl: "https://i.ytimg.com/vi/abcDEF12345/hqdefault.jpg",
      videoId: "abcDEF12345",
      durationLabel: "12:40",
    });
  });

  test("일반 글은 칼럼 박스이고 등록한 썸네일을 쓰며 없으면 썸네일 없음", () => {
    expect(
      toHomeColumnBox(row("c", { image_url: "https://img/x.png" })),
    ).toEqual({
      id: "c",
      kind: "column",
      title: "글 c",
      date: "2026.10.01",
      thumbnailUrl: "https://img/x.png",
    });
    expect(toHomeColumnBox(row("n")).thumbnailUrl).toBeUndefined();
  });

  test("재생 시간 칸이 비어 있으면 시간 표시를 만들지 않는다", () => {
    const box = toHomeColumnBox(
      row("v", { link_url: "https://youtu.be/abcDEF12345" }),
    );
    expect(box).not.toHaveProperty("durationLabel");
  });

  test("글의 카테고리를 박스에 싣고 없으면 싣지 않는다", () => {
    expect(toHomeColumnBox(row("k", { category: "교육칼럼" })).category).toBe(
      "교육칼럼",
    );
    expect(toHomeColumnBox(row("n"))).not.toHaveProperty("category");
  });
});
