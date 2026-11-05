import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { demoLibrary, demoShelf } from "@/lib/demo";
import { loadCurrentState } from "@/lib/session";
import { EMPTY_STATE } from "@/lib/state";
import { GET } from "./route";

vi.mock("@/lib/session", () => ({ loadCurrentState: vi.fn() }));

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
// A 1×1 transparent PNG, stands in for an AniList avatar.
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

const realFetch = globalThis.fetch;

/**
 * Answers network fetches with `handler` and records their URLs. Anything
 * else (satori loads its wasm through fetch from a data: URL) goes through.
 */
function stubFetch(handler: (url: string) => Promise<Response> = () => Promise.reject(new Error("offline"))) {
  const network: string[] = [];
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    if (!url.startsWith("http")) return realFetch(input, init);
    network.push(url);
    return handler(url);
  });
  return network;
}

function demoState(avatar: string | null = null) {
  const library = demoLibrary(new Date("2026-06-01T00:00:00Z"));
  library.user = { ...library.user, avatar };
  return { ...EMPTY_STATE, library, shelf: demoShelf(library) };
}

async function expectPng(res: Response) {
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toBe("image/png");
  expect(res.headers.get("cache-control")).toBe("private, no-store");
  const bytes = Buffer.from(await res.arrayBuffer());
  expect(bytes.subarray(0, 8)).toEqual(PNG_MAGIC);
  // IHDR: width and height follow the 8-byte signature, 4-byte length and "IHDR".
  expect(bytes.readUInt32BE(16)).toBe(1200);
  expect(bytes.readUInt32BE(20)).toBe(630);
  return bytes;
}

describe("GET /id-card.png", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("asks a fresh browser to sync first", async () => {
    vi.mocked(loadCurrentState).mockResolvedValue(EMPTY_STATE);

    const res = await GET();
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Sync first." });
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it("renders the demo profile as a 1200x630 PNG", async () => {
    vi.mocked(loadCurrentState).mockResolvedValue(demoState());
    const network = stubFetch();

    const bytes = await expectPng(await GET());
    expect(bytes.length).toBeGreaterThan(20_000);
    // No avatar, and every glyph comes from the vendored fonts: nothing to download.
    expect(network).toEqual([]);
  }, 30_000);

  it("embeds an avatar from the AniList CDN", async () => {
    const avatar = "https://s4.anilist.co/file/anilistcdn/user/avatar/large/b1-abc.png";
    vi.mocked(loadCurrentState).mockResolvedValue(demoState(avatar));
    const network = stubFetch(async () => new Response(TINY_PNG, { headers: { "content-type": "image/png" } }));

    await expectPng(await GET());
    expect(network).toEqual([avatar]);
  }, 30_000);

  it("ignores avatar URLs outside the AniList CDN", async () => {
    vi.mocked(loadCurrentState).mockResolvedValue(demoState("https://example.com/avatar.png"));
    const network = stubFetch();

    await expectPng(await GET());
    expect(network).toEqual([]);
  }, 30_000);

  it("still renders when the avatar can't be fetched", async () => {
    vi.mocked(loadCurrentState).mockResolvedValue(demoState("https://s4.anilist.co/file/x.png"));
    stubFetch();

    await expectPng(await GET());
  }, 30_000);

  it("drops an avatar satori can't decode instead of failing", async () => {
    vi.mocked(loadCurrentState).mockResolvedValue(demoState("https://s4.anilist.co/file/x.png"));
    stubFetch(async () => new Response("not an image", { headers: { "content-type": "image/png" } }));

    await expectPng(await GET());
  }, 30_000);
});
