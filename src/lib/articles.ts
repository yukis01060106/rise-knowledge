export const MAX_TITLE_LENGTH = 100;
export const MAX_BODY_LENGTH = 100_000;

/** タイトルが空の下書きの表示名 */
export const UNTITLED = "（無題）";

/** 記事作成時に挿入できるテンプレート */
export const ARTICLE_TEMPLATES = [
  {
    id: "tech-memo",
    label: "技術メモ",
    body: `## 概要

<!-- 何についての記事か、1〜2 行で -->

## 環境

- OS：
- バージョン：

## 手順

1. 
2. 

## 参考

- 
`,
  },
  {
    id: "troubleshooting",
    label: "トラブルシューティング",
    body: `## 発生した問題

<!-- エラーメッセージは客先名・ホスト名・IP などを伏せて貼る -->

## 原因

## 解決方法

## 再発防止・気をつけること
`,
  },
  {
    id: "learning",
    label: "学んだこと・勉強会レポート",
    body: `## きっかけ

## 学んだこと

## 仲間に伝えたいポイント

## もっと知りたい人へ
`,
  },
] as const;
/** 差し戻し・非公開の理由の上限 */
export const MAX_REASON_LENGTH = 1000;
