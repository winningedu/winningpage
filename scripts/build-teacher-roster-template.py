# Regenerates public/templates/teacher-roster.xlsx (W15 teacher Excel bulk upload template).
#
#   uv run --with openpyxl python scripts/build-teacher-roster-template.py
#
# Sheet "선생님", headers: 선생님 이름 | 전화번호 | 학년 | 그룹 | 반.
# Row 2 is a school example, row 3 an academy example (fake names and numbers only).
# 학년 accepts a list of six values, 반 has no rule (letters and digits), 전화번호 is text so the leading 0 stays.
# Keep the rules in step with judgeRows in api/_lib/console/teacherImport.ts.

from pathlib import Path

from openpyxl import Workbook
from openpyxl.worksheet.datavalidation import DataValidation

OUT = Path(__file__).resolve().parent.parent / "public" / "templates" / "teacher-roster.xlsx"
LAST_ROW = 500
GRADES = ["중1", "중2", "중3", "고1", "고2", "고3"]

wb = Workbook()
ws = wb.active
ws.title = "선생님"
ws.append(["선생님 이름", "전화번호", "학년", "그룹", "반"])
ws.append(["박지훈", "010-1234-5678", "고2", None, 3])
ws.append(["임채원", "010-4321-8765", "고1", "A반", 1])

for row in range(1, LAST_ROW + 1):
    ws.cell(row=row, column=2).number_format = "@"

grade_rule = DataValidation(
    type="list",
    formula1='"' + ",".join(GRADES) + '"',
    allow_blank=True,
    showErrorMessage=True,
    errorTitle="학년",
    error="학년은 중1~고3 중에서 골라 적어요",
)
grade_rule.add(f"C2:C{LAST_ROW}")
ws.add_data_validation(grade_rule)

for col, width in zip("ABCDE", (14, 16, 8, 12, 8)):
    ws.column_dimensions[col].width = width

wb.save(OUT)
print(f"wrote {OUT}")
