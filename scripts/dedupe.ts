// 清掉存量重複：把同一件事的多餘副本標為 ignored（保留最早那筆，來源訊息併過去）。
// 判定 key 與 core/extract.ts 的 dropDupes 相同——那道防線只擋新的，舊資料靠這支清。
// 用法：npx tsx scripts/dedupe.ts            → 只列出，不動資料
//       npx tsx scripts/dedupe.ts --apply    → 實際套用
import fs from 'node:fs';

for (const line of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

async function main() {
  const apply = process.argv.includes('--apply');
  const { getDb } = await import('../src/db');
  const { normTitle } = await import('../src/core/extract');
  const db = getDb();

  // 存活狀態與 key：事件同名同日才算重複（連日排班是不同事件），待辦/公告同名即重複
  const COLS = 'id, group_id, title, source_message_ids, created_at';
  const specs = [
    // starts_at 一定要撈：少了它 key 會退化成「只比標題」，連日同名排班會被當成重複清掉
    { table: 'events', alive: 'active', cols: `${COLS}, starts_at`, key: (r: any) => `${normTitle(r.title)}|${String(r.starts_at).slice(0, 10)}` },
    { table: 'tasks', alive: 'open', cols: COLS, key: (r: any) => normTitle(r.title) },
    { table: 'notes', alive: 'active', cols: COLS, key: (r: any) => normTitle(r.title) },
  ] as const;

  let total = 0;
  for (const { table, alive, cols, key } of specs) {
    const { data, error } = await (db.from(table) as any) // cols 是動態字串，Supabase 的型別推導吃不下
      .select(cols)
      .eq('status', alive)
      .order('created_at'); // 最早的排前面 = 保留的那筆
    if (error) throw error;
    for (const r of (data ?? []) as any[]) {
      if (table === 'events' && !r.starts_at) throw new Error('events 缺 starts_at，去重 key 會失準');
    }

    const groups = new Map<string, any[]>();
    for (const r of data ?? []) {
      const k = `${r.group_id}|${key(r)}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(r);
    }

    for (const rows of groups.values()) {
      if (rows.length < 2) continue;
      const [keep, ...extra] = rows;
      total += extra.length;
      console.log(`${apply ? '清除' : '待清'} ${table}｜${keep.title}｜多餘 ${extra.length} 筆`);
      if (!apply) continue;

      // 副本的來源訊息併進保留的那筆，「點回原始對話」才不會斷
      const merged = [...new Set(rows.flatMap((r) => r.source_message_ids ?? []))];
      if (merged.length > (keep.source_message_ids ?? []).length) {
        await db.from(table).update({ source_message_ids: merged }).eq('id', keep.id);
      }
      // 標 ignored 而不是刪除：可回復。needs_confirmation 一併關掉，
      // 否則會被抽取的「人已否決的項目」當成負面樣本（那是給人工否決用的訊號）
      const { error: e } = await db
        .from(table)
        .update({ status: 'ignored', needs_confirmation: false })
        .in('id', extra.map((r) => r.id));
      if (e) console.error('清除失敗', table, e.message);
    }
  }
  console.log(`\n${apply ? '已清除' : '可清除'} ${total} 筆重複${apply ? '' : '。加 --apply 實際執行'}`);
}
main();
