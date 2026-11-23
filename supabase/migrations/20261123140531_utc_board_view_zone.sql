-- 게시판 조회수 1일 1회 집계의 하루를 보는 사람의 시간대로 바꾼다.
-- 시그니처가 바뀌므로 옛 (text, uuid) 를 지우고 (text, uuid, text) 를 만든다.
drop function if exists public.increment_board_view(text, uuid);

CREATE OR REPLACE FUNCTION "public"."increment_board_view"("p_source" "text", "p_id" "uuid", "p_tz" "text") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  v_headers    json;
  v_ip         text;
  v_ua         text;
  v_today      date;
  v_viewer_key text;
  v_count      integer;
  v_visible    boolean;
begin
  -- (a) 화이트리스트. 이 검사를 통과하기 전에는 동적 SQL 을 한 글자도
  --     조립하지 않는다. 없으면 anon 이 임의 테이블을 UPDATE 할 수 있다.
  if p_source is null or p_source not in ('company_news', 'notices') then
    raise exception 'increment_board_view: unsupported source %', p_source
      using errcode = '22023';
  end if;

  if p_id is null then
    raise exception 'increment_board_view: p_id is required'
      using errcode = '22023';
  end if;

  -- 하루 1회 집계의 하루는 보는 사람의 시간대 기준이다. 모르는 시간대는 거절한다.
  if not public.fn_is_valid_time_zone(p_tz) then
    raise exception 'increment_board_view: invalid time zone %', p_tz
      using errcode = '22023';
  end if;

  -- (a-2) 대상 글의 존재 + 활성 확인. **반드시 board_views insert 보다 먼저다.**
  --   · 무한 증식 방어: 이 RPC 는 anon 에게 열려 있고 board_views 는 방문마다
  --     행이 늘어난다. 존재 확인을 insert 뒤로 미루면, 존재하지도 않는 uuid 를
  --     반복 호출하는 것만으로 대장이 무한히 부풀 수 있다(그때마다 viewer_key
  --     가 p_id 를 섞어 만들어지므로 PK 충돌조차 나지 않는다). rate limit 도
  --     자동 정리 잡도 없으니, "쓰기 전에 대상부터 확인" 이 유일한 방어선이다.
  --   · 비활성 글 영구 잠금 방어: 확인이 뒤에 있으면 비활성 글 조회 시
  --     board_views 행만 남고 UPDATE 는 coalesce(is_active, true) 조건에 걸려
  --     0행이 된다. 같은 날 관리자가 글을 활성화해도 그 방문자는 이미 대장에
  --     찍혀 있어 재집계되지 않는다. 확인을 앞으로 옮기면 비활성 구간의 호출은
  --     대장에 아무 흔적도 남기지 않으므로, 활성화 직후 정상 집계된다.
  --   · 동적 SQL 은 format('%I') 로 식별자만 넣고 uuid 는 using 바인딩이다
  --     (화이트리스트를 통과한 p_source 외에는 어떤 값도 문자열로 붙이지 않는다).
  --   · 여기서 통과한 뒤 UPDATE 사이에 글이 비활성화되는 경합은 조회수 +1 이
  --     0행이 되는 것뿐이라 무해하다 — 잠그지 않는다.
  execute format(
    'select exists(select 1 from public.%I where id = $1 and coalesce(is_active, true))',
    p_source
  )
     into v_visible
    using p_id;

  if not coalesce(v_visible, false) then
    return 0;
  end if;

  v_today := public.fn_local_date(now(), p_tz);

  -- PostgREST 가 넘겨주는 요청 헤더. HTTP 밖 호출이면 NULL 이다.
  v_headers := nullif(current_setting('request.headers', true), '')::json;

  v_ip := nullif(btrim(split_part(coalesce(v_headers ->> 'x-forwarded-for', ''), ',', 1)), '');
  v_ua := coalesce(v_headers ->> 'user-agent', '');

  -- 원본 IP 는 여기서 즉시 해시로 접히고, 어디에도 저장되지 않는다.
  -- IP 를 못 얻은 경로(SQL Editor 등)는 'unknown' 버킷으로 모인다 —
  -- 그런 호출은 사실상 관리자 수동 호출이므로 하루 1회로 묶여도 무해하다.
  v_viewer_key := md5(
    coalesce(v_ip, 'unknown') || '|' || v_ua || '|' ||
    v_today::text || '|' || p_source || '|' || p_id::text
  );

  insert into public.board_views (source, post_id, viewer_key, viewed_on)
  values (p_source, p_id, v_viewer_key, v_today)
  on conflict do nothing;

  -- on conflict do nothing 으로 아무 행도 안 들어갔으면 오늘 이미 집계된
  -- 방문이다. 증가 없이 현재 값만 돌려준다.
  if not found then
    execute format('select view_count from public.%I where id = $1', p_source)
       into v_count
      using p_id;
    return coalesce(v_count, 0);
  end if;

  execute format(
    'update public.%I set view_count = coalesce(view_count, 0) + 1 '
    ' where id = $1 and coalesce(is_active, true) '
    ' returning view_count',
    p_source
  )
     into v_count
    using p_id;

  return coalesce(v_count, 0);
end;
$_$;

alter function public.increment_board_view(text, uuid, text) owner to postgres;

comment on function public.increment_board_view(text, uuid, text) is '게시판 조회수 +1 (IP+UA 해시 기준 p_tz 달력의 하루 1회). p_source 는 company_news|notices 화이트리스트, p_tz 는 IANA 시간대. 반환값은 반영 후 view_count.';

revoke execute on function public.increment_board_view(text, uuid, text) from public;
grant execute on function public.increment_board_view(text, uuid, text) to anon, authenticated, service_role;
