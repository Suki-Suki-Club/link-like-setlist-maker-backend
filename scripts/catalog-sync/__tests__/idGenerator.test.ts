import { describe, expect, it } from "vitest";
import { generateSongId, slugify } from "../idGenerator.js";

describe("slugify", () => {
  it("slugifies ascii titles like the existing hand-authored ids", () => {
    expect(slugify("Dream Believers")).toBe("dream-believers");
    expect(slugify("On your mark")).toBe("on-your-mark");
    expect(slugify("AWOKE")).toBe("awoke");
  });
});

describe("generateSongId", () => {
  it("keeps ascii titles as plain slugs", async () => {
    expect(await generateSongId("Dream Believers", "hasunosora", new Set())).toBe(
      "dream-believers"
    );
  });

  it("romanizes Japanese titles deterministically", async () => {
    const first = await generateSongId("水彩世界", "hasunosora", new Set());
    const second = await generateSongId("水彩世界", "hasunosora", new Set());

    expect(first).toBe(second);
    expect(first).toMatch(/^[a-z0-9-]+$/);
    expect(first.length).toBeGreaterThan(2);
  }, 60_000);

  it("appends a stable hash suffix on collisions", async () => {
    const existing = new Set(["dream-believers"]);
    const id = await generateSongId("Dream Believers", "hasunosora", existing);

    expect(id).toMatch(/^dream-believers-[0-9a-f]{4}$/);
    expect(existing.has(id)).toBe(false);
  });
});
