import { type ReactNode, useEffect, useState } from "react";
import { Link } from "react-router";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/context/AuthProvider";
import {
  checkDiagnosisAccess,
  type DiagnosisAccessResult,
} from "@/lib/diagnosisAccess";
import {
  type DiagnosisReportRow,
  fetchLatestDiagnosisReport,
} from "@/lib/diagnosisReportQueries";
import {
  SURVEY_FIRST_STEP_PATH,
  SURVEY_REPORT_PATH,
} from "@/lib/renewalSurvey";
import { supabase } from "@/lib/supabase";
import MyPageModalShell from "./MyPageModalShell";
import ModalFooter from "./modal/ModalFooter";
import ServiceCard from "./ServiceCard";

/**
 * 마이페이지 "나의 서비스" 탭 — Figma hsokTD6OilcNEXyCR24sn4
 * (카드 상태: 노드 3762:18713 / 빈 상태: 노드 3762:20041).
 *
 * ── 정본 전환(2026-09-01, 부산캠퍼스 번들 QA 후속) ──
 * 예전에는 orders.order_name 문자열을 "[기간·횟수] 서비스명" 패턴으로 정규식
 * 파싱해 서비스별 카드를 만들었다. 번들 상품(order_items 1건 → grant 3행)이
 * 이 파서를 정면으로 못 통과해 카드 1장으로 뭉치는 버그가 났고, 그걸 고치려던
 * 1차 수정(order_name 문자열을 합성해 파서에 억지로 태우는 방식, 6be5af13)은
 * 팀 리드 판단으로 꼼수라 기각됐다 — "결제 후의 세계는 발급 원장(program_
 * access_grants)이 정본이어야 하고, 번들 구매자와 단품 구매자의 마이페이지가
 * 구분 가능해선 안 된다"는 원칙 때문이다.
 *
 * 그래서 이 컴포넌트는 orders를 전혀 보지 않는다. 학생 본인 program_access_
 * grants(RLS `program_access_grants_select_own`: profile_id = auth.uid())를
 * 직접 읽고, 살아있는(revoked_at is null) 행 1개 = 카드 1장이다. 회차 소비는
 * performance_credit_ledger(RLS 동일 원칙)에서 grant_id별로 합산한다 — 이
 * 조합은 PaymentsTab.tsx의 이용완료 판정이 이미 쓰던 패턴 그대로다(중복 구현
 * 아님, 같은 원장을 같은 방식으로 읽을 뿐).
 *
 * 서비스명·카테고리·앱 라우트는 program_key(diagnose/target/suhaeng/mentor)
 * 기반 고정 매핑이다 — 더 이상 서비스명 문자열 키워드 추측이 아니다. 매핑에
 * 없는 program_key(카탈로그 확장 등)는 원문 그대로 노출한다(지어내지 않는다).
 *
 * 무료진단(회원가입 1회, diagnosis_attempts kind='free')은 grant를 만들지
 * 않는다(20260821000005 주석 "free는 원장 미적재") — orders에도 안 잡혔던
 * 예전과 마찬가지로 program_access_grants 기반 카드 목록엔 애초에 나타나지
 * 않는다.
 *
 * ── 무료 진단 전용 합성 카드(2026-09-02) ──
 * 위 문단이 뜻하는 건 "grant가 없다"이지 "리포트가 없다"가 아니다 —
 * diagnosis_reports(attempt_id·profile_id·diagnosed_at·payload)에 결과가
 * 영속 저장되면서, 무료 진단만 이용한 학생은 카드 자체가 아예 없어 결과
 * 리포트로 돌아갈 진입점이 없는 문제가 생겼다. 그래서 이 컴포넌트는 로그인
 * 학생의 diagnosis_reports 최신 행을 별도로 조회해(latestDiagnosisReport,
 * 유료 완료 카드의 "결과 리포트 보기" 링크와 같은 조회를 공유한다) grant
 * 기반 diagnose 카드가 이미 없을 때만 카드 1장을 합성한다(buildFreeDiagnosisCard).
 * grant 기반 diagnose 카드가 있으면(유료 이용 이력) 중복 없이 그 카드만 쓴다.
 *
 * ── 서비스(program_key) 단위 합산(2026-09-01, 사용자 QA 후속) ──
 * 처음엔 "grant 1행 = 카드 1장"이었다 — 하지만 재구매 체이닝(기간 만료 후
 * 재구매, 회차권 추가 구매)이 실제로 grant를 여러 개 만들다 보니 같은
 * 서비스가 카드 여러 장(예: 수행평가 "잔여 2회"+"잔여 6회" 2장)으로 쪼개져
 * 보이는 걸 사용자가 명시적으로 재지적했다. 그래서 표시 단계에서 program_key
 * 로 다시 묶는다(aggregateByProgramKey) — grant 자체는 여전히 원장 그대로
 * 여러 행이고, 카드만 서비스 단위 1장으로 합산해 보여준다.
 *
 * 합산 규칙(살아있는 grant, revoked 제외):
 *   회차제  잔여 = 살아있는 grant들의 (총회차 − 소비) 합. "유효기간"은 가장
 *           늦은 expires_at까지 남은 일수(소진 순서가 expires_at asc라
 *           마지막 만료가 실질 한도 — fn_refund_quote 소비 순서와 같은 근거).
 *   기간제  이용기간 = 살아있는 grant들의 min(starts_at) ~ max(expires_at)
 *           (재구매 체이닝은 다음 grant가 이전 grant의 만료 시점부터 시작하므로
 *           이 구간이 곧 끊김 없는 전체 이용 구간이다). 남은 일수는 그 max
 *           expires_at 기준.
 *   완료    그 서비스에 살아있는 grant가 하나도 없을 때만 완료 카드 1장 —
 *           가장 최근에 만료/소진된 grant를 대표로 삼는다(진단 완료 카드의
 *           리포트/재검사 액션 정책은 그대로).
 * 진행바도 같은 합산 구간(min~max) 기준 경과율이다.
 *
 * 로컬 QA 전용 FAKE_ENTITLEMENT_ENABLED(entitlement.ts)는 orders 목업이라 이
 * 컴포넌트에는 더 이상 영향을 주지 않는다 — 실제 grant가 있어야 카드가 뜬다.
 */

