// 把某個 LINE 帳號設成某家公司的 owner（商業計劃 A6）：取代 LINE 登入 callback 裡的「平台擁有者自動種子」。
//
// 用法：npx tsx scripts/seed-owner.ts <公司 slug> <LINE userId> [顯示名稱]
//   例：npx tsx scripts/seed-owner.ts main Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx 林小姐
//
// 冪等：已經是成員就把角色改成 owner。會讀 .env.local 連正式庫——請自己確認後再跑。
import fs from 'node:fs';

for (const line of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const [slug, userId, displayName] = process.argv.slice(2);
if (!slug || !/^U[0-9a-f]{32}$/.test(userId ?? '')) {
  console.error('用法：npx tsx scripts/seed-owner.ts <公司 slug> <LINE userId（U 開頭 33 碼）> [顯示名稱]');
  process.exit(1);
}

(async () => {
  const { getDb } = await import('../src/db');
  const db = getDb();
  const { data: org } = await db.from('orgs').select('id, name').eq('slug', slug).maybeSingle();
  if (!org) {
    console.error(`找不到公司 ${slug}`);
    process.exit(1);
  }
  const { error } = await db
    .from('org_members')
    .upsert({ org_id: org.id, line_user_id: userId, role: 'owner', display_name: displayName ?? null }, { onConflict: 'org_id,line_user_id' });
  if (error) throw error;
  console.log(`完成：${userId} 是「${org.name}」（${slug}）的 owner`);
})().catch((e) => {
  console.error('失敗', e);
  process.exit(1);
});
