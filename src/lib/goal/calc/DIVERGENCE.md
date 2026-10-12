# 이탈 원장 (Divergence Ledger)

`src/lib/goal/calc/` 는 외부 target 앱(`api/student.mjs`, `IntakeForm.tsx`, `App.tsx`)의
확률·게이지 계산을 파리티 목적으로 이식한 것이다. 이식 원칙은 "원본 동작을 그대로
재현한다 — 버그로 보여도 고치지 않고 `NOTE(target-parity)` 주석만 단다"였다.

**이 문서에 없는 차이는 버그다.** 파리티 프로젝트의 확립된 관행을 따른다(PyPy
`cpython_differences.rst`: *"we do not want to copy bugs"* + *"Differences that are not
listed here should be considered bugs"*). 계산 모듈과 원본이 다르게 동작하는 지점은
전부 여기 등재돼야 한다 — 코드에 `NOTE(target-parity)`로만 표시돼 있고 여기 없다면
그 자체가 원장의 결함이다.

각 항목: 원본 위치 → 원본 동작 → 우리 동작 → 이탈 이유 → 영향 범위 → 상태
(**수정함** / **의도적 유지** / **미판단**).

---

## 1. 수정한 이탈

### #1 고1 무내신 → `remainNaesin` 이 오버라이드를 무시하고 강제 0

- **원본 위치**: `student.mjs:2448-2450` (target 앱), 이식: `pipeline.js:219-221` (수정 전)
- **원본 동작**: `isPreHighStudent(schoolType, grade)` 이면 `remainNaesin` 을 조건 삼항으로
  무조건 0 으로 만든다. 호출자가 `data.remainingNaesin` 을 아무리 넘겨도 무시된다.
  원본 자체가 이 문제를 안고 있었다 — `IntakeForm.tsx:1268-1269` 의 `grade !== '고1'`
  가드 때문에 원본 클라이언트도 고1 에는 애초에 오버라이드를 넘기지 않는다(고2·고3
  만 `getNaesinNoneRemaining` 값을 보낸다). 즉 원본 서버·클라이언트 양쪽이 "고1은
  remainNaesin 오버라이드가 통하지 않는다"는 전제로 맞춰져 있었다.
- **우리 동작(수정 전)**: 원본을 그대로 이식 — `getRemainingNaesin` 의 계약
  ("fallback 이 주어지면 최우선으로 쓴다", `primitives.js:50`)과 호출부가 내부적으로
  모순됐다. 무내신 고1 학생이 `remainNaesin=0` 을 받으면 `calcNaesinProb`
  (`primitives.js:130-132`)이 `remainExams<=0` 일 때 시간 할인 계수를 건너뛰고 원값을
  낸다("성적 확정" 의미) — 불확실성이 가장 큰 학생이 확정 취급을 받아 실제로 내신을
  본 학생보다 더 높은 확률을 받는 결함으로 이어졌다.
- **우리 동작(수정 후)**: `isPreHighStudent(schoolType, grade) && remainingNaesin == null`
  일 때만 0 으로 강제한다. 오버라이드가 명시적으로 있으면 `getRemainingNaesin` 이
  받아서 그대로 쓴다.
- **이탈 이유**: 사용자 승인. `primitives.js:50` 이 선언한 계약과 정면 모순되는 자기
  모순이었고, 원본 고2·고3 에는 이미 있는 "직전 학년 마지막 시험 기준" 규칙
  (`IntakeForm.tsx:514-518` `getNaesinNoneRemaining`)을 고1 에도 같은 방식으로
  적용하는 것이 계약과 일관된다.
- **영향 범위**: `isPreHighStudent` 이고 `remainingNaesin` 오버라이드를 명시적으로
  주는 호출자만. 기존 203개 골든 테스트는 이 오버라이드를 넘기는 픽스처가 0건이라
  전부 그대로 통과한다(직접 grep 확인). `api/goal/intake.js` 의 `NAESIN_NONE_REMAINING`
  표가 고1 을 추가로 채워 이 경로를 처음 실사용한다.
- **상태**: **수정함** (`pipeline.js:219-237`, 2026-08-12)

### #2 고1 무모의 → `remainMogo` 가 0 (호출부의 오버라이드 표 누락)

- **원본 위치**: `IntakeForm.tsx:1268-1269` `getMogoNoneRemaining` — 고2·고3 만
  오버라이드를 보낸다(고1 항목 자체가 원본에 없다, 정시 UI 가 원본에서 가상 3회차
  입력을 받는 별도 방식이라 이 오버라이드 경로를 안 탄다).
- **원본 동작**: 해당 없음(원본은 이 조합에서 고1 을 다루지 않는다).
- **우리 동작(수정 전)**: `pipeline.js` 의 `getRemainingMogo` 자체에는
  `isPreHighStudent` 가드가 없다(오버라이드를 처음부터 존중했다). 문제는 호출부
  `api/goal/intake.js` 의 `MOGO_NONE_REMAINING` 표에 고1 키가 없어 `?? null` 로
  `remainingMogo=null` 이 되고, `getRemainingMogo(grade, lastMogo='', null)` 이
  `${grade}_` 키로 표를 조회해 미매칭 → 0 이 됐다(실제 잔여는 14).
- **우리 동작(수정 후)**: `MOGO_NONE_REMAINING` 에 `고1: 14`(총량 그대로 — "작년
  모의고사"가 아예 없으므로) 를 추가해 오버라이드가 전달되게 했다.
- **이탈 이유**: 엔진(`pipeline.js`) 은 처음부터 문제가 없었다 — 이건 원본과의
  이탈이 아니라 **우리 쪽 호출부(intake.js)의 데이터 누락 버그**였다. 그래도 팀장
  지시에 따라 "같은 성질의 결함"으로 등재한다.
- **영향 범위**: `input.mockAllNone` 이고 `inputGrade === '고1'` 인 온보딩 요청의
  `remain_mogo` 저장값. `currentMogo` 가 0 이라 정시 확률 자체에는 영향이 없다
  (게이트에서 0 으로 걸림, `pipeline.js:227-228`) — 저장값 정확성만의 문제였다.
- **상태**: **수정함** (`api/goal/intake.js` `MOGO_NONE_REMAINING`, 2026-08-12)

### #3 고1 내신전무 + 모의는 있음 → `'중3_10모'` 키 미매칭으로 `remainMogo` 0

- **원본 위치**: `primitives.js` `getRemainingMogo` 표(88-103행) — `'중3_*'` 키가
  없다. 이 조합 자체가 원본에는 없는 케이스다(원본은 고1+내신전무 자체를 '중3'
  으로 치환하는 우리식 특례가 없다).
- **원본 동작**: 해당 없음.
- **우리 동작(수정 전)**: `intake.js` 가 고1+내신전무를 `grade='중3'` 으로 치환한
  뒤 실제 모의고사 라벨(`'10모'` 등)로 `getRemainingMogo('중3', '10모', ...)` 를
  조회 → `'중3_10모'` 가 표에 없어 미매칭 → 0. 모의고사를 10회나 남긴 학생의
  잔여 회차가 0 으로 떨어졌다.
- **우리 동작(수정 후)**: `isMiddleSubstituted` 분기에서 치환 **전** 학년
  (`inputGrade`, 즉 `'고1'`)으로 같은 엔진 함수(`getRemainingMogo`)를 호출해 값을
  만들어 오버라이드로 넘긴다(`api/goal/intake.js:649-653`). 표를 베껴 쓰지 않고
  같은 함수를 재사용한다.
- **이탈 이유**: `primitives.js` 의 표 자체는 원본 그대로 유지한다(손대지 않음,
  `NOTE(target-parity)` 대상) — 호출부에서 조회 학년을 우회해 미매칭을 피했다.
  "새로 여는 문(고1+내신전무+모의있음 경로는 이전엔 400 으로 막혀 있었다) 뒤에
  알려진 오작동을 두지 않는다"는 원칙에 따른 수정.
- **영향 범위**: 고1 + 내신 전 회차 없음 + 모의고사는 실제로 봄, 조합 하나.
- **상태**: **수정함** (`api/goal/intake.js`, `c37ac77`, 2026-08-11)

### #4 `'중3'` 학년 치환 리터럴이 DB 저장값으로 새어나감

- **원본 위치**: 해당 없음(우리 구현 전용 특례 — 원본에는 이 치환 개념 자체가
  없다).
- **원본 동작**: N/A.
- **우리 동작(수정 전)**: `api/goal/intake.js` 의 `grade`(엔진 호출용 치환값
  `'중3'`)를 그대로 `goal_students.grade` 행에 저장했다 — 고1 학생이 화면에
  "중3"으로 표시됐다.
- **우리 동작(수정 후)**: DB 에는 `inputGrade`(학생이 실제로 고른 `'고1'`)를
  저장한다. 엔진 호출에는 여전히 `'중3'` 을 쓴다(변환등급표 종류·+0.10 페널티·
  이번에 고친 `remainNaesin` 오버라이드 우선순위, 세 가지 모두에 필요하다).
- **이탈 이유**: 이건 원본과의 "이탈"이 아니라 **우리 쪽 데이터 무결성 버그**다
  (엔진 내부용 리터럴이 실수로 영속 계층까지 새어나갔다). 그래도 팀장 지시에 따라
  같은 계열의 결함으로 등재하고 분류를 명시한다.
- **영향 범위**: `goal_students.grade` 컬럼 값 하나. 소비처는
  `api/_lib/goal/repo.ts:315` `buildStudentPayload` 의 `profile.grade`(표시용) 가
  유일하다(grep 재확인 — 계산 로직 소비처 0건, 특례 식별자는 이미
  `naesin_scores.priorNaesinGrade` 로 행에 남아 있다). 계산 결과에는 영향이 없다.
- **상태**: **수정함** (우리 쪽 표시 버그로 분류, 원본과의 이탈이 아님)
  (`api/goal/intake.js`, 2026-08-12)

### #5 학원 1건당 이동시간 공제 — 원본 1h → 우리 0.5h

- **원본 위치**: `target/components/IntakeForm.tsx:997`
  `available -= (acEnd - acStart + 1)` — 학원 1건마다 이동시간으로 1h 를 추가
  공제한다. 상수에 설명 주석은 없다.
- **원본 동작**: 학원 시각쌍이 유효한 모든 건에 대해 `(하원 − 등원) + 1` 을
  가용시간에서 뺀다.
- **우리 동작**: `calcAvailableHours(day, hasSchool, commuteHours)` 세 번째
  인자로 파라미터화했다. 함수 기본값은 여전히 `1`(원본 파리티 — 기존 골든
  픽스처가 이 기본값을 전제로 고정돼 있어 그대로 둔다). 실사용 호출부
  (`api/goal/intake.js` `buildWeeklySchedule` → `calculateWeekSchedule({ …,
  commuteHours: ACADEMY_COMMUTE_HOURS })`, `schedule.js` 신설 상수)는 `0.5`
  를 명시로 넘긴다.
- **이탈 이유**: **2026-09-02 사용자 결정: 학원 이동시간 0.5h(QA 행293)**.
  `qa3-held-high-design.md` §4 결정③의 기본 권고는 원본 그대로(+1h, "닫음")였으나,
  §9-4 "QA 최대 준수안"에서 QA 문구("학원 하나당 +0.5")를 살리는 대안으로
  `ACADEMY_COMMUTE_HOURS` 파라미터화 + 0.5 적용을 제시했고, 사용자가 이 안을
  최종 선택했다 — QA 문구가 원래 가리켰던 값(자습시간 오버라이드 +0.5 상수)과는
  다른 근거지만, 결과적으로 "0.5"라는 QA 표현을 코드 동작으로 그대로 채택한
  것이다.
- **영향 범위**: `calcAvailableHours` 를 `commuteHours` 명시 없이 호출하는
  기존 호출부(파이프라인 골든 테스트 등)는 영향 없음(기본값 1 유지). 온보딩
  Step7(요일별 하루 일정) 실시간 미리보기와 서버 `buildWeeklySchedule` 산출값만
  0.5h 기준으로 바뀐다 — 같은 입력이라도 학원이 많을수록 가용시간이 원본보다
  `(학원 건수 × 0.5)h` 만큼 더 크게 나온다.
- **상태**: **의도적 이탈** (`src/lib/goal/calc/schedule.ts` `ACADEMY_COMMUTE_HOURS`,
  2026-09-02)

---

## 2. 미수정 이탈 후보 (`NOTE(target-parity)` 전수 등재, `rg` 확인 완료)

전부 원본 동작을 의도적으로 그대로 이식한 지점이다. 코드에 이미 `NOTE(target-parity)`
로 표시돼 있고, 골든 테스트가 최소 한 건 이상 그 동작을 고정하고 있는 경우가 많다
(schedule.test.js/pipeline.test.js 의 `[parity]`/"시나리오5" 등). 상태는 전부
**미판단** — 고칠지, 원본 파리티로 영구히 남길지 이번 작업 범위에서 결정하지 않는다.

### `primitives.js`

| 위치 | 내용 |
|---|---|
| `:22-24` | `round1` 은 `toNum` 과 달리 방어가 없다. `Number(v\|\|0)` 라 0·''·false·null·undefined·NaN 은 전부 0, -0 도 0 으로 접히지만, 숫자 아닌 문자열('abc')·객체는 NaN 이 그대로 흘러나간다. |
| `:34-35` | `clampProb` 은 `round1` 이 NaN 을 반환하면(예: `clampProb('abc')`) `Math.max/min` 도 NaN 을 통과시켜 결과가 NaN 이 된다 — 반환값이 항상 `[0,100]` 은 아니다. |
| `:41-42` | `getSchoolCutType`: `'자사고'`·`'영재고'` 같은 단일 문자열은 매칭되지 않는다. 정확히 `'특목,자사,영재고'` 또는 `'특목고'` 두 리터럴만 special. |
| `:52-53` | `getRemainingNaesin`: fallback 은 `Number()` 로만 변환하고 `Math.max(0, ...)` 클램프를 거치지 않는다. 음수·NaN 이 그대로 반환될 수 있다. |
| `:68-69` | `getRemainingNaesin` 표: 고3 1학기 기말 / 2학기 중간 / 2학기 기말이 전부 순번 10 으로 같다 — 셋 다 남은 회차 0. |
| `:81` | `getRemainingMogo` 도 fallback 클램프가 없다(위와 동일 패턴). |
| `:86-87` | `getRemainingMogo` 표: 고1·고2 는 5모·7모 항목이 없고 고3 만 갖는다. 미매칭 키는 "남은 회차 0" 으로 떨어져 중·초 학생과 구분되지 않는다. |
| `:118` | `calcNaesinProb`: `currentGrade` 또는 `targetCut` 이 0 이면(falsy) 확률 0 — "등급 0" 은 표현 불가능하다. |
| `:135-136` | `calcNaesinProb`: `totalExams` 가 0 이면 `ratio` 가 Infinity 가 되어 `factor` 가 ±Infinity 로 발산한다. 방어 없음. |
| `:138-140` | `calcNaesinProb`: 우세 갈래는 남은 시험이 많을수록 확률이 깎인다. `remainExams > totalExams` 면 우세 갈래는 factor 가 0.55 아래로, 열세 갈래는 1.0 위로 벗어난다. |
| `:166-168` | `applyPreHighGradePenalty`: 페널티 0 인 고교생도 `[1,9]` 클램프를 거친다. `schoolType==='중학교'` 면 `grade==='고1'` 이어도 페널티 0.30 이 붙는다(학년 매칭이 없을 때 학교급 폴백). |

### `jeongsi.js`

| 위치 | 내용 |
|---|---|
| `:26` | `Number(v\|\|0)` 이라 NaN·null·undefined·''·false 가 전부 0. |
| `:65` | min/max 로 정규화해 역순 입력(현재 > 목표)도 같은 값을 낸다. |
| `:75` | 밴드 경계가 `[min, max]` 로 닫혀 있는데 겹침은 반열린 구간처럼 처리된다. |
| `:96` | falsy 검사라 백분위 0(9등급 컷)이 "미입력"과 구분되지 않는다. |
| `:113` | `remainExams == null` 이거나 `totalExams <= 0` 이면 시간계수를 1 로 둔다 — "정보 없음"이 "가장 유리"로 처리된다. |
| `:120` | `ratio` 에 상한이 없어 `remainExams > totalExams` 면 계수가 1 을 넘는다. `ratio` 가 음수면 `Math.pow(음수,0.8)` 이 NaN → 계수 NaN → `clampProb` 가 0 으로 접어 확률이 0%로 나온다. |
| `:132` | `calcJeongsiProb` 는 `calcNaesinProb` 과 달리 하한 1% 보정이 없다. 0% 가 나올 수 있다. |
| `:156` | `width` 는 `max - min` 이다(밴드의 `max - min + 1` 과 다르다). |
| `:168` | 반올림 결과가 겹치면 Set 으로 중복만 제거해 칩 개수가 5개 미만이 될 수 있다. |
| `:178` | 등급 0 이하(미입력 0 포함)는 1등급과 동일하게 감점 0. |
| `:203` | 영어는 평균이 아니라 "마지막으로 값이 있는 회차"가 덮어쓴다. |
| `:207` | 값이 없는 과목의 평균은 0 으로 처리된다 — 탐구를 입력하지 않으면 평균이 낮아진다. |

### `bonus.js`

| 위치 | 내용 |
|---|---|
| `:35` | `excellent` 는 1.1 이라 "기준 rate 초과" 증분이 가능하다. 상한 clamp 없음. |
| `:64` | 같은 이름의 `round4` 가 원본에 두 벌(클라이언트/서버) 있고 NaN 처리가 서로 다르다. 통일하지 않는다. |
| `:94` | 기준일(D-day) 계산이 전부 실행 환경의 로컬 타임존을 탄다. 서버 TZ 가 KST 가 아니면 하루 어긋날 수 있다. |
| `:108` | 학년 오프셋이 원본처럼 if-else 사슬이다. 객체 맵 + `?? 0` 으로 바꾸면 `grade` 가 `'constructor'` 같은 `Object.prototype` 키일 때 결과가 달라져 사슬 그대로 옮겼다. |
| `:127` | 기준확률이 100 을 넘으면 rate 가 음수가 된다(clamp 없음) — 그 상태로 `calculateDailyBonus` 에 들어가면 열심히 할수록 확률이 깎인다. |
| `:141-143` | `getAchievementRateMultiplier`: 130·170 은 "초과"(`>`), 100 은 "이상"(`>=`)이라 부등호 방향이 섞여 있다. `rate` 가 NaN 이면 모든 비교가 false 라 `NaN/100=NaN` 이 그대로 반환된다. |
| `:159` | 원본은 이 계산(`calculateDailyBonus`)을 브라우저에서 수행해 결과를 그대로 서버에 저장한다 — 클라이언트가 확률 증분을 임의 조작할 수 있는 구조. 우리는 서버에서 호출한다(구조적으로 이미 개선됐다, 파일 상단 §9-3 주석 참고 — 재평가 대상이 아니라 정보성 기록). |
| `:205-206` | 0시간 제출 감점 폭이 "이상 목표 rate" 기준이라 최소 목표만 있는 날도 이상 rate 로 깎인다. `studyHours === 0` 엄격 비교라 문자열 `'0'` 이나 -0 아닌 음수는 이 분기를 안 타고, 음수 시간이 정상 분기로 흘러 음수 증분이 그대로 계산된다. |
| `:220` | 성취도 미지값은 0배(증분 0), 집중도 미지값은 1배로 기본값이 서로 다르다. |
| `:224` | 목표 시간이 0 이하면 달성률을 100%로 간주한다(분모 0 회피) — `pipeline.test.js` 시나리오6이 이 규칙과 미이식 일요일 보충(`getSundayRemainingScheduleFromRecords`)이 겹쳐 만드는 병리를 이미 고정해 뒀다. |
| `:236` | `tasks` 가 배열이 아니면 `.includes` 에서 TypeError(가드 없음). |
| `:246` | `susiBonus`/`jungsiBonus`/`calculatedBonus` 는 구 스키마 호환용 별칭이라 전부 "이상 목표" 값을 가리킨다. 최소 목표 값은 `minSusiBonus`/`minJungsiBonus` 에만 있다. |

### `schedule.js`

| 위치 | 내용 |
|---|---|
| `:134` | 커서 비교가 문자열 사전순(`cursor <= end`)이다. `'YYYY-MM-DD'` 포맷 유지에 의존한다. |
| `:164` | 문자열 `includes` 로 학과를 판정한다(부분 일치 오판정 가능). |
| `:174` | `topMed` 목록의 `'카톨릭대학교'` 는 오타로 보인다(정상 표기는 `'가톨릭대학교'`). |
| `:178` | `university`/`department` 가 null·undefined 면 `.trim()` 에서 TypeError. |
| `:262` | 학교 항에서 `+ (schoolStart - wake)` 를 더한다 — 기상이 등교보다 늦으면(`schoolStart < wake`) 음수가 되어 오히려 가용시간을 깎는다. clamp 없음. |
| `:266` | 학원 1건마다 `+1`(이동시간 추정)을 더 빼는데 이 상수는 원본에 설명이 없다. |
| `:269` | `day` 가 null 이거나 `day.academies` 가 없으면 TypeError(방어 없음). |
| `:322-325` | 배율표(`getStudyMultiplier`)가 이상/최소 대학을 독립 조회한다 — 최소 목표 대학의 배율이 더 높으면 목표가 역전된다(`pipeline.test.js` 시나리오5가 이미 고정). |
| `:327-329` | 현재자습시간 오버라이드에 상한(clamp)이 없다. 현재자습이 가용시간과 같거나 크면 목표가 가용시간을 넘는다(`schedule.test.js` "[parity] 병리②"가 이미 고정). |
| `:331` | 원본은 React `useCallback` 이 `form` 을 클로저로 잡는다 — 여기서는 순수 함수로 만들려고 `form` 을 인자로 받는다(본문 로직은 동일, 결함 아닌 구조 차이). |

### `virtualDate.js`

| 위치 | 내용 |
|---|---|
| `:45` | 원본은 KST 자정 `Date` 에 `setDate(getDate()+n)` 을 쓴다(월 경계에서 원본 특유의 롤오버 방식). |
| `:51` | `recordIndex` 가 숫자로 변환되지 않는 값('abc' 등)이면 원본 그대로의 방식으로 처리된다(방어 없음). |
| `:69` | 파싱 불가한 문자열('garbage!!' 등)은 NaN 을 반환한다. |
| `:84` | `ymd` 나 `days` 가 숫자로 파싱되지 않으면 Invalid Date 가 된다. |
| `:122` | 월요일 시작(비미니)일 때 `weekIndex` 0 과 1 이 완전히 같은 구간을 가리킨다. |
| `:126` | 일요일 시작(비미니)일 때 `weekIndex` 1 은 `startDate === endDate` 인 단일일 구간이 된다. |
| `:129` | 미니 온보딩일 때 `weekIndex` 를 음수로 주면 첫 분기(`idx === 0`)에 걸린다. |
| `:172` | 비미니면 `sundayCount` 를 그대로 돌려준다 — 음수·undefined 도 방어 없이 통과한다. |

---

## 3. 갱신 이력

| 날짜 | 항목 | 비고 |
|---|---|---|
| 2026-08-11 | #3 | `c37ac77` — 고1 내신전무+모의있음 경로 신설과 함께 수정 |
| 2026-08-12 | #1, #2, #4 | `remainNaesin` 오버라이드 우선순위 수정(엔진 자기모순 해소) + 부수 수정 2건 |
| 2026-08-12 | 2절 전체 | `NOTE(target-parity)` 전수 등재(`rg "NOTE\\(target-parity\\)" src/lib/goal/calc/`) |
| 2026-09-02 | #5 | 사용자 결정: 학원 이동시간 0.5h(QA 행293) — `ACADEMY_COMMUTE_HOURS` 신설, 요일별 하루 일정(Step7) 개편과 함께 |
