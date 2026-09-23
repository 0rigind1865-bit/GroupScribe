// 首次啟動、尚未設定外部服務時的指引頁
export function SetupNotice() {
  return (
    <main className="mx-auto max-w-3xl p-5">
      <h1 className="mb-3 text-2xl font-semibold tracking-tight">還差幾步就能開始 🔧</h1>
      <p className="mb-4 text-sm text-gray-700">
        GroupScribe 需要兩個外部服務才能運作，請在 <code className="rounded bg-gray-100 px-1">.env.local</code>{' '}
        填入後重新整理：
      </p>
      <ol className="list-decimal space-y-3 pl-5">
        <li className="card text-sm">
          <strong>Supabase</strong>（資料庫＋檔案儲存）：到 supabase.com 建立免費專案 → SQL Editor 執行{' '}
          <code className="rounded bg-gray-100 px-1">supabase/schema.sql</code> → 把 Settings → API 的 URL 與
          service_role key 填入 <code className="rounded bg-gray-100 px-1">SUPABASE_URL</code>、
          <code className="rounded bg-gray-100 px-1">SUPABASE_SERVICE_ROLE_KEY</code>
        </li>
        <li className="card text-sm">
          <strong>Gemini API key</strong>（aistudio.google.com）→ 填入{' '}
          <code className="rounded bg-gray-100 px-1">GEMINI_API_KEY</code>
        </li>
        <li className="card text-sm">
          <strong>LINE Messaging API</strong>（要接真實群組才需要）：Channel secret / access token 填入{' '}
          <code className="rounded bg-gray-100 px-1">LINE_CHANNEL_SECRET</code>、
          <code className="rounded bg-gray-100 px-1">LINE_CHANNEL_ACCESS_TOKEN</code>，Webhook URL 設為{' '}
          <code className="rounded bg-gray-100 px-1">https://&lt;網域&gt;/api/webhook/line</code>
        </li>
      </ol>
    </main>
  );
}