const MS_PER_DAY = 86400000;

type Grant = {
  id: string;
  program_key: string;
  granted_sessions: number | null;
  /** 기간제 grant 분해 다이얼로그("N개월: 시작~만료")에 쓴다. */
  granted_months: number | null;
  starts_at: string;
  expires_at: string | null;
  first_accessed_at: string | null;
};

type LedgerRow = { grant_id: string; delta: number };

type ServiceCategory = "session" | "diagnosis" | "duration";

type ProgramKeyMeta = {
  serviceName: string;
  category: ServiceCategory;
  /** 이용 중 카드의 "프로그램 가기" 링크. 앱 라우트가 없는 서비스는 소개 페이지. */
  route: string;
};

// diagnose 메타 — 무료 진단 합성 카드(buildFreeDiagnosisCard)가 인덱스
// 접근(PROGRAM_KEY_META["diagnose"]) 없이 직접 참조한다. Record<string, ...>
// 타입의 동적 인덱스 접근은 noUncheckedIndexedAccess로 undefined 가능성이
// 붙어 non-null 단언이 필요해지는데, 이 상수는 그 문제 없이 항상 정의돼 있다.
const DIAGNOSE_META: ProgramKeyMeta = {
  serviceName: "위닝 학습진단",
  category: "diagnosis",
  route: "/services/learning-diagnosis",
};

// program_key → 서비스명·카테고리·라우트 고정 매핑. programs 테이블(로컬 DB
// 실측)의 활성 4종만 다룬다 — 매핑에 없는 program_key는 parseGrant의 폴백이
// program_key 원문을 그대로 서비스명으로 쓴다(지어내지 않는다).
const PROGRAM_KEY_META: Record<string, ProgramKeyMeta> = {
  diagnose: DIAGNOSE_META,
  target: {
    serviceName: "위닝 목표관리",
    category: "duration",
    // 목표관리는 실제 앱(/app/goal) 진입이 가능하다(2026-08-10 확정).
    route: "/app/goal",
  },
  suhaeng: {
    serviceName: "위닝 수행평가",
    category: "duration",
    // 수행평가 하드 전환 완료 — /app/performance가 인덱스 경로
    // (performanceAppRoutes.tsx).
    route: "/app/performance",
  },
  growth: {
    serviceName: "위닝 성장설계",
    category: "duration",
    route: "/app/growth",
  },
  // 회차제 상품이라 수행평가(suhaeng)와 같은 duration 으로 둔다.
  selfeval: {
    serviceName: "위닝 자기평가서",
    category: "duration",
    route: "/app/selfeval",
  },
  mentor: {
    serviceName: "위닝 콜멘토",
    category: "session",
    route: "/services/callmentor",
  },
};

