-- =====================================================================
-- UTC 전환 U4c-content: increment_board_view 가 보는 사람의 시간대로 하루를 가르는지 검증
--
-- 실행: run-unit-spec.sh scripts/utc-board-view.spec.sql <마이그레이션>
-- 전체가 한 트랜잭션이고 마지막에 ROLLBACK 한다. 단언 실패는 예외로 터진다.
-- =====================================================================
begin;

create function pg_temp.expect_int(t text, got bigint, want bigint) returns void
language plpgsql as $$
begin
  if got is distinct from want then
    raise exception '[FAIL] %: got %, want %', t, got, want;
  end if;
  raise notice '[PASS] % = %', t, want;
end $$;

insert into public.company_news (id, title)
values ('00000000-0000-4000-8000-0000000b0a2d', 'utc board view spec');

-- 같은 방문자(헤더 없음 = 같은 viewer 재료), 같은 시간대, 같은 날: 한 번만 센다.
-- 현지 날짜가 반드시 다른 두 시간대(+14, -12, 26시간 차)로 실행 시각과 무관하게 검증한다.
select pg_temp.expect_int('첫 호출은 1',
  public.increment_board_view('company_news', '00000000-0000-4000-8000-0000000b0a2d', 'Pacific/Kiritimati'), 1);
select pg_temp.expect_int('같은 시간대 같은 날 두 번째는 그대로 1',
  public.increment_board_view('company_news', '00000000-0000-4000-8000-0000000b0a2d', 'Pacific/Kiritimati'), 1);
select pg_temp.expect_int('같은 순간이어도 현지 날짜가 다르면 새로 센다',
  public.increment_board_view('company_news', '00000000-0000-4000-8000-0000000b0a2d', 'Etc/GMT+12'), 2);

-- viewed_on 은 시간대의 현지 날짜다.
select pg_temp.expect_int('Kiritimati 의 viewed_on 은 그 시간대 현지 날짜',
  (select count(*) from public.board_views
    where post_id = '00000000-0000-4000-8000-0000000b0a2d'
      and viewed_on = public.fn_local_date(now(), 'Pacific/Kiritimati')), 1);

-- 모르는 시간대는 거절한다.
do $$
begin
  perform public.increment_board_view('company_news', '00000000-0000-4000-8000-0000000b0a2d', 'KST');
  raise exception '[FAIL] 잘못된 시간대가 통과했다';
exception when sqlstate '22023' then
  raise notice '[PASS] 잘못된 시간대는 22023 으로 거절';
end $$;

-- 옛 시그니처는 사라졌다.
select pg_temp.expect_int('옛 (text, uuid) 시그니처 없음',
  (select count(*) from pg_proc where proname = 'increment_board_view' and pronargs = 2), 0);

rollback;
