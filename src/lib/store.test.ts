import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ShelfSeries } from "./shelf";
import { EMPTY_STATE, type KitsuneState } from "./state";

// The store calls Server Actions; here each one is a mock whose promise the
// test settles by hand, to control the order in which saves finish.
const actions = vi.hoisted(() => ({
  addManualWishAction: vi.fn(),
  createLinkCodeAction: vi.fn(),
  dismissWishAction: vi.fn(),
  importBackupAction: vi.fn(),
  loadDemoAction: vi.fn(),
  loadStateAction: vi.fn(),
  redeemLinkCodeAction: vi.fn(),
  removeSeriesAction: vi.fn(),
  resetAllAction: vi.fn(),
  restoreDismissedAction: vi.fn(),
  syncLibraryAction: vi.fn(),
  upsertSeriesAction: vi.fn(),
}));

vi.mock("@/app/actions", () => actions);

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Lets every queued promise callback run. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function series(mediaId: number): ShelfSeries {
  return {
    mediaId,
    title: `Series ${mediaId}`,
    cover: null,
    color: null,
    siteUrl: null,
    totalVolumes: null,
    owned: [],
    edition: "standard",
    ongoing: false,
    addedAt: "2026-01-01T00:00:00.000Z",
    notes: "",
  };
}

function stateWith(...shelf: ShelfSeries[]): KitsuneState {
  return { ...EMPTY_STATE, shelf: Object.fromEntries(shelf.map((s) => [s.mediaId, s])) };
}

