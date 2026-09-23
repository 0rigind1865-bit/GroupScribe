// 建立新租戶（商業計劃 A6）：取代 README 原本的手動 SQL。
//
// 用法：npx tsx scripts/new-org.ts <slug> <名稱> <管理員 LINE userId> [模組，預設 gs]
//   例：npx tsx scripts/new-org.ts acme "宏達工程" Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx gs,attend
//
// 做三件事（皆冪等）：orgs 插一列、org_settings 設 modules、org_members 加 owner。
// 管理員的 LINE userId：請他先用 LINE 登入一次（/api/auth/line），伺服器 log 或 org_members 表會出現；
// 或從 LINE Developers Console 的 Messaging API 分頁取得自己的 userId。
import fs from 'node:fs';

for (const line of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const [slug, name, admin, modulesArg = 'gs'] = process.argv.slice(2);
if (!slug || !name || !admin) {
  console.error('用法：npx tsx scripts/new-org.ts <slug> <名稱> <管理員 LINE userId> [gs|attend|gs,attend]');
  process.exit(1);
}
if (!/^[a-z0-9][a-z0-9-]{1,30}$/.test(slug) || slug === 'unclaimed') {
  console.error('slug 只能是小寫英數與連字號（2–31 字），且不能是 unclaimed');
  process.exit(1);
}
const modules = modulesArg.split(',').map((s) => s.trim()).filter((s) => s === 'gs' || s === 'attend');
if (!modules.length) {
  console.error('模組只能是 gs、attend 或 gs,attend');
  process.exit(1);
}

(async () => {
  const { getDb } = await import('../src/db');
  const db = getDb();
  const { data: org, error } = await db.from('orgs').upsert({ slug, name }, { onConflict: 'slug' }).select('id').single();
  if (error || !org) throw error ?? new Error('建立 org 失敗');
  const now = new Date().toISOString();
  const { error: e2 } = await db.from('org_settings').upsert({ org_id: org.id, modules, updated_at: now }, { onConflict: 'org_id' });
  if (e2) throw e2;
  const { error: e3 } = await db
    .from('org_members')
    .upsert({ org_id: org.id, line_user_id: admin, role: 'owner' }, { onConflict: 'org_id,line_user_id' });
  if (e3) throw e3;
  const base = (process.env.APP_BASE_URL ?? '').replace(/\/$/, '');
  console.log(`✅ ${name}（${slug}）已建立，模組：${modules.join('、')}`);
  console.log(`   管理員登入：${base}/api/auth/line → 落在 ${base}/o/${slug}`);
  console.log('   接著請客戶把 GroupScribe 官方帳號邀進他們的 LINE 群，bot 會貼出認領連結。');
})().catch((e) => {
  console.error('失敗：', e?.message ?? e);
  process.exit(1);
});
