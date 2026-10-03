/**
 * 操作デモ（demo/）が使う分類の定義を、本物のアプリの定義（src/lib/taxonomy.ts）から書き出す。
 *   npm run demo:build
 */
import { writeFileSync } from "node:fs";
import { CATEGORIES, COMMON_GROUPS } from "../src/lib/taxonomy";

writeFileSync("demo/taxonomy.json", `${JSON.stringify({ COMMON_GROUPS, CATEGORIES }, null, 2)}\n`);
console.log("demo/taxonomy.json を書き出しました");
