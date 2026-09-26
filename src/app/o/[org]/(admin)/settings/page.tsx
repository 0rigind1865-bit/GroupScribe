import { dbConfigured, getDb } from '@/db';
import { DEFAULT_NOTICE } from '@/core/ingest';
import { SetupNotice } from '../setup-notice';
import { messageQuota } from '@/connectors/line';
import { refreshSettings, DEFAULT_EMBEDDING_MODEL } from '@/core/settings';
import { orgAdminAccess, orgGroups } from '@/org/orgs';
import { notFound } from 'next/navigation';
import { Banner } from '@/app/ui/banner';

export const dynamic = 'force-dynamic';

// 三條進度條同一個形狀：綠→琥珀→紅，門檻一致，看一眼就知道哪條該擔心
function Meter({ pct }: { pct: number }) {
  return (
    <div className="h-2.5 overflow-hidden rounded-full bg-gray-200">
      <div
        className={`h-full rounded-full ${pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-emerald-500'}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// 各模型每百萬 token 價格（美元，2026-07 官方牌價）；換模型記得對一下 ai.google.dev/gemini-api/docs/pricing
const PRICES: Record<string, { input: number; output: number }> = {
  'gemini-2.5-flash': { input: 0.3, output: 2.5 },
  'gemini-2.5-flash-lite': { input: 0.1, output: 0.4 },
  'gemini-3.5-flash': { input: 1.5, output: 9 },
  'gemini-3.5-flash-lite': { input: 0.3, output: 2.5 },
};
const EMBED_PRICE = 0.15;

export default async function SettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ saved?: string; error?: string; processed?: string }>;
}) {
  if (!dbConfigured()) return <SetupNotice />;
  const { saved, error, processed } = await searchParams;
  const access = await orgAdminAccess((await params).org);
  if (!access) notFound();
  // 收訊／LINE 額度／AI 用量與模型是全站共用的平台數字（商業計劃 G1、U11）：只給平台擁有者看。
  // 公司管理員只看自己的進群告知與自己群組的抽取品質。
  const platform = access.via === 'platform';
  const groupIds = (await orgGroups(access.org.id)).map((g) => g.group_id);
  const db = getDb();
  const { data: cfg } = await db
    .from('org_settings')
    .select('join_notice_enabled, join_notice_text')
    .eq('org_id', access.org.id)
    .maybeSingle();
  // 收訊健康：LINE 漏收不可回補，停機期間掉的訊息永久消失且無人會知道（E 節約束）
  const { data: hb } = await db.from('app_settings').select('last_webhook_at').eq('id', 1).maybeSingle();
  const lastWebhook = hb?.last_webhook_at ? new Date(hb.last_webhook_at) : null;
  // 靜默 6 小時就警示（A9）：工作群半天沒訊息不常見，漏收又無法回補，寧可早點看到
  const SILENT_WARN_HOURS = 6;
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
        .in('group_id', groupIds)
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

  // LINE 推送額度（官方端點，非自記帳）與生效中的 AI 設定
  const [lineQuota, cfgAi] = await Promise.all([messageQuota(), refreshSettings(true)]);

  const sum = (k: string) => (usageRows ?? []).reduce((n: number, r: any) => n + Number(r[k] ?? 0), 0);
  const model = cfgAi.genModel;
  const price = PRICES[model] ?? PRICES['gemini-3.5-flash-lite'];
  const cost =
    (sum('input_tokens') * price.input + sum('output_tokens') * price.output + sum('embed_tokens') * EMBED_PRICE) / 1e6;
  const pct = Math.min(100, Math.round((cost / budget) * 100));
  const todayRow = (usageRows ?? []).find((r: any) => r.day === today);
  // 免費層是「每日請求次數」不是花費，跟月預算是兩回事：錢還沒花完也可能今天先被擋下
  const freeLimit = cfgAi.aiDailyFreeCalls;
  const callsToday = Number(todayRow?.calls ?? 0);
  const freePct = freeLimit ? Math.min(100, Math.round((callsToday / freeLimit) * 100)) : 0;
  const linePct =
    'limit' in lineQuota && lineQuota.limit ? Math.min(100, Math.round((lineQuota.used / lineQuota.limit) * 100)) : 0;

  return (
    <main className="mx-auto max-w-2xl p-4 md:p-8">
      <h1 className="mb-5 text-3xl md:text-4xl">設定</h1>
      {saved && <p className="card mb-4 border-emerald-200 bg-emerald-50 text-sm">已儲存。</p>}
      {processed && (
        <p className="card mb-4 border-emerald-200 bg-emerald-50 text-sm">
          已解析 {processed} 個圖片／PDF。{Number(processed) === 20 && '（單次上限 20 個，還有積壓就再按一次。）'}
        </p>
      )}
      {error === 'ai' && (
        <p className="card mb-4 border-red-200 bg-red-50 text-sm text-red-700">
          AI 設定儲存失敗——欄位可能尚未建立，請在 Supabase SQL Editor 執行{' '}
          <code>supabase/migrations/011_ai_settings.sql</code>。
        </p>
      )}
      {error === 'budget' && (
        <p className="card mb-4 border-red-200 bg-red-50 text-sm text-red-700">
          預算儲存失敗——<code>monthly_budget_usd</code> 欄位可能尚未建立，請在 Supabase SQL Editor 執行{' '}
          <code>supabase/migrations/006_api_usage.sql</code>。
        </p>
      )}
      {error && error !== 'budget' && error !== 'ai' && (
        <p className="card mb-4 border-red-200 bg-red-50 text-sm text-red-700">
          儲存失敗——<code>org_settings</code> 表可能尚未建立，請在 Supabase SQL Editor 執行{' '}
          <code>supabase/migrations/012_orgs.sql</code>。
        </p>
      )}

      {platform && (<>
      <section className="card mb-6 space-y-2">
        <h2 className="text-base font-bold">收訊狀態</h2>
        {lastWebhook ? (
          <>
            <p className="text-sm">
              最後收到 LINE 訊息：{lastWebhook.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false })}
              {silentHours !== null && silentHours > SILENT_WARN_HOURS && (
                <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-bold text-amber-900">
                  已靜默 {Math.floor(silentHours)} 小時
                </span>
              )}
            </p>
            {silentHours !== null && silentHours > SILENT_WARN_HOURS && (
              <Banner tone="warn">
                若群組其實有在對話，代表 webhook 沒進來——檢查 LINE Console 的 Webhook URL 與「Use webhook」開關。
                <strong>漏收的訊息無法回補</strong>，建議在 Console 開啟 Webhook redelivery（本站有去重索引，重送安全）。
              </Banner>
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

      {/* LINE 推送額度：與 AI 用量分開一張卡，因為它們是兩種完全不同的破產方式——
          AI 用完是花錢，LINE 用完是「訊息安靜地送不出去」而且不會有人發現。 */}
      <section className="card mb-6 space-y-3">
        <h2 className="text-base font-bold">LINE 推送訊息（本月）</h2>
        {'error' in lineQuota ? (
          <p className="text-sm text-gray-500">查不到額度：{lineQuota.error}</p>
        ) : lineQuota.limit === null ? (
          <p className="text-sm text-gray-600">
            目前方案沒有推送上限，已用 <strong>{lineQuota.used}</strong> 則。
          </p>
        ) : (
          <>
            <div className="flex items-baseline justify-between text-sm">
              <span>
                已用 <strong>{lineQuota.used}</strong> / {lineQuota.limit} 則（{linePct}%）
              </span>
              <span className="text-gray-500">每月 1 號重置</span>
            </div>
            <Meter pct={linePct} />
            {linePct >= 90 && (
              <p className="text-sm text-red-700">
                ⚠️ 額度快用完了。用完之後每日摘要會安靜地送不出去——LINE 不會通知你，訂閱的人也不會察覺。
              </p>
            )}
          </>
        )}
        <p className="text-xs text-gray-400">
          數字來自 LINE 官方端點（非本站記帳）。只計主動推送——群組裡 @bot 的回覆不佔額度，
          所以這條幾乎都是每日摘要推播用掉的。
        </p>
      </section>

      <section className="card mb-6 space-y-3">
        <h2 className="text-base font-bold">AI 用量（本月）</h2>
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
            <Meter pct={pct} />

            {/* 免費層用量：與月預算是兩件事——錢沒花完也可能今天先撞到每日次數上限 */}
            {freeLimit ? (
              <>
                <div className="flex items-baseline justify-between pt-1 text-sm">
                  <span>
                    今日免費額度 <strong>{callsToday}</strong> / {freeLimit} 次（{freePct}%）
                  </span>
                  <span className="text-gray-500">每日重置</span>
                </div>
                <Meter pct={freePct} />
              </>
            ) : (
              <p className="pt-1 text-xs text-gray-400">
                想看免費層的每日次數進度，在下方「AI 設定」填入上限——Google 沒有查詢額度的 API，
                數字要自己從{' '}
                <a className="underline" href="https://aistudio.google.com/rate-limit" target="_blank" rel="noreferrer">
                  rate-limit
                </a>{' '}
                抄過來。
              </p>
            )}
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
              <button className="btn btn-sm">儲存預算</button>
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

      {/* AI 設定：原本要 ssh 進機器改 .env.local 再重建容器，而換模型是會反覆試的事。
          金鑰刻意不放進來——service-role 讀得到整張表，API key 進 DB 等於多開一條外洩路徑，
          而且金鑰本來就不是會反覆調整的東西。 */}
      <section className="card mb-6 space-y-3">
        <h2 className="text-base font-bold">AI 設定</h2>
        <form action="/api/settings" method="post" className="space-y-3 text-sm">
          <input type="hidden" name="ai" value="1" />
          <label className="block">
            <span className="mb-1 block font-bold">生成模型</span>
            <select className="input w-full" name="gen_model" defaultValue={cfgAi.genModel}>
              {Object.keys(PRICES).map((m) => (
                <option key={m} value={m}>
                  {m}（輸入 ${PRICES[m].input} / 輸出 ${PRICES[m].output} 每百萬 token）
                </option>
              ))}
              {!PRICES[cfgAi.genModel] && <option value={cfgAi.genModel}>{cfgAi.genModel}（無牌價，費用會低估）</option>}
            </select>
            <span className="mt-1 block text-xs text-gray-400">
              清單來自本頁的牌價表——換到表上沒有的模型，估算費用會失準，要同步更新 PRICES。
            </span>
          </label>
          <label className="block">
            <span className="mb-1 block font-bold">免費層每日請求上限</span>
            <input
              className="input w-32"
              name="ai_daily_free_calls"
              type="number"
              min="0"
              step="1"
              defaultValue={cfgAi.aiDailyFreeCalls ?? ''}
              placeholder="留空＝不顯示"
            />
            <span className="mt-1 block text-xs text-gray-400">
              Google 沒有查詢額度的 API，數字要自己填。填了上方才會出現今日免費額度的進度條。
            </span>
          </label>
          <button className="btn-primary">儲存 AI 設定</button>
        </form>
        <p className="text-xs text-gray-400">
          向量模型維持 <code>{cfgAi.embeddingModel}</code>
          {cfgAi.embeddingModel === DEFAULT_EMBEDDING_MODEL ? '（預設）' : ''}——
          刻意不放在這裡改：換了之後舊向量與新查詢不同模型就對不起來，必須先跑 <code>/api/reindex</code> 全量重建。
          要換請改環境變數 <code>EMBEDDING_MODEL_ID</code>，改完立刻重建。
        </p>
        <p className="text-xs text-gray-400">
          金鑰（<code>GEMINI_API_KEY</code>、<code>LINE_CHANNEL_ACCESS_TOKEN</code>、
          <code>ADMIN_PASSWORD</code>）仍然只能改環境變數——那是刻意的，不是還沒做。
        </p>
      </section>
      </>)}

      {/* 抽取品質：這是產品價值的健康指標，比用量更重要——
          用量告訴你花了多少錢，這裡告訴你那些錢有沒有換到有用的東西。 */}
      <section className="card mb-6 space-y-2">
        <h2 className="text-base font-bold">抽取品質（近 7 天）</h2>
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
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-gray-200">
                    {k.rate !== null && (
                      <span
                        className={`block h-full rounded-full ${
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
        <h2 className="text-base font-bold">進群告知訊息</h2>
        <input type="hidden" name="org" value={access.org.slug} />
        <p className="text-sm text-gray-500">
          群組被你認領時（或 bot 重新加入你的群組時）會發送這則訊息（隱私告知＋用法），之後保持沉默。只影響你的群組。
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