type ParsedGrant = {
  id: string;
  programKey: string;
  serviceName: string;
  category: ServiceCategory;
  /** 부여된 총 회차. null이면 회차 개념이 없는 순수 기간제. */
  totalCount: number | null;
  /** 잔여 회차(총회차 - 소비회차). totalCount가 null이면 null. */
  remaining: number | null;
  /** 부여된 개월수 — 기간제 grant 분해 다이얼로그 표기용. */
  grantedMonths: number | null;
  startsAt: Date;
  expiresAt: Date | null;
  /** 실제로 처음 이용을 시작한 시각 — 완료 카드의 "진단 완료"류 날짜 표기용. */
  firstAccessedAt: Date | null;
  isOngoing: boolean;
};

type ServiceCardAction = {
  kind: "link" | "outline-solid" | "solid";
  label: string;
  href: string;
  disabled?: boolean;
  disabledReason?: string;
};

type ServiceCardViewModel = {
  id: string;
  serviceName: string;
  statusLabel: string;
  isOngoing: boolean;
  progressPercent: number;
  metaLeft: string;
  metaRight: string;
  actions: ServiceCardAction[];
  /** 서비스 단위 합산 카드라 배지 자체를 안 쓴다 — 항상 1(ServiceCard의 "결제 N건" 배지 미노출). */
  paymentCount: number;
  /** 이용 중 카드의 메타 행 클릭 → grant별 유효기간 분해 다이얼로그. */
  onMetaClick?: (() => void) | undefined;
};

// "YYYY.MM.DD" — 기간형 서비스의 이용기간 범위 표기.
function formatDate(date: Date | null) {
  if (!date) return "-";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}.${m}.${d}`;
}

// "YYYY. MM. DD" — 완료일 단독 표기(시안의 무료진단/콜멘토 완료 카드 날짜 형식).
function formatDateSpaced(date: Date | null) {
  if (!date) return "-";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}. ${m}. ${d}`;
}

function parseGrant(
  grant: Grant,
  usedByGrant: Record<string, number>,
): ParsedGrant {
  const meta = PROGRAM_KEY_META[grant.program_key] ?? {
    serviceName: grant.program_key,
    category: "duration" as ServiceCategory,
    route: "/services",
  };

  const startsAt = new Date(grant.starts_at);
  const expiresAt = grant.expires_at ? new Date(grant.expires_at) : null;
  const firstAccessedAt = grant.first_accessed_at
    ? new Date(grant.first_accessed_at)
    : null;

  const totalCount = grant.granted_sessions;
  const used = usedByGrant[grant.id] ?? 0;
  const remaining = totalCount !== null ? Math.max(totalCount - used, 0) : null;

  const now = Date.now();
  const expired = expiresAt ? expiresAt.getTime() <= now : false;
  const exhausted = totalCount !== null && used >= totalCount;
  const isOngoing = !expired && !exhausted;

  return {
    id: grant.id,
    programKey: grant.program_key,
    serviceName: meta.serviceName,
    category: meta.category,
    totalCount,
    remaining,
    grantedMonths: grant.granted_months,
    startsAt,
    expiresAt,
    firstAccessedAt,
    isOngoing,
  };
}

// 서비스(program_key) 단위로 합산한 표시용 집계 — 카드 1장의 입력이다.
// 필드 이름은 ParsedGrant와 맞췄다(뜻이 같다 — 다만 이용 중 카드는 살아있는
// grant들의 합산값, 완료 카드는 대표 grant 1건의 값).
type AggregatedService = {
  id: string;
  programKey: string;
  serviceName: string;
  category: ServiceCategory;
  isOngoing: boolean;
  progressPercent: number;
  totalCount: number | null;
  remaining: number | null;
  startsAt: Date | null;
  expiresAt: Date | null;
  firstAccessedAt: Date | null;
  /**
   * 이용 중일 때만 채운다(살아있는 grant 목록) — 유효기간 분해 다이얼로그가
   * grant별 행을 그리는 데 쓴다. 완료 카드는 대표 1건뿐이라 분해할 게 없어
   * 빈 배열이다(다이얼로그 자체를 안 연다).
   */
  liveGrants: ParsedGrant[];
};

