import type { SupabaseClient } from '@supabase/supabase-js';
import { getDb } from '@/db';
import { logFunnel } from '@/core/funnel';
import { todayISO } from '@/core/date';
import { isPaidPlan, REFERRAL } from './plans';

// 推薦獎勵（migration 029）：別家用你的連結建立組織，等他第一次升級付費方案，雙方各得 30 天。
//
// 為什麼是「付費才發、發天數」：
// - 商業計劃第 4 節定案「Free 不做推薦解鎖」——免費方案的群數與 AI 額度是成本煞車，推薦不能撬開它。
//   只在對方付錢時發，開假帳號洗推薦就沒有意義（要洗得先付錢）。
// - 第 5 節定案「不做代理商分潤」——不發現金，只發服務天數（等同折扣）。
//   現金獎勵對個人可能涉及所得申報（未查證細節；哪天要改發現金，先問會計師）。
//
// 天數與上限在 plans.ts 的 REFERRAL（這裡轉出，呼叫端從哪邊 import 都可以）。
export { REFERRAL };

// 去掉 0/O、1/I/L：口頭念、手抄都不會錯
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LEN = 6;
const CODE_RE = new RegExp(`^[${ALPHABET}]{${CODE_LEN}}$`);

export function newRefCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LEN));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

/** 網址、cookie、表單來的推薦碼：轉大寫後必須完全合格，否則回空字串 */
export function normalizeRefCode(v: unknown): string {
  const s = typeof v === 'string' ? v.trim().toUpperCase() : '';
  return CODE_RE.test(s) ? s : '';
}

export function addDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export type CreditState = { plan: unknown; paidUntil: string | null; creditDays: number };

/**
 * 存著的天數能不能折抵：付費方案且有到期日才加上去（從到期日或今天較晚的那天起算——
 * 已過期的到期日直接加，獎勵會被過去的日子吃掉）。其餘情況原樣回傳，天數繼續存著。
 */
export function settleCredit(st: CreditState, today: string): CreditState {
  if (st.creditDays <= 0 || !isPaidPlan(st.plan) || !st.paidUntil) return st;
  const base = st.paidUntil > today ? st.paidUntil : today;
  return { ...st, paidUntil: addDays(base, st.creditDays), creditDays: 0 };
}

/** 推薦人這次拿幾天：已領滿上限就 0（被推薦的一方照樣拿） */
export const referrerDaysFor = (rewardedSoFar: number) => (rewardedSoFar < REFERRAL.maxRewards ? REFERRAL.rewardDays : 0);

export type ReferralRow = { status: string; referrer_days: number };
export function summarizeReferrals(rows: ReferralRow[]) {
  const live = rows.filter((r) => r.status !== 'void');
  const paid = live.filter((r) => r.status === 'rewarded');
  return { signedUp: live.length, paid: paid.length, earnedDays: paid.reduce((a, r) => a + (r.referrer_days ?? 0), 0) };
}

// ── 資料庫 ──
// 全部吞錯：推薦是加分功能，migration 029 沒跑、網路抖動都不能擋住註冊或改方案。

/** 這家組織的推薦碼；第一次要的時候才產生。讀不到（migration 029 沒跑）回 null。 */
export async function ensureRefCode(orgId: string, db: SupabaseClient = getDb()): Promise<string | null> {
  const read = async () => {
    const { data, error } = await db.from('orgs').select('referral_code').eq('id', orgId).maybeSingle();
    if (error) console.warn('讀推薦碼失敗（migration 029 跑了嗎？）', error.message);
    return { code: (data?.referral_code as string | null) ?? null, error };
  };
  const first = await read();
  if (first.error) return null;
  if (first.code) return first.code;
  for (let i = 0; i < 3; i++) {
    // is null：同時開兩個分頁只有一個寫得進去；碰到 unique 衝突（極少）就換一組再試
    const { data } = await db
      .from('orgs')
      .update({ referral_code: newRefCode() })
      .eq('id', orgId)
      .is('referral_code', null)
      .select('referral_code')
      .maybeSingle();
    if (data?.referral_code) return data.referral_code as string;
    const again = await read();
    if (again.code) return again.code;
  }
  return null;
}

/** 推薦碼 → 推薦人組織。「未認領」不能當推薦人。 */
export async function referrerByCode(code: unknown, db: SupabaseClient = getDb()): Promise<{ id: string; name: string } | null> {
  const c = normalizeRefCode(code);
  if (!c) return null;
  const { data, error } = await db.from('orgs').select('id, slug, name').eq('referral_code', c).maybeSingle();
  if (error || !data || data.slug === 'unclaimed') return null;
  return { id: data.id as string, name: data.name as string };
}

