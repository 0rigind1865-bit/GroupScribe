// README 截圖產生器：一次截完五張，畫面尺寸／深淺色／捲動位置都固定，重截才對得起來。
//
// 為什麼不是 `chrome --headless --screenshot`：管理後台要 admin cookie（CLI 沒得設）、
// headless 預設跟隨系統深色、而且截不到捲動後的位置。改用 CDP，三件事一起解決。
// 零依賴：Node 內建 WebSocket + fetch。
//
//   npx tsx scripts/shots.ts            # 全部
//   npx tsx scripts/shots.ts today      # 只截檔名含 today 的
//
// 前置：`npx tsx scripts/seed-demo.ts` 建示範資料、`npm run dev` 起站（DEMO_MODE=1 才進得去成員版）。

import { createHmac } from 'node:crypto';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9222;
const OUT = 'docs/screenshots';

// iPhone 14 的邏輯尺寸；mobile=true 才會套到手機版斷點與底部 Tab 列。
// 高度就是一個真實螢幕——不做整頁長圖：README 要的是「一眼看完」，
// 而且 fixed 的底部 Tab 列在整頁截圖裡會卡在畫面中間，很醜。
const WIDTH = 390;
const HEIGHT = 844;
const SCALE = 3;

type Shot = { file: string; url: string; h?: number; scroll?: number };
const SHOTS: Shot[] = [
  // 首圖：一個螢幕內要同時看得見上方抽取結果與下方時間軸來源（說明文字指的就是這組對應）
  { file: 'today-mobile', url: '/?group=DEMO-GROUP' },
  { file: 'inbox-mobile', url: '/inbox?group=DEMO-GROUP' },
  { file: 'tasks-mobile', url: '/tasks?group=DEMO-GROUP' },
  { file: 'calendar-agenda', url: '/calendar?group=DEMO-GROUP' },
  { file: 'member-liff', url: '/g/DEMO-GROUP' },
];

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .map((l) => l.match(/^([A-Z_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m![1], m![2].trim()]),
);

// 與 core/auth.ts 同一套簽章（那支是 node:crypto，這裡不能 import 因為它讀 process.env）
function adminCookie(): string {
  const pw = env.ADMIN_PASSWORD;
  if (!pw) throw new Error('.env.local 沒有 ADMIN_PASSWORD，管理後台截不到');
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return `${exp}.${createHmac('sha256', pw).update(String(exp)).digest('hex')}`;
}

// PORT=xxxx 可指定；否則掃常見埠。逾時是必要的——殭屍 node 會接受連線但永不回應。
async function findPort(): Promise<number> {
  const ports = process.env.PORT ? [Number(process.env.PORT)] : [3000, 3001, 54119];
  for (const p of ports) {
    const ok = await fetch(`http://localhost:${p}/login`, { signal: AbortSignal.timeout(1500) })
      .then((r) => r.ok)
      .catch(() => false);
    if (ok) return p;
  }
  throw new Error('找不到 dev server，先跑 `npm run dev`（或用 PORT=xxxx 指定）');
}

// 最小 CDP client：send(method, params) → Promise<result>
function cdp(ws: WebSocket) {
  let id = 0;
  const waiting = new Map<number, (v: any) => void>();
  ws.addEventListener('message', (e) => {
    const msg = JSON.parse(String(e.data));
    if (msg.id && waiting.has(msg.id)) waiting.get(msg.id)!(msg.result), waiting.delete(msg.id);
  });
  return (method: string, params: any = {}) =>
    new Promise<any>((res) => (waiting.set(++id, res), ws.send(JSON.stringify({ id, method, params }))));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const only = process.argv[2];
  const shots = only ? SHOTS.filter((s) => s.file.includes(only)) : SHOTS;
  if (!shots.length) throw new Error(`沒有符合「${only}」的截圖`);

  const port = await findPort();
  // 示範資料不在就先擋下來——空畫面截起來一樣是五張漂亮的 PNG，很容易就這樣 commit 進 README
  const probe = await fetch(`http://localhost:${port}/g/DEMO-GROUP`).then((r) => r.text());
  if (probe.includes('近期沒有已排定的行程'))
    throw new Error('DEMO-GROUP 是空的，先跑 `npx tsx scripts/seed-demo.ts`');

  const profile = mkdtempSync(join(tmpdir(), 'gs-shots-'));
  const chrome = spawn(CHROME, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    '--hide-scrollbars',
    '--disable-gpu',
  ]);

  // 等 DevTools endpoint 起來
  let target: any;
  for (let i = 0; i < 40 && !target; i++) {
    await sleep(250);
    target = await fetch(`http://localhost:${PORT}/json/new?about:blank`, { method: 'PUT' })
      .then((r) => r.json())
      .catch(() => null);
  }
  if (!target) throw new Error('Chrome 沒起來');

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  const send = cdp(ws);

  await send('Page.enable');
  await send('Network.enable');
  await send('Network.setCookie', {
    name: 'gs_auth',
    value: adminCookie(),
    domain: 'localhost',
    path: '/',
  });
  // 淺色：headless 預設跟隨系統，深色機器截出來會跟 README 其他圖不一致
  await send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-color-scheme', value: 'light' }],
  });

  for (const s of shots) {
    await send('Emulation.setDeviceMetricsOverride', {
      width: WIDTH,
      height: s.h ?? HEIGHT,
      deviceScaleFactor: SCALE,
      mobile: true,
    });
    await send('Page.navigate', { url: `http://localhost:${port}${s.url}` });
    await sleep(2500); // force-dynamic：每頁都要打一輪 DB，給足時間
    if (s.scroll) {
      await send('Runtime.evaluate', { expression: `window.scrollTo(0, ${s.scroll})` });
      await sleep(300);
    }
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    const path = `${OUT}/${s.file}.png`;
    writeFileSync(path, Buffer.from(data, 'base64'));
    console.log(`✅ ${path}  ${WIDTH * SCALE}×${(s.h ?? HEIGHT) * SCALE}`);
  }

  ws.close();
  chrome.kill();
}

main().catch((e) => (console.error('❌', e.message), process.exit(1)));
