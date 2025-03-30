import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import SSHConfig from "@jeanp413/ssh-config";
import { getMessages } from "./i18n"; // Import getMessages

export function activate(context: vscode.ExtensionContext) {
  const messages = getMessages(); // Get messages

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
      await newTerminal(selectedItem, inputValue);
    }
  );

  // ターミナルを分割するコマンド
  const splitTerminalDisposable = vscode.commands.registerCommand(
    "terminal-ssh.splitTerminal",
    async () => {
      const { selectedItem, inputValue } = await showSSHQuickPick();
      await splitTerminal(selectedItem, inputValue);
    }
  );

  // コマンドをサブスクリプションに追加
  context.subscriptions.push(newTerminalDisposable);
  context.subscriptions.push(splitTerminalDisposable);
}

/**
 * 新しいターミナルを作成する関数
 */
async function newTerminal(
  selectedItem: vscode.QuickPickItem | undefined,
  inputValue: string | undefined
) {
  const messages = getMessages(); // Get messages
  // ターゲットホスト名を決定
  let targetHost = "";
  let isFromConfigFile = true;
  if (
    selectedItem &&
    !selectedItem.label.includes(messages.newConnection)
  ) {
    targetHost = selectedItem.label;
  } else if (inputValue) {
    targetHost = inputValue;
    isFromConfigFile = false;
  }

  if (
    selectedItem &&
    selectedItem.label.includes(messages.newConnection)
  ) {
    // 新しい接続先を追加する場合は
    newSshConnection("new");
    return;
  }

  if (!targetHost) {
    return; // ホスト名がない場合は何もしない
  }

  // 共通関数を使用してターミナル作成と接続を行う
  await connectWithProgress(
    targetHost,
    isFromConfigFile
  );
}

async function splitTerminal(
  selectedItem: vscode.QuickPickItem | undefined,
  inputValue: string | undefined
) {
  const messages = getMessages();
  // ターゲットホスト名を決定
  let targetHost = "";
  let isFromConfigFile = true;
  if (
    selectedItem &&
    !selectedItem.label.includes(messages.newConnection)
  ) {
    targetHost = selectedItem.label;
  } else if (inputValue) {
    targetHost = inputValue;
    isFromConfigFile = false;
  }

  if (
    selectedItem &&
    selectedItem.label.includes(messages.newConnection)
  ) {
    // 新しい接続先を追加する場合
    newSshConnection("split");
    return;
  }

  if (!targetHost) {
    return; // ホスト名がない場合は何もしない
  }

  // ターミナルのリストを取得
    // 既存のターミナルがある場合、まずターミナルを表示
    // ターミナル分割コマンドを実行（非同期だが、即時実行される）
    // 分割後、アクティブなターミナルを取得（これが新しく分割されたターミナル）
    // 既存のターミナルがない場合は新しいターミナルを作成

  // 共通関数を使用してターミナル作成と接続を行う
  await connectWithProgress(targetHost, isFromConfigFile);
}

/**
 * 新しいSSH接続用関数
 */
async function newSshConnection(command: "new" | "split") {
  const messages = getMessages();
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

  const fullHostname = `${username}@${hostname}`;

  if (command === "new") {
    // 新しいターミナルを作成
    await newTerminal(undefined, fullHostname);
  } else {
    // ターミナルを分割
    await splitTerminal(undefined, fullHostname);
  }
}

/**
 * SSH設定ファイルからホスト情報を取得する
 */
async function getSSHHosts(): Promise<
  Array<{ label: string; description: string }>
> {
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

/**
 * ホスト名に基づいて色とアイコンを計算
 */
function calculateHostIconAndColor(hostname: string) {
  const messages = getMessages();
  /**
   * ホスト名に基づいて色とアイコンを計算
   */
  const colorIndex =
    hostname.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0) % 6;
  const emojis = ["🔵", "🟢", "🔴", "🟡", "🟣", "🔷"];
  const emoji = emojis[colorIndex];

  /**
   * VS Codeのテーマカラー配列
   */
  const themeColors = [
    "terminal.ansiBlue", // 青
    "terminal.ansiGreen", // 緑
    "terminal.ansiRed", // 赤
    "terminal.ansiYellow", // 黄
    "terminal.ansiMagenta", // マゼンタ（紫）
    "terminal.ansiCyan", // シアン（水色）
  ];

  // 新しいターミナルを作成
  return;
}

/**
 * SSHターミナル接続と進捗表示を共通化した関数
 * @param targetHost 接続先ホスト名
 * @returns 作成されたターミナル
 */
async function connectWithProgress(
  targetHost: string,
  isFromConfigFile: boolean = true
): Promise<void> {
  const messages = getMessages();
  return vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: messages.connecting.replace("{0}", targetHost),
      cancellable: false,
    },
    async () => {
      // 両方の処理を並行して開始し、両方が完了するまで待機
      const terminalPromise = Promise.resolve().then(() => {

        // 設定ファイルからのホストの場合のみ -F オプションを付ける
        if (isFromConfigFile) {
          const sshConfigPath = vscode.workspace
            .getConfiguration("terminal-ssh")
            .get<string>("sshConfigPath");

          // 設定値が空または未定義の場合はデフォルトのパスを使用
          let effectivePath =
            sshConfigPath || path.join(os.homedir(), ".ssh", "config");

          // 実際のファイルパス
          const realPath = effectivePath;

          // 設定ファイルが存在するか確認
          if (!fs.existsSync(realPath)) {
            // 設定ファイルが存在しない場合はエラーメッセージを表示
            vscode.window.showErrorMessage(
              messages.sshConfigNotFound.replace("{0}", realPath)
            );
            // ターミナルは作成するが、コマンドは送信しない
            return;
          }

          // Windowsの場合、コマンドラインで使用するためバックスラッシュをエスケープする
          if (process.platform === "win32") {
            effectivePath = effectivePath.replace(/\\/g, "\\\\");
          }

          // SSHコマンドを実行
        } else {
          // 手動入力されたホストの場合は -F オプションを付けない
        }

        // ターミナルを表示
        return;
      });

      // 最低3秒間は表示するためのタイマー
      const timerPromise = new Promise((resolve) => setTimeout(resolve, 3000));

      // 両方の処理が完了するのを待つ
      const [terminal] = await Promise.all([terminalPromise, timerPromise]);

      // 接続完了後にステータスバーに表示
      vscode.window.setStatusBarMessage(
        messages.connected.replace("{0}", targetHost),
        2000
      );

      // ターミナル変数をコマンド内で使用可能にするために返す
      return terminal;
    }
  );
}

// This method is called when your extension is deactivated
export function deactivate() {}
