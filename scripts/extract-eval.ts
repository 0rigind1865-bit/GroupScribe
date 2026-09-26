// 跨行業抽取回歸（商業計劃 E1）：上第一個非同業租戶前跑一次，記錄假陽性率與漏抽率。
//
// 用法（尚未能跑，見下方 TODO）：
//   EVAL_SUPABASE_URL=... EVAL_SUPABASE_SERVICE_ROLE_KEY=... GEMINI_API_KEY=... npx tsx scripts/extract-eval.ts
//
// ⚠ 絕不讀 .env.local：抽取會寫 messages／events／tasks／notes，一定要接一個「測試用」Supabase 專案。
// 花費：3 份題目 × 每份約 1–3 次抽取呼叫 ≈ 10 次以內的 Gemini 呼叫。
//
// TODO（要先做才能跑）：抽取目前與 DB 綁在一起（extract.ts 從 messages 撈、寫回 events／tasks／notes），
// 沒有「對話 → 抽取結果」的純入口。兩條路擇一：
//   (a) 從 extract.ts 抽出純函式 extractFromMessages(messages, profile) → ops，這裡直接呼叫（推薦，也能加快單元測試）
//   (b) 對測試專案：建一個假群、insert 題目訊息、呼叫 extractGroup()、再讀回 events／tasks／notes
import fs from 'node:fs';
import path from 'node:path';
import { compare, type Actual, type Expected } from '../src/core/eval-compare';

if (!process.env.EVAL_SUPABASE_URL || !process.env.EVAL_SUPABASE_SERVICE_ROLE_KEY) {
  console.error('缺 EVAL_SUPABASE_URL／EVAL_SUPABASE_SERVICE_ROLE_KEY：請接測試用 Supabase 專案（不會讀 .env.local）');
  process.exit(1);
}

type Fixture = { industry: string; messages: { at: string; name: string; text: string }[]; expected: Expected[] };

async function extractFixture(_f: Fixture): Promise<Actual[]> {
  throw new Error('尚未實作：見檔案頂端 TODO');
}

(async () => {
  const dir = path.join(import.meta.dirname, '../tests/fixtures/golden');
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const f = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')) as Fixture;
    const r = compare(f.expected, await extractFixture(f));
    console.log(`${f.industry}：對到 ${r.matched}/${f.expected.length}、多抽 ${r.extra.length}、假陽性率 ${(r.falsePositiveRate * 100).toFixed(0)}%`);
    for (const m of r.missed) console.log('  漏：', m.kind, m.keywords.join('＋'));
    for (const x of r.extra) console.log('  多：', x.kind, x.title);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
