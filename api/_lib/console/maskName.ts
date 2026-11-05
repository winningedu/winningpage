// 콘솔 이름 가림. 담임 이외 화면과 엑셀 출력에 쓴다(결정 8, 27, 41).
// Figma 프레임 기준으로 성 다음 한 글자만 가리고 나머지는 그대로 둔다("김하늘" 은 "김*늘").

export function maskName(name: string): string {
  const chars = Array.from(name);
  if (chars.length < 2) return name;
  chars[1] = "*";
  return chars.join("");
}
