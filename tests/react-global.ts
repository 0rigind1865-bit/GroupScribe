// tsconfig 的 jsx: preserve 交給 Next 編譯；tsx 跑測試時會退回傳統 React.createElement，
// 所以測 .tsx 元件前先 import 這支，把 React 放到全域。要排在元件的 import 之前。
import React from 'react';
(globalThis as { React?: unknown }).React = React;
