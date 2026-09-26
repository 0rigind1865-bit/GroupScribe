// AI 分類（從 Snaptab lib/classify.ts 搬來）：依備註文字挑最適合的分類。本地比對，免費、即時、離線可用。
// 群記版改用分類「名稱」（公司自訂），並補上群記預設分類與概念的對照。

const CONCEPTS: Record<string, string[]> = {
  fuel: ['加油', '汽油', '柴油', '油錢', '中油', '台塑', '加滿', 'gas', '無鉛'],
  transit: ['計程車', '高鐵', '台鐵', '火車', '捷運', '公車', '客運', 'uber', '機票', '車資', '車票'],
  meal: ['便當', '午餐', '晚餐', '早餐', '餐費', '自助餐', '排骨', '雞腿', '池上', '小吃', '麵', '飯', '餐廳', '吃飯', '伙食', '便餐', '餐盒', '宵夜'],
  drink: ['飲料', '手搖', '咖啡', '紅茶', '綠茶', '奶茶', '珍奶', '可樂', '礦泉水', '茶水', '豆漿', '星巴克', '提神'],
  park: ['停車', '停車費', '停車場', '車位', 'parking', '路邊停車', '停車格'],
  toll: ['過路', '過路費', '國道', '高速公路', '通行費', 'etag', 'etc', '收費站'],
  stay: ['住宿', '旅館', '飯店', '民宿', '旅店', '過夜', '訂房', '房費', 'hotel', 'motel', '汽車旅館'],
  tool: ['五金', '零件', '工具', '螺絲', '材料', '電線', '膠帶', '板手', '扳手', '鑽頭', '接頭', '燈泡', '燈具', '配件', '線材', '水電', '耗材', '束帶', '電池'],
  car: ['洗車', '修車', '保養', '輪胎', '機油', '車輛維修'],
  cart: ['採買', '採購', '賣場', '全聯', '量販', '買菜', '超市', '好市多'],
  misc: ['雜支', '雜費', '醫', '看病', '看醫生', '藥', '診所', '醫院', '文具', '影印', '郵寄', '快遞', '清潔', '租金', '規費', '醫療', '其他'],
};

// 群記預設分類 → 它涵蓋的概念（名稱本身不含關鍵字，例如「餐飲」「交通」）
const DEFAULT_CONCEPTS: Record<string, string[]> = {
  交通: ['fuel', 'transit', 'car'],
  餐飲: ['meal', 'drink'],
  住宿: ['stay'],
  停車過路: ['park', 'toll'],
  材料耗材: ['tool', 'cart'],
  雜支: ['misc'],
};

function conceptsOf(name: string): string[] {
  if (DEFAULT_CONCEPTS[name]) return DEFAULT_CONCEPTS[name];
  return Object.entries(CONCEPTS)
    .filter(([, kws]) => kws.some((k) => name.includes(k)))
    .map(([c]) => c);
}

/** 依備註挑出分類名稱；完全沒命中回 null（讓使用者自己選） */
export function classifyNote(note: string, categories: readonly string[]): string | null {
  const text = note.trim().toLowerCase();
  if (!text || !categories.length) return null;
  let best: string | null = null;
  let bestScore = 0;
  for (const cat of categories) {
    let score = 0;
    if (text.includes(cat.toLowerCase())) score += 6; // 備註直接寫了分類名稱：最強訊號
    for (const c of conceptsOf(cat)) for (const kw of CONCEPTS[c]) if (text.includes(kw.toLowerCase())) score += kw.length >= 2 ? 3 : 1;
    if (score > bestScore) {
      bestScore = score;
      best = cat;
    }
  }
  return best;
}
