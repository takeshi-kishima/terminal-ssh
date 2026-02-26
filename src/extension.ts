import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import SSHConfig from "@jeanp413/ssh-config";
import { getMessages } from "./i18n";
import {
  resolveTerminalColors,
  type TerminalColors,
} from "./hostColorResolver";
import { SSHTerminal } from "./sshTerminal";

export function activate(context: vscode.ExtensionContext) {
  const messages = getMessages();

  // QuickPick関数を作成
  async function showSSHQuickPick(): Promise<{
    selectedItem: vscode.QuickPickItem | undefined;
    inputValue: string;
  }> {
    // SSHの設定ファイルからホスト情報を取得
    const sshHosts = await getSSHHosts();

    // QuickPickを作成
    const quickPick = vscode.window.createQuickPick();
    quickPick.items = [
      ...sshHosts,
      {
        label: messages.newConnection,
        description: "",
      },
    ];
    quickPick.placeholder = messages.quickPickPlaceholder;
    quickPick.ignoreFocusOut = true;

    return new Promise((resolve) => {
      quickPick.onDidAccept(() => {
        const selectedItem = quickPick.selectedItems[0];
        const inputValue = quickPick.value; // ユーザーが入力した文字列
        quickPick.hide();
        resolve({ selectedItem, inputValue });
      });

      // QuickPickを表示
      quickPick.show();
    });
  }

  // 新しいターミナルを作成するコマンド
  const newTerminalDisposable = vscode.commands.registerCommand(
    "terminal-ssh.newTerminal",
    async () => {
      const { selectedItem, inputValue } = await showSSHQuickPick();
      await handleTerminalConnection(selectedItem, inputValue, context, false);
    }
  );

  // ターミナルを分割するコマンド
  const splitTerminalDisposable = vscode.commands.registerCommand(
    "terminal-ssh.splitTerminal",
    async () => {
      const { selectedItem, inputValue } = await showSSHQuickPick();
      await handleTerminalConnection(selectedItem, inputValue, context, true);
    }
  );

  // コマンドをサブスクリプションに追加
  context.subscriptions.push(newTerminalDisposable);
  context.subscriptions.push(splitTerminalDisposable);
}

async function handleTerminalConnection(
  selectedItem: vscode.QuickPickItem | undefined,
  inputValue: string | undefined,
  context: vscode.ExtensionContext,
  split: boolean
) {
  const messages = getMessages();
  // ターゲットホスト名
  let targetHost = "";
  // SSH設定ファイルからホスト情報を取得
  let isFromConfigFile = true;

  // 「新しい接続」オプションが選択された場合
  if (selectedItem && selectedItem.label.includes(messages.newConnection)) {
    // ユーザーからSSHの接続先情報を取得
    const hostname = await vscode.window.showInputBox({
      placeHolder: messages.hostname,
      prompt: messages.enterHostname,
    });

    if (!hostname) {
      return; // ユーザーがキャンセルした場合
    }

    const username = await vscode.window.showInputBox({
      placeHolder: messages.username,
      prompt: messages.enterUsername,
    });

    if (!username) {
      return; // ユーザーがキャンセルした場合
    }

    // フルホスト名
    targetHost = `${username}@${hostname}`;
    isFromConfigFile = false;
  } else if (selectedItem) {
    targetHost = selectedItem.label;
    isFromConfigFile = true;
  } else if (inputValue) {
    targetHost = inputValue;
    isFromConfigFile = false;
  }

  if (!targetHost) {
    return; // ホスト名がない場合は何もしない
  }

  const terminalColors = getTerminalColorsForHost(targetHost, isFromConfigFile);
  await connectWithProgress(targetHost, isFromConfigFile, context, terminalColors);
}

