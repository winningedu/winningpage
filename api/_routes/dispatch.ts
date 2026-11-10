import type { VercelRequest, VercelResponse } from "@vercel/node";

export type RouteLoader = () => Promise<{
  default: (req: VercelRequest, res: VercelResponse) => unknown;
}>;

// Vercel 은 rewrite 뒤에도 원래 요청 주소를 req.url 에 남긴다.
// 라우트 키는 정규화 없이 원문 그대로 뽑는다. new URL 로 풀면 `..` 접기, 역슬래시 변환,
// 절대 주소 허용 때문에 `/api/goal/../x` 가 x 핸들러에 닿아 경로 기반 방화벽 규칙을 우회할 수 있다.
// 그래서 빈 구간, `.`, `..`, 역슬래시, `%` 가 있으면 라우트 조회 없이 404 로 거절한다.
const rawRouteKey = (url: string | undefined): string | undefined => {
  const target = (url ?? "").split(/[?#]/)[0];
  if (!target.startsWith("/api/") || /[\\%]/.test(target)) return undefined;
  const key = target.slice("/api/".length).replace(/\/+$/, "");
  const invalid = key
    .split("/")
    .some((segment) => segment === "" || segment === "." || segment === "..");
  return invalid ? undefined : key;
};

export async function dispatch(
  routes: Record<string, RouteLoader>,
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  const route = rawRouteKey(req.url);
  const load =
    route !== undefined && Object.hasOwn(routes, route)
      ? routes[route]
      : undefined;
  if (!load) {
    res.status(404).json({ error: "NOT_FOUND" });
    return;
  }
  const mod = await load();
  await mod.default(req, res);
}
