import { getDb } from '@/db';
import { isDm } from '@/core/types';
import { aiScope, orgOfGroup } from '@/core/quota';
import { getLLM } from '@/core/config';
import { parseReceipt, type Receipt } from './receipt';
import { orgCategories, orgProjects } from './categories';
import { parseTextExpense, pickPlace, pickProject, type Hit } from './text';
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
  if (dup?.length) return { ...r, duplicate: true };
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
  return data?.length ? r : null; // 空＝重試時已記過，不再回覆
}

/** 一句話 → { 品項, 總金額 }；不像花費、AI 掛了 → null。沒有任何數字（含國字數字）的句子不可能有金額，直接略過省一次 AI */
async function expenseByAi(groupId: string, text: string, cats: readonly string[]): Promise<Hit | null> {
  if (text.length > 200 || !/[\d〇零一二兩三四五六七八九十百千萬]/.test(text)) return null;
  try {
    const j = (await aiScope(groupId, () =>
      getLLM().generateJson(`這是使用者私訊的一句話（可能是語音轉文字，有錯字或口語）：「${text}」。若這是在記一筆花費，回 JSON：{"item":"簡短品項","amount":總金額數字}（amount 是全部花了多少元；有單價和數量就算好乘起來）。若不是記帳（提醒、閒聊、問問題），或句子殘缺、看不出買了什麼（例如只有一串數字），回 {"item":null}，不要猜。`),
    )) as { item?: unknown; amount?: unknown };
    const amount = Number(j?.amount);
    if (typeof j?.item !== 'string' || !j.item.trim() || !Number.isFinite(amount) || amount <= 0) return null;
    const item = j.item.trim().slice(0, 30);
    return { item, amount: Math.round(amount), category: classifyNote(item, cats) ?? '雜支' };
  } catch {
    return null;
  }
}

/** 「16個80元」這種單價或總價都說得通的句子：問 AI 用常識挑。AI 掛了／額度用完 → false（照舊當總價，使用者看得到算式可以改） */
async function eachPriceByAi(groupId: string, text: string): Promise<boolean> {
  try {
    const j = await aiScope(groupId, () =>
      getLLM().generateJson(`這是一句記帳：「${text}」。句中有數量和一個金額。請依生活常識判斷這個金額是「每一份的單價」還是「全部的總價」（例如 16 份炒飯不可能總共 80 元，所以是單價）。只回 JSON：{"each": true} 代表單價，{"each": false} 代表總價。`),
    );
    return (j as { each?: unknown })?.each === true;
  } catch {
    return false;
  }
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
  // 規則看不懂時改請 AI 抽並判斷是不是記帳（語音逐字稿常有口語、錯字：「加油98起油1156元」；打字也會有：「10/23號要與XX烤肉」→ AI 回不是）
  let hit: (Hit & { alt?: Hit }) | null = parseTextExpense(a.text, cats) ?? (await expenseByAi(a.groupId, a.text, cats));
  if (!hit) return null;
  if (hit.alt && (await eachPriceByAi(a.groupId, a.text))) hit = hit.alt;
  const r: Receipt = { amount: hit.amount, spent_on: taipeiDate(a.at), vendor: '', category: hit.category, invoice_no: '' };
  // 「林口體育館 便當 110元 20個」→ 已有這個專案：專案＝地點；沒有：只猜地點（專案影響報表分組，不猜）
  const project = pickProject(a.text, await orgProjects(orgId));
  const row = {
    org_id: orgId,
    line_user_id: a.groupId.slice(3),
    person_name: a.senderName ?? null,
    media_asset_id: a.assetId ?? null,
    ...r,
    note: hit.item,
    project,
    place_name: project || pickPlace(hit.item, cats),
    source: 'text',
  };
  const { data, error } = await withV2Fallback(row, (x) =>
    getDb().from('expenses').upsert(x, { onConflict: 'media_asset_id', ignoreDuplicates: true }).select('id'),
  );
  if (error) {
    console.warn('文字記帳寫入失敗（migration 022 跑了嗎？）', error.message);
    return null;
  }
  return data?.length ? { ...r, vendor: hit.item } : null; // vendor 只給回覆顯示用（「（午餐）」）
}

/** 1:1 回覆文字：「🧾 記好了：9/25 餐飲 $320（全家）」 */
// url：「我的報帳」連結；有的話金額不對可以自己去改，不用找管理者
export function receiptReply(r: Receipt, url?: string | null): string {
  const md = `${Number(r.spent_on.slice(5, 7))}/${Number(r.spent_on.slice(8, 10))}`;
  if (r.duplicate) {
    const head = `🧾 這張收據記過了：${md} ${r.category} $${r.amount.toLocaleString('en-US')}${r.vendor ? `（${r.vendor}）` : ''}，這次不再重複記`;
    return url ? `${head}\n真的是另一筆的話，請在這裡自己新增 👉 ${url}` : `${head}\n真的是另一筆的話，請跟管理者說`;
  }
  const head =`🧾 記好了：${md} ${r.category} $${r.amount.toLocaleString('en-US')}${r.vendor ? `（${r.vendor}）` : ''}`;
  return url ? `${head}\n查看或修改 👉 ${url}` : `${head}\n金額不對請跟管理者說`;
}
