// 開發用 CLI：不經 LINE 直接問問題，驗證檢索與問答
// 用法：npx tsx scripts/ask.ts <groupId> <問題>
import fs from 'node:fs';

for (const line of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

async function main() {
  const [groupId, ...q] = process.argv.slice(2);
  if (!groupId || !q.length) {
    console.error('用法：npx tsx scripts/ask.ts <groupId> <問題>');
    process.exit(1);
  }
  const { answer } = await import('../src/core/query');
  console.log(await answer(groupId, q.join(' ')));
}
main();
