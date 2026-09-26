import { MoreList } from '../../more-list';
import { requireModule } from '@/org/orgs';
import { ATTEND_MODULE } from '../../routes';

export const dynamic = 'force-dynamic';

// 考勤的「更多」：打卡地點與薪資規則——設定類，設好就很少再動，不佔底部 tab。
export default async function AttendMorePage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ emp?: string }>;
}) {
  const { org: slug } = await params;
  await requireModule(slug, 'attend');
  const { emp } = await searchParams;
  return <MoreList slug={slug} module={ATTEND_MODULE} ctx={{ emp }} />;
}
