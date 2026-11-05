import type { Pool } from "pg";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getPool } from "@/lib/db/pool";
import { GET } from "./route";

vi.mock("@/lib/db/pool", () => ({ getPool: vi.fn() }));

function poolWith(query: () => Promise<unknown>) {
  vi.mocked(getPool).mockReturnValue({ query } as unknown as Pool);
}

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("answers 200 when the database responds", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ "?column?": 1 }] });
    poolWith(query);

    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(query).toHaveBeenCalledWith("SELECT 1");
  });

  it("answers 503 when the query fails", async () => {
    poolWith(() => Promise.reject(new Error("connect ECONNREFUSED")));

    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false });
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("answers 503 when the pool can't even be created", async () => {
    vi.mocked(getPool).mockImplementation(() => {
      throw new Error("DATABASE_URL is not set.");
    });

    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false });
  });
});
