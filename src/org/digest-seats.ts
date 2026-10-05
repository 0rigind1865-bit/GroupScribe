import { getDb } from '@/db';
import { orgOfGroup } from '@/core/quota';
import { isPlanId, PLAN_LIMITS } from './plans';

// 每日提醒名額（商業計劃第 4 節：Free 3／Starter 10／Team 30 人）。
// 為什麼要擋：每日提醒是 1:1 推播，LINE 按收件人次計費、額度是全平台共用的（K7）；
// 不擋的話一家 100 人的公司全員訂閱，推播費就吃掉 Starter 月費的六成。
//
// 算「人」不算「訂閱」：同一個人訂同一家公司的三個群只佔一個名額（老闆通常每個群都訂）。
// 只擋新增：已經在訂的人不會因為降級或名額變少被踢掉。

/** 這個人能不能訂：已經佔名額的人永遠可以（多訂一個群不多佔），否則看還有沒有空位 */
export function hasSeat(subscribers: Iterable<string>, uid: string, limit: number | null): boolean {
  if (limit === null) return true;
  const set = new Set(subscribers);
  return set.has(uid) || set.size < limit;
}

/** 方案名額＋目前佔用名額的人。org_settings 沒有列的舊組織比照 free（同認領上限的預設） */
export async function digestSeats(orgId: string): Promise<{ used: string[]; limit: number | null } | null> {
  const db = getDb();
  const [{ data: st }, { data: groups, error: ge }] = await Promise.all([
    db.from('org_settings').select('plan').eq('org_id', orgId).maybeSingle(),
    db.from('groups').select('group_id').eq('org_id', orgId),
  ]);
  const plan = String(st?.plan ?? 'free');
  const limit = isPlanId(plan) ? PLAN_LIMITS[plan].subscribers : PLAN_LIMITS.free.subscribers;
  if (ge) return null;
  const ids = (groups ?? []).map((g) => g.group_id as string);
  if (!ids.length) return { used: [], limit };
  const { data: subs, error } = await db.from('push_subscriptions').select('line_user_id').eq('enabled', true).in('group_id', ids);
  if (error) return null;
  return { used: [...new Set((subs ?? []).map((s) => s.line_user_id as string))], limit };
}

/** 訂閱 API 用：查不到（表沒建、網路）就不擋——每日提醒是加分功能，擋錯人比多送幾則更糟 */
export async function canSubscribe(groupId: string, uid: string): Promise<boolean> {
  try {
    const orgId = await orgOfGroup(groupId);
    if (!orgId) return true;
    const seats = await digestSeats(orgId);
    return !seats || hasSeat(seats.used, uid, seats.limit);
  } catch (e) {
    console.warn('查每日提醒名額失敗，先放行', e);
    return true;
  }
}
