// Test fixture for pages 7 to 16 (DiagnosisV3Pages p7..p16). Strings are markers, not client copy.
import type {
  DiagnosisV3Pages,
  Page7,
  Page8,
  Page9,
  Page10,
  Page11,
  Page16,
  PlannerPage,
} from "@/lib/diagnosis-v3/types";

export const p7: Page7 = {
  title: "P7 title",
  lead: "P7 lead",
  result: {
    kind: "computed",
    comparison: {
      cut50: { label: "CUT50 label", value: 3.1 },
      cut70: { label: "CUT70 label", value: 3.4 },
      mine: { label: "MINE label", value: 3.2 },
      diff: "DIFF text",
      source: "SOURCE text",
    },
    band: {
      headline: "BAND headline",
      text: "BAND text",
      precision: "PRECISION text",
    },
  },
  cards: [{ question: "CARD q", answer: "CARD a", text: "CARD text" }],
  roadmap: {
    title: "ROADMAP title",
    steps: [
      { when: "WHEN1", text: "STEP1" },
      { when: "WHEN2", text: "STEP2" },
    ],
  },
  notes: ["NOTE admission", "NOTE prob"],
};

export const p8: Page8 = {
  mbti: {
    kind: "type",
    card: { type: "ENTJ", nick: "NICK", style: "STYLE", share: "SHARE" },
    poles: [
      {
        letter: "E",
        name: "POLE name E",
        habit: "POLE habit E",
        tip: "POLE tip E",
      },
      {
        letter: "N",
        name: "POLE name N",
        habit: "POLE habit N",
        tip: "POLE tip N",
      },
    ],
    factors: {
      lead: "FACTORS lead ",
      names: ["FACTOR a", "FACTOR b"],
      habits: ["FACTOR habit1"],
      smallSample: "SMALL sample",
    },
    links: ["LINK1"],
  },
  disclaimer: "MBTI disclaimer",
};

export const p9: Page9 = {
  title: "P9 title",
  lead: "TEMP lead",
  scaleNote: "TEMP scale",
  hero: { name: "HERO name", sub: "HERO sub", body: "HERO body" },
  dims: [
    {
      dim: "NS",
      label: "DIM label1",
      score: 4,
      level: "H",
      levelLabel: "LEVEL high",
      text: "DIM text1",
    },
    {
      dim: "HA",
      label: "DIM label2",
      score: 3,
      level: "M",
      levelLabel: "LEVEL mid",
      text: "DIM text2",
    },
  ],
  study: { strengths: ["STUDY strength"], cautions: ["STUDY caution"] },
  crossCheck: ["CROSS item"],
  factors: {
    items: [
      { factor: "F_STAB", heading: "TFACTOR heading", text: "TFACTOR text" },
    ],
    swayCause: "SWAY cause",
  },
  lowReliability: "LOWREL text",
  protect: "PROTECT text",
};

export const p10: Page10 = {
  title: "P10 title",
  intro: "ADMIT intro",
  admission: {
    kind: "rules",
    areas: [
      {
        area: "HS",
        name: "AREA hs",
        basis: [
          { label: "BASIS a", score: 50 },
          { label: "BASIS b", score: 75 },
        ],
        texts: ["RULE hs1", "RULE hs2"],
      },
      { area: "PACE", name: "AREA pace", basis: [], texts: ["RULE pace"] },
    ],
  },
  methods: ["METHOD1"],
};

export const p11: Page11 = {
  title: "P11 title",
  lead: "PLAN lead",
  urgency: { label: "URG label", text: "URG text" },
  events: { kind: "events", within: ["EVT within1"], after: "EVT after" },
  table: {
    columns: ["COL1", "COL2", "COL3"],
    weeks: [
      { week: 1, cells: ["W1a", "W1b", "W1c"], reduced: false },
      { week: 2, cells: ["W2a", "W2b", "W2c"], reduced: true },
      { week: 3, cells: ["W3a", "W3b", "W3c"], reduced: false },
      { week: 4, cells: ["W4a", "W4b", "W4c"], reduced: false },
    ],
    reduceNote: "REDUCE note",
    ruleNote: "RULE note",
  },
  numbers: { logMinutes: 15, rates: [80, 70, 60], minLoad: "MINLOAD text" },
  styleTips: ["TIP1"],
  checkpoints: ["CHECK1", "CHECK2"],
};

export const planner = (week: 1 | 2 | 3 | 4): PlannerPage => ({
  week,
  goal: `GOAL${week}`,
  badge: `BADGE${week}`,
  redx: `REDX${week}`,
  done: [`DONE${week}a`],
  tasks: [
    { area: `AREA${week}`, task: `TASK${week}`, due: `DUE${week}` },
    {
      area: `AREB${week}`,
      task: `TASKB${week}`,
      due: `DUEB${week}`,
      done: `DONEAT${week}`,
    },
  ],
  days: Array.from({ length: 7 }, (_, i) => ({
    date: `DATE${week}-${i + 1}`,
    tasks: i === 2 ? [`DAYTASK${week}`] : [],
    highlight: i === 2,
  })),
  slip: [`SLIP${week}`],
});

export const p16: Page16 = {
  title: "P16 title",
  lead: "P16 lead",
  preferences: ["PREF1", "PREF2"],
  services: [
    {
      code: "GOAL",
      name: "SVC name1",
      prefix: "RANK1",
      text: "SVC text1",
      tags: ["TAG1"],
    },
    {
      code: "PERF",
      name: "SVC name2",
      prefix: "RANK2",
      text: "SVC text2",
      tags: ["TAG2"],
    },
  ],
  scopeNote: "SCOPE note",
  agenda: ["AGENDA1", "AGENDA2", "AGENDA3"],
  reading: ["READ1"],
  footer: ["FOOT basis", "FOOT limit"],
};

export const laterPages = {
  p7,
  p8,
  p9,
  p10,
  p11,
  p12: planner(1),
  p13: planner(2),
  p14: planner(3),
  p15: planner(4),
  p16,
} as unknown as DiagnosisV3Pages;
