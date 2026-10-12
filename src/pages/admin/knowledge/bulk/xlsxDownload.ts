// 엑셀 내려받기. 통합 문서를 파일로 만들어 브라우저 다운로드를 띄운다. 파일명은 제목_연월일.xlsx 다.

import * as XLSX from "xlsx";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function triggerXlsxDownload(workbook: XLSX.WorkBook, fileName: string) {
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

export function downloadXlsx(
  workbook: XLSX.WorkBook,
  title: string,
  today: Date,
) {
  triggerXlsxDownload(
    workbook,
    `${title}_${today.getFullYear()}${pad2(today.getMonth() + 1)}${pad2(today.getDate())}.xlsx`,
  );
}
