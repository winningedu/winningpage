-- 목적: 스쿨멘토 QA 계정 15개를 public.qa_accounts 에 등록한다.
--   등록된 계정은 운영에 영향을 주는 동작이 막히고 "QA 계정이라 이 기능은 작동하지 않아요." 가 나온다.
--
-- 근거: 2026-11-10 사용자 지시 "이 계정들 중, 실제 운영에 영향을 끼치는 건 동작이 안되게 해줘"(결정 114).
--
-- 대상 DB: Schoolmentor prod (aalujumpwlnwlemnqrus) 에만 실행한다. QA 계정이 이 DB에만 있다.
-- dev(gjowqdiopinhixfivnkx)와 Winning prod(ykrpjcsubmbenfcnwlzd)에는 실행하지 않는다.
-- qa_accounts 테이블을 만드는 마이그레이션이 운영에 적용된 뒤에 실행한다.
--
-- 실행 전 조회:
--   select count(*) from public.qa_accounts;
-- 실행 후 확인:
--   같은 조회가 15. 아래 select 의 이메일과 아이디 15개가 모두 들어 있다.
--
-- 멱등: profile_id 가 이미 있으면 넣지 않는다(on conflict do nothing). 하드코딩한 uuid 없음. 삭제 없음.

-- 0. 대상 DB 가드. Schoolmentor prod 만 통과한다.
do $$
begin
  if not exists (
    select 1 from public.page_contents
     where slug = 'company-intro' and menu_label = '공지-회사소개'
  ) then
    raise exception 'Schoolmentor prod 전용 파일입니다. 대상 DB가 맞는지 확인하세요 (company-intro menu_label 이 공지-회사소개 가 아님).';
  end if;
end $$;

-- 1. QA 계정 15개를 등록한다. 자연 키는 이메일(본사, 학생, 학부모)과 로그인 아이디(교사)다.
insert into public.qa_accounts (profile_id)
select p.id
  from public.profiles p
 where p.email in (
         'qa-admin@schoolmentor.test',
         'qa-subadmin@schoolmentor.test',
         'qa-student-g3@schoolmentor.test',
         'qa-student-g1@schoolmentor.test',
         'qa-student-noclass@schoolmentor.test',
         'qa-student-academy@schoolmentor.test',
         'qa-student-etc@schoolmentor.test',
         'qa-parent@schoolmentor.test',
         'qa-parent-pending@schoolmentor.test'
       )
    or p.username in (
         '7ER6DC5RC9K2U4',
         '7ER6DC5R23TBR2',
         '7ER6DC5RMVRBZE',
         '7ER6DC5REVCTYK',
         '2JWX3UD2ER6SNW',
         '2JWX3UD2A4YR3B'
       )
on conflict (profile_id) do nothing;

-- 2. 15개가 아니면 멈춘다(계정 이름이 바뀌었거나 빠진 경우).
do $$
begin
  if (select count(*) from public.qa_accounts) <> 15 then
    raise exception 'qa_accounts 가 15개가 아닙니다. 계정 목록을 확인하세요.';
  end if;
end $$;

-- 실행 기록 (소유자가 실행한 뒤 채운다)
