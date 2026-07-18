import { describe, expect, it } from "vitest";
import { cleanPerformerCredit, createUnitResolver } from "../unitResolver.js";

const units = [
  { id: "hasunosora", name: "蓮ノ空女学院スクールアイドルクラブ", seriesId: "hasunosora", sortOrder: 1 },
  { id: "cerise-bouquet", name: "スリーズブーケ", seriesId: "hasunosora", sortOrder: 2 },
  { id: "solo", name: "ソロ", seriesId: "hasunosora", sortOrder: 11 }
];

const aliases = {
  大沢瑠璃乃: "solo"
};

describe("cleanPerformerCredit", () => {
  it("strips CV annotations", () => {
    expect(cleanPerformerCredit("大沢瑠璃乃(CV.菅 叶和)")).toBe("大沢瑠璃乃");
    expect(cleanPerformerCredit("スリーズブーケ")).toBe("スリーズブーケ");
  });

  it("strips bracketed member lists", () => {
    expect(
      cleanPerformerCredit("蓮ノ空女学院スクールアイドルクラブ ［日野下花帆(CV.楡井希実)、村野さやか(CV.野中ここな)］")
    ).toBe("蓮ノ空女学院スクールアイドルクラブ");
  });
});

describe("createUnitResolver", () => {
  const resolver = createUnitResolver(units, aliases);

  it("resolves unit names exactly", () => {
    expect(resolver.resolve("スリーズブーケ")).toBe("cerise-bouquet");
  });

  it("resolves member solo credits through aliases", () => {
    expect(resolver.resolve("大沢瑠璃乃(CV.菅 叶和)")).toBe("solo");
  });

  it("resolves whole-club credits with member list annotations", () => {
    expect(
      resolver.resolve("蓮ノ空女学院スクールアイドルクラブ ［日野下花帆(CV.楡井希実)］")
    ).toBe("hasunosora");
  });

  it("returns null for unknown combined credits instead of guessing", () => {
    expect(resolver.resolve("乙宗梢(CV.花宮初奈)、夕霧綴理(CV.佐々木琴子)")).toBeNull();
    expect(resolver.resolve(null)).toBeNull();
  });
});
