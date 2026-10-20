import { describe, expect, it } from "vitest";
import { singleFlight } from "@/src/lib/singleFlight";

describe("singleFlight", () => {
  it("runs one shared request for concurrent callers", async () => {
    let calls = 0;
    const run = () =>
      singleFlight("quote:AAPL", async () => {
        calls += 1;
        await new Promise((resolve) => setTimeout(resolve, 20));
        return "ok";
      });
    const results = await Promise.all([run(), run(), run()]);
    expect(results).toEqual(["ok", "ok", "ok"]);
    expect(calls).toBe(1);
  });
});
