-- 성장설계 학기 자료 충분도 판정값(No.44 운영 설정값).
-- 0건은 없음, enough 미만은 부족, enough 이상은 있음으로 판정한다.
-- 코드에 폴백 상수를 두지 않으므로 이 행이 없으면 API 가 500 을 낸다.

insert into public.app_settings (key, value)
values ('growth_sufficiency_thresholds', '{"enough": 3}'::jsonb)
on conflict (key) do nothing;
