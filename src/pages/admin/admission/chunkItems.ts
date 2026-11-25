// `{"items":[` + `]}`: JSON.stringify({ items })가 행 말고 더하는 고정 바이트
const ENVELOPE_BYTES = 12;

const encoder = new TextEncoder();

/**
 * 행을 순서대로 이어 붙여, 각 청크의 JSON.stringify({ items: chunk })가
 * maxBytes(UTF-8)를 넘지 않게 나눈다. 한도를 넘는 한 행은 버리지 않고 혼자
 * 한 청크가 된다(서버나 Vercel이 응답하면 그 행의 오류로 보인다).
 */
export function chunkItemsBySize<T>(items: T[], maxBytes: number): T[][] {
  const chunks: T[][] = [];
  let current: T[] = [];
  let currentBytes = ENVELOPE_BYTES;
  for (const item of items) {
    const itemBytes = encoder.encode(JSON.stringify(item)).length;
    // 청크에 이미 행이 있으면 쉼표 1바이트가 더 붙는다
    const added = current.length === 0 ? itemBytes : itemBytes + 1;
    if (current.length > 0 && currentBytes + added > maxBytes) {
      chunks.push(current);
      current = [item];
      currentBytes = ENVELOPE_BYTES + itemBytes;
    } else {
      current.push(item);
      currentBytes += added;
    }
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}