/** 新組織建好後記一筆推薦。推薦人組織自己的管理員開新組織不算（自己推薦自己）。 */
export async function recordReferral(code: unknown, referredOrgId: string, uid: string, db: SupabaseClient = getDb()): Promise<boolean> {
  try {
    const ref = await referrerByCode(code, db);
    if (!ref || ref.id === referredOrgId) return false;
    const { count } = await db
      .from('org_members')
      .select('org_id', { count: 'exact', head: true })
      .eq('org_id', ref.id)
      .eq('line_user_id', uid);
    if ((count ?? 0) > 0) return false;
    const { error } = await db.from('referrals').insert({ referrer_org_id: ref.id, referred_org_id: referredOrgId, referred_line_user_id: uid });
    if (error) {
      console.warn('記錄推薦失敗', error.message);
      return false;
    }
    await logFunnel({ org_id: referredOrgId, line_user_id: uid, step: 'ref_signup', source: null });
    return true;
  } catch (e) {
    console.warn('記錄推薦失敗', e);
    return false;
  }
}

// 加天數並試著折抵。沒有 org_settings 列的組織不補建（補建會用預設值改掉它的模組與方案）。
// ponytail: 讀改寫不是原子操作；目前只有平台擁有者手動改方案會觸發，PAYUNi 自動扣款上線時改成 SQL 函式
async function addCredit(db: SupabaseClient, orgId: string, days: number, today: string): Promise<void> {
  const { data: st, error } = await db.from('org_settings').select('plan, paid_until, referral_credit_days').eq('org_id', orgId).maybeSingle();
  if (error) throw error;
  if (!st) return;
  const cur: CreditState = { plan: st.plan, paidUntil: st.paid_until ?? null, creditDays: Number(st.referral_credit_days ?? 0) + days };
  const next = settleCredit(cur, today);
  if (days === 0 && next === cur) return;
  const { error: e } = await db
    .from('org_settings')
    .update({ paid_until: next.paidUntil, referral_credit_days: next.creditDays, updated_at: new Date().toISOString() })
    .eq('org_id', orgId);
  if (e) throw e;
}

/**
 * 方案改完之後呼叫（平台頁改方案；之後 PAYUNi 結帳成功也呼叫這支）：
 * 1. 這家是被推薦的、現在是付費方案、還沒發過 → 雙方發獎勵。status 從 signed_up 改 rewarded 是條件式更新，只會成功一次
 * 2. 把這家存著的天數折抵進 paid_until
 * 回傳這次有沒有發推薦獎勵（給平台頁的提示）。
 */
export async function settleReferrals(orgId: string, today = todayISO(), db: SupabaseClient = getDb()): Promise<boolean> {
  try {
    const { data: st } = await db.from('org_settings').select('plan').eq('org_id', orgId).maybeSingle();
    if (isPaidPlan(st?.plan)) {
      const { data: ref } = await db
        .from('referrals')
        .update({ status: 'rewarded', rewarded_at: new Date().toISOString() })
        .eq('referred_org_id', orgId)
        .eq('status', 'signed_up')
        .select('id, referrer_org_id')
        .maybeSingle();
      if (ref) {
        // 這一列的 referrer_days 還是 0，不會算到自己
        const { count } = await db
          .from('referrals')
          .select('id', { count: 'exact', head: true })
          .eq('referrer_org_id', ref.referrer_org_id)
          .eq('status', 'rewarded')
          .gt('referrer_days', 0);
        const referrerDays = referrerDaysFor(count ?? 0);
        await db.from('referrals').update({ referrer_days: referrerDays, referred_days: REFERRAL.rewardDays }).eq('id', ref.id);
        await addCredit(db, orgId, REFERRAL.rewardDays, today);
        if (referrerDays) await addCredit(db, ref.referrer_org_id as string, referrerDays, today);
        await logFunnel({ org_id: orgId, line_user_id: null, step: 'ref_paid', source: null });
        return true;
      }
    }
    await addCredit(db, orgId, 0, today);
    return false;
  } catch (e) {
    console.warn('推薦獎勵結算失敗', orgId, e);
    return false;
  }
}

/** 推薦頁的數字（自己推薦了幾家、幾家付費、拿了幾天）。表不存在回 null。 */
export async function referralStats(orgId: string, db: SupabaseClient = getDb()) {
  const { data, error } = await db.from('referrals').select('status, referrer_days').eq('referrer_org_id', orgId);
  if (error) return null;
  return summarizeReferrals((data ?? []) as ReferralRow[]);
}

/** 這家是不是被推薦來、還沒付費（方案頁提示「第一期多送 30 天」） */
export async function pendingReferredBonus(orgId: string, db: SupabaseClient = getDb()): Promise<boolean> {
  const { data, error } = await db.from('referrals').select('status').eq('referred_org_id', orgId).maybeSingle();
  return !error && data?.status === 'signed_up';
}
