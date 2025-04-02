import * as vscode from "vscode";
import { ChildProcessWithoutNullStreams, spawn } from "child_process";

export class SSHTerminal {
  private panel: vscode.WebviewPanel;
  private sshProcess: ChildProcessWithoutNullStreams | null = null;
  private disposables: vscode.Disposable[] = [];

  constructor(private context: vscode.ExtensionContext) {
    // WebViewパネルの作成
    this.panel = vscode.window.createWebviewPanel(
      "sshTerminal",
      "SSH Terminal",
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(context.extensionUri, "node_modules", "xterm"),
          vscode.Uri.joinPath(
            context.extensionUri,
            "node_modules",
            "xterm-addon-fit"
          ),
        ],
        retainContextWhenHidden: true,
      }
    );

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
    // WebViewからのメッセージ処理の設定
    this.panel.webview.onDidReceiveMessage(
      (message: {
        type: "resize" | "input" | "ready";
        cols?: number;
        rows?: number;
        data?: string;
      }) => {
        switch (message.type) {
          case "ready":
            // ターミナルの準備ができたらSSH接続を開始
            this.startSSHProcess(host, useConfigFile, configPath);
            break;
          case "input":
            // ユーザー入力をSSHプロセスに送信
            if (this.sshProcess && this.sshProcess.stdin) {
              this.sshProcess.stdin.write(message.data);
            }
            break;
          case "resize":
            // ターミナルのサイズ変更をSSHプロセスに通知
            if (this.sshProcess && this.sshProcess.stdin) {
              const cols = message.cols || 80;
              const rows = message.rows || 24;

              try {
                // 1. 環境変数を設定
                process.env.COLUMNS = String(cols);
                process.env.LINES = String(rows);

                // 2. リサイズエスケープシーケンスを送信（現在の接続に影響する場合がある）
                // this.sshProcess.stdin.write(`\x1b[8;${rows};${cols}t`);

                // 3. WindowChangeRequest パケットを送信するために特別なシーケンスを送信
                // これは一部の SSH 実装でのみ動作
                // this.sshProcess.stdin.write(`\x1b]777;${cols};${rows}\x07`);
              } catch (e) {
                console.error("Error resizing terminal:", e);
              }
            }
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
    const sshArgs: string[] = ["-tt"]; // 強制的にpseudo-terminalを割り当て

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
    // xterm.js のリソースURIを取得
    const xtermJsUri = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(
        this.context.extensionUri,
        "node_modules",
        "xterm",
        "lib",
        "xterm.js"
      )
    );
    const xtermCssUri = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(
        this.context.extensionUri,
        "node_modules",
        "xterm",
        "css",
        "xterm.css"
      )
    );
    // xtermのアドオンURIを取得
    const xtermFitAddonUri = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(
        this.context.extensionUri,
        "node_modules",
        "xterm-addon-fit",
        "lib",
        "xterm-addon-fit.js"
      )
    );

    return `
            <!DOCTYPE html>
            <html lang="ja">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <link rel="stylesheet" href="${xtermCssUri}">
                <style>
                    /* 既存のスタイルはそのまま */
                    html, body {
                        width: 100%;
                        height: 100%;
                        margin: 0;
                        padding: 0;
                        background-color: #1e1e1e;
                        overflow: hidden;
                    }
                    #terminal-container {
                        width: 80%;
                        height: 80%;
                        min-width: 400px;
                        min-height: 300px;
                        max-width: 100%;
                        max-height: 100%;
                        position: relative;
                        margin: 20px auto;
                        border: 1px solid #444;
                        box-shadow: 0 0 10px rgba(0,0,0,0.3);
                        resize: both;
                        overflow: hidden;
                        padding-bottom: 10px;
                    }
                    .xterm {
                        width: 100% !important;
                        height: calc(100% - 5px) !important;
                    }
                    .xterm-viewport {
                        overflow-y: auto !important;
                        scrollbar-width: thin;
                        scrollbar-color: #666 #333;
                    }
                    .xterm-viewport::-webkit-scrollbar {
                        width: 10px;
                    }
                    .xterm-viewport::-webkit-scrollbar-track {
                        background: #333;
                    }
                    .xterm-viewport::-webkit-scrollbar-thumb {
                        background-color: #666;
                        border-radius: 6px;
                        border: 2px solid #333;
                    }
                    .xterm-screen {
                        position: relative !important;
                        height: auto !important;
                        padding-bottom: 20px;
                    }
                    .resize-handle {
                        position: absolute;
                        width: 10px;
                        height: 10px;
                        background: #666;
                        right: 0;
                        bottom: 0;
                        cursor: nwse-resize;
                    }
                    .status {
                        position: absolute;
                        bottom: 5px;
                        left: 5px;
                        color: #999;
                        font-size: 12px;
                        z-index: 10;
                    }
                    ::-webkit-scrollbar {
                        width: 10px;
                        height: 10px;
                    }
                </style>
                <title>SSH Terminal</title>
            </head>
            <body>
                <div id="terminal-container">
                    <!-- リサイズハンドル -->
                    <div class="resize-handle" id="resize-handle"></div>
                </div>
                <div class="status" id="status"></div>
                
                <!-- スクリプト読み込み -->
                <script src="${xtermJsUri}"></script>
                <script src="${xtermFitAddonUri}"></script>
                
                <script>
                    // VSCode APIの取得
                    const vscode = acquireVsCodeApi();
                    
                    // DOM要素の取得
                    const terminalContainer = document.getElementById('terminal-container');
                    const resizeHandle = document.getElementById('resize-handle');
                    const status = document.getElementById('status');
                    
                    // ターミナルの作成
                    const term = new Terminal({
                        fontFamily: 'Consolas, "Courier New", monospace',
                        fontSize: 14,
                        theme: {
                            background: '#1e1e1e',
                            foreground: '#f0f0f0'
                        },
                        cursorBlink: true,
                        cols: 100,
                        rows: 30,
                        scrollback: 5000,
                        scrollSensitivity: 6,
                        rightClickSelectsWord: false,
                        screenReaderMode: false,
                        macOptionIsMeta: true
                    });
                    
                    // ターミナルを先に開く
                    term.open(terminalContainer);
                    
                    // fitAddonを格納する変数
                    let fitAddon = null;
                    
                    // FitAddonのロード処理
                    function loadFitAddon() {
                        try {
                            if (typeof window.FitAddon === 'function') {
                                // 直接コンストラクタとして使用できる場合
                                fitAddon = new window.FitAddon();
                                console.log("FitAddon loaded as direct constructor");
                            } else if (window.FitAddon && typeof window.FitAddon.FitAddon === 'function') {
                                // 名前空間の中にあるコンストラクタ
                                fitAddon = new window.FitAddon.FitAddon();
                                console.log("FitAddon loaded from namespace");
                            } else {
                                console.warn("FitAddon not available in expected formats");
                                return false;
                            }
                            
                            // アドオンの読み込み
                            term.loadAddon(fitAddon);
                            return true;
                        } catch (e) {
                            console.error("Error loading FitAddon:", e);
                            fitAddon = null;
                            return false;
                        }
                    }
                    
                    // 適切なサイズ調整関数を使用
                    function updateTerminalSize() {
                        // まずFitAddonを試す
                        if (fitAddon) {
                            try {
                                fitAddon.fit();
                                console.log("🐓🐓🐓🐓🐓🐓FitAddon used for resizing");
                                return true;
                            } catch (e) {
                                console.error("Error using fitAddon:", e);
                            }
                        }
                    }
                    
                    
                    // スクロール位置を調整して最下行が見えるようにする
                    function ensureScrollVisibility() {
                        const viewport = document.querySelector('.xterm-viewport');
                        if (viewport) {
                            setTimeout(() => {
                                viewport.scrollTop = viewport.scrollHeight;
                            }, 50);
                        }
                    }
                    
                    // リサイズ機能の実装 (マウスドラッグ)
                    let isResizing = false;
                    let lastX = 0;
                    let lastY = 0;
                    
                    resizeHandle.addEventListener('mousedown', function(e) {
                        isResizing = true;
                        lastX = e.clientX;
                        lastY = e.clientY;
                        e.preventDefault();
                    });
                    
                    document.addEventListener('mousemove', function(e) {
                        if (!isResizing) return;
                        
                        const deltaX = e.clientX - lastX;
                        const deltaY = e.clientY - lastY;
                        
                        const newWidth = terminalContainer.offsetWidth + deltaX;
                        const newHeight = terminalContainer.offsetHeight + deltaY;
                        
                        terminalContainer.style.width = newWidth + 'px';
                        terminalContainer.style.height = newHeight + 'px';
                        
                        lastX = e.clientX;
                        lastY = e.clientY;
                        
                        // ターミナルのサイズを調整
                        updateTerminalSize();
                        
                        e.preventDefault();
                    });
                    
                    document.addEventListener('mouseup', function(e) {
                        if (isResizing) {
                            isResizing = false;
                            e.preventDefault();
                        }
                    });
                    
                    // ウィンドウリサイズ時も調整
                    window.addEventListener('resize', updateTerminalSize);
                    
                    // CSS の resize プロパティを使ったリサイズを監視
                    if (window.ResizeObserver) {
                        new ResizeObserver(updateTerminalSize).observe(terminalContainer);
                    }
                    
                    // マウスホイールイベントを監視してスクロール位置を調整
                    terminalContainer.addEventListener('wheel', function(e) {
                        const viewport = document.querySelector('.xterm-viewport');
                        if (viewport) {
                            const isAtBottom = viewport.scrollTop + viewport.clientHeight >= viewport.scrollHeight - 10;
                            if (isAtBottom) {
                                setTimeout(() => {
                                    viewport.scrollTop = viewport.scrollHeight;
                                }, 10);
                            }
                        }
                    });
                    
                    // ユーザー入力の処理
                    term.onData(data => {
                        vscode.postMessage({ type: 'input', data: data });
                    });
                    
                    // VSCodeからのメッセージ処理
                    window.addEventListener('message', event => {
                        const message = event.data;
                        
                        switch (message.type) {
                            case 'output':
                                term.write(message.data);
                                ensureScrollVisibility();
                                break;
                            case 'exit':
                                term.write('\\r\\n\\r\\nConnection closed (exit code: ' + message.code + ')\\r\\n');
                                break;
                        }
                    });
                    
                    // FitAddonのロードを試みる（読み込みが遅延している可能性があるため）
                    setTimeout(() => {
                        if (loadFitAddon()) {
                            console.log("Successfully loaded FitAddon");
                            fitAddon.fit();
                            console.log("🐔🐔🐔🐔🐔🐔FitAddon used for resizing");
                        }
                        
                        // 初期化完了を通知
                        term.focus();
                        vscode.postMessage({ type: 'ready' });
                        term.write('Connecting to SSH server...\\r\\n');
                    }, 300);
                </script>
            </body>
            </html>
        `;
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