function aggregateByProgramKey(
  parsedGrants: ParsedGrant[],
): AggregatedService[] {
  const groups = new Map<string, ParsedGrant[]>();
  for (const g of parsedGrants) {
    const list = groups.get(g.programKey);
    if (list) list.push(g);
    else groups.set(g.programKey, [g]);
  }

  return Array.from(groups.entries()).map(([programKey, group]) => {
    const meta = PROGRAM_KEY_META[programKey] ?? {
      serviceName: programKey,
      category: "duration" as ServiceCategory,
      route: "/services",
    };
    const liveGrants = group.filter((g) => g.isOngoing);

    if (liveGrants.length > 0) {
      // 회차 보유분이 하나라도 있으면 회차제 표기(기존 단일 카드 규칙과 동일
      // 원칙) — 순수 기간제 grant까지 섞여 있으면 그쪽은 회차 계산에서 빼고
      // 이용기간 구간(시작~만료)에만 반영한다.
      const sessionGrants = liveGrants.filter((g) => g.totalCount !== null);
      const hasSessions = sessionGrants.length > 0;
      const basisForWindow = hasSessions ? sessionGrants : liveGrants;

      const startsAt = basisForWindow.reduce<Date | null>(
        (min, g) => (!min || g.startsAt < min ? g.startsAt : min),
        null,
      );
      const expiresAt = basisForWindow.reduce<Date | null>((max, g) => {
        if (!g.expiresAt) return max;
        return !max || g.expiresAt > max ? g.expiresAt : max;
      }, null);

      const now = Date.now();
      let progressPercent = 0;
      if (startsAt && expiresAt) {
        const totalMs = expiresAt.getTime() - startsAt.getTime();
        const elapsedMs = now - startsAt.getTime();
        progressPercent =
          totalMs > 0
            ? Math.min(100, Math.max(0, (elapsedMs / totalMs) * 100))
            : 0;
      }

      return {
        id: programKey,
        programKey,
        serviceName: meta.serviceName,
        category: meta.category,
        isOngoing: true,
        progressPercent,
        totalCount: hasSessions
          ? sessionGrants.reduce((sum, g) => sum + (g.totalCount ?? 0), 0)
          : null,
        remaining: hasSessions
          ? sessionGrants.reduce((sum, g) => sum + (g.remaining ?? 0), 0)
          : null,
        startsAt,
        expiresAt,
        firstAccessedAt: null,
        liveGrants,
      };
    }

    // 완료 — 살아있는 grant가 없다. 가장 최근에 만료/소진된 grant 1건을
    // 대표로 삼는다(만료일이 있으면 만료일, 없으면(진단처럼 만료 대신 소진만
    // 있는 경우) 최초 이용일·시작일 순으로 폴백).
    const representative = group.reduce((latest, g) => {
      const latestKey =
        latest.expiresAt?.getTime() ??
        latest.firstAccessedAt?.getTime() ??
        latest.startsAt.getTime();
      const gKey =
        g.expiresAt?.getTime() ??
        g.firstAccessedAt?.getTime() ??
        g.startsAt.getTime();
      return gKey > latestKey ? g : latest;
    });

    return {
      id: programKey,
      programKey,
      serviceName: meta.serviceName,
      category: meta.category,
      isOngoing: false,
      progressPercent: 100,
      totalCount: representative.totalCount,
      remaining: representative.remaining,
      startsAt: representative.startsAt,
      expiresAt: representative.expiresAt,
      firstAccessedAt: representative.firstAccessedAt,
      liveGrants: [],
    };
  });
}

// 학습진단 재검사 문구 — SurveyStepShell 진입 게이트 alert(QA 행 27 안내문)와 톤을 맞춘다.
const DIAGNOSIS_RETAKE_BLOCKED_REASON =
  "1회 이용권을 모두 사용했습니다. 이용권을 구매하시면 다시 이용하실 수 있습니다.";

// 영속 리포트(diagnosis_reports) 조회 전 또는 결측(과거 데이터·조회 실패)일 때의 안내 —
// DIAGNOSIS_RETAKE_BLOCKED_REASON과 같은 톤(ServiceCard.tsx의 disabledReason 표시 자리 공유).
const DIAGNOSIS_REPORT_UNAVAILABLE_REASON =
  "리포트를 준비하고 있습니다. 잠시 후 다시 확인해 주세요.";

