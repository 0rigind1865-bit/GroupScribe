import { getDb } from '@/db';
import { isDm } from '@/core/types';
import { aiScope, orgOfGroup } from '@/core/quota';
import { getLLM } from '@/core/config';
import { parseReceipt, type Receipt } from './receipt';
import { orgCategories, orgProjects } from './categories';
import { parseTextExpense, pickPlace, pickProject, pickWhen, spentFields, type Hit } from './text';
import { parseDate } from './receipt';
import { classifyNote } from './classify';
import { withV2Fallback } from './store';

// 收據照 → 一筆報帳（X1）。只收 1:1 私訊：私訊給群記＝本人明確說「這筆我墊的」；
// 群組裡的收據可能是轉傳的報價，誰付的說不準。
// 表還沒建（migration 022 未跑）或該公司沒開報帳 → 什麼都不做，不影響媒體解析。

const taipeiDate = (d: Date) => d.toLocaleDateString('sv', { timeZone: 'Asia/Taipei' });

export async function orgHasExpense(orgId: string): Promise<boolean> {
  const { data } = await getDb().from('org_settings').select('modules').eq('org_id', orgId).maybeSingle();
  return Array.isArray(data?.modules) && data.modules.includes('expense');
}

/** 個人筆記所屬公司的報帳分類（沒開報帳或查不到 → undefined，AI 用預設清單） */
export async function receiptCategoriesOf(groupId: string): Promise<string[] | undefined> {
  const orgId = await orgOfGroup(groupId);
  if (!orgId || !(await orgHasExpense(orgId))) return undefined;
  return orgCategories(orgId);
}

/** 記成功回 Receipt（給 1:1 回覆用）；之前記過的同一張 → duplicate: true；不是收據、不該記、重試、或寫入失敗 → null */
export async function recordReceipt(a: {
  assetId: string;
  groupId: string;
  raw: unknown;
  at: Date;
  senderName?: string | null;
}): Promise<Receipt | null> {
  if (!isDm(a.groupId)) return null;
  const orgId = await orgOfGroup(a.groupId);
  if (!orgId || !(await orgHasExpense(orgId))) return null;
  const r = parseReceipt(a.raw, taipeiDate(a.at), await orgCategories(orgId));
  if (!r) return null;
  // 同一張收據重傳（同一張照片再丟一次、換個角度再拍）→ 不再記一筆，回一句讓本人知道。
  // 有發票號碼就只比號碼（全國唯一）；沒有就比「同一人、同一天、同一家店、同金額」。
  // ponytail: 真的有兩張一模一樣的無號碼收據時第二張會被擋——回覆裡教他到「我的報帳」自己新增
  const same = getDb().from('expenses').select('id').eq('org_id', orgId);
  const { data: dup } = await (r.invoice_no
    ? same.eq('invoice_no', r.invoice_no)
    : same.eq('line_user_id', a.groupId.slice(3)).eq('spent_on', r.spent_on).eq('amount', r.amount).eq('vendor', r.vendor)
  ).limit(1);
  if (dup?.length) return { ...r, duplicate: true, id: dup[0].id };
  const { data, error } = await getDb()
    .from('expenses')
    .upsert(
      {
        org_id: orgId,
        line_user_id: a.groupId.slice(3), // dm:<userId>
        person_name: a.senderName ?? null,
        media_asset_id: a.assetId,
        ...r,
      },
      { onConflict: 'media_asset_id', ignoreDuplicates: true },
    )
    .select('id');
  if (error) {
    console.warn('報帳寫入失敗（migration 022 跑了嗎？）', error.message);
    return null;
  }
  return data?.length ? { ...r, id: data[0].id } : null; // 空＝重試時已記過，不再回覆
}

type AiHit = Hit & { date: string | null; time: string | null; place: string };

