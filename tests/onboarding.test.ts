// 上手卡（A7）三種狀態：沒群→三步卡；有群但訊息少→「已收到 N 則」；其他→不顯示
import { test } from 'node:test';
import assert from 'node:assert/strict';
import './react-global';
import { createElement } from 'react';
// @ts-expect-error 沒裝 @types/react-dom（不為測試加依賴）
import { renderToStaticMarkup } from 'react-dom/server';
import { OnboardingCard, FEW_MESSAGES } from '../src/app/ui/onboarding-card';

const html = (p: Parameters<typeof OnboardingCard>[0]): string => renderToStaticMarkup(createElement(OnboardingCard, p));

test('上手卡：沒有群 → 三步卡，含認領與灰盾說明、匯入連結帶 org 前綴', () => {
  const out = html({ slug: 'acme', hasGroups: false, messageCount: 0, botBasicId: '@057abcde' });
  assert.match(out, /三步開始/);
  assert.match(out, /認領連結/);
  assert.match(out, /灰色盾牌/);
  assert.match(out, /line\.me\/R\/ti\/p\/@057abcde/);
  assert.match(out, /\/o\/acme\/import/);
});

test('上手卡：沒設 LINE_BOT_BASIC_ID → 沒有加好友按鈕', () => {
  for (const id of [undefined, null, '', '  ']) {
    const out = html({ slug: 'acme', hasGroups: false, messageCount: 0, botBasicId: id });
    assert.doesNotMatch(out, /line\.me/);
    assert.match(out, /三步開始/);
  }
});

test('上手卡：有群但訊息少 → 已收到 N 則；夠多就不顯示', () => {
  const few = html({ slug: 'acme', hasGroups: true, messageCount: 3 });
  assert.match(few, /已收到 3 則/);
  assert.doesNotMatch(few, /三步開始/);
  assert.equal(html({ slug: 'acme', hasGroups: true, messageCount: FEW_MESSAGES }), '');
});
