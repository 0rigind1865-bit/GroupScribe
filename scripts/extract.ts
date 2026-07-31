// 開發用 CLI：手動觸發指定群組的結構化抽取
// 用法：npx tsx scripts/extract.ts <groupId>
import fs from 'node:fs';

for (const line of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

async function main() {
  const [groupId] = process.argv.slice(2);
  if (!groupId) {
    console.error('用法：npx tsx scripts/extract.ts <groupId>');
    process.exit(1);
  }
  const { extractGroup } = await import('../src/core/extract');
  console.log(JSON.stringify(await extractGroup(groupId), null, 2));
}
main();