function toViewModel(
  agg: AggregatedService,
  diagnosisAccess: DiagnosisAccessResult | null,
  latestDiagnosisAttemptId: string | null,
  onOpenValidityDetail: (agg: AggregatedService) => void,
): ServiceCardViewModel {
  const {
    category,
    programKey,
    totalCount,
    remaining,
    startsAt,
    expiresAt,
    firstAccessedAt,
    isOngoing,
  } = agg;

  // 이용 중 카드의 "유효기간"은 이제 구간 길이가 아니라 가장 늦은 만료일까지
  // 남은 일수다(합산 규칙 — 파일 상단 주석 참고, 소진 순서가 expires_at asc라
  // 마지막 만료가 실질 한도).
  const now = Date.now();
  const remainingDays = expiresAt
    ? Math.ceil((expiresAt.getTime() - now) / MS_PER_DAY)
    : null;

  const statusLabel = (() => {
    if (!isOngoing) return "이용완료";
    if (remaining !== null) return `잔여 ${remaining}회`;
    return "이용중";
  })();

  // 메타 한 줄(좌/우) — 진단 완료 카드만 전용 문구, 나머지는 회차 유무(회차제
  // vs 기간제)로 갈린다. 기간+회차를 동시에 가진 상품(수행평가 혼합형)도
  // 회차제 표기를 쓴다 — 환불 산정(fn_refund_quote)이 같은 원칙(⑧ 후문
  // 단서)으로 회차제를 우선하는 것과 표시를 맞춘다.
  let metaLeft = "-";
  let metaRight = "-";
  if (!isOngoing && category === "diagnosis") {
    metaLeft = "진단 완료";
    metaRight = formatDateSpaced(firstAccessedAt ?? startsAt);
  } else if (totalCount !== null) {
    metaLeft = isOngoing ? `${totalCount}회권` : `총 ${totalCount}회 이용`;
    // "최대" — 합산 카드는 grant마다 만료일이 달라(가장 늦은 것 기준) 이
    // 숫자가 전부에게 똑같이 적용되는 값이 아니라는 걸 표시에서부터 알려준다
    // (사용자 확정 카피, 2026-09-01). 클릭하면 grant별 실제 값을 보여준다.
    metaRight = isOngoing
      ? remainingDays !== null
        ? `유효기간 최대 ${remainingDays}일`
        : "-"
      : formatDateSpaced(startsAt);
  } else {
    metaLeft =
      startsAt || expiresAt
        ? `${formatDate(startsAt)} ~ ${formatDate(expiresAt)}`
        : "-";
    metaRight = isOngoing
      ? remainingDays !== null
        ? `${remainingDays}일 남음`
        : "-"
      : "만료";
  }

  const href = PROGRAM_KEY_META[programKey]?.route ?? "/services";

  let actions: ServiceCardAction[];
  if (isOngoing && category === "diagnosis") {
    // 미사용 유료 1회권 — 소진 전에는 "이용중"이고, 할 일은 검사뿐이다(옛
    // 구현은 진단을 무조건 완료로 취급해 이 상태 자체가 없었다).
    actions = [
      { kind: "link", label: "검사하기", href: SURVEY_FIRST_STEP_PATH },
    ];
  } else if (isOngoing) {
    const label = category === "session" ? "상담 기록 보기" : "프로그램 가기";
    actions = [{ kind: "link", label, href }];
  } else if (category === "diagnosis") {
    // 소진(또는 만료) — 기존 완료 카드 정책 그대로: 리포트 보기 + 재검사
    // 게이트(diagnosisAccess, fail-open).
    const retakeBlocked = diagnosisAccess !== null && !diagnosisAccess.allowed;
    // B4-c — 리포트 보기는 이제 정적 SURVEY_REPORT_PATH(세션 경로, 다른 탭·기기에서는
    // 설문으로 튕기는 버그가 있었다)가 아니라 diagnosis_reports 최신 attemptId로 연다.
    // 아직 조회 전이거나 결측이면 disabled(기존 disabled 패턴, 위 재검사 게이트와 동일).
    actions = [
      latestDiagnosisAttemptId
        ? {
            kind: "outline-solid",
            label: "결과 리포트 보기",
            href: `/learning-diagnosis/report/${latestDiagnosisAttemptId}`,
          }
        : {
            kind: "outline-solid",
            label: "결과 리포트 보기",
            href: SURVEY_REPORT_PATH,
            disabled: true,
            disabledReason: DIAGNOSIS_REPORT_UNAVAILABLE_REASON,
          },
      retakeBlocked
        ? {
            kind: "solid",
            label: "다시 검사하기",
            href: SURVEY_FIRST_STEP_PATH,
            disabled: true,
            disabledReason: DIAGNOSIS_RETAKE_BLOCKED_REASON,
          }
        : {
            kind: "solid",
            label: "다시 검사하기",
            href: SURVEY_FIRST_STEP_PATH,
          },
    ];
  } else if (category === "session") {
    actions = [
      { kind: "outline-solid", label: "상담 기록 보기", href },
      { kind: "solid", label: "다시 이용하기", href: "/pricing" },
    ];
  } else {
    // 기간형 서비스의 완료 카드는 시안 예시가 없어 무료진단/콜멘토 패턴을 참고한 추정 문구다.
    actions = [
      { kind: "outline-solid", label: "이용 내역 보기", href },
      { kind: "solid", label: "다시 신청하기", href: "/pricing" },
    ];
  }

  return {
    id: agg.id,
    serviceName: PROGRAM_KEY_META[programKey]?.serviceName ?? programKey,
    statusLabel,
    isOngoing,
    progressPercent: agg.progressPercent,
    metaLeft,
    metaRight,
    actions,
    paymentCount: 1,
    // 이용 중 카드만 클릭 가능 — 완료 카드는 대표 grant 1건뿐이라 분해할
    // 살아있는 grant 자체가 없다(agg.liveGrants가 빈 배열, 다이얼로그를 열
    // 이유가 없다).
    onMetaClick: isOngoing ? () => onOpenValidityDetail(agg) : undefined,
  };
}

