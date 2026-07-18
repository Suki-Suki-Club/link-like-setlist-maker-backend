export type UnitSeedEntry = {
  id: string;
  name: string;
  seriesId: string;
  sortOrder: number;
};

/** クレジット照合用の正規化。空白と大文字小文字、全角半角のゆれを吸収する */
export function normalizeCreditKey(text: string): string {
  return text.normalize("NFKC").toLowerCase().replace(/[\s　]+/g, "");
}

/**
 * 「歌：」クレジットから照合用の文字列を取り出す。
 * - (CV.…)・（CV.…） の声優表記を除去
 * - ［メンバー一覧］ のような補足ブロックを除去
 */
export function cleanPerformerCredit(credit: string): string {
  return credit
    .normalize("NFKC")
    .replace(/[（(]CV[.．][^）)]*[）)]/gi, "")
    .replace(/[［\[][^］\]]*[］\]]/g, "")
    .replace(/[\s　]+/g, " ")
    .trim();
}

export type UnitResolver = {
  resolve(performerCredit: string | null): string | null;
};

export function createUnitResolver(
  units: UnitSeedEntry[],
  aliases: Record<string, string>
): UnitResolver {
  const byKey = new Map<string, string>();

  for (const unit of units) {
    byKey.set(normalizeCreditKey(unit.name), unit.id);
  }

  // エイリアスはユニット正名より優先(手動の訂正手段として機能させる)
  for (const [alias, unitId] of Object.entries(aliases)) {
    byKey.set(normalizeCreditKey(alias), unitId);
  }

  return {
    resolve(performerCredit: string | null): string | null {
      if (!performerCredit) {
        return null;
      }

      const cleaned = cleanPerformerCredit(performerCredit);

      if (!cleaned) {
        return null;
      }

      return byKey.get(normalizeCreditKey(cleaned)) ?? null;
    }
  };
}
