import * as vscode from 'vscode';
import { spawn } from 'child_process';
import * as path from 'path';
import * as os from 'os';

export class SSHTerminal {
    private panel: vscode.WebviewPanel;
    private sshProcess: any;
    private disposables: vscode.Disposable[] = [];

    constructor(private context: vscode.ExtensionContext) {
        // WebViewパネルの作成
        this.panel = vscode.window.createWebviewPanel(
            'sshTerminal',
            'SSH Terminal',
            vscode.ViewColumn.Active,
            {
                enableScripts: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(context.extensionUri, 'node_modules', 'xterm')
                ],
                retainContextWhenHidden: true
            }
        );

        // WebView内容の初期化
        this.panel.webview.html = this.getWebViewContent();

        // パネルが閉じられたときの処理
        this.panel.onDidDispose(() => {
            this.dispose();
        }, null, this.disposables);
    }

    public async connect(host: string, useConfigFile: boolean = false, configPath?: string): Promise<void> {
        // WebViewからのメッセージ処理の設定
        this.panel.webview.onDidReceiveMessage(
            message => {
                switch (message.type) {
                    case 'ready':
                        // ターミナルの準備ができたらSSH接続を開始
                        this.startSSHProcess(host, useConfigFile, configPath);
                        break;
                    case 'input':
                        // ユーザー入力をSSHプロセスに送信
                        if (this.sshProcess && this.sshProcess.stdin) {
                            this.sshProcess.stdin.write(message.data);
                        }
                        break;
                }
            },
            undefined,
            this.disposables
        );
    }

    private startSSHProcess(host: string, useConfigFile: boolean = false, configPath?: string): void {
        // SSHコマンドの引数を構築
        const sshArgs: string[] = ['-tt']; // 強制的にpseudo-terminalを割り当て
        
        if (useConfigFile && configPath) {
            sshArgs.push('-F', configPath);
        }
        
        // ホスト名を追加
        sshArgs.push(host);

        // プロセスの起動
        this.sshProcess = spawn('ssh', sshArgs, {
            stdio: ['pipe', 'pipe', 'pipe'],
            env: { ...process.env, TERM: 'xterm-color' }
        });

        // 標準出力の処理
        this.sshProcess.stdout.on('data', (data: Buffer) => {
            const output = data.toString('utf8');
            this.panel.webview.postMessage({ 
                type: 'output', 
                data: output 
            });
        });

        // 標準エラー出力の処理
        this.sshProcess.stderr.on('data', (data: Buffer) => {
            const output = data.toString('utf8');
            this.panel.webview.postMessage({ 
                type: 'output', 
                data: output 
            });
        });

        // プロセス終了時の処理
        this.sshProcess.on('close', (code: number) => {
            this.panel.webview.postMessage({ 
                type: 'exit', 
                code: code 
            });
        });
    }

    private getWebViewContent(): string {
        // xterm.js のリソースURIを取得
        const xtermJsUri = this.panel.webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'node_modules', 'xterm', 'lib', 'xterm.js')
        );
        const xtermCssUri = this.panel.webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'node_modules', 'xterm', 'css', 'xterm.css')
        );

        return `
            <!DOCTYPE html>
            <html lang="ja">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <link rel="stylesheet" href="${xtermCssUri}">
                <style>
                    html, body {
                        width: 100%;
                        height: 100%;
                        margin: 0;
                        padding: 0;
                        background-color: #1e1e1e;
                        overflow: hidden;
                    }
                    #terminal-container {
                        width: 100%;
                        height: 100%;
                    }
                    .status {
                        position: absolute;
                        bottom: 5px;
                        left: 5px;
                        color: #999;
                        font-size: 12px;
                        z-index: 10;
                    }
                </style>
                <title>SSH Terminal</title>
            </head>
            <body>
                <div id="terminal-container"></div>
                <div class="status" id="status"></div>
                
                <script src="${xtermJsUri}"></script>
                <script>
                    const vscode = acquireVsCodeApi();
                    const terminalContainer = document.getElementById('terminal-container');
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
                        rows: 40,
                        scrollback: 5000
                    });
                    
                    // ターミナルを開く
                    term.open(terminalContainer);
                    
                    // リサイズ
                    window.addEventListener('resize', () => {
                        // 簡易的なリサイズ - 実際のサイズは固定値
                        status.textContent = 'Window resized';
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
                                break;
                            case 'exit':
                                term.write('\\r\\n\\r\\nConnection closed (exit code: ' + message.code + ')\\r\\n');
                                break;
                        }
                    });
                    
                    // 準備完了を通知
                    setTimeout(() => {
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
                console.error('Error killing SSH process:', e);
            }
        }

        // 登録したイベントリスナーをクリア
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];
    }
}