/** 一句話 → { 品項, 總金額, 日期, 時間, 地點 }；不像花費、AI 掛了 → null。沒有任何數字（含國字數字）的句子不可能有金額，直接略過省一次 AI */
async function expenseByAi(groupId: string, text: string, at: Date, cats: readonly string[]): Promise<AiHit | null> {
  if (text.length > 200 || !/[\d〇零一二兩三四五六七八九十百千萬]/.test(text)) return null;
  const today = at.toLocaleDateString('sv', { timeZone: 'Asia/Taipei' });
  const weekday = at.toLocaleDateString('zh-TW', { weekday: 'short', timeZone: 'Asia/Taipei' });
  try {
    const j = (await aiScope(groupId, () =>
      getLLM().generateJson(`今天是 ${today}（${weekday}，台北時間）。這是使用者私訊的一句話（可能是語音轉文字，有錯字或口語）：「${text}」。若這是在記一筆花費或收入，回 JSON：{"item":"簡短品項","amount":總金額數字,"kind":"expense 或 income","date":"花費日期 YYYY-MM-DD","time":"花費時間 HH:MM","place":"地點或店家"}（amount 是全部金額；有單價和數量就算好乘起來；薪水、獎金、進帳、收款、退款是 income，其他是 expense；date／time 依句子裡的「昨天、上週三、中午、下午三點」等推算，句子沒提就回 null，不要用今天補；place 是句子提到的地點、店家、案場，沒提就回空字串；item 不要含時間和地點）。若不是記帳（提醒、閒聊、問問題），或句子殘缺、看不出買了什麼（例如只有一串數字），回 {"item":null}，不要猜。`, {
        purpose: 'expense_text',
        schema: { type: 'object', properties: { item: { type: 'string', nullable: true }, amount: { type: 'number', nullable: true }, kind: { type: 'string', enum: ['expense', 'income'] }, date: { type: 'string', nullable: true }, time: { type: 'string', nullable: true }, place: { type: 'string', nullable: true } }, required: ['item'] },
      }),
    )) as { item?: unknown; amount?: unknown; kind?: unknown; date?: unknown; time?: unknown; place?: unknown };
    const amount = Number(j?.amount);
    if (typeof j?.item !== 'string' || !j.item.trim() || !Number.isFinite(amount) || amount <= 0) return null;
    const item = j.item.trim().slice(0, 30);
    const date = parseDate(j.date); // 格式不對就當沒講（退回訊息日期）
    const time = typeof j.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(j.time) ? j.time : null;
    const place = typeof j.place === 'string' ? j.place.trim().slice(0, 60) : '';
    if (j.kind === 'income') return { item, amount: Math.round(amount), category: '收入', kind: 'income', date, time, place };
    return { item, amount: Math.round(amount), category: classifyNote(item, cats) ?? '雜支', date, time, place };
  } catch {
    return null;
  }
}

/** 「16個80元」這種單價或總價都說得通的句子：問 AI 用常識挑。AI 掛了／額度用完 → false（照舊當總價，使用者看得到算式可以改） */
async function eachPriceByAi(groupId: string, text: string): Promise<boolean> {
  try {
    const j = await aiScope(groupId, () =>
      getLLM().generateJson(`這是一句記帳：「${text}」。句中有數量和一個金額。請依生活常識判斷這個金額是「每一份的單價」還是「全部的總價」（例如 16 份炒飯不可能總共 80 元，所以是單價）。只回 JSON：{"price_is":"each"} 代表單價，{"price_is":"total"} 代表總價。`, {
        purpose: 'expense_price',
        schema: { type: 'object', properties: { price_is: { type: 'string', enum: ['each', 'total'] } }, required: ['price_is'] },
      }),
    );
    return (j as { price_is?: unknown })?.price_is === 'each';
  } catch {
    return false;
  }
}

/** 語音沒一字不差講出專案名（「林口體育館」聽成「林口體育」「林口那場」）→ 請 AI 從公司已有的專案裡挑；只回清單裡的名稱，沒提到就回空字串，不猜 */
async function projectByAi(groupId: string, text: string, projects: readonly string[]): Promise<string> {
  if (!projects.length) return '';
  const list = projects.slice(0, 50); // 新的在前，太舊的專案不太會再記帳
  try {
    const j = (await aiScope(groupId, () =>
      getLLM().generateJson(`這是一句記帳（語音轉文字，可能有錯字、簡稱、同音字）：「${text}」。公司的專案清單：${JSON.stringify(list)}。句子有提到其中哪一個專案（或它的地點、簡稱、錯字）就回 JSON：{"project":"清單裡的完整名稱"}；句子沒提到任何專案就回 {"project":""}，不要猜。`, {
        purpose: 'expense_project',
        schema: { type: 'object', properties: { project: { type: 'string' } }, required: ['project'] },
      }),
    )) as { project?: unknown };
    return typeof j?.project === 'string' && list.includes(j.project) ? j.project : '';
  } catch {
    return '';
  }
}

/** 語音完全沒提到專案 → 沿用同一個人同一天上一筆的專案（一整天通常待在同一個案場）；那天還沒記過有專案的 → 空字串 */
async function lastProjectOfDay(orgId: string, lineUserId: string, spentOn: string): Promise<string> {
  const { data } = await getDb()
    .from('expenses')
    .select('project')
    .eq('org_id', orgId)
    .eq('line_user_id', lineUserId)
    .eq('spent_on', spentOn)
    .neq('project', '')
    .order('created_at', { ascending: false })
    .limit(1);
  return (data?.[0]?.project as string | undefined) ?? '';
}

