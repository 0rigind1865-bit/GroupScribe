// Demo 資料：建立一個可公開展示的假群組。
//
// 為什麼需要：真實群組的畫面全是客戶名、金額與員工真名，一張都不能對外；而開源專案
// clone 下來看到空畫面等於沒有 demo。這份種子資料同時解決三件事——可安全截圖、
// 新手第一眼就有東西、以及能並排展示「群組隨口一句 → 自動變成行程」的那一刻。
//
// 用法：npx tsx scripts/seed-demo.ts        建立/重建 demo 群組
//       npx tsx scripts/seed-demo.ts --drop 只清除
//
// 不呼叫 AI：抽取結果是預先寫好的，重跑不花錢也不會變動。
import fs from 'node:fs';

for (const line of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const GROUP_ID = 'DEMO-GROUP';
const GROUP_NAME = '日新 · 專案群';

// 相對今天算日期，截圖時「今天」頁永遠有內容
const D = (offsetDays: number, hhmm = '09:00') => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const [h, mi] = hhmm.split(':').map(Number);
  d.setHours(h, mi, 0, 0);
  return d;
};
const iso = (d: Date) => d.toLocaleDateString('sv', { timeZone: 'Asia/Taipei' });

// 找未來第 n 週的某個星期幾——demo 的日期必須永遠落在工作日，而且要跟對話裡的講法對得起來。
// （對話說「下週三」、卡片卻顯示週日，這種破綻會直接毀掉 demo 的可信度。）
const nextDow = (dow: number, addWeeks = 0, hhmm = '09:00') => {
  const d = new Date();
  d.setDate(d.getDate() + (((dow - d.getDay() + 7) % 7) || 7) + addWeeks * 7);
  const [h, mi] = hhmm.split(':').map(Number);
  d.setHours(h, mi, 0, 0);
  return d;
};
const IN = nextDow(3);       // 到場開會：下一個週三
const HANDOVER = nextDow(5, 1); // 交件：下下週五
const mmdd = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;

// 對話腳本。ref 是給下面的抽取結果對回來源訊息用的（Obsidian 式來源連結靠它）
type Line = { ref?: string; who: string; text: string; at: Date; low?: boolean };
const SCRIPT: Line[] = [
  { who: '雅婷', text: '早安～', at: D(-3, '08:12'), low: true },
  { ref: 'A1', who: '老王', text: '中山北路那case客戶敲下週三早上八點到現場，麻煩排一下車', at: D(-3, '08:40') },
  { who: '阿凱', text: '收到', at: D(-3, '08:41'), low: true },
  { ref: 'A2', who: '阿凱', text: '那天我人在新莊，請小林支援一下', at: D(-3, '08:43') },
  { ref: 'A3', who: '老王', text: '@小林 中山北路的資料你先看一下，有問題今天講', at: D(-3, '09:02') },
  { who: '小林', text: '好', at: D(-3, '09:15'), low: true },
  { ref: 'B1', who: '雅婷', text: '提醒大家，以後估價單一律要副本給我一份，不然月底對帳會漏', at: D(-2, '10:30') },
  { who: '老王', text: '同意', at: D(-2, '10:31'), low: true },
  { who: '阿凱', text: '了解', at: D(-2, '10:33'), low: true },
  { ref: 'C1', who: '小林', text: '資料看完了，第三項的數量標示怪怪的，我跟客戶確認過改成 320', at: D(-2, '14:20') },
  { ref: 'C2', who: '老王', text: '那時間改成早上十點好了，等客戶的人到齊', at: D(-2, '14:35') },
  { ref: 'D1', who: '阿凱', text: '新莊那邊的東西明天到，誰有空去點一下？', at: D(-1, '16:05') },
  { ref: 'D2', who: '雅婷', text: '我明天下午過去', at: D(-1, '16:20') },
  { ref: 'E1', who: '小林', text: '中山北路報價單.pdf', at: D(-1, '17:40') },
  { who: '老王', text: '收到，我看一下', at: D(-1, '17:52'), low: true },
  { ref: 'F1', who: '老王', text: `${mmdd(HANDOVER)} 要交件，驗收清單雅婷先擬一版出來`, at: D(0, '09:10') },
];

