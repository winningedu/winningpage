import type { VercelRequest, VercelResponse } from "@vercel/node";

export type RouteLoader = () => Promise<{
  default: (req: VercelRequest, res: VercelResponse) => unknown;
}>;

// Vercel 은 rewrite 뒤에도 원래 요청 주소를 req.url 에 남긴다.
// 라우트 키는 정규화 없이 원문 그대로 뽑는다. new URL 로 풀면 `..` 접기, 역슬래시 변환,
// 절대 주소 허용 때문에 `/api/goal/../x` 가 x 핸들러에 닿아 경로 기반 방화벽 규칙을 우회할 수 있다.
// 그래서 빈 구간, `.`, `..`, 역슬래시, `%` 가 있으면 라우트 조회 없이 404 로 거절한다.
const rawRouteKey = (url: string | undefined): string | undefined => {
  const [target = ""] = (url ?? "").split(/[?#]/);
  if (!target.startsWith("/api/") || /[\\%]/.test(target)) return undefined;
  const key = target.slice("/api/".length).replace(/\/+$/, "");
  const invalid = key
    .split("/")
    .some((segment) => segment === "" || segment === "." || segment === "..");
  return invalid ? undefined : key;
};

// 키 구간 [name] 은 요청의 한 구간과 맞고 req.query[name] 이 된다. 값은 섹션 키, id 에 쓰는 문자만 허용한다.
const PARAM_SEGMENT = /^\[([a-zA-Z]+)\]$/;
const PARAM_VALUE = /^[A-Za-z0-9_-]+$/;

type Match = {
  key: string;
  params: Record<string, string>;
  literal: boolean[];
};

const matchPattern = (key: string, parts: string[]): Match | undefined => {
  const keyParts = key.split("/");
  if (keyParts.length !== parts.length) return undefined;
  const params: Record<string, string> = {};
  const literal: boolean[] = [];
  for (const [i, keyPart] of keyParts.entries()) {
    const value = parts[i] as string;
    const name = PARAM_SEGMENT.exec(keyPart)?.[1];
    if (name === undefined) {
      if (keyPart !== value) return undefined;
    } else if (PARAM_VALUE.test(value)) {
      params[name] = value;
    } else {
      return undefined;
    }
    literal.push(name === undefined);
  }
  return { key, params, literal };
};

// 앞 구간부터 비교해 글자 그대로인 쪽이 [param] 보다 구체적이다(구간 수는 같다).
const moreSpecific = (a: Match, b: Match): boolean => {
  for (const [i, isLiteral] of a.literal.entries()) {
    if (isLiteral !== b.literal[i]) return isLiteral;
  }
  return false;
};

const findPattern = (
  routes: Record<string, RouteLoader>,
  route: string,
): Match | undefined => {
  const parts = route.split("/");
  let best: Match | undefined;
  for (const key of Object.keys(routes)) {
    if (!key.includes("[")) continue;
    const match = matchPattern(key, parts);
    if (match && (!best || moreSpecific(match, best))) best = match;
  }
  return best;
};

export async function dispatch(
  routes: Record<string, RouteLoader>,
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  const route = rawRouteKey(req.url);
  let load: RouteLoader | undefined;
  if (route !== undefined && Object.hasOwn(routes, route)) {
    load = routes[route];
  } else if (route !== undefined) {
    const pattern = findPattern(routes, route);
    if (pattern) {
      load = routes[pattern.key];
      // 경로 값이 같은 이름의 쿼리스트링 값을 덮어쓴다(메뉴 권한 키 위조 방지).
      req.query = { ...req.query, ...pattern.params };
    }
  }
  if (!load) {
    res.status(404).json({ error: "NOT_FOUND" });
    return;
  }
  const mod = await load();
  await mod.default(req, res);
}
