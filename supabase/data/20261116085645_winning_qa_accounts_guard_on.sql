-- 목적: 위닝에듀 QA 계정 5개를 public.qa_accounts 에 등록하고 QA 계정 차단 스위치를 켠다.
--   등록된 계정은 운영에 영향을 주는 동작이 막히고 "QA 계정이라 이 기능은 작동하지 않아요." 가 나온다.
--   서버 쪽 스위치(Vercel winningpage 프로젝트의 QA_ACCOUNT_GUARD_ENABLED)도 같은 날 true 로 바꾸고 다시 배포한다.
--
-- 근거: 2026-11-16 사용자 지시 "위닝에듀도 QA 계정 닫아."
--
-- 대상 DB: Winning prod (ykrpjcsubmbenfcnwlzd) 에만 실행한다.
-- dev(gjowqdiopinhixfivnkx)와 Schoolmentor prod(aalujumpwlnwlemnqrus)에는 실행하지 않는다.
--
-- 멱등: profile_id 가 이미 있으면 넣지 않는다. 스위치가 이미 true 이면 바뀌는 행이 없다. 하드코딩한 uuid 없음. 삭제 없음.

-- 0. 대상 DB 가드. Schoolmentor prod 에서는 멈춘다.
do $$
begin
  if exists (
    select 1 from public.page_contents
     where slug = 'company-intro' and menu_label = '공지-회사소개'
  ) then
    raise exception 'Winning prod 전용 파일입니다. 대상 DB가 맞는지 확인하세요 (Schoolmentor prod 로 보임).';
  end if;
end $$;

-- 1. QA 계정 5개를 등록한다. 자연 키는 이메일이다(본사 관리자 1, 학생 3, 학부모 1).
insert into public.qa_accounts (profile_id)
select p.id
  from public.profiles p
 where p.email in (
         'qa-admin@winning.test',
         'qa-parent@winning.test',
         'qa-student@winning.test',
         'qa-student02@winning.test',
         'qa-student03@winning.test'
       )
on conflict (profile_id) do nothing;

-- 2. 차단 스위치를 켠다.
insert into public.app_settings (key, value)
values ('qa_account_guard_enabled', 'true'::jsonb)
on conflict (key) do update set value = excluded.value
  where public.app_settings.value is distinct from excluded.value;

-- 실행 기록
-- 2026-11-16 Winning prod ykrpjcsubmbenfcnwlzd: 실행 전 qa_accounts 0행, 스위치 없음. 실행 후 5행, 스위치 true. 재실행 변경 없음
-- 2026-11-16 Vercel winningpage 프로젝트: QA_ACCOUNT_GUARD_ENABLED 를 false 에서 true 로 바꾸고(Production, Preview) 운영을 다시 배포함
-- dev, Schoolmentor prod: 실행하지 않음
