// toSessionItems: 프로필 읽기와 선택 주제 읽기는 서로 기다리지 않는다.

import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, test } from "vitest";
import {
  createFakeAdmin,
  createKitState,
} from "../../console/consoleTestKit.js";
import { gateReads } from "../../gatedReads.testkit.js";
import type { SessionListRow } from "./list.js";
import { toSessionItems } from "./sessionItems.js";

const row = (id: string, topic: string | null) =>
  ({
    id,
    profile_id: `p-${id}`,
    status: "completed",
    current_step: 3,
    area: "교과",
    subject: "수학",
    activity_name: "탐구",
    selected_topic_id: topic,
    completed_at: null,
    last_activity_at: "2026-11-01T00:00:00Z",
    ledger_id: null,
    ledger_reversed_at: null,
    generation_state: null,
    evaluation_count: 0,
    topic_round_count: 0,
  }) as unknown as SessionListRow;

describe("toSessionItems", () => {
  test("프로필 읽기와 선택 주제 읽기를 함께 시작한다", async () => {
    const state = createKitState();
    state.rows.profiles = () => [
      { id: "p-s1", name: "김학생", email: "kim@example.com" },
    ];
    state.rows.inquiry_topics = () => [{ id: "t1", detail: { title: "주제" } }];
    const { admin, gate } = gateReads(
      createFakeAdmin(state),
      (target) =>
        target.kind === "from" &&
        (target.name === "profiles" || target.name === "inquiry_topics"),
    );

    const run = toSessionItems(admin as unknown as SupabaseClient, [
      row("s1", "t1"),
    ]);
    await gate.settle();
    expect([...gate.started].sort()).toEqual([
      "from:inquiry_topics",
      "from:profiles",
    ]);
    gate.release();

    const items = await run;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: "s1",
      topicTitle: "주제",
    });
  });
});
