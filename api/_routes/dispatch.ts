import type { VercelRequest, VercelResponse } from "@vercel/node";

export type RouteLoader = () => Promise<{
  default: (req: VercelRequest, res: VercelResponse) => unknown;
}>;

// Vercel 은 rewrite 뒤에도 원래 요청 주소를 req.url 에 남긴다.
// 그 경로(`/api/` 접두와 끝 슬래시 제거, 쿼리 제외)가 곧 라우트 키다.
export async function dispatch(
  routes: Record<string, RouteLoader>,
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
  const route = pathname.replace(/^\/api\//, "").replace(/\/+$/, "");
  const load = Object.hasOwn(routes, route) ? routes[route] : undefined;
  if (!load) {
    res.status(404).json({ error: "NOT_FOUND" });
    return;
  }
  const mod = await load();
  await mod.default(req, res);
}
