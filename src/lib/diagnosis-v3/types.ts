// Shared contract of the v3 diagnosis engine: what the survey sends
// (DiagnosisV3Answers), what the server adds (DiagnosisV3Context), and what the
// engine returns (DiagnosisV3Payload = machine scores + render pages).

import type {
  AreaCode,
  MindCode,
  P1Code,
  P2Code,
  ServiceCode,
  TempDim,
  TempFactor,
  TrackCode,
} from "./codes.js";
import type { Likert } from "./likert.js";

export const SCHEMA_VERSION = "2026-11-v3";

/** YYYY-MM-DD, a KST calendar date. */
export type IsoDate = string;

// ---------------------------------------------------------------------------
// Answers
// ---------------------------------------------------------------------------

/**
 * 1-based option ordinal. For 14_선택지코드 questions it is the 순번 (B column);
 * q2 follows 13 H6, q4 16 r6-r9, q5 16 r11-r17 (see options.ts).
 */
export type Ordinal = number;

/** Likert items by item number (index = No - 1) plus the trailing check item. */
export type LikertBlock = {
  readonly items: readonly Likert[];
  /** 17_신뢰도 V1 (q9), V3 (q20), V2 (q11), V4 (q23) */
  readonly verify: Likert;
};

/** q6s subjects, 13 F12 (국, 수, 영, 사, 과). */
export type SubjectCode = "KOR" | "MATH" | "ENG" | "SOC" | "SCI";
/** q6m adds 한국사 (judge-report R3: input only, not judged). */
export type MockSubjectCode = SubjectCode | "HIST";

/** 14_선택지코드 q13 EVENT: codes that carry a date. */
export type EventKind = "EXAM" | "PERF" | "MOCK" | "APPLY" | "ETC";

export type ScheduleEvent = {
  readonly kind: EventKind;
  readonly date: IsoDate;
  readonly subject?: string;
};

/** 14_선택지코드 q22 MBTI: codes without the prefix. */
export type MbtiType =
  | "ISTJ"
  | "ISFJ"
  | "ISTP"
  | "ISFP"
  | "INTJ"
  | "INFJ"
  | "INTP"
  | "INFP"
  | "ESTP"
  | "ESFP"
  | "ESTJ"
  | "ESFJ"
  | "ENTP"
  | "ENFP"
  | "ENTJ"
  | "ENFJ";

/** q15 4-step cascade, the admission_results natural key. */
export type AdmissionTarget = {
  readonly universityKey: string;
  readonly departmentKey: string;
  readonly mainTrack: string;
  readonly admissionTrack: string;
  readonly subjectReflection: string | null;
};

/**
 * Answer payload keyed by 13_문항메타 question id. Optional fields are
 * optional questions or hidden ones; a hidden question must be absent.
 */
export type DiagnosisV3Answers = {
  readonly q1: Ordinal;
  readonly q2: Ordinal;
  readonly q3: Ordinal;
  /** q3 ordinal 1..3 only (13 H7): target university and major text */
  readonly q3Target?: { readonly university?: string; readonly major?: string };
  /** max 2, hidden when q3 is the 0-score option (13 H8) */
  readonly q3r?: readonly Ordinal[];
  readonly q4: Ordinal;
  readonly q5: Ordinal;
  /** overall average in the q4 grade system */
  readonly q6: number;
  /** shown when 06 C51 is 사용 and the track is not M3 */
  readonly q6s?: Readonly<Partial<Record<SubjectCode, number>>>;
  readonly q6r?: number;
  readonly q6m?: {
    /** exam month 3..11 */
    readonly month: number;
    readonly grades: Readonly<Partial<Record<MockSubjectCode, number>>>;
  };
  readonly q8?: Ordinal;
  /** hidden when q8 is FLOW:NA or absent */
  readonly q8s?: Ordinal;
  /** hidden when q8s is SUBJ:NA or absent */
  readonly q8d?: Ordinal;
  /** 15 items + V1 */
  readonly q9: LikertBlock;
  /** 6 items + V3 */
  readonly q20: LikertBlock;
  /** max 3 */
  readonly q10?: readonly Ordinal[];
  /** 12 track items + V2 */
  readonly q11: LikertBlock;
  /** max 3, ordinals of the track's q12 rows */
  readonly q12?: readonly Ordinal[];
  /** up to 3 dated events, or an exclusive choice; absent = 일정 없음 (13 H24) */
  readonly q13?: readonly ScheduleEvent[] | "NONE" | "UNKNOWN";
  readonly q21: { readonly weekday: Ordinal; readonly weekend: Ordinal };
  /** max 2 */
  readonly q14?: readonly Ordinal[];
  /** hidden for M3 */
  readonly q15?: AdmissionTarget;
  /** q16..q18 shown only with q15 */
  readonly q16?: Ordinal;
  readonly q17?: Ordinal;
  readonly q18?: Ordinal;
  /** absent = NONE (13 H31) */
  readonly q22?: MbtiType | "NONE";
  /** 35 items by item number (not display order) + V4 */
  readonly q23: LikertBlock;
};

