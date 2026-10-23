# supabase/ DB 마이그레이션 체계

마이그레이션은 스키마만 담는다. 데이터 변경은 마이그레이션이 아니라 `supabase/data/`의 SQL로
수행한다([data/README.md](data/README.md)). 추적은 supabase CLI가
`supabase_migrations.schema_migrations`로 전담한다.

2026-10-23에 이력 마이그레이션 122개를 스키마 전용 baseline 한 파일
`20261021014317_busan_oct_extension_goal_gift.sql`로 스쿼시했다. 원격 DB 3곳이 이미 이 버전을
기록하고 있어 파일명은 유지했다. 이전 파일은 git 이력에 남아 있고, 원격 이력은 이 단일 버전으로
정리했다.

## 구조

| 경로 | 역할 |
|---|---|
| `config.toml` | 로컬 Docker 스택 설정 (PG 17, 포트 54321/54322). storage 버킷 선언 포함, `[db.seed]` 비활성 |
| `migrations/` | 스키마 전용 baseline. 새 변경은 타임스탬프 마이그레이션으로 추가 |
| `data/` | 수동 실행 데이터 SQL과 실행 기록 |

마이그레이션에 담는 것: 테이블, 컬럼, 제약, 인덱스, 함수, 트리거, RLS 정책, grant, storage 정책.
데이터 문(최상위 `INSERT`/`UPDATE`/`DELETE`/`TRUNCATE`/`MERGE`/`COPY`, `DO` 블록 안 포함)은 넣지 않는다.
CI의 `scripts/check-migration-data-inserts.mjs`가 이를 차단한다.

## 개발 흐름

```bash
# 로컬 스택 (Docker 필요)
supabase start            # 첫 기동 시 이미지 다운로드

# 로컬 DB를 dev와 정합시키기: reset(스키마 baseline만 재생) 후 dev 데이터 주입
npm run db:reseed

# 개별 실행이 필요하면
supabase db reset                # 마이그레이션만 재생 (seed.sql 없음)
node scripts/seed-from-dev.mjs   # dev에서 데이터 복사(커밋 안 함)

# 새 마이그레이션
supabase migration new <설명>    # migrations/에 타임스탬프 파일 생성
supabase db reset                # 로컬에서 재생 검증
```

### 마이그레이션 파일명 규칙 (CI `Check new migration timestamps` 강제)

- 파일명은 **반드시 `supabase migration new <설명>`으로 생성**: 접두사는 실제 생성 시각(UTC, `YYYYMMDDHHMMSS`).
  손으로 번호를 매기지 말 것. 특히 **미래 날짜나 `000000` 같은 가짜 시각 금지**.
- 새 파일의 타임스탬프는 베이스 브랜치의 마지막 마이그레이션보다 커야 한다. 베이스가 앞서갔으면
  베이스 최신화 후 파일을 다시 생성(내용 복사)한다.
- 왜: 2026-08-24에 한 브랜치가 다음 날 접두사(`20260825…`)를 먼저 적용시키자, 같은 날 다른 브랜치의
  정상 번호(`20260824000007/8`)가 원격 마지막 버전보다 작아져 `supabase db push`가 거부했고 이후
  모든 push가 연쇄 실패했다. push 워크플로는 이제 `--include-all`로 순서 역전도 적용하지만,
  파일명은 여전히 생성 시각과 일치시켜 재발을 막는다.

`db:reseed`가 dev에서 복사하는 범위:

- 유저 비연관 테이블 전체
- QA 계정(이메일이 `@winning.test`로 끝남)의 로그인 행, profiles, admin_members, 유효한
  program_access_grants(주문 연결은 null 처리), 양쪽이 모두 QA인 parent_child_links

운영 시드 파일은 보관하지 않는다. 새 환경이 필요하면 그 시점에 원본 DB에서 덤프한다.

## 반영 경로 (수동 `supabase db push`와 SQL Editor 실행 금지)

- PR: `db-migrations-ci.yml`이 로컬 스택 전체 재생 리허설 (`rehearse-migrations` check)
- dev 브랜치 push: `db-push-dev.yml`이 dev DB에 `supabase db push --include-all`
- main 브랜치 push: `db-push-prod.yml`(Winning)과 `db-push-prod-schoolmentor.yml`(Schoolmentor)이 각 prod DB에 `supabase db push --include-all`
- 필요 secrets: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD_DEV`, `SUPABASE_DB_PASSWORD_PROD` (등록 완료)

앱 배포(Vercel)와 DB push는 같은 push 이벤트에 병렬로 돌므로, 파괴적 변경(컬럼 삭제나 
rename)은 expand-contract 2단계로 나눠서 이전 코드가 새 스키마와 공존하게 할 것.

## 주의

- 원격 `supabase db dump`는 storage 스키마 정책을 포함하지 않는다. `storage.objects` 정책 6개는
  세 DB 모두 baseline과 일치한다.
- 시드 화이트리스트(`scripts/seed-from-dev.mjs`)에 유저 데이터 테이블 추가 금지. 예외는 위의
  QA 계정 범위뿐이다.
- `db:reseed`의 dev 접속 정보는 **`.env.seed.local`**(gitignore됨)에 둔다.
  `SUPABASE_URL=https://<dev>.supabase.co`와 `SUPABASE_SERVICE_ROLE_KEY=<dev service key>`
  두 줄. 이 파일이 없으면 `.env.local`을 읽는데, 기본 상태(로컬 블록 활성)에서는
  안전 가드에 걸려 시드가 중단된다.
- **로컬 스택은 워크트리별로 격리되지 않는 공유 자원**이다. `supabase db reset`(=
  `db:reseed`의 첫 단계)은 다른 워크트리나 세션이 로컬 DB에 만들어 둔 데이터까지 전부
  지운다. 병렬 작업 중에는 실행 전에 반드시 확인할 것.

## 알려진 드리프트 (2026-10-23 스쿼시 시점)

- `auth.users` 트리거 2종(`on_auth_user_created`, `on_auth_user_created_coupon_grant`)은 dev에만
  있고 마이그레이션에는 없다. Winning prod와 Schoolmentor prod에는 없다.
- Winning prod는 `fn_parent_create_enrollment`, `fn_respond_enrollment`의 EXECUTE grant가
  anon과 service_role에 없다. Schoolmentor prod는 baseline과 일치한다. dev는 baseline에 있는
  anon/authenticated grant 약 60개가 없다.
- grant 드리프트 해소 방식은 소유자 결정 대기 중이다.
