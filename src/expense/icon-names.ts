// 圖示的純資料（不含 JSX）：伺服器端與測試也能用。SVG 本體在 icons.tsx。
export const ICON_KEYS = ['gas', 'meal', 'parking', 'toll', 'hotel', 'misc', 'drink', 'coffee', 'tool', 'cart', 'box', 'ticket', 'receipt', 'car', 'truck', 'plane', 'tag', 'camera', 'mic', 'stop', 'scan', 'trash', 'edit', 'list', 'pin', 'sliders', 'download', 'image', 'sun', 'moon', 'chart', 'sparkles'] as const;

/** 舊資料(emoji)→ icon key 的對應,讓既有 Firestore 分類無痛沿用線性 icon。 */
const EMOJI_MAP: Record<string, string> = {
  '⛽': 'gas',
  '🍱': 'meal',
  '🍜': 'meal',
  '🍽️': 'meal',
  '🅿️': 'parking',
  '🅿': 'parking',
  '🛣️': 'toll',
  '🚇': 'toll',
  '🏨': 'hotel',
  '🏠': 'hotel',
  '🏡': 'hotel',
  '🛏️': 'hotel',
  '🛌': 'hotel',
  '📎': 'misc',
  '💡': 'misc',
  '🧴': 'misc',
  '🚗': 'car',
  '🛻': 'truck',
  '🧰': 'tool',
  '🔧': 'tool',
  '☕': 'coffee',
  '🍵': 'drink',
  '🥤': 'drink',
  '🛒': 'cart',
  '🏪': 'cart',
  '🎫': 'ticket',
  '📦': 'box',
  '✈️': 'plane',
  '🧾': 'receipt',
  '🏷️': 'tag',
};

/** 把任何儲存值(icon key 或舊 emoji)正規化成一個已知的 icon key。 */
export function normalizeIcon(raw?: string): string {
  if (!raw) return 'tag';
  if ((ICON_KEYS as readonly string[]).includes(raw)) return raw;
  if (raw in EMOJI_MAP) return EMOJI_MAP[raw];
  return 'tag';
}

/** 分類管理可選的圖示清單(key + 中文標籤)。 */
export const CATEGORY_ICONS: { key: string; label: string }[] = [
  { key: 'gas', label: '加油' },
  { key: 'meal', label: '餐食' },
  { key: 'parking', label: '停車' },
  { key: 'toll', label: '過路' },
  { key: 'hotel', label: '住宿' },
  { key: 'misc', label: '雜支' },
  { key: 'drink', label: '飲料' },
  { key: 'coffee', label: '咖啡' },
  { key: 'tool', label: '工具' },
  { key: 'cart', label: '採買' },
  { key: 'box', label: '材料' },
  { key: 'ticket', label: '票券' },
  { key: 'receipt', label: '單據' },
  { key: 'car', label: '汽車' },
  { key: 'truck', label: '貨車' },
  { key: 'plane', label: '交通' },
  { key: 'tag', label: '標籤' },
];

// 群記預設分類與常見名稱 → 圖示（公司沒在分類管理選圖示時用）
const NAME_ICON: [RegExp, string][] = [
  [/停車|過路/, 'parking'],
  [/加油|油資|油錢/, 'gas'],
  [/交通|車資|計程車|高鐵|台鐵|捷運|機票/, 'plane'],
  [/餐|便當|伙食/, 'meal'],
  [/飲料|咖啡|茶/, 'coffee'],
  [/住宿|旅館|飯店/, 'hotel'],
  [/材料|耗材|零件|五金/, 'box'],
  [/工具/, 'tool'],
  [/採買|採購/, 'cart'],
  [/雜支|雜費|其他/, 'misc'],
];

export function defaultIconFor(name: string): string {
  return NAME_ICON.find(([re]) => re.test(name))?.[1] ?? 'tag';
}