// ---------------------------------------------------------------------------
// Context (server inputs)
// ---------------------------------------------------------------------------

export type DiagnosisV3Context = {
  readonly diagnosedAt: IsoDate;
  /** profiles.created_at as a KST date; null falls back to diagnosedAt (07 B24) */
  readonly joinedAt: IsoDate | null;
  /** null when q15 is absent or nothing was found */
  readonly admission: {
    readonly cut50: number | null;
    readonly cut70: number | null;
    readonly competitionRate: number | null;
    readonly universityName: string;
    readonly unitName: string;
    readonly typeName: string;
    readonly year: number;
  } | null;
  readonly studentName: string | null;
};

// ---------------------------------------------------------------------------
// Scores (machine layer, code keys only)
// ---------------------------------------------------------------------------

/** 06 r14-r18 grade bands: L1 80+, L2 70+, L3 60+, L4 45+, L5 below. */
export type GradeLevel = "L1" | "L2" | "L3" | "L4" | "L5";

/** 06 r20-r23 area state: TOP 70+, MID 60+, LOW 45+, WEAK below. */
export type AreaState = "TOP" | "MID" | "LOW" | "WEAK";

export type AreaScore = {
  readonly score: number;
  readonly state: AreaState;
  readonly level: GradeLevel;
  /** max(0, 75 - score), 15 r12 */
  readonly gapToTarget: number;
  /** checked q10 / q12 options mapped to this area (23 r7) */
  readonly checks: number;
  /** lowest scale value after reversal (23 r8) */
  readonly minItem: number;
};

/** 06 r25-r33: TYPE_1..TYPE_9 copy ids. */
export type StudentType = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

/** 22 r29 goal matrix cell. */
export type GoalCell =
  | "C_IN"
  | "C_MIX"
  | "C_EX"
  | "C_NA"
  | "E_IN"
  | "E_MIX"
  | "E_EX"
  | "E_NA";

/** 22 r44 subject verdict. */
export type SubjectVerdict = "PRIORITY" | "CHECK" | "STRENGTH" | "KEEP";

/** 08 bands: 1 안정, 2 적정, 3 소신, 4 위험 (BAND_n, ADM_HEAD_n). */
export type AdmissionBand = 1 | 2 | 3 | 4;

/** 18 r32-r48 rule areas. */
export type TempRuleArea = "HS" | "AD_RATIO" | "AD_HOLISTIC" | "PACE" | "SUBJ";

/** 20 r16-r20. */
export type LeverCode =
  | "LEVER_P1_LOG"
  | "LEVER_P1_PLAN"
  | "LEVER_P1_GOAL"
  | "LEVER_H12_DEEP"
  | "LEVER_H12_REC";

export type ServiceFit = {
  readonly code: ServiceCode;
  /** difficulty + hope + deficit, one decimal */
  readonly fit: number;
  readonly difficulty: number;
  readonly hope: number;
  readonly deficit: number;
  /** related area mean, the 23 r19 tie breaker */
  readonly relatedMean: number;
  /** 07 B31: S1 80+, S2 65+, S3 below */
  readonly band: "S1" | "S2" | "S3";
};

