import tsParser from "@typescript-eslint/parser";
import betterTailwindcss from "eslint-plugin-better-tailwindcss";
import reactHooks from "eslint-plugin-react-hooks";

// 매핑 헬퍼 — variant 접두사($1:hover: 등)는 캡처 그룹으로 보존하고, 값만
// 토큰으로 치환한다. `pattern`은 클래스 청크 전체(변형 접두사 포함)에 매칭된다.
const VARIANT_PREFIX = "([a-zA-Z0-9:/_\\-\\[\\]]*:)?";
function exactMapping(rawValue, rawPx, token) {
  const escaped = rawValue.replace(/\./g, "\\.");
  return {
    pattern: `^${VARIANT_PREFIX}text-\\[(?:${escaped}|${rawPx}px)\\]$`,
    fix: `$1text-${token}`,
    message: `원시 글자 크기 "${rawValue}"(${rawPx}px)는 공유 타입 스케일 토큰 "text-${token}"로 통일해야 한다.`,
  };
}
function outOfScaleWarning(rawValue, rawPx, guidance) {
  return {
    pattern: `^${VARIANT_PREFIX}text-\\[${rawValue.replace(/\./g, "\\.")}\\]$`,
    message: `원시 글자 크기 "${rawValue}"(${rawPx}px)는 타입 스케일 밖 값이다. ${guidance} 중 하나로 수동 매핑할 것.`,
  };
}

// React Compiler 규칙 검증 전용 — Biome이 이미 포맷/기본 린트를 담당하므로 이 설정은
// eslint-plugin-react-hooks(react-compiler 규칙 포함) 하나만 스코프로 좁힌다.
// @typescript-eslint/parser는 규칙 플러그인이 아니라 TS/TSX 구문을 읽기 위한 파서 의존성이다.
export default [
  {
    files: ["src/**/*.{js,jsx,ts,tsx}"],
    ...reactHooks.configs.flat["recommended-latest"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
  },
  // 인앱 화면(목표관리·수행평가·앱 셸)의 원시 글자 크기를 공유 타입 스케일
  // 토큰(src/index.css `@theme`의 `--text-app-*`, src/lib/utils.ts
  // APP_TEXT_SCALE)으로 강제한다. `no-restricted-classes`는 클래스 문자열에
  // 대한 순수 정규식 매칭이라 tailwind 설정 해석이 필요 없다 — 확인 완료,
  // 별도 `entryPoint` settings 불필요.
  {
    files: [
      "src/components/performance/**/*.{ts,tsx}",
      "src/components/goal/**/*.{ts,tsx}",
      "src/components/app-shell/**/*.{ts,tsx}",
      "src/pages/performance/**/*.{ts,tsx}",
      "src/pages/goal/**/*.{ts,tsx}",
    ],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      "better-tailwindcss": betterTailwindcss,
    },
    rules: {
      "better-tailwindcss/no-restricted-classes": [
        "error",
        {
          restrict: [
            exactMapping("0.75rem", 12, "app-caption"),
            exactMapping("0.8125rem", 13, "app-label"),
            exactMapping("0.9375rem", 15, "app-body"),
            exactMapping("1rem", 16, "app-card-title"),
            exactMapping("1.25rem", 20, "app-section"),
            exactMapping("1.5rem", 24, "app-stat"),
            exactMapping("1.75rem", 28, "app-title"),
            exactMapping("0.6875rem", 11, "app-badge"),
            outOfScaleWarning(
              "0.875rem",
              14,
              "text-app-body(0.9375rem)/text-app-label(0.8125rem)",
            ),
            outOfScaleWarning(
              "1.125rem",
              18,
              "text-app-section(1.25rem)/text-app-card-title(1rem)",
            ),
          ],
        },
      ],
    },
  },
];
