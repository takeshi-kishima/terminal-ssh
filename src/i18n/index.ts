import * as vscode from "vscode";
import { messages as jaMessages } from "./ja";
import { messages as enMessages } from "./en";

// サポートする言語
type SupportedLanguage = "en" | "ja";

// 言語メッセージのマップ
const languageMessages = {
  en: enMessages,
  ja: jaMessages,
};

/**
 * 現在のVS Code UIの言語設定に基づいてメッセージを取得
 */
export function getMessages() {
  // VS Codeの言語設定を取得（例: ja, en, zh-cn など）
  const vscodeLanguage = vscode.env.language;

  // サポートする言語にマッピング
  let lang: SupportedLanguage = "en"; // デフォルトは英語

  if (vscodeLanguage.startsWith("ja")) {
    lang = "ja";
  }

  // 拡張機能の設定から言語設定を上書きできるようにする
  const configLanguage = vscode.workspace
    .getConfiguration("fileTreeExporter")
    .get<string>("language");
  if (configLanguage && (configLanguage === "en" || configLanguage === "ja")) {
    lang = configLanguage as SupportedLanguage;
  }

  return languageMessages[lang];
}
