// 자기평가서 결정론 텍스트 유틸의 클라이언트 사본. 서버 api/_lib/selfeval/text.ts 와 같은 규칙이어야
// 저장 확인 모달의 초기값이 서버 승격(promote.ts)과 어긋나지 않는다. src 는 api 를 import 하지 않는다.
// 서버 규칙이 바뀌면 이 파일도 같이 고친다.

const TERMINATORS = new Set([".", "?", "!"]);
const PAIRED: Record<string, string> = {
  "“": "”",
  "‘": "’",
  "「": "」",
  "『": "』",
};
const TOGGLED = new Set(['"', "'"]);

/** 마침표, 물음표, 느낌표 뒤에 공백이나 끝이 올 때만 경계로 본다. 인용 부호 안은 경계가 아니다. */
export function splitSentences(text: string): string[] {
  const out: string[] = [];
  let buf = "";
  let toggled: string | null = null;
  const closers: string[] = [];
  const chars = [...text];

  const push = (piece: string) => {
    const t = piece.trim();
    if (t !== "") out.push(t);
  };

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i] as string;
    buf += ch;

    if (closers.length > 0) {
      if (ch === closers[closers.length - 1]) closers.pop();
      else if (PAIRED[ch]) closers.push(PAIRED[ch]);
      continue;
    }
    if (toggled !== null) {
      if (ch === toggled) toggled = null;
      continue;
    }
    if (PAIRED[ch]) {
      closers.push(PAIRED[ch]);
      continue;
    }
    if (TOGGLED.has(ch)) {
      toggled = ch;
      continue;
    }
    if (TERMINATORS.has(ch)) {
      const next = chars[i + 1];
      if (next === undefined || /\s/.test(next)) {
        push(buf);
        buf = "";
      }
    }
  }
  push(buf);
  return out;
}

const UNITS =
  "시간|분|초|개월|일|주|달|년|월|개|명|회|건|점|배|번|권|쪽|차례|세트|곳|가지|문항|문제|장|편";
const NUMBER_PATTERN = new RegExp(
  `\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?%?(?:${UNITS})?|\\d+(?:\\.\\d+)?%?(?:${UNITS})?`,
  "g",
);

/** 단위가 붙은 수, 퍼센트, 천단위 쉼표, 소수를 한 토큰으로 잡는다. 중복은 지우지 않는다. */
export function extractNumbers(text: string): string[] {
  return text.match(NUMBER_PATTERN) ?? [];
}

// 길이가 긴 조사부터 맞춰야 "에서" 가 "서" 로 잘못 떨어지지 않는다.
const PARTICLES = [
  "에서",
  "으로",
  "은",
  "는",
  "이",
  "가",
  "을",
  "를",
  "의",
  "에",
  "로",
  "와",
  "과",
  "도",
];

/** 어절 끝의 흔한 조사를 한 번 뗀다. 조사가 없으면 그대로. */
export function stripParticle(word: string): string {
  for (const p of PARTICLES) {
    if (word.endsWith(p)) return word.slice(0, -p.length);
  }
  return word;
}
