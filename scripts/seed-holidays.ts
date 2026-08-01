// 台灣假日 seed：把 holidays-tw.json 寫入指定 org 的 holidays 表（冪等 upsert）。
// 用法：npx tsx scripts/seed-holidays.ts [org-slug]（預設 main；讀 .env.local 的 Supabase 憑證）
// 資料請對照行政院人事行政總處公告核對；管理端規則頁可增修。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

// 手動載入 .env.local（不引入 dotenv：只有這支腳本需要）
for (const line of readFileSync(join(__dirname, '..', '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

async function main() {
  const slug = process.argv[2] ?? 'main';
  const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  const { data: org } = await db.from('orgs').select('id').eq('slug', slug).maybeSingle();
  if (!org) throw new Error(`找不到 org：${slug}（先跑 migration 012）`);

  const json = JSON.parse(readFileSync(join(__dirname, 'holidays-tw.json'), 'utf8'));
  const rows: { org_id: string; day: string; kind: string; name: string }[] = [];
  for (const year of Object.keys(json)) {
    if (year.startsWith('_')) continue;
    for (const kind of ['national', 'workday_override'] as const) {
      for (const [day, name] of json[year][kind] ?? []) rows.push({ org_id: org.id, day, kind, name });
    }
  }
  const { error } = await db.from('holidays').upsert(rows, { onConflict: 'org_id,day' });
  if (error) throw error;
  console.log(`已寫入 ${rows.length} 筆假日資料 → org ${slug}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
