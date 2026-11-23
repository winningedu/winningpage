import * as XLSX from "xlsx";

export function pad2(n) {
  return String(n).padStart(2, "0");
}

// 표 단위 xlsx(tableBlockXlsx.js)와 같은 이유로 XLSX.writeFile 대신
// XLSX.write(버퍼만 생성) + 수동 다운로드를 쓴다, writeFile의 Node
// ESM/CJS 환경 감지 불안정 이슈를 겪은 적이 있어(그건 노드 검증
// 스크립트 얘기지만) 프로덕션 경로도 동일 패턴으로 통일해둔다.
export function triggerXlsxDownload(workbook, fileName) {
  const wbout = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  const blob = new Blob([wbout], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