export type PlanTask = {
  readonly date: IsoDate;
  /** Day 1 = diagnosedAt */
  readonly day: number;
  readonly week: 1 | 2 | 3 | 4;
  /** COPY_TEXT id of the task text (FIX_*, AREA_*_ACTn, EVT_*, EXAMOPS_*) */
  readonly taskId: string;
  /** COPY_TEXT id of the done criterion (DONE_*), when the task has one */
  readonly doneId?: string;
  /** plan column 1..3 for area tasks */
  readonly column?: 1 | 2 | 3;
  readonly area?: AreaCode;
  readonly event?: ScheduleEvent;
};

export type PrescriptionItem = {
  readonly question: "q9" | "q11";
  readonly no: number;
  readonly area: AreaCode;
  readonly answer: Likert;
};

export type Prescription = {
  readonly lever: LeverCode | null;
  readonly weak: readonly (PrescriptionItem & {
    readonly target: Likert;
    /** earliest plan task of the area, else the area ACT1 copy id */
    readonly link:
      | { readonly kind: "task"; readonly task: PlanTask }
      | { readonly kind: "act"; readonly actId: string };
  })[];
  readonly strong: readonly PrescriptionItem[];
};

export type DiagnosisV3Scores = {
  readonly track: TrackCode;
  /** q1 ordinal, keeps 고3 vs N수 and 고1 vs 고2 apart */
  readonly grade: Ordinal;
  readonly page1: {
    readonly areas: Readonly<Record<P1Code, AreaScore>>;
    readonly total: number;
    readonly level: GradeLevel;
    /** low to high, 23 tie rule */
    readonly order: readonly P1Code[];
  };
  readonly mind: {
    readonly areas: Readonly<Record<MindCode, AreaScore>>;
    readonly lowest: MindCode;
    readonly highest: MindCode;
  };
  readonly page2: {
    readonly areas: Readonly<Partial<Record<P2Code, AreaScore>>>;
    readonly total: number;
    readonly level: GradeLevel;
    /** low to high, 23 tie rule */
    readonly order: readonly P2Code[];
  };
  readonly reliability: {
    readonly flags: Readonly<
      Record<"F1" | "F2" | "F3" | "F4" | "F5" | "F6", boolean>
    >;
    /** 17 r14-r16 */
    readonly diagnosis: "SIMPLE" | "MID" | "GOOD";
    /** 17 r17-r18 */
    readonly temperament: "CAUTION" | "NORMAL";
  };
  /** null when reliability.diagnosis is SIMPLE */
  readonly studentType: StudentType | null;
  readonly goal: {
    readonly cell: GoalCell;
    /** 22 r35 filled rungs */
    readonly ladder: {
      readonly far: boolean;
      readonly mid: boolean;
      readonly near: boolean;
    };
  };
  /** 21 r35 */
  readonly examOps: "RISK" | "MID" | "OK";
  /** 22 r44; null when 22 r45 applies */
  readonly subjects: Readonly<
    Partial<Record<SubjectCode, SubjectVerdict>>
  > | null;
  readonly temperament: {
    readonly dims: Readonly<
      Record<
        TempDim,
        { readonly score: number; readonly level: "H" | "M" | "L" }
      >
    >;
    readonly factors: Readonly<Record<TempFactor, number>>;
    /** 18 r18-r19 */
    readonly representative:
      | { readonly kind: "single"; readonly dim: TempDim }
      | { readonly kind: "mixed"; readonly dims: readonly [TempDim, TempDim] };
    /** 18 r23, judge-report R12 order NS, SD, RD */
    readonly swayCause: "NS" | "SD" | "RD";
    readonly xchkHa: boolean;
    readonly xchkSust: boolean;
    /** 18 r27 TEMP_COUNSEL after the SIMPLE and CAUTION exclusions */
    readonly counsel: boolean;
    /** 18 r32-r48 fired rule ids (T_*) per area, max 2, track rules only */
    readonly rules: Readonly<Partial<Record<TempRuleArea, readonly string[]>>>;
    /** 18 r50-r52 */
    readonly methods: readonly ("M_NS" | "M_HA" | "M_PS")[];
  };
  /** null when q22 is NONE or absent */
  readonly mbti: {
    readonly type: MbtiType;
    readonly sampleN: number;
    readonly sharePct: number;
    /** 19 C..G factor numbers 1..5 (MBTI_HABIT_n), all maxima */
    readonly topFactors: readonly number[];
    readonly smallSample: boolean;
  } | null;
  readonly admission:
    | { readonly status: "HIDDEN" }
    | { readonly status: "SKIPPED" }
    | { readonly status: "NODATA" }
    | {
        readonly status: "COMPUTED";
        readonly mode: "PRECISE" | "BASIC";
        /** q6 converted to the 9-grade scale */
        readonly grade9: number;
        readonly baseBand: AdmissionBand;
        readonly probability: number;
        readonly probabilityLow: number;
        readonly probabilityHigh: number;
        readonly band: AdmissionBand;
      };
  readonly services: {
    /** 07 C16-C21 candidate scope */
    readonly scope: "ALL" | "M3" | "NSU" | "G3LATE";
    readonly ranked: readonly [ServiceFit, ServiceFit];
    readonly counselPinned: boolean;
  };
  readonly urgency: {
    readonly base: number;
    readonly lowAreas: number;
    readonly points: number;
    /** URG_L1 낮음 .. URG_L4 매우 높음 */
    readonly level: "L1" | "L2" | "L3" | "L4";
  };
  readonly plan: {
    readonly columns: readonly [P1Code, P1Code, P2Code];
    readonly tasks: readonly PlanTask[];
    readonly reducedWeeks: readonly (1 | 2 | 3 | 4)[];
    /** Day 29..42 events */
    readonly afterEvents: readonly ScheduleEvent[];
    readonly minLoad: number;
    readonly redxDate: IsoDate;
  };
  readonly prescriptions: {
    readonly page1: Prescription;
    readonly page2: Prescription;
  };
};

