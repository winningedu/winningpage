# supabase/data/ 데이터 SQL

데이터 변경(상품명, 가격, 참조 행, 백필, grant, 모든 행 값)은 마이그레이션이 아니다.
마이그레이션은 스키마만 담는다. 데이터는 이 폴더의 SQL 파일로 수동 실행한다.
`scripts/` 아래의 기존 데이터 SQL(예: `scripts/busan-oct-goal-gift-data.sql`)은 그 자리에 둔다.

## 대상 DB

| 이름 | project ref |
|---|---|
| dev | `gjowqdiopinhixfivnkx` |
| Winning prod | `ykrpjcsubmbenfcnwlzd` |
| Schoolmentor prod | `aalujumpwlnwlemnqrus` |

## 파일 규칙

- 파일명은 `<YYYYMMDDHHMMSS>_<설명>.sql`.
- 파일 머리 주석에 목적과 대상 DB를 적는다.
- 문장은 멱등이어야 한다. 가드를 걸어 다시 실행해도 아무것도 바뀌지 않게 한다.
- 행은 자연 키(slug, code, key)로 지정한다. 하드코딩한 uuid는 쓰지 않는다.
- FK로 참조되는 행은 삭제하지 않는다.

## 실행 절차

1. SQL 파일을 작성하고 대상 DB와 SQL을 소유자에게 보고해 승인을 받는다.
2. 실행 전 값을 조회해 기록한다.
3. dev에서 먼저 실행한다.

   ```bash
   supabase db query --linked --project-ref <ref> -f supabase/data/<file>
   ```

4. 실행 후 값을 조회해 기록한다.
5. 같은 파일을 다시 실행해 변경이 없음을 확인한다.
6. dev 검증 후 같은 절차로 prod에 실행한다.
7. 파일 맨 아래에 실행 기록(날짜, 대상 DB, 전후 행 수)을 주석 블록으로 덧붙이고 PR로 커밋한다.
