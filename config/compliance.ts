/**
 * AI チェック（コンプライアンスチェック）の設定。モデルやしきい値はここだけで変える。
 * 秘密情報（API キー）はここに書かない。ANTHROPIC_API_KEY 環境変数で渡す。
 */
export const COMPLIANCE_CONFIG = {
  /** 使うモデル（docs/design/architecture.md） */
  model: "claude-opus-5-5",
  /** 考える深さ。審査は見落としが困るので medium 以上にする */
  effort: "high" as "low" | "medium" | "high" | "xhigh" | "max",
  maxTokens: 8000,
  /** 1 回の呼び出しのタイムアウト（ミリ秒） */
  timeoutMs: 120_000,
  /** 失敗したときの試行回数（この回数失敗したら「AI チェック未実施」として管理者の確認へ回す） */
  maxAttempts: 3,
  /** 再試行までの待ち時間（ミリ秒）。回数ごとに倍にする */
  retryBaseDelayMs: 2_000,
  /** このリスク以上なら自動で差し戻す（公開は常に管理者が判断する） */
  autoRejectAt: "high" as "high" | "medium",
  /** プロンプトのバージョン。prompts/compliance_check.md を変えたら上げる（判定の記録に残す） */
  promptVersion: "compliance_check@1",
  /** 応答を断られた（refusal）ときに、自動で別のモデルでやり直す（サーバー側フォールバック） */
  useServerFallback: true,
} as const;