// ---------------------------------------------------------------------------
// Pages (render layer): final display strings per 22_리포트요소 row. A hidden
// element is an absent optional field or the other arm of a union. Copy
// strings keep their source markup (for example <br>) as COPY_TEXT has it.
// ---------------------------------------------------------------------------

export type ScoreBar = {
  readonly code: AreaCode;
  readonly label: string;
  readonly score: number;
  /** state label text (06 r20-r23 for the page) */
  readonly state: string;
  /** 06 r20-r23 state code behind the label; the view colors by it (15 r17) */
  readonly stateCode: AreaState;
};

export type TextBlock = { readonly heading: string; readonly body: string };

export type PrescriptionTable = {
  /** RX_INTRO */
  readonly intro: string;
  /** LEVER_* when a lever fired */
  readonly lever?: string;
  readonly weak:
    | {
        readonly kind: "items";
        readonly items: readonly {
          readonly question: string;
          /** rx.target filled with the current and target answer labels */
          readonly target: string;
          /** linked task text with its due date, or AREA_*_ACT1 */
          readonly link: string;
        }[];
      }
    | { readonly kind: "none"; readonly text: string };
  readonly strong: readonly {
    readonly question: string;
    readonly answer: string;
  }[];
};

export type CoverPage = {
  /** 22 r6; absent when the profile has no name */
  readonly studentName?: string;
  /** 22 r6 */
  readonly gradeLabel: string;
  /** 22 r6 */
  readonly schoolTypeLabel: string;
  /** 22 r6 */
  readonly diagnosedAt: string;
  /** 22 r7: shown page numbers and titles (M3 drops page 7) */
  readonly toc: readonly { readonly page: number; readonly title: string }[];
  /** judge-report R6: 1p title, 4p stage scores with their break marks (PDF p1), REPORT_BASIS */
  readonly headline: string;
  readonly stages: readonly (ScoreBar & { readonly broken: boolean })[];
  readonly basis: string;
};

