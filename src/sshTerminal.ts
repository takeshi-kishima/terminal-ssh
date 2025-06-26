import * as vscode from "vscode";
import { ChildProcessWithoutNullStreams, spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";

export class SSHTerminal {
  private panel: vscode.WebviewPanel;
  private sshProcess: ChildProcessWithoutNullStreams | null = null;
  private disposables: vscode.Disposable[] = [];

  constructor(private context: vscode.ExtensionContext) {
    // WebViewパネルの作成
    this.panel = vscode.window.createWebviewPanel(
      "sshTerminal",
      "SSH Terminal",
      vscode.ViewColumn.Active | vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(context.extensionUri, "media", "xterm"),
          vscode.Uri.joinPath(context.extensionUri, "media", "xterm-addon-fit"),
          vscode.Uri.joinPath(context.extensionUri, "media", "webview"),
        ],
        retainContextWhenHidden: true,
      }
    );

    this.panel.iconPath = {
      light: vscode.Uri.joinPath(
        context.extensionUri,
        "media",
        "icons",
        "terminal-icon-light.svg"
      ),
      dark: vscode.Uri.joinPath(
        context.extensionUri,
        "media",
        "icons",
        "terminal-icon-dark.svg"
      ),
    };

    // WebView内容の初期化
    this.panel.webview.html = this.getWebViewContent();

    // パネルが閉じられたときの処理
    this.panel.onDidDispose(
      () => {
        this.dispose();
      },
      null,
      this.disposables
    );
  }

  public async connect(
    host: string,
    useConfigFile: boolean = false,
    configPath?: string
  ): Promise<void> {
    // タイトルを動的に設定
    this.panel.title = host;
    // WebViewからのメッセージ処理の設定
    this.panel.webview.onDidReceiveMessage(
      (message: {
        type: "ready" | "input" | "closePanel";
        data?: string;
      }) => {
        switch (message.type) {
          case "input":
            // ユーザー入力をSSHプロセスに送信
            if (this.sshProcess && this.sshProcess.stdin) {
              this.sshProcess.stdin.write(message.data);
            }
            break;

          case "ready":

            // // 1. ランダム色を生成
            // const bgColor =
            // "#" +
            // Math.floor(Math.random() * 0xffffff)
            //   .toString(16)
            //   .padStart(6, "0");
            // // 2. Webviewに送信
            // this.panel.webview.postMessage({ type: "setBackground", color: bgColor });
          
            // ターミナルの準備ができたらSSH接続を開始
            this.startSSHProcess(host, useConfigFile, configPath);
            break;

          case "closePanel":
              // Webview からのリクエストで panel を閉じる
              this.panel.dispose();
              break;
        }
      },
      undefined,
      this.disposables
    );
  }

  private startSSHProcess(
    host: string,
    useConfigFile: boolean = false,
    configPath?: string
  ): void {
    // SSHコマンドの引数を構築
    const sshArgs: string[] = [
      "-tt", // 強制的にpseudo-terminalを割り当て
      "-o", "StrictHostKeyChecking=no",
      "-o", "UserKnownHostsFile=/dev/null"
    ];

    if (useConfigFile && configPath) {
      sshArgs.push("-F", configPath);
    }

    // ホスト名を追加
    sshArgs.push(host);

    // プロセスの起動
    this.sshProcess = spawn("ssh", sshArgs, {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, TERM: "xterm-color" },
    });

    // 標準出力の処理
    this.sshProcess.stdout.on("data", (data: Buffer) => {
      const output = data.toString("utf8");
      this.panel.webview.postMessage({
        type: "output",
        data: output,
      });
    });

    // 標準エラー出力の処理
    this.sshProcess.stderr.on("data", (data: Buffer) => {
      const output = data.toString("utf8");
      this.panel.webview.postMessage({
        type: "output",
        data: output,
      });
    });

    // プロセス終了時の処理
    this.sshProcess.on("close", (code: number) => {
      this.panel.webview.postMessage({
        type: "exit",
        code: code,
      });
    });
  }

  private getWebViewContent(): string {
    // xterm.js のリソースURIを取得（mediaディレクトリから）
    const xtermJsUri = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(
        this.context.extensionUri,
        "media",
        "xterm",
        "lib",
        "xterm.js"
      )
    );

    const xtermCssUri = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(
        this.context.extensionUri,
        "media",
        "xterm",
        "css",
        "xterm.css"
      )
    );

    // xtermのアドオンURIを取得（mediaディレクトリから）
    const xtermFitAddonUri = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(
        this.context.extensionUri,
        "media",
        "xterm-addon-fit",
        "lib",
        "xterm-addon-fit.js"
      )
    );

    // カスタムWebViewリソースの取得
    const stylesheetUri = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(
        this.context.extensionUri,
        "media",
        "webview",
        "terminal.css"
      )
    );
    const scriptUri = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(
        this.context.extensionUri,
        "media",
        "webview",
        "terminal.js"
      )
    );
    const htmlUri = vscode.Uri.joinPath(
      this.context.extensionUri,
      "media",
      "webview",
      "terminal.html"
    );
    let htmlContent = fs.readFileSync(htmlUri.fsPath, "utf8");

    // プレースホルダーを置換
    htmlContent = htmlContent
      .replace("${language}", vscode.env.language || "en")
      .replace("${xtermCssUri}", xtermCssUri.toString())
      .replace("${stylesheetUri}", stylesheetUri.toString())
      .replace("${xtermJsUri}", xtermJsUri.toString())
      .replace("${xtermFitAddonUri}", xtermFitAddonUri.toString())
      .replace("${scriptUri}", scriptUri.toString());

    return htmlContent;
  }

  public dispose(): void {
    // SSHプロセスの終了
    if (this.sshProcess) {
      try {
        this.sshProcess.kill();
      } catch (e) {
        console.error("Error killing SSH process:", e);
      }
    }

    // 登録したイベントリスナーをクリア
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
  }
}
