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

## QA 계정 차단 켜기(운영 전환)

스쿨멘토 QA 기간에는 QA 계정 차단이 꺼져 있다. 운영 전환 때 아래 순서로 켠다. 스위치는 두 곳이고 반드시 함께 바꾼다.
DB 스위치(`app_settings.qa_account_guard_enabled`)는 브라우저 쓰기와 RPC를, 서버 스위치(`QA_ACCOUNT_GUARD_ENABLED`)는 API 라우트를 막는다.
한쪽만 켜면 막히는 범위가 반쪽이다.

1. QA 데이터 초기화 데이터 SQL을 실행한다. QA 계정과 QA 기관, 그 안에서 생긴 데이터만 지우고 약관, 콘텐츠, 설정은 남긴다.
2. QA 계정 15개를 다시 만들고 `qa_accounts`에 등록한다(`20261110050000_schoolmentor_qa_accounts.sql`).
3. `app_settings`의 `qa_account_guard_enabled`를 `true`로 바꾸는 데이터 SQL을 실행한다(행이 없으면 꺼짐).
4. Vercel 스쿨멘토 production 환경 변수 `QA_ACCOUNT_GUARD_ENABLED=true`를 넣고 재배포한다.
5. `qa-admin`으로 저장을 시도해 "QA 계정이라 이 기능은 작동하지 않아요."가 나오는지 확인한다.
