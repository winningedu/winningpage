// 발급 계정 안내 파일(교 #125). 임시 비밀번호는 화면에 보이지 않고 이 파일로만 한 번 내려받는다.
// 저장하거나 서버로 보내지 않는다. 엑셀 라이브러리는 내려받을 때만 불러온다.

export interface IssuedRow {
  name: string;
  phoneLast4: string;
  /** 학년, 반이 없는 교사는 빈 값. */
  grade: string;
  className: string;
  loginId: string;
  tempPassword: string;
}

const HEADER = [
  "이름",
  "전화번호 뒷 4자리",
  "학년",
  "반",
  "아이디",
  "임시 비밀번호",
];
const XLSX_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export function issuedSheet(rows: IssuedRow[]): string[][] {
  return [
    HEADER,
    ...rows.map((r) => [
      r.name,
      r.phoneLast4,
      r.grade,
      r.className,
      r.loginId,
      r.tempPassword,
    ]),
  ];
}

const REVOKE_DELAY_MS = 60_000;

export async function downloadIssuedFile(rows: IssuedRow[]): Promise<void> {
  const XLSX = await import("xlsx");
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    book,
    XLSX.utils.aoa_to_sheet(issuedSheet(rows)),
    "발급 계정",
  );
  const bytes = XLSX.write(book, { type: "array", bookType: "xlsx" });
  const url = URL.createObjectURL(new Blob([bytes], { type: XLSX_TYPE }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "교사 계정 안내.xlsx";
  link.click();
  // 하나뿐인 임시 비밀번호 파일이라 click 직후에 풀면 내려받기가 끊길 수 있다. 시작할 시간을 둔다.
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}
