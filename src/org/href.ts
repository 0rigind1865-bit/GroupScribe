// org 內部連結的唯一產生器（多租戶，migration 012）。
//
// 為什麼需要它：管理頁從 src/app/(admin)/ 搬到 src/app/o/[org]/(admin)/ 之後，
// 頁面內寫死的 `/tasks`、`/inbox` 等連結仍指向舊路徑，靠 middleware 的 LEGACY 302
// 硬導到「寫死的 /o/main」——單租戶時看不出問題，多租戶下就是跨租戶。
// 所有 org 內部連結一律走這裡，並由 tests/routes.test.ts 掃描把關。
//
// path 一律以 '/' 開頭（或空字串代表 org 首頁）；query 的 undefined/空值自動略過。
export function oh(slug: string, path: string, query?: Record<string, string | number | undefined | null>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  }
  const qs = p.toString();
  return `/o/${slug}${path}${qs ? `?${qs}` : ''}`;
}
