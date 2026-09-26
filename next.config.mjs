import { PHASE_DEVELOPMENT_SERVER } from 'next/constants.js';

/** @type {(phase: string) => import('next').NextConfig} */
const nextConfig = (phase) => ({
  output: 'standalone', // 容器部署（Fly.io）：產出自帶 server.js 的最小 runtime
  // 關掉開發模式左下角的浮動指示器：它會出現在本機截的示範圖裡（正式站本來就沒有）
  devIndicators: false,
  // 驗證用 build 可輸出到別的資料夾（NEXT_DIST_DIR=.next-verify）：正在跑的 next start 讀 .next，
  // 同一個資料夾重新 build 會把它弄壞（2026-09-26 Mac 暫代正式主機時踩過）
  // next dev 預設寫 .next-dev：設計工具／預覽開的 dev 會覆蓋 .next，讓對外的 next start 抓不到 CSS 全站跑版（2026-09-26 又踩一次）
  distDir: process.env.NEXT_DIST_DIR || (phase === PHASE_DEVELOPMENT_SERVER ? '.next-dev' : '.next'),
});

export default nextConfig;
