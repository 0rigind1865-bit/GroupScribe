import { getDb } from '@/db';
import { isDm } from '@/core/types';
import { orgOfGroup } from '@/core/quota';
import { parseReceipt, type Receipt } from './receipt';
import { orgCategories } from './categories';
import { parseTextExpense } from './text';
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

/** 記成功回 Receipt（給 1:1 回覆用）；不是收據、不該記、重複、或寫入失敗 → null */
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
  const hit = parseTextExpense(a.text, await orgCategories(orgId));
  if (!hit) return null;
  const r: Receipt = { amount: hit.amount, spent_on: taipeiDate(a.at), vendor: '', category: hit.category, invoice_no: '' };
  const row = {
    org_id: orgId,
    line_user_id: a.groupId.slice(3),
    person_name: a.senderName ?? null,
    media_asset_id: a.assetId ?? null,
    ...r,
    note: hit.item,
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
  const head = `🧾 記好了：${md} ${r.category} $${r.amount.toLocaleString('en-US')}${r.vendor ? `（${r.vendor}）` : ''}`;
  return url ? `${head}\n查看或修改 👉 ${url}` : `${head}\n金額不對請跟管理者說`;
}
