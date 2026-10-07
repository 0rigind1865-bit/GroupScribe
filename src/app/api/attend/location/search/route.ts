import { NextRequest, NextResponse } from 'next/server';
import { moduleAccess } from '@/org/orgs';

// 打卡地點「搜尋地址」：伺服器代理 Google Places (New) Text Search，金鑰只在伺服器（帶法同 /api/liff/expense/nearby）。
// 只有考勤管理者能叫（moduleAccess，同 /api/attend/location）。沒金鑰／失敗一律回空，頁面還有「站在現場」「貼座標」。
// 收費：每按一次「搜尋」一筆 Text Search（Google 每月有免費額度）；只有管理者用，不另設上限。
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  if (!(await moduleAccess(sp.get('org') ?? '', 'attend'))) return NextResponse.json({ error: '沒有權限' }, { status: 403 });
  const empty = NextResponse.json({ places: [] });
  const key = process.env.GOOGLE_MAPS_API_KEY;
  const q = (sp.get('q') ?? '').trim().slice(0, 200);
  if (!key || !q) return empty;

  try {
    const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.location',
      },
      body: JSON.stringify({ textQuery: q, pageSize: 5, languageCode: 'zh-TW', regionCode: 'TW' }),
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return empty;
    const data = await r.json();
    type P = { displayName?: { text?: string }; formattedAddress?: string; location?: { latitude?: number; longitude?: number } };
    const places = ((data?.places ?? []) as P[]).flatMap(({ displayName, formattedAddress, location: l }) =>
      Number.isFinite(l?.latitude) && Number.isFinite(l?.longitude)
        ? [{ name: displayName?.text ?? '', address: formattedAddress ?? '', lat: l!.latitude!, lng: l!.longitude! }]
        : [],
    );
    return NextResponse.json({ places });
  } catch {
    return empty;
  }
}