async function getSSHHosts(): Promise<Array<{ label: string; description: string }>> {
  const messages = getMessages();
  // 選択されたホストに接続
  const configPath = vscode.workspace
    .getConfiguration("terminal-ssh")
    .get<string>("sshConfigPath");

  // 設定値が空または未定義の場合はデフォルトのパスを使用
  const sshConfigPath = configPath || path.join(os.homedir(), ".ssh", "config");
  const hosts: Array<{ label: string; description: string }> = [];

  try {
    if (fs.existsSync(sshConfigPath)) {
      const configContent = fs.readFileSync(sshConfigPath, "utf-8");
      const config = SSHConfig.parse(configContent);

      for (const line of config) {
        if (
          line.type === SSHConfig.DIRECTIVE &&
          line.param === "Host" &&
          line.value
        ) {
          const host = Array.isArray(line.value) ? line.value[0] : line.value;
          if (!host.includes("*")) {
            // ワイルドカードを除外
            const hostConfig = config.compute(host) as Record<string, string>;
            const user = hostConfig["User"] || "";
            const hostName = hostConfig["HostName"] || host;

            hosts.push({
              label: host,
              description: `${user ? user + "@" : ""}${hostName}`,
            });
          }
        }
      }
    }
  } catch (error) {
    console.error(messages.readConfigError, error);
  }

  return hosts;
}

function getEffectiveSshConfigPath(): string {
  const configPath = vscode.workspace
    .getConfiguration("terminal-ssh")
    .get<string>("sshConfigPath");
  return configPath || path.join(os.homedir(), ".ssh", "config");
}

function getTerminalColorsForHost(
  targetHost: string,
  isFromConfigFile: boolean
): TerminalColors {
  const config = vscode.workspace.getConfiguration("terminal-ssh");
  const hostColorsMap = config.get<Record<string, unknown>>("hostColors", {});
  let resolvedHostName: string | undefined;
  let resolvedUser: string | undefined;

  if (isFromConfigFile) {
    try {
      const sshConfigPath = getEffectiveSshConfigPath();
      if (fs.existsSync(sshConfigPath)) {
        const configContent = fs.readFileSync(sshConfigPath, "utf-8");
        const parsedConfig = SSHConfig.parse(configContent);
        const hostConfig = parsedConfig.compute(targetHost) as Record<string, string>;
        resolvedHostName = hostConfig["HostName"];
        resolvedUser = hostConfig["User"];
      }
    } catch {
      // Ignore parse/resolve errors and fall back to target-based matching.
    }
  }

  return resolveTerminalColors({
    targetHost,
    isFromConfigFile,
    defaultColorsInput: config.get<unknown>("defaultColors"),
    hostColorsMap,
    resolvedHostName,
    resolvedUser,
  });
}

async function connectWithProgress(
  targetHost: string,
  isFromConfigFile: boolean = true,
  context: vscode.ExtensionContext,
  terminalColors: TerminalColors
): Promise<void> {
  const messages = getMessages();

  return vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: messages.connecting.replace("{0}", targetHost),
      cancellable: false,
    },
    async () => {
      try {
        // SSHTerminal インスタンスを作成
        const sshTerminal = new SSHTerminal(context);

        if (isFromConfigFile) {
          const sshConfigPath = vscode.workspace
            .getConfiguration("terminal-ssh")
            .get<string>("sshConfigPath");

          // 設定値が空または未定義の場合はデフォルトのパスを使用
          const effectivePath =
            sshConfigPath || path.join(os.homedir(), ".ssh", "config");

          // 設定ファイルが存在するか確認
          if (!fs.existsSync(effectivePath)) {
            // 設定ファイルが存在しない場合はエラーメッセージを表示
            vscode.window.showErrorMessage(
              messages.sshConfigNotFound.replace("{0}", effectivePath)
            );
            return;
          }

          await sshTerminal.connect(
            targetHost,
            true,
            effectivePath,
            terminalColors
          );
        } else {
          await sshTerminal.connect(targetHost, false, undefined, terminalColors);
        }

        // 最低でも1秒間は進捗表示
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // 接続完了後にステータスバーに表示
        vscode.window.setStatusBarMessage(
          messages.connected.replace("{0}", targetHost),
          2000
        );
      } catch (error) {
        vscode.window.showErrorMessage(
          `Failed to connect to ${targetHost}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }
  );
}

export function deactivate() {}