export type Page1 = {
  /** 22 r9 TYPE_n_HEAD / SINCERITY_HEAD */
  readonly title: string;
  /** 22 r10, absent when SIMPLE */
  readonly typeSummary?: { readonly name: string; readonly body: string };
  /** 22 r11 SUM_LEAD / SUM_LEAD_SIMPLE */
  readonly lead: string;
  readonly profile: {
    /** 22 r12 */
    readonly grade: string;
    /** 22 r12 */
    readonly school: string;
    /** 22 r13 */
    readonly target: string;
    /** 22 r14 */
    readonly gpa: string;
    /** 22 r15 */
    readonly trend: string;
    /** 22 r16: Day 1, Day 28 and the re-diagnosis date, each plan.due; the layout joins them */
    readonly period: {
      readonly from: string;
      readonly to: string;
      readonly redx: string;
    };
    /** 22 r17 */
    readonly temperament: string;
    /** 22 r18 */
    readonly reliability: string;
  };
  /** 22 r19 */
  readonly radar: {
    readonly stages: readonly ScoreBar[];
    readonly total: number;
    readonly target: number;
  };
  /** 22 r20 */
  readonly kpi1: {
    readonly label: string;
    readonly area: ScoreBar;
    readonly subtitle: string;
  };
  /** 22 r21 */
  readonly kpi2: {
    readonly label: string;
    readonly total: number;
    readonly sub: string;
  };
  /** 22 r22 */
  readonly kpi3: {
    readonly label: string;
    readonly area: ScoreBar;
    readonly sub: string;
  };
  /** 22 r23 */
  readonly traitIntro: string;
  /** 22 r24-r26 */
  readonly traits: readonly [TextBlock, TextBlock, TextBlock];
  /** 22 r27 ONE_TITLE and actions */
  readonly one: { readonly title: string; readonly actions: readonly string[] };
};

export type LadderRung = {
  readonly source: string;
  readonly text: string;
};

export type Page2 = {
  /** 22 r30 */
  readonly title: string;
  /** 22 r31 */
  readonly lead: string;
  /** 22 r32: q3 options as a 6-step bar */
  readonly specificity: {
    readonly options: readonly string[];
    readonly selectedIndex: number;
    readonly university?: string;
    readonly major?: string;
  };
  /** 22 r33, shown when q3r was shown */
  readonly reasons?: {
    readonly chips: readonly string[];
    readonly intrinsic: number;
    readonly extrinsic: number;
  };
  /** 22 r34: 6 cells, NA highlights none */
  readonly matrix: {
    readonly cells: readonly {
      readonly cell: GoalCell;
      readonly name: string;
      readonly desc: string;
    }[];
    readonly highlighted?: GoalCell;
    /** 22 r29/r34: an NA cell is not drawn, its GOAL_Q_C_NA / GOAL_Q_E_NA name and desc stand as the matrix note */
    readonly note?: { readonly name: string; readonly desc: string };
  };
  /** 22 r35 */
  readonly ladder: {
    readonly far: boolean;
    readonly mid: boolean;
    readonly near: boolean;
    readonly text: string;
    /** PDF p3 rung content; source is the 22 D35 question ("3번", "8-1", "8-2"); absent in payloads stored before 2026-11-23 */
    readonly rungs?: {
      /** the 1p profile target (16번 names, else 3번 inputs) */
      readonly far: LadderRung;
      /** 01 q9 item statement and its 01 A2 answer word */
      readonly mid: LadderRung & { readonly answer: string };
      readonly near: LadderRung & { readonly answer: string };
    };
  };
  /** 22 r36: cell tip, ladder tip */
  readonly tips: readonly [string, string];
};