async function main() {
  const drop = process.argv.includes('--drop');
  const { getDb } = await import('../src/db');
  const { getChannelId } = await import('../src/core/ingest');
  const db = getDb();

  // 先清乾淨：demo 資料要可重跑，也不能污染真實群組
  for (const t of ['events', 'tasks', 'notes']) await db.from(t).delete().eq('group_id', GROUP_ID);
  await db.from('embeddings').delete().eq('group_id', GROUP_ID);
  await db.from('messages').delete().eq('group_id', GROUP_ID);
  await db.from('groups').delete().eq('group_id', GROUP_ID);
  if (drop) return console.log(`已清除 ${GROUP_ID}`);

  await db.from('groups').upsert({
    group_id: GROUP_ID,
    name: GROUP_NAME,
    category: '示範',
    updated_at: new Date().toISOString(),
  });

  const channelId = await getChannelId();
  const { data: rows, error } = await db
    .from('messages')
    .insert(
      SCRIPT.map((l) => ({
        channel_id: channelId,
        group_id: GROUP_ID,
        sender_name: l.who,
        type: l.text.endsWith('.pdf') ? 'pdf' : 'text',
        text: l.text,
        is_low_info: !!l.low,
        source: 'import',
        extracted_at: new Date().toISOString(), // demo 不需要真的再跑抽取
        created_at: l.at.toISOString(),
      })),
    )
    .select('id, text');
  if (error) throw error;

  // ref → message id
  const id = new Map<string, string>();
  SCRIPT.forEach((l, i) => l.ref && id.set(l.ref, rows![i].id));
  const src = (...refs: string[]) => refs.map((r) => id.get(r)!).filter(Boolean);

  // 抽取結果：每一筆都對得回上面的對話，這正是要展示的「魔法時刻」
  await db.from('events').insert([
    {
      group_id: GROUP_ID,
      title: '中山北路 到場',
      starts_at: iso(IN),
      start_time: '10:00', // C2 把 A1 的八點改成十點——展示「同一件事用 update 不重複建立」
      location: '中山北路',
      status: 'active',
      needs_confirmation: false,
      source_message_ids: src('A1', 'C2'),
      created_at: D(-3, '08:45').toISOString(),
      updated_at: D(-2, '14:40').toISOString(),
    },
    {
      group_id: GROUP_ID,
      title: '交件驗收',
      starts_at: iso(HANDOVER),
      location: '中山北路',
      status: 'active',
      needs_confirmation: true, // 留一筆待確認，展示把關流程與琥珀色狀態
      source_message_ids: src('F1'),
      created_at: D(0, '09:12').toISOString(),
      updated_at: D(0, '09:12').toISOString(),
    },
  ]);

  await db.from('tasks').insert([
    {
      group_id: GROUP_ID,
      title: '中山北路 資料確認',
      assignee: '小林',
      due_at: iso(D(-2)),
      status: 'done',
      needs_confirmation: false,
      source_message_ids: src('A3', 'C1'),
      created_at: D(-3, '09:05').toISOString(),
      updated_at: D(-2, '14:25').toISOString(),
    },
    {
      group_id: GROUP_ID,
      title: '新莊到貨點收',
      assignee: '雅婷',
      due_at: iso(D(0)),
      status: 'open',
      needs_confirmation: false,
      source_message_ids: src('D1', 'D2'),
      created_at: D(-1, '16:25').toISOString(),
      updated_at: D(-1, '16:25').toISOString(),
    },
    {
      group_id: GROUP_ID,
      title: '擬交件驗收清單',
      assignee: '雅婷',
      due_at: iso(nextDow(4, 1)), // 交件前一天交出清單
      status: 'open',
      needs_confirmation: true,
      source_message_ids: src('F1'),
      created_at: D(0, '09:12').toISOString(),
      updated_at: D(0, '09:12').toISOString(),
    },
    {
      group_id: GROUP_ID,
      title: '安排中山北路出車',
      assignee: '阿凱',
      due_at: iso(nextDow(2)), // 到場前一天
      status: 'open',
      needs_confirmation: false,
      source_message_ids: src('A1', 'A2'),
      created_at: D(-3, '08:45').toISOString(),
      updated_at: D(-3, '08:45').toISOString(),
    },
  ]);

  await db.from('notes').insert([
    {
      group_id: GROUP_ID,
      kind: 'decision',
      title: '估價單一律副本給雅婷',
      body: '月底對帳會漏單，所有估價單寄出時副本給會計。',
      pinned: true,
      status: 'active',
      needs_confirmation: false,
      source_message_ids: src('B1'),
      created_at: D(-2, '10:35').toISOString(),
      updated_at: D(-2, '10:35').toISOString(),
    },
    {
      group_id: GROUP_ID,
      kind: 'decision',
      title: '第三項數量改為 320',
      body: '原資料標示有誤，已與客戶確認。',
      status: 'active',
      needs_confirmation: false,
      source_message_ids: src('C1'),
      created_at: D(-2, '14:25').toISOString(),
      updated_at: D(-2, '14:25').toISOString(),
    },
  ]);

  console.log(`✅ ${GROUP_NAME}（${GROUP_ID}）：${SCRIPT.length} 則對話 → 2 事件 / 4 待辦 / 2 公告`);
  console.log(`   看畫面：/?group=${GROUP_ID}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
