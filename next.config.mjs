/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone', // 容器部署（Fly.io）：產出自帶 server.js 的最小 runtime
  // 關掉開發模式左下角的浮動指示器：它會出現在本機截的示範圖裡（正式站本來就沒有）
  devIndicators: false,
};

export default nextConfig;