export type Page3 = {
  /** 22 r38 */
  readonly title: string;
  /** 22 r39 */
  readonly lead: string;
  /** 22 r40 */
  readonly gpa: string;
  /** 22 r41 */
  readonly recent: string;
  /** 22 r42 */
  readonly trend: string;
  /** 22 r43 */
  readonly bars?: {
    readonly school: readonly {
      readonly subject: SubjectCode;
      readonly grade: number;
    }[];
    readonly mock?: {
      readonly month: number;
      readonly grades: readonly {
        readonly subject: MockSubjectCode;
        readonly grade: number;
      }[];
    };
  };
  /** 22 r44 table or 22 r45 skip note */
  readonly subjects:
    | {
        readonly kind: "table";
        readonly rows: readonly {
          readonly subject: SubjectCode;
          readonly verdict: SubjectVerdict;
          readonly text: string;
        }[];
        readonly note: string;
      }
    | { readonly kind: "skip"; readonly note: string };
  /** 22 r46 */
  readonly examOps: TextBlock;
  /** spec row 76: verdict word of scores.examOps, 21 C35 (보완, 보통, 양호); absent in payloads stored before 2026-11-23 */
  readonly examOpsVerdict?: string;
  /** spec row 76: the 8-15 answer word (01 A2) and the 10번 15 option label (02 r20) when picked */
  readonly examOpsEvidence: {
    readonly item: string;
    readonly answer: string;
    readonly examRoom?: string;
  };
};

export type Page4 = {
  /** 22 r48 */
  readonly title: string;
  /** 22 r49 CYC_LEAD */
  readonly lead: string;
  /** 22 r49 CYC_SCORE_NOTE */
  readonly scoreNote: string;
  /** 22 r50 */
  readonly cycle: {
    readonly stages: readonly (ScoreBar & { readonly broken: boolean })[];
    readonly total: number;
    readonly gradeText: string;
    readonly caption: string;
  };
  /** 22 r51: lowest 3 stages, NARR heading and body */
  readonly breaks: readonly TextBlock[];
  /** 22 r52 */
  readonly why?: TextBlock;
  /** 22 r53 */
  readonly rx: PrescriptionTable;
};

export type Page5 = {
  /** 22 r55 */
  readonly title: string;
  /** 22 r56 */
  readonly lead: string;
  /** 22 r57: q10 options grouped by area, picked ones marked */
  readonly groups: readonly {
    readonly area: string;
    readonly options: readonly {
      readonly label: string;
      readonly selected: boolean;
    }[];
  }[];
  /** 22 r58 */
  readonly mind: { readonly bars: readonly ScoreBar[]; readonly note: string };
  /** 22 r59: one line per MIND area, then the lowest area WEAK line */
  readonly interpretation: {
    readonly areas: readonly string[];
    readonly weak: string;
  };
  /** 22 r60 items or 22 r61 note; absent when SIMPLE with picks */
  readonly crossCheck?:
    | {
        readonly kind: "items";
        readonly items: readonly {
          readonly option: string;
          readonly area: ScoreBar;
          readonly answers: readonly {
            readonly question: string;
            readonly answer: string;
          }[];
          readonly text: string;
        }[];
      }
    | { readonly kind: "skipped"; readonly text: string };
};

export type Page6 = {
  /** 22 r63 */
  readonly title: string;
  /** 22 r64 */
  readonly lead: string;
  /** 22 r65 low to high */
  readonly bars: {
    readonly areas: readonly ScoreBar[];
    readonly total: number;
    readonly gradeText: string;
  };
  /** 22 r66 */
  readonly hardest?: readonly {
    readonly option: string;
    readonly area: string;
  }[];
  /** 22 r67 */
  readonly overlap: string;
  /** 22 r68 */
  readonly strengths: readonly TextBlock[];
  /** 22 r68 STR_NONE / STR_ONE */
  readonly strengthNote?: string;
  /** 22 r68 */
  readonly weaknesses: readonly TextBlock[];
  /** 22 r69 */
  readonly rx: PrescriptionTable;
};

