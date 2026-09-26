// 抽取回歸集的比對器（商業計劃 E1）：期望項目 vs 實際抽出的項目。
// 對到＝同類型（event／task／note）且標題包含期望的全部關鍵字；一個實際項目只能對到一個期望。
export type Expected = { kind: 'event' | 'task' | 'note'; keywords: string[] };
export type Actual = { kind: 'event' | 'task' | 'note'; title: string };

export function compare(expected: Expected[], actual: Actual[]) {
  const used = new Set<number>();
  const missed: Expected[] = [];
  for (const e of expected) {
    const i = actual.findIndex((a, j) => !used.has(j) && a.kind === e.kind && e.keywords.every((k) => a.title.includes(k)));
    if (i >= 0) used.add(i);
    else missed.push(e);
  }
  const extra = actual.filter((_, j) => !used.has(j)); // 多抽的＝假陽性
  return {
    matched: used.size,
    missed,
    extra,
    falsePositiveRate: actual.length ? extra.length / actual.length : 0,
    recall: expected.length ? used.size / expected.length : 1,
  };
}
