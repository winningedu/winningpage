-- 목적: 위닝 학생 중 소속(profiles.tenant_id)은 있는데 올해 학적(student_enrollments)이 없는 학생에게 학급 없는 학적을 만들기
--   20261118090341_winning_enrollment_on_tenant_join.sql 마이그레이션은 앞으로의 가입, 소속 코드 입력, 어드민 소속 지정만 처리한다.
--   그 전에 소속을 가진 학생은 스쿨멘토 선생님 화면이 읽는 student_enrollments 에 행이 없어 보이지 않는다.
--   학적은 fn_enrollment_join 으로 만든다(학급과 번호 없음, enrollment_changes 에 signup 이력이 같이 남는다).
--   학년은 student_profiles.grade 가 중1~고3 일 때만 쓰고, 아니면 null 이다.
--   올해는 그 학생 소속 기관의 school_year 다. 같은 학년도 학적이 어느 기관에든 이미 있으면 건드리지 않아 다시 돌려도 늘지 않는다.
--
-- 대상 DB: dev (gjowqdiopinhixfivnkx), Winning prod (ykrpjcsubmbenfcnwlzd). dev 먼저, prod 는 소유자 승인 후 수동으로 실행한다.
--   Schoolmentor prod (aalujumpwlnwlemnqrus) 는 가입 때부터 학적이 있어 대상이 아니다.
--   app_settings.site_key 가 "winning" 일 때만 행을 만든다. 다른 값이거나 키가 없으면 notice 만 남기고 아무것도 만들지 않는다.
--   그래서 20261118182917_app_settings_site_key.sql 을 대상 DB 에 먼저 실행해 site_key 를 심은 뒤에 이 파일을 실행한다.
-- 전제: 20261118090341_winning_enrollment_on_tenant_join.sql 이 먼저 적용되어 있어야 한다(WC100 과 같은 학적 규칙).

begin;

-- 1) 실행 전 확인 (읽기 전용): 소속 있는 학생 수 / 올해 학적이 없는 수
select count(*) as tenant_students,
       count(*) filter (where not exists (
         select 1 from public.student_enrollments e
          where e.student_id = pr.id and e.school_year = t.school_year
       )) as missing_enrollments
  from public.profiles pr
  join public.tenants t on t.id = pr.tenant_id
 where pr.member_type = 'student';

-- 2) 백필
do $$
declare
  r record;
  v_site_key text;
begin
  select (s.value #>> '{}') into v_site_key from public.app_settings s where s.key = 'site_key';
  if v_site_key is distinct from 'winning' then
    raise notice 'site_key 가 winning 이 아니라서(현재: %) 학적을 만들지 않고 건너뛴다. 0건 생성.', coalesce(v_site_key, '없음');
    return;
  end if;

  for r in
    select pr.id as student_id,
           pr.tenant_id,
           case when sp.grade = any (array['중1', '중2', '중3', '고1', '고2', '고3']) then sp.grade end as grade
      from public.profiles pr
      join public.tenants t on t.id = pr.tenant_id
      left join public.student_profiles sp on sp.profile_id = pr.id
     where pr.member_type = 'student'
       and not exists (
         select 1 from public.student_enrollments e
          where e.student_id = pr.id and e.school_year = t.school_year
       )
     order by pr.id
  loop
    perform public.fn_enrollment_join(r.student_id, r.tenant_id, r.grade, null, null, null);
  end loop;
end $$;

-- 3) 실행 후 확인 (읽기 전용): 올해 학적이 없는 수가 0이어야 한다
select count(*) as tenant_students,
       count(*) filter (where not exists (
         select 1 from public.student_enrollments e
          where e.student_id = pr.id and e.school_year = t.school_year
       )) as missing_enrollments
  from public.profiles pr
  join public.tenants t on t.id = pr.tenant_id
 where pr.member_type = 'student';

commit;

-- 실행 기록
-- 2026-11-19 dev(gjowqdiopinhixfivnkx): 실행 뒤 소속 학생 6명, 올해 학적 없는 학생 0명. 학적 6건 생성(학년 없음 3건).
-- 2026-11-19 Winning prod(ykrpjcsubmbenfcnwlzd): main 배포(PR #437)와 마이그레이션 20261118090341 적용 확인 뒤 실행. 실행 전 소속 학생 14명 중 학적 없는 학생 14명, 실행 뒤 0명. 학적 14건 생성(학년 있음 1건), enrollment_changes signup 14건.
