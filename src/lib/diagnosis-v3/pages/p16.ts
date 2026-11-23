// 16p 서비스 \u00b7 안내 (22 r115-r121).

import {
  AREAS,
  type AreaCode,
  MIND_CODES,
  P1_CODES,
  P2_CODES,
  type ServiceCode,
  TRACK_NAMES,
} from "../codes.js";
import { copy, fill, reportCell } from "../copy.js";
import { OPTIONS } from "../options.js";
import { formatDue } from "../plan.js";
import type { Engine } from "../report.js";
import { sheetRows, textCell } from "../sheet.js";
import { COPY_SHEETS, COPY_TEXT } from "../source/copyText.js";
import { orderLowToHigh } from "../tie.js";
import type { AreaScore, Page16, ServiceCard, ServiceFit } from "../types.js";
import { nextText } from "./common.js";

// 08 and 09 copy rows keyed 고3\u00b7N수 win over 기본 for H3 (08 A2, 09 A2, 22 r117)
const TRACK_COPY = "고3\u00b7N수";
const BASE_COPY = "기본";

const sheet07 = sheetRows("07_서비스");

/** 07 r16-r21 B: service name. */
const serviceName = (code: ServiceCode) => {
  const row = sheet07.find((r) => r.r >= 16 && r.r <= 21 && r.c[0] === code);
  if (!row) throw new Error("missing 07 name row " + code);
  return textCell(row, 1);
};

/** 07 r5-r14 F: related areas of the service in the track. */
const relatedAreas = (engine: Engine, code: ServiceCode): AreaCode[] => {
  const track = engine.scores.track;
  const row = sheet07.find(
    (r) =>
      r.r >= 5 &&
      r.r <= 14 &&
      r.c[0] === code &&
      (r.c[2] === "공통" || r.c[2] === TRACK_NAMES[track]),
  );
  if (!row) throw new Error("missing 07 row " + code + " " + track);
  const codes: readonly AreaCode[] = [
    ...P1_CODES,
    ...P2_CODES[track],
    ...MIND_CODES,
  ];
  return textCell(row, 5)
    .split(/,\s*/)
    .map((label) => {
      const area = codes.find((c) => AREAS[c].label === label);
      if (!area) throw new Error("07 area " + label + " not in " + track);
      return area;
    });
};

const allAreas = (engine: Engine): Partial<Record<AreaCode, AreaScore>> => ({
  ...engine.scores.page1.areas,
  ...engine.scores.page2.areas,
  ...engine.scores.mind.areas,
});

/** 09 D-G tags, the 고3\u00b7N수 row first when preferred. */
const tagsOf = (code: ServiceCode, preferTrack: boolean) => {
  const rows = (COPY_SHEETS["09_서비스태그"] ?? []).filter(
    (r) => r.c[0] === code,
  );
  const row =
    (preferTrack ? rows.find((r) => r.c[2] === TRACK_COPY) : undefined) ??
    rows.find((r) => r.c[2] === BASE_COPY);
  if (!row) throw new Error("missing 09 tags " + code);
  return [3, 4, 5, 6].map((col) => String(row.c[col]));
};

const serviceText = (fit: ServiceFit, preferTrack: boolean) => {
  const base = "SVC_" + fit.code + "_" + fit.band;
  const track = base + "@" + TRACK_COPY;
  return copy(preferTrack && track in COPY_TEXT ? track : base);
};

// 22 r18 E: "양호 RELIAB_GOOD / 보통 RELIAB_MID / 응답 단순 SINCERITY_BANNER"
const RELIABILITY_LABELS = new Map(
  reportCell(18, 4)
    .split(" / ")
    .map((part) => {
      const words = part.split(" ");
      return [String(words.at(-1)), words.slice(0, -1).join(" ")] as const;
    }),
);
const RELIABILITY_IDS = {
  GOOD: "RELIAB_GOOD",
  MID: "RELIAB_MID",
  SIMPLE: "SINCERITY_BANNER",
} as const;

const SCOPE_NOTES = {
  M3: "SVC_M3_LIMIT",
  NSU: "SVC_NSU_LIMIT",
  G3LATE: "SVC_G3LATE_LIMIT",
} as const;

export function buildPage16(engine: Engine): Page16 {
  const { scores, answers, services, admission } = engine;
  const preferTrack = services.preferTrackCopy;
  const [first, second] = services.ranked;
  const [lowP1] = scores.page1.order;
  const [lowP2] = scores.page2.order;
  if (!lowP1 || !lowP2) throw new Error("empty area order");
  const lowP2Score = scores.page2.areas[lowP2]?.score;
  if (lowP2Score === undefined) throw new Error("missing " + lowP2);
  // 22 r117 SVC_RANK2_PREFIX {영역}: lowest related area of the 2nd service (23 tie rule)
  const [secondLow] = orderLowToHigh(
    allAreas(engine),
    relatedAreas(engine, second.code),
  );
  if (!secondLow) throw new Error("no related area for " + second.code);
  const card = (fit: ServiceFit, prefix: string): ServiceCard => ({
    code: fit.code,
    name: serviceName(fit.code),
    prefix,
    text: serviceText(fit, preferTrack),
    tags: tagsOf(fit.code, preferTrack),
  });
  const reliabilityId = RELIABILITY_IDS[scores.reliability.diagnosis];
  const reliabilityLabel = RELIABILITY_LABELS.get(reliabilityId);
  if (reliabilityLabel === undefined)
    throw new Error("no label " + reliabilityId);
  return {
    // 22 r115
    title: copy(
      scores.reliability.diagnosis === "SIMPLE"
        ? "SVC_HEAD_HIDDEN"
        : services.counselPinned
          ? "SVC_HEAD_TEMP"
          : "SVC_HEAD_2",
    ),
    // 22 r116
    preferences: OPTIONS.q14
      .filter((o) => answers.q14?.includes(o.ordinal))
      .map((o) => o.label),
    // 22 r117
    services: [
      card(
        first,
        copy(
          services.counselPinned && first.code === "CALL"
            ? "SVC_CALL_TEMP_PREFIX"
            : "SVC_RANK1_PREFIX",
        ),
      ),
      card(second, fill("SVC_RANK2_PREFIX", { 영역: AREAS[secondLow].label })),
    ],
    // 22 r118
    ...(services.scope === "ALL"
      ? {}
      : { scopeNote: copy(SCOPE_NOTES[services.scope]) }),
    // 07 C16-C21: lets the render layer pick the closed-site notice
    scope: services.scope,
    // 22 r119
    agenda: [
      fill("AGENDA_P1", {
        area: AREAS[lowP1].label,
        next: nextText(lowP1, scores.page1.areas[lowP1].score),
      }),
      fill("AGENDA_P2", {
        area: AREAS[lowP2].label,
        next: nextText(lowP2, lowP2Score),
      }),
      copy(
        scores.track === "M3"
          ? "AGENDA_ADM_M3"
          : admission.status === "COMPUTED"
            ? "AGENDA_ADM_" + admission.band
            : "AGENDA_ADM_SKIP",
      ),
    ],
    // 22 r120
    reading: [
      copy("READ_1"),
      copy("READ_2"),
      copy("READ_3"),
      copy("READ_4"),
      fill("READ_RELIAB", {
        label: reliabilityLabel,
        text: copy(reliabilityId),
      }),
      fill("READ_REDX", { date: formatDue(scores.plan.redxDate) }),
    ],
    // 22 r121
    footer: [copy("REPORT_BASIS"), copy("REPORT_LIMIT")],
  };
}
