export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="mx-auto max-w-sm p-5 pt-20">
      <div className="card">
        <h1 className="mb-3 text-xl font-semibold tracking-tight">登入</h1>
        {error === 'noorg' ? (
          <p className="mb-3 text-sm text-amber-800">這個 LINE 帳號還沒有組織。第一次使用請先建立組織。</p>
        ) : error === 'state' || error === 'line' || error === 'noliff' ? (
          <p className="mb-3 text-sm text-red-600">LINE 登入失敗，請再試一次。</p>
        ) : error ? (
          <p className="mb-3 text-sm text-red-600">密碼錯誤，或伺服器尚未設定 ADMIN_PASSWORD。</p>
        ) : null}
        {/* 一般客戶：LINE 登入（組織管理員）；第一次使用去 /start 自助建組織 */}
        <a className="btn-primary w-full" href="/api/auth/line">
          用 LINE 登入
        </a>
        <p className="mt-2 text-center text-sm text-gray-500">
          第一次使用？{' '}
          <a className="text-emerald-700 underline" href="/start">
            免費建立你的組織
          </a>
        </p>
        {/* 平台擁有者：密碼登入（收在下面，一般客戶用不到） */}
        <p className="mt-3 text-center text-xs text-gray-400">
          <a className="underline" href="/terms">服務條款</a> · <a className="underline" href="/privacy">隱私權政策</a>
        </p>
        <details className="mt-4">
          <summary className="cursor-pointer text-xs text-gray-400">平台管理者密碼登入</summary>
          <form action="/api/login" method="post" className="mt-2 flex gap-2">
            <input className="input flex-1" type="password" name="password" placeholder="管理密碼" />
            <button className="btn">登入</button>
          </form>
        </details>
      </div>
    </main>
  );
}
