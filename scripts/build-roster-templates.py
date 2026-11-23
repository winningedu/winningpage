# Regenerates public/templates/student-roster.xlsx and public/templates/grade-bulk-change.xlsx (W11 student Excel templates).
#
#   uv run --with openpyxl python scripts/build-roster-templates.py
#
# student-roster.xlsx, sheet "양식", headers: 이름 | 학년 | 그룹 | 반 | 번호.
#   Row 2 is a school example, row 3 an academy example with a letter class, row 4 an academy mixed-grade example
#   (fake names only). The 5-column roster reads an empty grade at an academy as 다학년, and the dropdown holds only
#   the six grades, so row 4 leaves the grade empty.
#   학년 accepts a list of six values, 반 is a text cell that must not contain the character 반 (custom formula).
# grade-bulk-change.xlsx, sheet "양식", headers: 이름 | 기존 학년 | 그룹 | 반 | 번호 | 새 학년 | 그룹 | 반 | 번호.
#   Two examples, the second keeps a 다학년 new grade. No validations.
# Keep the rules in step with api/_lib/console/rolloverPreview.ts.

from pathlib import Path

from openpyxl import Workbook
from openpyxl.worksheet.datavalidation import DataValidation

OUT_DIR = Path(__file__).resolve().parent.parent / "public" / "templates"
LAST_ROW = 500
GRADES = ["중1", "중2", "중3", "고1", "고2", "고3"]


def build_roster():
    wb = Workbook()
    ws = wb.active
    ws.title = "양식"
    ws.append(["이름", "학년", "그룹", "반", "번호"])
    ws.append(["홍길동", "고1", "없음", "4", "7"])
    ws.append(["임채원", "고2", "없음", "A", "5"])
    ws.append(["김다학", None, "없음", "B", "3"])

    for row in range(1, LAST_ROW + 1):
        ws.cell(row=row, column=4).number_format = "@"

    grade_rule = DataValidation(
        type="list",
        formula1='"' + ",".join(GRADES) + '"',
        allow_blank=True,
        showErrorMessage=True,
        errorTitle="학년",
        error="학년은 중1~고3 중에서 골라 적어요. 학원의 다학년 반은 비워 두세요",
    )
    grade_rule.add(f"B2:B{LAST_ROW}")
    class_rule = DataValidation(
        type="custom",
        formula1='ISERROR(SEARCH("반",D2))',
        allow_blank=True,
        showErrorMessage=True,
        errorTitle="반",
        error="반 칸에는 '반' 글자 없이 적어 주세요. 예: 1, A",
    )
    class_rule.add(f"D2:D{LAST_ROW}")
    ws.add_data_validation(grade_rule)
    ws.add_data_validation(class_rule)

    for col, width in zip("ABCDE", (14, 10, 10, 8, 8)):
        ws.column_dimensions[col].width = width
    wb.save(OUT_DIR / "student-roster.xlsx")


def build_bulk_change():
    wb = Workbook()
    ws = wb.active
    ws.title = "양식"
    ws.append(["이름", "기존 학년", "그룹", "반", "번호", "새 학년", "그룹", "반", "번호"])
    ws.append(["홍길동", "고1", "없음", "4", "7", "고2", "없음", "3", "8"])
    ws.append(["이다학", "고1", "없음", "A", "5", "다학년", "없음", "A", "5"])
    for col, width in zip("ABCDEFGHI", (14, 12, 10, 8, 8, 12, 10, 8, 8)):
        ws.column_dimensions[col].width = width
    wb.save(OUT_DIR / "grade-bulk-change.xlsx")


build_roster()
build_bulk_change()
print(f"wrote {OUT_DIR}")
