-- 미배정 목록 "확인 필요" 백필(2026-11-27 고객 요청 "소속코드는 있는데 매칭이 안 된 학생은 모두").
-- 대상 DB: dev, Winning prod, Schoolmentor prod.
--
-- 20261127040809_pool_confirm_needed 는 그 이전 학적을 모두 확인됨(needs_confirm false)으로 두었다.
-- 이 파일은 그중 학생 본인이 마지막으로 반을 정한 학적(가장 최근 적용 이력이 signup 또는 self_assign)을
-- 확인 필요로 되돌린다. 과거 가입 때 명단과 맞았는지는 남아 있지 않아(맞으면 명단 줄이 지워진다) 본인 배치 전부를 대상으로 한다.
-- 교사가 이미 확인한 학적(confirm 이력이 있음)과 교사, 명단, 학년도 전환으로 배치된 학적은 건드리지 않는다.
-- version 을 올려 열려 있는 화면의 오래된 쓰기는 409 로 막는다.
-- 멱등: needs_confirm 이 false 인 행만 바꾸고, 확인된 뒤에는 confirm 이력이 생겨 다시 대상이 되지 않는다.

with last_change as (
  select distinct on (c.student_id, c.school_year) c.student_id, c.school_year, c.kind
    from public.enrollment_changes c
   where c.status = 'applied' and c.kind <> 'confirm'
   order by c.student_id, c.school_year, coalesce(c.decided_at, c.created_at) desc
)
update public.student_enrollments e
   set needs_confirm = true,
       version = e.version + 1,
       updated_at = now()
  from public.tenants t, last_change lc
 where t.id = e.tenant_id
   and e.school_year = t.school_year
   and not t.is_catch_all
   and e.status = 'active'
   and e.class_id is not null
   and not e.needs_confirm
   and lc.student_id = e.student_id
   and lc.school_year = e.school_year
   and lc.kind in ('signup', 'self_assign')
   and not exists (
     select 1 from public.enrollment_changes cc
      where cc.student_id = e.student_id and cc.school_year = e.school_year and cc.kind = 'confirm'
   );

-- 실행 기록(2026-11-27 UTC, 소유자 승인 "확인 필요 ㄱㄱ QA도 포함")
-- 조회: 올해 반 배치 학적 중 마지막 적용 이력이 signup 또는 self_assign 인 학생 수와 needs_confirm 수.
-- dev(gjowqdiopinhixfivnkx): 대상 0명. 실행, 재실행 모두 변경 없음.
-- Winning prod(ykrpjcsubmbenfcnwlzd): 실행 전 본인 배치 1명(위닝대전캠퍼스), needs_confirm 0. 실행 후 needs_confirm 1. 재실행 뒤에도 1(변경 없음).
-- Schoolmentor prod(aalujumpwlnwlemnqrus): 실행 전 본인 배치 1명(QA학원), needs_confirm 0. 실행 후 needs_confirm 1. 재실행 뒤에도 1(변경 없음).
