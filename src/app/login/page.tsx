export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="mx-auto max-w-sm p-5 pt-20">
      <div className="card">
        <h1 className="mb-3 text-xl font-semibold tracking-tight">登入</h1>
        {error && <p className="mb-3 text-sm text-red-600">密碼錯誤，或伺服器尚未設定 ADMIN_PASSWORD。</p>}
        <form action="/api/login" method="post" className="flex gap-2">
          <input className="input flex-1" type="password" name="password" placeholder="管理密碼" autoFocus />
          <button className="btn-primary">登入</button>
        </form>
      </div>
    </main>
  );
}