export type Page7 = {
  /** 22 r71 */
  readonly title: string;
  /** 17 ADM_LEAD (17 r115 항상), the PDF p8 lead (judge-report R6 b) */
  readonly lead: string;
  /** 22 r72-r73 when computed, else 22 r74 */
  readonly result:
    | {
        readonly kind: "computed";
        /** 22 r72 */
        readonly comparison: {
          readonly cut50?: { readonly label: string; readonly value: number };
          readonly cut70: { readonly label: string; readonly value: number };
          readonly mine: { readonly label: string; readonly value: number };
          /** gap to the 70% cut (diff_short / diff_over / diff_base) */
          readonly diff: string;
          /** gap to the 50% cut, when that cut is shown */
          readonly diff50?: string;
          readonly source: string;
        };
        /** 22 r73 */
        readonly band: {
          readonly headline: string;
          readonly text: string;
          readonly precision?: string;
        };
      }
    | {
        readonly kind: "notice";
        readonly text: string;
        /** NODATA shows the names only */
        readonly universityName?: string;
        readonly unitName?: string;
      };
  /** 22 r75, when q15 was answered */
  readonly cards?: readonly {
    readonly question: string;
    readonly answer: string;
    /** ADM_Q1x_n; absent for an unanswered card (ADM_NA) */
    readonly text?: string;
  }[];
  /** 22 r76 */
  readonly roadmap: {
    readonly title: string;
    readonly steps: readonly { readonly when: string; readonly text: string }[];
  };
  /** 22 r77 ADMISSION_NOTE, PROB_NOTE */
  readonly notes: readonly [string, string];
};

export type Page8 = {
  /** 22 r79-r82 or 22 r83 */
  readonly mbti:
    | {
        readonly kind: "type";
        /** 22 r79 */
        readonly card: {
          readonly type: MbtiType;
          readonly nick: string;
          readonly style: string;
          readonly share: string;
        };
        /** 22 r80 */
        readonly poles: readonly {
          readonly letter: string;
          readonly name: string;
          readonly habit: string;
          readonly tip: string;
        }[];
        /** 22 r81 */
        readonly factors: {
          /** mbti.top up to {factors} */
          readonly lead: string;
          /** 19 r4 names of the tied top factors; the layout joins them */
          readonly names: readonly string[];
          readonly habits: readonly string[];
          readonly smallSample?: string;
        };
        /** 22 r82 */
        readonly links: readonly string[];
      }
    | {
        readonly kind: "none";
        readonly text: string;
        readonly habits: readonly string[];
      };
  /** 22 r84 */
  readonly disclaimer: string;
};

export type Page9 = {
  /** 22 r86 */
  readonly title: string;
  /** 22 r87 TEMP_LEAD */
  readonly lead: string;
  /** 22 r87 TEMP_SCALE_NOTE */
  readonly scaleNote: string;
  /** 22 r88 */
  readonly hero: {
    readonly name: string;
    readonly sub: string;
    readonly body: string;
  };
  /** 22 r89 */
  readonly dims: readonly {
    readonly dim: TempDim;
    /** 18 C6-C12 dimension name */
    readonly label: string;
    readonly score: number;
    readonly level: "H" | "M" | "L";
    /** 18 B14-B16 level word */
    readonly levelLabel: string;
    readonly text: string;
  }[];
  /** 22 r90 */
  readonly study: {
    readonly strengths: readonly string[];
    readonly cautions: readonly string[];
  };
  /** 22 r91 */
  readonly crossCheck: readonly string[];
  /** 22 r92 */
  readonly factors: {
    readonly items: readonly {
      readonly factor: TempFactor;
      /** temp.factor: name, score, label */
      readonly heading: string;
      /** TEMP_F_<x>_<label> */
      readonly text: string;
    }[];
    readonly swayCause: string;
  };
  /** 22 r93 */
  readonly lowReliability?: string;
  /** 22 r94 */
  readonly protect: string;
};

export type Page10 = {
  /** 22 r96 TEMP_ADM_HEAD */
  readonly title: string;
  /** 22 r96 TEMP_ADMIT_INTRO */
  readonly intro: string;
  /** 22 r97 rules or 22 r98 notice */
  readonly admission:
    | {
        readonly kind: "rules";
        readonly areas: readonly {
          readonly area: TempRuleArea;
          /** 18 B area name, the area heading */
          readonly name: string;
          /** 22 r97 D: values named by the fired rule conditions, [] for TEMP_RULE_NONE */
          readonly basis: readonly {
            readonly label: string;
            readonly score: number;
          }[];
          readonly texts: readonly string[];
        }[];
      }
    | { readonly kind: "hidden"; readonly text: string };
  /** 22 r99 */
  readonly methods: readonly string[];
};

