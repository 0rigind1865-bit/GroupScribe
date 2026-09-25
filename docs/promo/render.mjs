// 把 promo.html 逐格截圖、接給 ffmpeg 壓成 MP4。
// 用法：node docs/promo/render.mjs [輸出檔]
// 需要：puppeteer-core、ffmpeg-static（放在任何 node_modules 可解析到的地方）、本機 Google Chrome
import puppeteer from 'puppeteer-core';
import ffmpeg from 'ffmpeg-static';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const FPS = 30, SECONDS = 31;
const html = fileURLToPath(new URL('./promo.html', import.meta.url));
const out = process.argv[2] ?? fileURLToPath(new URL('./groupscribe-promo.mp4', import.meta.url));

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const page = await browser.newPage();
await page.setViewport({ width: 1080, height: 1920 });
await page.goto(pathToFileURL(html).href, { waitUntil: 'networkidle0' });

const ff = spawn(ffmpeg, ['-y', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });

for (let f = 0; f < FPS * SECONDS; f++) {
  await page.evaluate(ms => window.seek(ms), (f * 1000) / FPS);
  const buf = await page.screenshot({ type: 'jpeg', quality: 92 });
  if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
}
ff.stdin.end();
await new Promise(r => ff.on('close', r));
await browser.close();
console.log('完成：' + out);