describe("store", () => {
  let store: typeof import("./store");
  const a = series(1);
  const b = series(2);

  // The store keeps its state at module level, so each test gets a fresh copy.
  beforeEach(async () => {
    vi.resetModules();
    vi.resetAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    store = await import("./store");
  });

  it("applies an edit right away and keeps it when the save succeeds", async () => {
    const save = deferred();
    actions.upsertSeriesAction.mockReturnValueOnce(save.promise);

    store.upsertSeries(a);
    expect(store.readStore().state.shelf).toEqual({ 1: a });

    save.resolve();
    await flush();
    expect(store.readStore()).toEqual({ state: stateWith(a), saveError: null });
    expect(actions.loadStateAction).not.toHaveBeenCalled();
  });

  it("does not drop a pending edit when an earlier save fails", async () => {
    const saveA = deferred();
    const saveB = deferred();
    actions.upsertSeriesAction.mockReturnValueOnce(saveA.promise).mockReturnValueOnce(saveB.promise);
    const reload = deferred<KitsuneState>();
    actions.loadStateAction.mockReturnValueOnce(reload.promise);

    store.upsertSeries(a);
    store.upsertSeries(b);
    saveA.reject(new Error("boom"));
    await flush();

    // B is still saving, so nothing is reloaded yet and both edits stay visible.
    expect(actions.loadStateAction).not.toHaveBeenCalled();
    expect(store.readStore().state.shelf).toEqual({ 1: a, 2: b });

    saveB.resolve();
    await flush();
    expect(actions.loadStateAction).toHaveBeenCalledTimes(1);
    expect(store.readStore().state.shelf).toEqual({ 1: a, 2: b });

    reload.resolve(stateWith(b));
    await flush();
    expect(store.readStore().state).toEqual(stateWith(b));
  });

  it("discards a reload that an edit overtook and reloads again after that save", async () => {
    const saveA = deferred();
    const saveB = deferred();
    actions.upsertSeriesAction.mockReturnValueOnce(saveA.promise).mockReturnValueOnce(saveB.promise);
    const first = deferred<KitsuneState>();
    const second = deferred<KitsuneState>();
    actions.loadStateAction.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    store.upsertSeries(a);
    saveA.reject(new Error("boom"));
    await flush();
    expect(actions.loadStateAction).toHaveBeenCalledTimes(1);

    // Edited while the reload is in flight: the server's answer predates B.
    store.upsertSeries(b);
    first.resolve(EMPTY_STATE);
    await flush();
    expect(store.readStore().state.shelf).toEqual({ 1: a, 2: b });
    expect(actions.loadStateAction).toHaveBeenCalledTimes(1);

    saveB.resolve();
    await flush();
    expect(actions.loadStateAction).toHaveBeenCalledTimes(2);
    second.resolve(stateWith(b));
    await flush();
    expect(store.readStore().state).toEqual(stateWith(b));
  });

  it("reloads again when a save settles during the reload", async () => {
    const saveA = deferred();
    const saveB = deferred();
    actions.upsertSeriesAction.mockReturnValueOnce(saveA.promise).mockReturnValueOnce(saveB.promise);
    const first = deferred<KitsuneState>();
    const second = deferred<KitsuneState>();
    actions.loadStateAction.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    store.upsertSeries(a);
    saveA.reject(new Error("boom"));
    await flush();

    // B starts and finishes while the first reload is still waiting.
    store.upsertSeries(b);
    saveB.resolve();
    await flush();
    expect(actions.loadStateAction).toHaveBeenCalledTimes(1);

    first.resolve(EMPTY_STATE);
    await flush();
    expect(store.readStore().state.shelf).toEqual({ 1: a, 2: b });
    expect(actions.loadStateAction).toHaveBeenCalledTimes(2);

    second.resolve(stateWith(b));
    await flush();
    expect(store.readStore().state).toEqual(stateWith(b));
  });

  it("replaces the state with the server's after a failure with nothing pending", async () => {
    actions.upsertSeriesAction.mockRejectedValueOnce(new Error("boom"));
    actions.loadStateAction.mockResolvedValueOnce(stateWith(b));

    store.upsertSeries(a);
    expect(store.readStore().state.shelf).toEqual({ 1: a });

    await flush();
    expect(actions.loadStateAction).toHaveBeenCalledTimes(1);
    expect(store.readStore().state).toEqual(stateWith(b));
  });

  it("sets saveError on failure and clears it on the next successful save", async () => {
    actions.upsertSeriesAction.mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce(undefined);
    actions.loadStateAction.mockResolvedValueOnce(EMPTY_STATE);

    store.upsertSeries(a);
    await flush();
    expect(store.readStore().saveError).toBe("Couldn't save your last change. Showing what's saved.");

    store.upsertSeries(b);
    await flush();
    expect(store.readStore()).toEqual({ state: stateWith(b), saveError: null });
  });

  it("reports an unreachable server when the reload fails too", async () => {
    actions.upsertSeriesAction.mockRejectedValueOnce(new Error("boom"));
    actions.loadStateAction.mockRejectedValueOnce(new Error("offline"));

    store.upsertSeries(a);
    await flush();
    expect(store.readStore()).toEqual({
      state: stateWith(a),
      saveError: "Can't reach the server. Changes aren't being saved.",
    });
  });

  it("hands out a link code without touching the state", async () => {
    const made = { ok: true, code: "ABCD-EFGH", expiresAt: "2026-01-01T00:10:00.000Z" };
    actions.createLinkCodeAction.mockResolvedValueOnce(made);
    expect(await store.createLinkCode()).toEqual(made);
    expect(store.readStore()).toEqual({ state: EMPTY_STATE, saveError: null });
  });

  it("shows the linked profile once a code is redeemed", async () => {
    actions.upsertSeriesAction.mockResolvedValueOnce(undefined);
    actions.redeemLinkCodeAction.mockResolvedValueOnce({ ok: true, state: stateWith(b) });

    store.upsertSeries(a);
    await flush();
    const result = await store.linkProfile("abcd-efgh");
    expect(actions.redeemLinkCodeAction).toHaveBeenCalledWith("abcd-efgh");
    expect(result).toEqual({ ok: true, state: stateWith(b) });
    // The whole state is replaced: what this browser had is no longer shown.
    expect(store.readStore()).toEqual({ state: stateWith(b), saveError: null });
  });

  it("keeps the state when a code is refused", async () => {
    actions.upsertSeriesAction.mockResolvedValueOnce(undefined);
    const refused = { ok: false, error: "That code is invalid or has expired." };
    actions.redeemLinkCodeAction.mockResolvedValueOnce(refused);

    store.upsertSeries(a);
    await flush();
    expect(await store.linkProfile("ZZZZ-ZZZZ")).toEqual(refused);
    expect(store.readStore()).toEqual({ state: stateWith(a), saveError: null });
  });
});