// 무료 진단(회원가입 1회) 전용 합성 카드 — grant가 없어 aggregateByProgramKey
// 입력에 아예 안 잡힌다(파일 상단 주석 참고). diagnosis_reports에 결과가 있고
// grant 기반 diagnose 카드가 없을 때만 이 함수가 카드 1장을 별도로 만든다.
// 유료 완료 카드(toViewModel의 diagnosis 분기)와 문구·액션 규칙을 맞췄다.
//
// ── 신규 카피 — 승인 대기 ──
// 상태 배지 "무료 1회"는 이 카드가 유료 완료 카드("이용완료")와 다르다는 걸
// 알려주려는 추정 문구다(시안 근거 없음).
function buildFreeDiagnosisCard(
  report: Pick<DiagnosisReportRow, "attempt_id" | "diagnosed_at">,
  diagnosisAccess: DiagnosisAccessResult | null,
): ServiceCardViewModel {
  const diagnosedAt = new Date(report.diagnosed_at);
  const retakeBlocked = diagnosisAccess !== null && !diagnosisAccess.allowed;

  return {
    id: "diagnose-free",
    serviceName: DIAGNOSE_META.serviceName,
    statusLabel: "무료 1회",
    isOngoing: false,
    progressPercent: 100,
    metaLeft: "진단 완료",
    metaRight: formatDateSpaced(diagnosedAt),
    actions: [
      {
        kind: "outline-solid",
        label: "결과 리포트 보기",
        href: `/learning-diagnosis/report/${report.attempt_id}`,
      },
      retakeBlocked
        ? {
            kind: "solid",
            label: "다시 검사하기",
            href: SURVEY_FIRST_STEP_PATH,
            disabled: true,
            disabledReason: DIAGNOSIS_RETAKE_BLOCKED_REASON,
          }
        : {
            kind: "solid",
            label: "다시 검사하기",
            href: SURVEY_FIRST_STEP_PATH,
          },
    ],
    paymentCount: 1,
    onMetaClick: undefined,
  };
}

// 빈 상태(3762:20041) — 결제한 서비스가 없을 때. 문구·버튼 라벨은 시안 스크린샷 실측.
// 버튼 색 — 2026-09-02 QA(시트 행 261 "컬러 변경 필요"): 구매 동선 CTA는 결제 버튼
// (PricingSelling "결제하기")·서비스 랜딩 "이용권 구매하기"(행 264)와 같은 accent 채움으로 통일.
function EmptyState() {
  return (
    <div className="flex min-h-80 flex-col items-center justify-center gap-6 rounded-perf-modal bg-surface-04 px-8 py-16 text-center">
      <p className="text-[1rem] leading-normal text-ink-sub">
        아직 결제한 서비스가 없어요
      </p>
      <Link
        to="/pricing"
        className="inline-flex h-12 items-center justify-center rounded-xl bg-accent px-8 text-[0.9375rem] font-semibold text-white transition hover:brightness-95"
      >
        서비스 이용하러 가기
      </Link>
    </div>
  );
}

// 그랜트 조회 중 — orders prop이 없어져 부모가 이미 받아둔 데이터를 그대로
// 못 쓴다(이 컴포넌트가 직접 비동기로 읽는다). 조회 전에 EmptyState를 먼저
// 그리면 실제로는 서비스가 있는 사용자에게 빈 상태가 한 프레임 깜빡인다.
function Loading() {
  return (
    <div className="flex min-h-80 items-center justify-center rounded-perf-modal bg-surface-04 px-8 py-16 text-center">
      <p className="text-[1rem] leading-normal text-ink-sub">불러오는 중...</p>
    </div>
  );
}

