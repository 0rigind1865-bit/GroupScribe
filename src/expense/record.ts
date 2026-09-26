import { getDb } from '@/db';
import { isDm } from '@/core/types';
import { orgOfGroup } from '@/core/quota';
import { parseReceipt, type Receipt } from './receipt';

// 收據照 → 一筆報帳（X1）。只收 1:1 私訊：私訊給群記＝本人明確說「這筆我墊的」；
// 群組裡的收據可能是轉傳的報價，誰付的說不準。
// 表還沒建（migration 022 未跑）或該公司沒開報帳 → 什麼都不做，不影響媒體解析。

const taipeiDate = (d: Date) => d.toLocaleDateString('sv', { timeZone: 'Asia/Taipei' });

export async function orgHasExpense(orgId: string): Promise<boolean> {
  const { data } = await getDb().from('org_settings').select('modules').eq('org_id', orgId).maybeSingle();
  return Array.isArray(data?.modules) && data.modules.includes('expense');
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
  const r = parseReceipt(a.raw, taipeiDate(a.at));
  if (!r) return null;
  const orgId = await orgOfGroup(a.groupId);
  if (!orgId || !(await orgHasExpense(orgId))) return null;
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

/** 1:1 回覆文字：「🧾 記好了：9/25 餐飲 $320（全家）」 */
export function receiptReply(r: Receipt): string {
  const md = `${Number(r.spent_on.slice(5, 7))}/${Number(r.spent_on.slice(8, 10))}`;
  return `🧾 記好了：${md} ${r.category} $${r.amount.toLocaleString('en-US')}${r.vendor ? `（${r.vendor}）` : ''}\n金額不對請跟管理者說`;
}