/**
 * 文字／語音記帳（X2-6）：1:1 傳「午餐 120」或講一段語音 → 記一筆。
 * 語音帶 assetId（media_asset_id 唯一，重試不重複記）；文字靠 webhook 層的訊息去重。
 */
export async function recordTextExpense(a: {
  groupId: string;
  text: string;
  at: Date;
  senderName?: string | null;
  assetId?: string;
}): Promise<Receipt | null> {
  if (!isDm(a.groupId)) return null;
  const orgId = await orgOfGroup(a.groupId);
  if (!orgId || !(await orgHasExpense(orgId))) return null;
  const cats = await orgCategories(orgId);
  // 「昨天中午 便當 110元」：先把時間字抽走，規則只看剩下的「便當 110元」；日期／時間照句子，沒講才用訊息時間
  const when = pickWhen(a.text, a.at);
  // 規則看不懂時改請 AI 抽並判斷是不是記帳（語音逐字稿常有口語、錯字：「加油98起油1156元」；打字也會有：「10/23號要與XX烤肉」→ AI 回不是）
  let hit: (Hit & { alt?: Hit; date?: string | null; time?: string | null; place?: string }) | null =
    parseTextExpense(when.rest, cats) ?? (await expenseByAi(a.groupId, a.text, a.at, cats));
  if (!hit) return null;
  if (hit.alt && (await eachPriceByAi(a.groupId, a.text))) hit = hit.alt;
  const spent = spentFields(a.at, hit.date ?? when.date, hit.time ?? when.time);
  const r: Receipt = { amount: hit.amount, spent_on: spent.spent_on, vendor: '', category: hit.category, invoice_no: '', kind: hit.kind ?? 'expense' };
  // 「林口體育館 便當 110元 20個」→ 已有這個專案：專案＝地點；沒有：AI 抽到的地點，再不然猜品項第一個詞（專案影響報表分組，不猜）
  // 語音（有 assetId）字面沒中再問 AI，AI 也說沒提到就沿用他當天上一筆的專案；ponytail: 打字一字不差的機率高，先不多花一次 AI，要的話拿掉 a.assetId 條件
  const projects = await orgProjects(orgId);
  const project = pickProject(a.text, projects) || (a.assetId ? (await projectByAi(a.groupId, a.text, projects)) || (await lastProjectOfDay(orgId, a.groupId.slice(3), spent.spent_on)) : '');
  const row = {
    org_id: orgId,
    line_user_id: a.groupId.slice(3),
    person_name: a.senderName ?? null,
    media_asset_id: a.assetId ?? null,
    ...r,
    spent_at: spent.spent_at,
    note: hit.item,
    project,
    place_name: project || hit.place || pickPlace(hit.item, cats),
    source: 'text',
  };
  const { data, error } = await withV2Fallback(row, (x) =>
    getDb().from('expenses').upsert(x, { onConflict: 'media_asset_id', ignoreDuplicates: true }).select('id'),
  );
  if (error) {
    console.warn('文字記帳寫入失敗（migration 022 跑了嗎？）', error.message);
    return null;
  }
  return data?.length ? { ...r, vendor: hit.item, project, id: data[0].id } : null; // vendor／project 只給回覆顯示用（「（午餐）」「📁 專案」）
}

/** 1:1 回覆文字：「🧾 記好了：9/25 餐飲 $320（全家）」 */
// url：「我的報帳」連結；有的話金額不對可以自己去改，不用找管理者
export function receiptReply(r: Receipt, url?: string | null): string {
  const md = `${Number(r.spent_on.slice(5, 7))}/${Number(r.spent_on.slice(8, 10))}`;
  if (r.duplicate) {
    const head = `🧾 這張收據記過了：${md} ${r.category} $${r.amount.toLocaleString('en-US')}${r.vendor ? `（${r.vendor}）` : ''}，這次不再重複記`;
    return url ? `${head}\n真的是另一筆的話，請在這裡自己新增 👉 ${url}` : `${head}\n真的是另一筆的話，請跟管理者說`;
  }
  const head = (r.kind === 'income'
    ? `💰 記好了：${md} 收入 $${r.amount.toLocaleString('en-US')}${r.vendor ? `（${r.vendor}）` : ''}`
    : `🧾 記好了：${md} ${r.category} $${r.amount.toLocaleString('en-US')}${r.vendor ? `（${r.vendor}）` : ''}`)
    + (r.project ? `\n📁 專案：${r.project}` : '');
  return url ? `${head}\n查看或修改 👉 ${url}` : `${head}\n金額不對請跟管理者說`;
}