// 섹션 제목~카드 그리드 간격 40px, 섹션 간 간격 100px — get_design_context 실측.
function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-10">
      <h2 className="text-[1.5rem] font-semibold leading-[1.3] tracking-[-0.03rem] text-ink">
        {title} <span className="text-accent">{count}</span>
      </h2>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {children}
      </div>
    </section>
  );
}

type ValidityDetailRow = {
  key: string;
  left: string;
  right: string;
};

// grant별 유효기간 분해 다이얼로그(2026-09-01, 서비스 단위 합산 카드
// QA 후속) — 카드 메타 행(예: "8회권 … 유효기간 최대 122일" / "2026.09.01
// ~ 2027.01.01 … 122일 남음")은 여러 grant를 합친 값이라, 실제로 어떤
// grant가 언제까지인지는 눌러서 펼쳐야 보인다. 회차제(잔여 있는 살아있는
// grant, 만료 임박순)와 기간제(체이닝 구간별, 시작순)는 행 포맷이 다르다.
// 완료 카드는 agg.liveGrants가 비어 있어 애초에 열리지 않는다(ServiceCard가
// onMetaClick 자체를 안 만든다).
function ServiceValidityDetailModal({
  open,
  service,
  onClose,
}: {
  open: boolean;
  service: AggregatedService | null;
  onClose: () => void;
}) {
  if (!open || !service) return null;

  const isSessionType = service.totalCount !== null;
  const now = Date.now();

  const rows: ValidityDetailRow[] = isSessionType
    ? service.liveGrants
        .filter((g) => g.totalCount !== null && (g.remaining ?? 0) > 0)
        .slice()
        .sort(
          (a, b) =>
            (a.expiresAt?.getTime() ?? 0) - (b.expiresAt?.getTime() ?? 0),
        )
        .map((g) => {
          const days = g.expiresAt
            ? Math.ceil((g.expiresAt.getTime() - now) / MS_PER_DAY)
            : null;
          return {
            key: g.id,
            left: `${g.remaining}회`,
            right:
              days !== null
                ? `유효기간 ${days}일 (${formatDate(g.expiresAt)}까지)`
                : "-",
          };
        })
    : service.liveGrants
        .slice()
        .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
        .map((g) => ({
          key: g.id,
          left: g.grantedMonths ? `${g.grantedMonths}개월` : "-",
          right: `${formatDate(g.startsAt)} ~ ${formatDate(g.expiresAt)}`,
        }));

  return (
    <MyPageModalShell
      open={open}
      onClose={onClose}
      size="sm"
      // 조회 전용 모달이라 주변(RefundApprovalModal 등) 명사형 제목 관례를 따랐다.
      title="이용권 유효기간"
      footer={
        <ModalFooter
          buttons={[
            {
              key: "confirm",
              label: "확인",
              variant: "primary",
              onClick: onClose,
            },
          ]}
        />
      }
    >
      <ScrollArea className="flex-1 px-6 py-2">
        <div className="flex flex-col">
          {rows.map((row) => (
            <div
              key={row.key}
              className="flex items-center justify-between gap-4 border-b border-line/60 py-3.75"
            >
              <span className="shrink-0 text-[0.875rem] font-semibold text-ink">
                {row.left}
              </span>
              <span className="truncate text-right text-[0.875rem] text-ink-sub">
                {row.right}
              </span>
            </div>
          ))}
        </div>
        {isSessionType && (
          <p className="mt-4 pb-2 text-[0.8125rem] leading-relaxed text-ink-sub">
            먼저 만료되는 회차부터 자동 사용됩니다.
          </p>
        )}
      </ScrollArea>
    </MyPageModalShell>
  );
}

