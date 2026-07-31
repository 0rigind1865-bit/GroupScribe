import { dbConfigured, getDb } from '@/db';
import { DEFAULT_NOTICE } from '@/core/ingest';
import { SetupNotice } from '../setup-notice';

export const dynamic = 'force-dynamic';

// 各模型每百萬 token 價格（美元，2026-07 官方牌價）；換模型記得對一下 ai.google.dev/gemini-api/docs/pricing
const PRICES: Record<string, { input: number; output: number }> = {
  'gemini-2.5-flash': { input: 0.3, output: 2.5 },
  'gemini-2.5-flash-lite': { input: 0.1, output: 0.4 },
  'gemini-3.5-flash': { input: 1.5, output: 9 },
  'gemini-3.5-flash-lite': { input: 0.3, output: 2.5 },
};
const EMBED_PRICE = 0.15;

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string; processed?: string }>;
}) {
  if (!dbConfigured()) return <SetupNotice />;
  const { saved, error, processed } = await searchParams;
  const db = getDb();
  const { data: cfg } = await db
    .from('app_settings')
    .select('join_notice_enabled, join_notice_text')
    .eq('id', 1)
    .maybeSingle();
  // 收訊健康：LINE 漏收不可回補，停機期間掉的訊息永久消失且無人會知道（E 節約束）
  const { data: hb } = await db.from('app_settings').select('last_webhook_at').eq('id', 1).maybeSingle();
  const lastWebhook = hb?.last_webhook_at ? new Date(hb.last_webhook_at) : null;
  const silentHours = lastWebhook ? (Date.now() - lastWebhook.getTime()) / 3_600_000 : null;
  const enabled = cfg?.join_notice_enabled ?? true;
  const text = cfg?.join_notice_text ?? DEFAULT_NOTICE;

  // AI 用量（api_usage，migration 006）；預算欄位另查，006 未跑時不影響上面的告知設定
  const today = new Date().toLocaleDateString('sv', { timeZone: 'Asia/Taipei' });
  const monthStart = `${today.slice(0, 7)}-01`;
  const { data: usageRows, error: usageErr } = await db
    .from('api_usage')
    .select('*')
    .gte('day', monthStart)
    .order('day');
  const { data: budgetRow } = await db.from('app_settings').select('monthly_budget_usd').eq('id', 1).maybeSingle();
  const budget = Number(budgetRow?.monthly_budget_usd) > 0 ? Number(budgetRow?.monthly_budget_usd) : 5;

  // 待解析媒體積壓（E 節：捕捉的失敗必須可見）——webhook 每次順手重試幾筆，這裡讓數字看得到
  const { count: pendingMedia } = await db
    .from('media_assets')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending');

  // 抽取品質（近 7 天）：AI 產出裡有多少被人採用。
  // E 節說「捕捉的失敗必須可見」，同一條邏輯該延伸到產品價值本身——採用率低就是抽取準度出問題，
  // 再多的 UI 打磨都救不了。待確認的不計入分母：人還沒判斷，不算數。
  //
  // 為什麼是 7 天而不是 30 天：一次性的大批匯入抽取（例如冷啟動那批）會被人批次清掉，
  // 那些 done/ignored 是「清垃圾」不是「判斷品質」，混進來會讓數字嚴重失真
  // （實測 30 天窗跑出 84%，其中大半是批次操作的結果）。短窗看的是「現在準不準」。
  const since30 = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const quality = async (table: string) => {
    const base = () =>
      db
        .from(table)
        .select('id', { count: 'exact', head: true })
        .eq('source', 'ai')
        .gte('created_at', since30)
        .neq('group_id', 'DEMO-GROUP'); // 示範資料是寫死的，算進去會虛增採用率
    // 「忽略」有兩種語意，混在一起會嚴重誤判抽取品質：
    //   還沒確認就忽略 ＝ 人第一眼就說「這不對」→ 真正的品質訊號
    //   確認過之後才忽略 ＝ 曾經是對的，過期或被新的取代（公告尤其常見）→ 生命週期，不是抽錯
    // 用既有欄位就分得出來，不必多問人一次，也不必加 schema。
    const [ok, rej, ret, pd] = await Promise.all([
      base().eq('needs_confirmation', false).neq('status', 'ignored'),
      base().eq('status', 'ignored').eq('needs_confirmation', true),
      base().eq('status', 'ignored').eq('needs_confirmation', false),
      base().eq('needs_confirmation', true).neq('status', 'ignored'),
    ]);
    return { ok: ok.count ?? 0, rejected: rej.count ?? 0, retired: ret.count ?? 0, pending: pd.count ?? 0 };
  };
  // 必須分類型看：混成一個數字會把「只有某一類不準」這個唯一可行動的訊號蓋掉（principles.md）。
  const qs = await Promise.all([quality('events'), quality('tasks'), quality('notes')]);
  const kinds = ['行程', '待辦', '公告'].map((label, i) => {
    const q = qs[i];
    const j = q.ok + q.rejected; // 分母只有「採用」與「一看就否決」；撤下的不算抽錯
    return { label, ...q, judged: j, rate: j > 0 ? Math.round((q.ok / j) * 100) : null };
  });
  const adopted = qs.reduce((n, q) => n + q.ok, 0);
  const rejected = qs.reduce((n, q) => n + q.rejected, 0);
  const retired = qs.reduce((n, q) => n + q.retired, 0);
  const awaiting = qs.reduce((n, q) => n + q.pending, 0);
  const judged = adopted + rejected;
  const adoptRate = judged > 0 ? Math.round((adopted / judged) * 100) : null;
  const worst = kinds.filter((k) => k.judged >= 5 && k.rate !== null).sort((a, b) => a.rate! - b.rate!)[0];

  const sum = (k: string) => (usageRows ?? []).reduce((n: number, r: any) => n + Number(r[k] ?? 0), 0);
  const model = process.env.GEMINI_MODEL ?? 'gemini-3.5-flash-lite'; // 與 providers/gemini.ts 的預設一致
  const price = PRICES[model] ?? PRICES['gemini-3.5-flash-lite'];
  const cost =
    (sum('input_tokens') * price.input + sum('output_tokens') * price.output + sum('embed_tokens') * EMBED_PRICE) / 1e6;
  const pct = Math.min(100, Math.round((cost / budget) * 100));
  const todayRow = (usageRows ?? []).find((r: any) => r.day === today);

  return (
    <main className="mx-auto max-w-2xl p-5">
      <h1 className="mb-4 text-2xl font-bold">設定</h1>
      {saved && <p className="card mb-4 border-emerald-200 bg-emerald-50 text-sm">已儲存。</p>}
      {processed && (
        <p className="card mb-4 border-emerald-200 bg-emerald-50 text-sm">
          已解析 {processed} 個圖片／PDF。{Number(processed) === 20 && '（單次上限 20 個，還有積壓就再按一次。）'}
        </p>
      )}
      {error === 'budget' && (
        <p className="card mb-4 border-red-200 bg-red-50 text-sm text-red-700">
          預算儲存失敗——<code>monthly_budget_usd</code> 欄位可能尚未建立，請在 Supabase SQL Editor 執行{' '}
          <code>supabase/migrations/006_api_usage.sql</code>。
        </p>
      )}
      {error && error !== 'budget' && (
        <p className="card mb-4 border-red-200 bg-red-50 text-sm text-red-700">
          儲存失敗——<code>app_settings</code> 表可能尚未建立，請在 Supabase SQL Editor 執行{' '}
          <code>supabase/migrations/003_app_settings.sql</code>。
        </p>
      )}

      <section className="card mb-6 space-y-2">
        <h2 className="font-bold">收訊狀態</h2>
        {lastWebhook ? (
          <>
            <p className="text-sm">
              最後收到 LINE 訊息：{lastWebhook.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false })}
              {silentHours !== null && silentHours > 24 && (
                <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-bold text-amber-900">
                  已靜默 {Math.floor(silentHours)} 小時
                </span>
              )}
            </p>
            {silentHours !== null && silentHours > 24 && (
              <p className="text-xs text-amber-700">
                若群組其實有在對話，代表 webhook 沒進來——檢查 LINE Console 的 Webhook URL 與「Use webhook」開關。
                <strong>漏收的訊息無法回補</strong>，建議在 Console 開啟 Webhook redelivery（本站有去重索引，重送安全）。
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-gray-500">
            尚未記錄（需執行 <code>supabase/migrations/009_push_subscriptions.sql</code>，或還沒收過訊息）。
          </p>
        )}

        {/* 媒體積壓（E 節：捕捉的失敗必須可見）。原本掛在「AI 用量」卡裡，但這是捕捉健康指標
            不是費用指標——2026-07 有 30 個圖片／PDF 卡在 pending 三天，找它時第一個看的是收訊狀態。
            順手補一個手動觸發，免得又要靠人記得敲 curl。 */}
        {(pendingMedia ?? 0) > 0 && (
          <div className="border-t border-gray-100 pt-2">
            <p className="text-sm">
              待解析的圖片／PDF：<strong>{pendingMedia}</strong> 個
              {(pendingMedia ?? 0) > 10 && (
                <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-bold text-amber-900">積壓</span>
              )}
            </p>
            <p className="mt-0.5 text-xs text-gray-500">
              收到新訊息時會順手補解析幾個；數字一直降不下來通常是 AI 配額用完（見下方用量）。
            </p>
            <form action="/api/process" method="post" className="mt-1.5">
              <button className="btn text-xs">立刻解析（最多 20 個）</button>
            </form>
          </div>
        )}
      </section>

      <section className="card mb-6 space-y-3">
        <h2 className="font-bold">AI 用量（本月）</h2>
        {usageErr ? (
          <p className="text-sm text-gray-500">
            用量記帳尚未啟用——請在 Supabase SQL Editor 執行 <code>supabase/migrations/006_api_usage.sql</code>，
            之後每次 AI 呼叫都會自動記帳。
          </p>
        ) : (
          <>
            <div className="flex items-baseline justify-between text-sm">
              <span>
                估算費用 <strong>US${cost.toFixed(3)}</strong> / 預算 US${budget}（{pct}%）
              </span>
              <span className="text-gray-500">
                呼叫 {sum('calls')} 次｜輸入 {Math.round(sum('input_tokens') / 1000)}k｜輸出{' '}
                {Math.round(sum('output_tokens') / 1000)}k tokens
              </span>
            </div>
            <div className="h-3 overflow-hidden rounded bg-gray-200">
              <div
                className={`h-full rounded ${pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            {(todayRow?.blocked ?? 0) > 0 && (
              <p className="text-sm text-red-700">
                ⚠️ 今天有 {todayRow.blocked} 次呼叫被 Gemini 拒絕（429 配額/花費上限）——到{' '}
                <a className="underline" href="https://ai.studio/spend" target="_blank" rel="noreferrer">
                  ai.studio/spend
                </a>{' '}
                查看。
              </p>
            )}
            <form action="/api/settings" method="post" className="flex items-center gap-2 text-sm">
              月預算 US$
              <input
                className="input w-24 py-1"
                name="monthly_budget"
                type="number"
                step="0.5"
                min="0.5"
                defaultValue={budget}
              />
              <button className="btn px-2 py-1 text-xs">儲存預算</button>
            </form>
            <p className="text-xs text-gray-400">
              這是應用自己的記帳（模型 {model}；Google 沒有提供查詢額度的 API）——Google 端的權威數字請看{' '}
              <a className="underline" href="https://ai.studio/spend" target="_blank" rel="noreferrer">
                ai.studio/spend
              </a>
              ；免費層另有每日重置的次數限制，見{' '}
              <a className="underline" href="https://aistudio.google.com/rate-limit" target="_blank" rel="noreferrer">
                rate-limit
              </a>
              。
            </p>
          </>
        )}
      </section>

      {/* 抽取品質：這是產品價值的健康指標，比用量更重要——
          用量告訴你花了多少錢，這裡告訴你那些錢有沒有換到有用的東西。 */}
      <section className="card mb-6 space-y-2">
        <h2 className="font-bold">抽取品質（近 7 天）</h2>
        {judged === 0 ? (
          <p className="text-sm text-gray-500">
            還沒有足夠樣本。AI 產出的項目經你「確認」或「忽略」之後，這裡會顯示採用率。
            {awaiting > 0 && <>目前有 {awaiting} 件待確認。</>}
          </p>
        ) : (
          <>
            {/* 分類型是重點：整體數字會把「只有某一類不準」蓋掉 */}
            <div className="space-y-1.5">
              {kinds.map((k) => (
                <div key={k.label} className="flex items-center gap-3 text-sm">
                  <span className="w-8 flex-none text-gray-600">{k.label}</span>
                  <span className="w-12 flex-none text-right font-bold tabular-nums">
                    {k.rate === null ? '—' : `${k.rate}%`}
                  </span>
                  <span className="h-2 flex-1 overflow-hidden rounded bg-gray-200">
                    {k.rate !== null && (
                      <span
                        className={`block h-full rounded ${
                          k.rate >= 70 ? 'bg-emerald-500' : k.rate >= 50 ? 'bg-amber-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${k.rate}%` }}
                      />
                    )}
                  </span>
                  <span className="w-20 flex-none text-right text-xs text-gray-500 tabular-nums">
                    {k.ok}/{k.judged} 件
                  </span>
                </div>
              ))}
            </div>
            <p className="border-t border-gray-100 pt-2 text-xs text-gray-500">
              整體 {adoptRate}%（{adopted}/{judged}）｜待確認 {awaiting} 件尚未判斷，不計入
            </p>
            {retired > 0 && (
              <p className="text-xs text-gray-500">
                另有 <strong>{retired}</strong> 件是確認過之後才撤下的——過期或被新的取代，
                <strong>不算抽錯</strong>，所以不計入上面的比率。
              </p>
            )}
            {judged < 5 && (
              <p className="text-xs text-gray-500">樣本還少，數字會跳動；累積一兩週再看趨勢比較準。</p>
            )}
            {worst && worst.rate! < 50 && (
              <p className="text-xs text-red-700">
                <strong>「{worst.label}」只有 {worst.rate}% 被採用</strong>——這一類的抽取準度是目前最該處理的問題。
                其他類型正常的話，調整那一類的抽取條件比動介面有效得多。
              </p>
            )}
          </>
        )}
      </section>

      <form action="/api/settings" method="post" className="card space-y-4">
        <h2 className="font-bold">進群告知訊息</h2>
        <p className="text-sm text-gray-500">
          bot 加入群組時會發送這則訊息（隱私告知＋用法），之後保持沉默。這是它唯一主動說話的時機。
        </p>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="enabled" defaultChecked={enabled} />
          bot 加入群組時發送告知訊息
        </label>

        <label className="block text-sm">
          訊息內容
          <textarea className="input mt-1 block w-full font-mono text-sm" name="text" rows={8} defaultValue={text} />
        </label>

        <p className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
          ⚠️ 關閉後，群成員不會被告知 bot 正在記錄訊息。請自行確認符合你的隱私政策與當地法規（例如台灣個資法 PDPA）。
        </p>

        <button className="btn-primary">儲存</button>
      </form>
    </main>
  );
}