export type Page11 = {
  /** 22 r101 PLAN_HEAD */
  readonly title: string;
  /** 22 r101 PLAN_LEAD */
  readonly lead: string;
  /** 22 r102 (judge-report R5: no formula sentence) */
  readonly urgency: {
    /** 22 B102 element name, the PDF p11 box title; absent in payloads stored before 2026-11-23 */
    readonly title?: string;
    /** scores.urgency.points (not a 0..100 score), the PDF p11 "N점"; absent in payloads stored before 2026-11-23 */
    readonly points?: number;
    readonly label: string;
    readonly text: string;
  };
  /** 22 r103 */
  readonly events:
    | {
        readonly kind: "events";
        readonly within: readonly string[];
        readonly after?: string;
      }
    | { readonly kind: "none"; readonly text: string };
  /** 22 r104 */
  readonly table: {
    readonly columns: readonly [string, string, string];
    readonly weeks: readonly {
      readonly week: 1 | 2 | 3 | 4;
      readonly cells: readonly [string, string, string];
      readonly reduced: boolean;
    }[];
    readonly reduceNote?: string;
    readonly ruleNote: string;
  };
  /** 22 r105 */
  readonly numbers: {
    readonly logMinutes: number;
    readonly rates: readonly number[];
    readonly minLoad: string;
  };
  /** 22 r106, absent when nothing applies */
  readonly styleTips?: readonly string[];
  /** 22 r107 */
  readonly checkpoints: readonly string[];
};

export type PlannerPage = {
  /** 22 r109 */
  readonly week: 1 | 2 | 3 | 4;
  readonly goal: string;
  readonly badge: string;
  readonly redx: string;
  /** 22 r110 */
  readonly done: readonly string[];
  /** 22 r111 */
  readonly tasks: readonly {
    readonly area: string;
    readonly task: string;
    readonly due: string;
    readonly done?: string;
  }[];
  /** 22 r112: 7 days */
  readonly days: readonly {
    readonly date: string;
    readonly tasks: readonly string[];
    readonly highlight: boolean;
  }[];
  /** 22 r113 */
  readonly slip: readonly string[];
};

export type ServiceCard = {
  readonly code: ServiceCode;
  readonly name: string;
  /** SVC_RANK1_PREFIX / SVC_RANK2_PREFIX / SVC_CALL_TEMP_PREFIX */
  readonly prefix: string;
  readonly text: string;
  readonly tags: readonly string[];
};

export type Page16 = {
  /** 22 r115 */
  readonly title: string;
  /** 17 SVC_LEAD (17 r168 항상), the PDF p17 lead (judge-report R6 b) */
  readonly lead: string;
  /** 22 r116 */
  readonly preferences: readonly string[];
  /** 22 r117 */
  readonly services: readonly [ServiceCard, ServiceCard];
  /** 22 r118 */
  readonly scopeNote?: string;
  /** candidate scope behind scopeNote (07 B30); render layer picks the closed-site notice by it */
  readonly scope?: "ALL" | "M3" | "NSU" | "G3LATE";
  /** 22 r119 */
  readonly agenda: readonly [string, string, string];
  /** 22 r120 */
  readonly reading: readonly string[];
  /** 22 r121 REPORT_BASIS, REPORT_LIMIT */
  readonly footer: readonly [string, string];
};

export type DiagnosisV3Pages = {
  readonly cover: CoverPage;
  readonly p1: Page1;
  readonly p2: Page2;
  readonly p3: Page3;
  readonly p4: Page4;
  readonly p5: Page5;
  readonly p6: Page6;
  /** absent for M3 (22 r70) */
  readonly p7?: Page7;
  readonly p8: Page8;
  readonly p9: Page9;
  readonly p10: Page10;
  readonly p11: Page11;
  readonly p12: PlannerPage;
  readonly p13: PlannerPage;
  readonly p14: PlannerPage;
  readonly p15: PlannerPage;
  readonly p16: Page16;
};

export type DiagnosisV3Payload = {
  readonly version: typeof SCHEMA_VERSION;
  readonly scores: DiagnosisV3Scores;
  readonly pages: DiagnosisV3Pages;
};
