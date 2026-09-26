import { NextRequest, NextResponse } from 'next/server';
import { myExpenseIdentity } from '@/expense/mine';

// 附近地點（Snaptab app/api/nearby）：伺服器代理 Google Places (New) searchNearby，金鑰只在伺服器。
// 300 公尺內、依距離、最多 6 個、繁中。沒金鑰／失敗／超過上限一律回空，前端改手動輸入。
// 收費：每次約 US$0.032（Google 每月有免費額度）。
// ponytail: 全站每月上限計在記憶體（重啟歸零）；真正的硬上限請在 Google Cloud 設配額
const MONTHLY_CAP = Number(process.env.PLACES_MONTHLY_CAP ?? 3000);
let month = '';
let used = 0;

export async function GET(req: NextRequest) {
  const empty = NextResponse.json({ candidates: [] });
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key || !(await myExpenseIdentity())) return empty;
  const lat = Number(req.nextUrl.searchParams.get('lat'));
  const lng = Number(req.nextUrl.searchParams.get('lng'));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return empty;

  const m = new Date().toISOString().slice(0, 7);
  if (m !== month) [month, used] = [m, 0];
  if (used >= MONTHLY_CAP) return empty;
  used++;

  try {
    const r = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'places.displayName' },
      body: JSON.stringify({
        maxResultCount: 6,
        rankPreference: 'DISTANCE',
        languageCode: 'zh-TW',
        locationRestriction: { circle: { center: { latitude: lat, longitude: lng }, radius: 300 } },
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return empty;
    const data = await r.json();
    const candidates = ((data?.places ?? []) as { displayName?: { text?: string } }[])
      .map((p) => p.displayName?.text)
      .filter((t): t is string => !!t);
    return NextResponse.json({ candidates });
  } catch {
    return empty;
  }
}
