import { NextRequest } from 'next/server';
import { getDb } from '@/db';
import { redirectTo } from '@/http';
import { orgAdminAccess } from '@/org/orgs';
import { oh } from '@/org/href';
import { normalizeCategories } from '@/expense/categories';
import { isMissingColumn } from '@/expense/store';

// 報帳分類儲存（X2-4）：orgAdminAccess(表單 org) → 只改自己公司的 org_settings
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const slug = String(form.get('org') ?? '');
  const access = await orgAdminAccess(slug);
  if (!access) return new Response('沒有權限', { status: 403 });
  const list = form.get('reset') ? null : normalizeCategories(String(form.get('categories') ?? ''));
  const { error } = await getDb()
    .from('org_settings')
    .update({ expense_categories: list, updated_at: new Date().toISOString() })
    .eq('org_id', access.org.id);
  if (error) console.warn('報帳分類儲存失敗', error.message);
  return redirectTo(oh(slug, '/expense/categories', { [error ? 'err' : 'ok']: error && isMissingColumn(error) ? 'nomig' : error ? 'failed' : 'saved' }));
}
