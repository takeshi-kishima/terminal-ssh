import * as vscode from "vscode";
import { messages as jaMessages } from "./ja";
import { messages as enMessages } from "./en";

type SupportedLanguage = "en" | "ja";

const languageMessages: Record<SupportedLanguage, typeof enMessages> = {
  en: enMessages,
  ja: jaMessages,
};

export function getMessages() {
  try {
    const vscodeLanguage = vscode.env.language;
    let lang: SupportedLanguage = vscodeLanguage.startsWith("ja") ? "ja" : "en";

    const configLanguage = vscode.workspace
      .getConfiguration("terminal-ssh")
      .get<string>("language");

    if (configLanguage === "en" || configLanguage === "ja") {
      lang = configLanguage;
    }

    return languageMessages[lang] ?? enMessages;
  } catch {
    return enMessages;
  }
}
