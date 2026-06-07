import { describe, expect, it } from "vitest";
import { buildAutoImageRequests, buildView } from "../PlayHud";

describe("PlayHud buildView", () => {
  it("classifies held inventory from canonical graph edge roles, not status words", () => {
    const view = buildView({
      currentState: { turn: 1, mode: "guided", premise: "查一个配送柜。" },
      graph: {
        entities: [
          { id: "loc-cabinet", type: "location", label: "F-07配送柜", status: "就在面前" },
          { id: "blood", type: "evidence", label: "柜内血迹", status: "已看见，还未采集" },
          { id: "note", type: "clue", label: "夹层纸条", status: "正在查阅" },
        ],
        edges: [
          { id: "edge-hold-note", fromId: "actor_player", type: "拿着", toId: "note", value: { role: "holding", physical: true } },
        ],
        stateSlots: [],
        events: [],
      },
    });

    expect(view?.facing.map((row) => row.label)).toEqual([
      "F-07配送柜",
      "柜内血迹",
    ]);
    expect(view?.holdings.map((row) => row.label)).toEqual(["夹层纸条"]);
  });

  it("does not put observed intangible phenomena into the player's inventory", () => {
    const view = buildView({
      currentState: { turn: 1, mode: "open", premise: "后山石缝。" },
      graph: {
        entities: [
          { id: "evidence_grass", type: "evidence", label: "草叶回避现象", status: "已观察到" },
        ],
        edges: [
          { id: "edge-observed-grass", fromId: "actor_player", type: "持有", toId: "evidence_grass", value: { role: "holding" } },
        ],
        stateSlots: [],
        events: [],
      },
    });

    expect(view?.facing.map((row) => row.label)).toEqual(["草叶回避现象"]);
    expect(view?.holdings.map((row) => row.label)).toEqual([]);
  });

  it("does not treat inventory-looking status text as authoritative", () => {
    const view = buildView({
      currentState: { turn: 1, mode: "guided", premise: "查一个配送柜。" },
      graph: {
        entities: [
          { id: "note", type: "clue", label: "夹层纸条", status: "已收起" },
        ],
        edges: [],
        stateSlots: [],
        events: [],
      },
    });

    expect(view?.facing.map((row) => row.label)).toEqual(["夹层纸条"]);
    expect(view?.holdings.map((row) => row.label)).toEqual([]);
  });

  it("does not infer holdings from relation wording alone", () => {
    const view = buildView({
      currentState: { turn: 1, mode: "guided", premise: "查一个配送柜。" },
      graph: {
        entities: [
          { id: "note", type: "clue", label: "夹层纸条", status: "正在查阅" },
        ],
        edges: [
          { id: "edge-hold-note", fromId: "actor_player", type: "持有", toId: "note" },
        ],
        stateSlots: [],
        events: [],
      },
    });

    expect(view?.facing.map((row) => row.label)).toEqual(["夹层纸条"]);
    expect(view?.holdings.map((row) => row.label)).toEqual([]);
  });

  it("only treats actor_player holding edges as the player's inventory", () => {
    const view = buildView({
      currentState: { turn: 1, mode: "guided", premise: "查一个旧站台。" },
      graph: {
        entities: [
          { id: "actor_mechanic", type: "actor", label: "临时维修员", status: "警觉" },
          { id: "ticket", type: "item", label: "旧车票", status: "已收起" },
          { id: "key", type: "item", label: "铜钥匙", status: "已收起" },
        ],
        edges: [
          { id: "edge-wrong-holder", fromId: "actor_mechanic", type: "持有", toId: "ticket", value: { role: "holding" } },
          { id: "edge-player-holder", fromId: "actor_player", type: "持有", toId: "key", value: { role: "holding" } },
        ],
        stateSlots: [],
        events: [],
      },
    });

    expect(view?.holdings.map((row) => row.label)).toEqual(["铜钥匙"]);
    expect(view?.facing.map((row) => row.label)).toEqual(["临时维修员", "旧车票"]);
  });

  it("uses semantic relation roles and suppresses duplicate status labels", () => {
    const view = buildView({
      currentState: { turn: 1, mode: "open", premise: "查一个旧站台。" },
      graph: {
        entities: [
          { id: "actor_player", type: "actor", label: "值班员", status: "值班员" },
          { id: "actor_guard", type: "actor", label: "站长", status: "怀疑" },
          { id: "key", type: "item", label: "旧钥匙", status: "已持有" },
        ],
        edges: [
          { id: "edge-hold-key", fromId: "actor_player", type: "持有", toId: "key", value: { role: "holding" } },
          { id: "edge-suspect", fromId: "actor_guard", type: "怀疑", toId: "actor_player", value: { role: "relation" } },
        ],
        stateSlots: [],
        events: [],
      },
    });

    const player = view?.actors.find((row) => row.id === "actor_player");
    expect(player?.note).toBeNull();
    expect(player?.details.map((detail) => detail.text)).toEqual(["怀疑 · 站长"]);
    expect(view?.holdings.map((row) => row.label)).toEqual(["旧钥匙"]);
  });

  it("surfaces semantic world time as a synchronized state row", () => {
    const view = buildView({
      currentState: {
        turn: 2,
        mode: "open",
        premise: "雨夜库房。",
        timeAdvance: {
          elapsed: "几息",
          anchor: "仍在雨夜门外的同一个片刻",
          rationale: "玩家只是屏息观察门外动静。",
          synchronized: ["门外的人也停住脚步，像是在数玩家的呼吸。"],
        },
      },
      graph: {
        entities: [],
        edges: [],
        stateSlots: [],
        events: [],
      },
    });

    expect(view?.time?.label).toBe("世界时间");
    expect(view?.time?.value).toBe("仍在雨夜门外的同一个片刻");
    expect(view?.time?.note).toContain("屏息观察");
    expect(view?.time?.details[0]).toEqual({ label: "经过", text: "几息" });
    expect(view?.time?.details[1]?.text).toContain("数玩家的呼吸");
  });

  it("auto-illustrates enabled actors, holdings, and current moment", () => {
    const view = buildView({
      currentState: { turn: 3, mode: "open", premise: "雨夜库房。" },
      graph: {
        entities: [
          { id: "actor_player", type: "actor", label: "守库弟子" },
          { id: "actor_master", type: "actor", label: "执事", imageUrl: "/ready.png" },
          { id: "item_box", type: "item", label: "铜匣" },
        ],
        edges: [
          { id: "edge-hold-box", fromId: "actor_player", type: "持有", toId: "item_box", value: { role: "holding" } },
        ],
        stateSlots: [],
        events: [],
      },
    });

    expect(buildAutoImageRequests(view, { actors: true, moments: true, inventory: true })).toEqual([
      { key: "actor_player", body: { target: "entity", entityId: "actor_player" } },
      { key: "item_box", body: { target: "entity", entityId: "item_box" } },
      { key: "scene-turn-3", body: { target: "scene" } },
    ]);
  });

  it("does not auto-illustrate the current moment when a scene image is already ready", () => {
    const view = buildView({
      currentState: { turn: 3, mode: "open", premise: "雨夜库房。" },
      graph: { entities: [], edges: [], stateSlots: [], events: [] },
    });

    expect(buildAutoImageRequests(view, { actors: false, moments: true, inventory: false }, "/scene.png")).toEqual([]);
  });
});