export default function MyServicesTab() {
  const { userId } = useAuth();

  // "다시 검사하기" 활성 여부 판정 — 서버가 정본(diagnosisAccess.ts 참고). 조회 전엔
  // null(활성 취급)로 두고, 응답이 오면 완료 카드의 재검사 버튼에 반영한다.
  const [diagnosisAccess, setDiagnosisAccess] =
    useState<DiagnosisAccessResult | null>(null);

  useEffect(() => {
    let alive = true;
    checkDiagnosisAccess().then((result) => {
      if (alive) setDiagnosisAccess(result);
    });
    return () => {
      alive = false;
    };
  }, []);

  // 본인의 가장 최근 diagnosis_reports 행 — 유료 완료 diagnose 카드의 "결과
  // 리포트 보기" 링크 대상이자, 무료 진단 전용 합성 카드(buildFreeDiagnosisCard)의
  // 데이터 원천이다(같은 조회를 두 용도가 공유한다). null은 조회 전 또는
  // 결측 둘 다를 뜻한다 — reportLoaded로 조회 완료 여부를 따로 구분한다.
  const [latestDiagnosisReport, setLatestDiagnosisReport] =
    useState<DiagnosisReportRow | null>(null);
  const [reportLoaded, setReportLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!userId) return undefined;
    fetchLatestDiagnosisReport(userId).then((row) => {
      if (alive) {
        setLatestDiagnosisReport(row);
        setReportLoaded(true);
      }
    });
    return () => {
      alive = false;
    };
  }, [userId]);

  const [grants, setGrants] = useState<Grant[]>([]);
  const [usedByGrant, setUsedByGrant] = useState<Record<string, number>>({});
  const [loaded, setLoaded] = useState(false);
  // 유효기간 분해 다이얼로그가 열려 있는 서비스 — 훅이라 조기 반환(로딩/빈
  // 상태)보다 먼저 선언한다(React hooks 규칙).
  const [detailService, setDetailService] = useState<AggregatedService | null>(
    null,
  );

  // 부여 원장(program_access_grants)+소비 원장(performance_credit_ledger)을
  // 본인 RLS로 직접 읽는다 — PaymentsTab.tsx의 이용완료 판정과 같은 조합·같은
  // 근거(파일 상단 주석 참고).
  useEffect(() => {
    let alive = true;
    if (!userId) return undefined;

    (async () => {
      const [g, l] = await Promise.all([
        supabase
          .from("program_access_grants")
          .select(
            "id, program_key, granted_sessions, granted_months, starts_at, expires_at, first_accessed_at",
          )
          .eq("profile_id", userId)
          .is("revoked_at", null)
          .overrideTypes<Grant[], { merge: false }>(),
        supabase
          .from("performance_credit_ledger")
          .select("grant_id, delta")
          .eq("profile_id", userId)
          .overrideTypes<LedgerRow[], { merge: false }>(),
      ]);

      if (!alive) return;

      if (g.error) console.warn("부여 원장 조회 실패:", g.error.message);
      if (l.error) console.warn("소비 원장 조회 실패:", l.error.message);

      const used: Record<string, number> = {};
      for (const row of l.data ?? []) {
        used[row.grant_id] =
          (used[row.grant_id] ?? 0) + -Number(row.delta || 0);
      }

      setUsedByGrant(used);
      setGrants(g.data ?? []);
      setLoaded(true);
    })();

    return () => {
      alive = false;
    };
  }, [userId]);

  if (!loaded || !reportLoaded) {
    return <Loading />;
  }

  // grant 기반 diagnose 카드가 이미 있으면(유료 이용 이력) 무료 진단 합성
  // 카드는 만들지 않는다 — 중복 방지(파일 상단 주석 참고).
  const hasDiagnoseGrantCard = grants.some(
    (grant) => grant.program_key === "diagnose",
  );
  const freeDiagnosisCard =
    latestDiagnosisReport && !hasDiagnoseGrantCard
      ? buildFreeDiagnosisCard(latestDiagnosisReport, diagnosisAccess)
      : null;

  if (!grants.length && !freeDiagnosisCard) {
    return <EmptyState />;
  }

  const parsedGrants = grants.map((grant) => parseGrant(grant, usedByGrant));
  const cards = aggregateByProgramKey(parsedGrants).map((agg) =>
    toViewModel(
      agg,
      diagnosisAccess,
      latestDiagnosisReport?.attempt_id ?? null,
      setDetailService,
    ),
  );
  if (freeDiagnosisCard) {
    // 기존 카드들 뒤에 둔다 — "완료된 서비스" 섹션의 마지막 카드가 된다.
    cards.push(freeDiagnosisCard);
  }
  const ongoing = cards.filter((card) => card.isOngoing);
  const completed = cards.filter((card) => !card.isOngoing);

  return (
    <div className="flex flex-col gap-25">
      {ongoing.length > 0 && (
        <Section title="이용 중인 서비스" count={ongoing.length}>
          {ongoing.map((card) => (
            <ServiceCard key={card.id} card={card} />
          ))}
        </Section>
      )}
      {completed.length > 0 && (
        <Section title="이용 완료된 서비스" count={completed.length}>
          {completed.map((card) => (
            <ServiceCard key={card.id} card={card} />
          ))}
        </Section>
      )}

      <ServiceValidityDetailModal
        open={!!detailService}
        service={detailService}
        onClose={() => setDetailService(null)}
      />
    </div>
  );
}
