import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request } from "express";
import { cachedRead, invalidateReadCache } from "./readCache";
import { publicProcedure, router } from "./routers/trpc";

beforeEach(() => invalidateReadCache());

describe("cachedRead", () => {
  it("loads once and answers repeat reads from memory", async () => {
    const load = vi.fn(async () => ({ n: 1 }));
    expect(await cachedRead("k", load)).toEqual({ n: 1 });
    expect(await cachedRead("k", load)).toEqual({ n: 1 });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("shares one load between readers arriving together", async () => {
    const load = vi.fn(async () => "v");
    await Promise.all([cachedRead("k", load), cachedRead("k", load), cachedRead("k", load)]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("runs a lazy thenable (like a drizzle query) once, not once per await", async () => {
    const run = vi.fn(() => "rows");
    const lazyQuery = { then: (ok: (v: string) => void) => ok(run()) } as PromiseLike<string>;
    await cachedRead("k", () => lazyQuery);
    await cachedRead("k", () => lazyQuery);
    await cachedRead("k", () => lazyQuery);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("does not remember a failure", async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error("blip")).mockResolvedValueOnce("ok");
    await expect(cachedRead("k", load)).rejects.toThrow("blip");
    expect(await cachedRead("k", load)).toBe("ok");
  });

  it("reads again after an invalidation", async () => {
    let value = "before";
    const load = vi.fn(async () => value);
    expect(await cachedRead("k", load)).toBe("before");
    value = "after";
    invalidateReadCache();
    expect(await cachedRead("k", load)).toBe("after");
  });
});

describe("mutations clear the read cache", () => {
  const testRouter = router({
    library: router({ edit: publicProcedure.mutation(() => "saved") }),
    progress: router({ saveLastPage: publicProcedure.mutation(() => "saved") }),
  });
  const caller = testRouter.createCaller({ user: null, req: {} as Request });

  it("forgets everything after a write to shared data", async () => {
    const load = vi.fn(async () => "v");
    await cachedRead("k", load);
    await caller.library.edit();
    await cachedRead("k", load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("keeps the cache when a reader only saves their own place in a book", async () => {
    const load = vi.fn(async () => "v");
    await cachedRead("k", load);
    await caller.progress.saveLastPage();
    await cachedRead("k", load);
    expect(load).toHaveBeenCalledTimes(1);
  });
});
