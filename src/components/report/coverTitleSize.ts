// 표지 제목 글자 크기 - 수행평가, 심화탐구, 자기평가는 과제물 제목을 쓰고 긴 제목은 크기를 줄여 칸 안에 다 보이게 한다(QA 파일91~95).
// 칸은 폭 83.8cqw, 높이 18.67cqw(표지 높이 141.43cqw 의 13.2%), line-height 1.2 다. 단위는 전부 cqw.
const BOX_WIDTH = 83.8;
const BOX_HEIGHT = 18.67;
const LINE_HEIGHT = 1.2;
// keep-all 줄바꿈으로 줄 끝이 비는 몫
const LINE_FILL = 0.85;
const CANDIDATE_SIZES = [7, 6.2, 5.4, 4.7, 4.1, 3.6, 3.2];
const MIN_SIZE = 3.2;

const UPPERCASE = /[A-Z]/;
const LOWERCASE_OR_DIGIT = /[a-z0-9]/;
const PUNCTUATION = /[()[\]{}<>.,:;!?'"~\-_/&·]/;

// em 단위 글자 폭. 한글 등 전각은 1.0
function charWidth(char: string): number {
  if (char === " ") return 0.3;
  if (UPPERCASE.test(char)) return 0.65;
  if (LOWERCASE_OR_DIGIT.test(char)) return 0.55;
  if (PUNCTUATION.test(char)) return 0.35;
  return 1;
}

function lineWidth(line: string): number {
  return [...line].reduce((sum, char) => sum + charWidth(char), 0);
}

export function coverTitleMaxLines(fontSize: number): number {
  return Math.floor(BOX_HEIGHT / (fontSize * LINE_HEIGHT));
}

export function coverTitleLineCount(title: string, fontSize: number): number {
  const capacity = (BOX_WIDTH / fontSize) * LINE_FILL;
  return title
    .split("\n")
    .reduce(
      (sum, line) => sum + Math.max(1, Math.ceil(lineWidth(line) / capacity)),
      0,
    );
}

export function coverTitleFontSize(title: string): number {
  const fitting = CANDIDATE_SIZES.find(
    (size) => coverTitleLineCount(title, size) <= coverTitleMaxLines(size),
  );
  return fitting ?? MIN_SIZE;
}
