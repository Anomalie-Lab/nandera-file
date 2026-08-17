import { describe, expect, it } from "vitest";
import { rateLimit } from "@/lib/rate-limit";

describe("rateLimit", () => {
  it("allows up to the limit then blocks", () => {
    const key = `test-${Date.now()}-${Math.random()}`;
    expect(rateLimit(key, 3, 60_000).ok).toBe(true);
    expect(rateLimit(key, 3, 60_000).ok).toBe(true);
    expect(rateLimit(key, 3, 60_000).ok).toBe(true);
    const blocked = rateLimit(key, 3, 60_000);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it("resets after the window elapses", () => {
    const key = `test-window-${Date.now()}-${Math.random()}`;
    expect(rateLimit(key, 1, 1).ok).toBe(true);
    expect(rateLimit(key, 1, 1).ok).toBe(false);
    const start = Date.now();
    while (Date.now() - start < 5) {
      /* wait for the 1ms window */
    }
    expect(rateLimit(key, 1, 1).ok).toBe(true);
  });
});
