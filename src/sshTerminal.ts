import * as vscode from "vscode";
import { ChildProcessWithoutNullStreams, spawn } from "child_process";
import * as fs from "fs";

type TerminalColors = {
  foreground: string;
  background: string;
};

export class SSHTerminal {
  private panel: vscode.WebviewPanel;
  private sshProcess: ChildProcessWithoutNullStreams | null = null;
  private disposables: vscode.Disposable[] = [];

  constructor(private context: vscode.ExtensionContext) {
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

    this.panel.webview.html = this.getWebViewContent();

    this.panel.onDidDispose(
      () => {
        this.dispose();
      },
      undefined,
      this.disposables
    );
  }

  public async connect(
    host: string,
    useConfigFile: boolean = false,
    configPath?: string,
    terminalColors?: TerminalColors
  ): Promise<void> {
    this.panel.title = host;

    this.panel.webview.onDidReceiveMessage(
      (message: { type: "ready" | "input" | "closePanel"; data?: string }) => {
        switch (message.type) {
          case "input":
            if (this.sshProcess && this.sshProcess.stdin) {
              this.sshProcess.stdin.write(message.data);
            }
            break;

          case "ready":
            if (terminalColors) {
              this.panel.webview.postMessage({
                type: "setColors",
                colors: terminalColors,
              });
            }
            this.startSSHProcess(host, useConfigFile, configPath);
            break;

          case "closePanel":
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
    const sshArgs: string[] = [
      "-tt",
      "-o",
      "StrictHostKeyChecking=no",
      "-o",
      "UserKnownHostsFile=/dev/null",
    ];

    if (useConfigFile && configPath) {
      sshArgs.push("-F", configPath);
    }

    sshArgs.push(host);

    this.sshProcess = spawn("ssh", sshArgs, {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, TERM: "xterm-color" },
    });

    this.sshProcess.stdout.on("data", (data: Buffer) => {
      const output = data.toString("utf8");
      this.panel.webview.postMessage({
        type: "output",
        data: output,
      });
    });

    this.sshProcess.stderr.on("data", (data: Buffer) => {
      const output = data.toString("utf8");
      this.panel.webview.postMessage({
        type: "output",
        data: output,
      });
    });

    this.sshProcess.on("close", (code: number) => {
      this.panel.webview.postMessage({
        type: "exit",
        code,
      });
    });
  }

  private getWebViewContent(): string {
    const xtermJsUri = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "media", "xterm", "lib", "xterm.js")
    );

    const xtermCssUri = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "media", "xterm", "css", "xterm.css")
    );

    const xtermFitAddonUri = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(
        this.context.extensionUri,
        "media",
        "xterm-addon-fit",
        "lib",
        "xterm-addon-fit.js"
      )
    );

    const stylesheetUri = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "media", "webview", "terminal.css")
    );
    const scriptUri = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "media", "webview", "terminal.js")
    );
    const htmlUri = vscode.Uri.joinPath(
      this.context.extensionUri,
      "media",
      "webview",
      "terminal.html"
    );

    let htmlContent = fs.readFileSync(htmlUri.fsPath, "utf8");
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
    if (this.sshProcess) {
      try {
        this.sshProcess.kill();
      } catch (e) {
        console.error("Error killing SSH process:", e);
      }
    }

    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
  }
}
