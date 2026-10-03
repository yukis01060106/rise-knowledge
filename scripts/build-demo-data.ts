/**
 * 操作デモ（demo/）が使う分類の定義と理念・バリューを、本物のアプリの定義から書き出す。
 *   npm run demo:build
 */
import { writeFileSync } from "node:fs";
import { CATEGORIES, COMMON_GROUPS } from "../src/lib/taxonomy";
import { PHILOSOPHY } from "../src/lib/philosophy";

writeFileSync("demo/taxonomy.json", `${JSON.stringify({ COMMON_GROUPS, CATEGORIES }, null, 2)}\n`);
writeFileSync("demo/philosophy.json", `${JSON.stringify(PHILOSOPHY, null, 2)}\n`);
console.log("demo/taxonomy.json と demo/philosophy.json を書き出しました");
