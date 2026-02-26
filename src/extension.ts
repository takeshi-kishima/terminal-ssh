import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

type TerminalColors = {
  foreground: string;
  background: string;
};

type ExtensionMessages = {
  newConnection: string;
  quickPickPlaceholder: string;
  hostname: string;
  enterHostname: string;
  username: string;
  enterUsername: string;
  SSH: string;
  connecting: string;
  connected: string;
  sshConfigNotFound: string;
  readConfigError: string;
  privateKeyPath: string;
  enterPrivateKeyPath: string;
  privateKeyOptional: string;
  privateKeyNotFound: string;
  privateKeyRetryPrompt: string;
  privateKeyRetryAction: string;
};

type ResolvedSshConfigPath = {
  configuredPath: string;
  effectivePath: string;
  usedDefault: boolean;
};

const FALLBACK_MESSAGES: ExtensionMessages = {
  newConnection: "$(plus) New SSH connection...",
  quickPickPlaceholder: "Select a configured SSH host or enter user@host",
  hostname: "hostname",
  enterHostname: "Enter SSH hostname",
  username: "username",
  enterUsername: "Enter username",
  SSH: "SSH",
  connecting: "Connecting to {0}...",
  connected: "Connected to {0}",
  sshConfigNotFound: "SSH configuration file not found: {0}",
  readConfigError: "Failed to read SSH configuration file:",
  privateKeyPath: "Private key path (optional), e.g. ~/.ssh/id_rsa",
  enterPrivateKeyPath: "Enter private key path for this connection (optional)",
  privateKeyOptional: "Leave empty to connect without specifying a private key",
  privateKeyNotFound: "Private key file not found: {0}",
  privateKeyRetryPrompt: "Authentication failed. Select a private key and retry?",
  privateKeyRetryAction: "Select Key and Retry",
};

function errorToText(error: unknown): string {
  if (error instanceof Error && error.stack) {
    return error.stack;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function logError(
  output: vscode.OutputChannel,
  commandId: string,
  error: unknown
): void {
  output.appendLine(`[${commandId}] ERROR`);
  output.appendLine(errorToText(error));
}

async function loadMessages(
  output: vscode.OutputChannel
): Promise<ExtensionMessages> {
  try {
    const i18n = await import("./i18n/index.js");
    return { ...FALLBACK_MESSAGES, ...i18n.getMessages() };
  } catch (error) {
    logError(output, "terminal-ssh.messages", error);
    return FALLBACK_MESSAGES;
  }
}

function resolveSshConfigPath(): ResolvedSshConfigPath {
  const configPathRaw =
    vscode.workspace
      .getConfiguration("terminal-ssh")
      .get<string>("sshConfigPath") ?? "";
  const configuredPath = configPathRaw.trim();
  const usedDefault = configuredPath.length === 0;
  const effectivePath = usedDefault
    ? path.join(os.homedir(), ".ssh", "config")
    : expandPathPlaceholders(configuredPath);

  return {
    configuredPath,
    effectivePath,
    usedDefault,
  };
}

export function expandPathPlaceholders(inputPath: string): string {
  let expanded = inputPath;

  // Allow users to configure "~/.ssh/config" style paths.
  if (expanded.startsWith("~")) {
    const tail = expanded.slice(1).replace(/^[/\\]+/, "");
    expanded = path.join(os.homedir(), tail);
  }

  // Expand ${env:NAME} and $NAME placeholders.
  expanded = expanded.replace(/\$\{env:([^}]+)\}/gi, (_, name: string) => {
    return process.env[name] ?? "";
  });
  expanded = expanded.replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (_, name: string) => {
    return process.env[name] ?? "";
  });

  // Expand Windows %NAME% placeholders.
  expanded = expanded.replace(/%([^%]+)%/g, (_, name: string) => {
    return process.env[name] ?? "";
  });

  return path.resolve(expanded);
}

async function getSSHHosts(
  messages: ExtensionMessages,
  output: vscode.OutputChannel
): Promise<Array<{ label: string; description: string }>> {
  const sshConfigPath = resolveSshConfigPath().effectivePath;
  const hosts: Array<{ label: string; description: string }> = [];

  try {
    if (!fs.existsSync(sshConfigPath)) {
      return hosts;
    }

    const { default: SSHConfig } = await import("@jeanp413/ssh-config");
    const SSHConfigAny = SSHConfig as any;
    const configContent = fs.readFileSync(sshConfigPath, "utf-8");
    const config = SSHConfigAny.parse(configContent);

    for (const line of config) {
      if (
        (line as any).type === SSHConfigAny.DIRECTIVE &&
        (line as any).param === "Host" &&
        (line as any).value
      ) {
        const host = Array.isArray((line as any).value) ? (line as any).value[0] : (line as any).value;
        if (!host.includes("*")) {
          const hostConfig = config.compute(host) as Record<string, string>;
          const user = hostConfig["User"] || "";
          const hostName = hostConfig["HostName"] || host;
          hosts.push({
            label: host,
            description: `${user ? `${user}@` : ""}${hostName}`,
          });
        }
      }
    }

    // Fallback parser: some configs with unusual directives/comments can lead
    // to 0 extracted hosts via parser iteration. Keep UX stable by scanning
    // plain Host blocks.
    if (hosts.length === 0) {
      const hostDescriptions = new Map<string, string>();
      const lines = configContent.split(/\r?\n/);
      let currentHosts: string[] = [];
      let currentUser = "";
      let currentHostName = "";

      const pushCurrentHosts = (): void => {
        for (const host of currentHosts) {
          if (hostDescriptions.has(host)) {
            continue;
          }
          const description = `${currentUser ? `${currentUser}@` : ""}${currentHostName || host}`;
          hostDescriptions.set(host, description);
        }
      };

      for (const rawLine of lines) {
        const lineWithoutComment = rawLine.replace(/\s+#.*$/, "");
        const trimmed = lineWithoutComment.trim();
        if (trimmed.length === 0) {
          continue;
        }

        const hostMatch = /^\s*Host\s+(.+)$/i.exec(lineWithoutComment);
        if (hostMatch) {
          pushCurrentHosts();
          currentHosts = hostMatch[1]
            .split(/\s+/)
            .map((v) => v.trim())
            .filter((v) => v.length > 0 && !v.includes("*"));
          currentUser = "";
          currentHostName = "";
          continue;
        }

        if (currentHosts.length === 0) {
          continue;
        }

        const userMatch = /^\s*User\s+(.+)$/i.exec(lineWithoutComment);
        if (userMatch && currentUser.length === 0) {
          currentUser = userMatch[1].trim();
          continue;
        }

        const hostNameMatch = /^\s*HostName\s+(.+)$/i.exec(lineWithoutComment);
        if (hostNameMatch && currentHostName.length === 0) {
          currentHostName = hostNameMatch[1].trim();
        }
      }

      pushCurrentHosts();

      for (const [host, description] of hostDescriptions) {
        hosts.push({
          label: host,
          description,
        });
      }
    }
  } catch (error) {
    output.appendLine(messages.readConfigError);
    logError(output, "terminal-ssh.getSSHHosts", error);
  }

  return hosts;
}

async function showSSHQuickPick(
  messages: ExtensionMessages,
  output: vscode.OutputChannel
): Promise<{
  selectedItem: vscode.QuickPickItem | undefined;
  inputValue: string;
}> {
  const sshHosts = await getSSHHosts(messages, output);
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
      const inputValue = quickPick.value;
      quickPick.hide();
      resolve({ selectedItem, inputValue });
    });
    quickPick.show();
  });
}

async function getTerminalColorsForHost(
  targetHost: string,
  isFromConfigFile: boolean,
  output: vscode.OutputChannel
): Promise<TerminalColors> {
  const config = vscode.workspace.getConfiguration("terminal-ssh");
  const hostColorsMap = config.get<Record<string, unknown>>("hostColors", {});
  let resolvedHostName: string | undefined;
  let resolvedUser: string | undefined;

  if (isFromConfigFile) {
    try {
      const sshConfigPath = resolveSshConfigPath().effectivePath;
      if (fs.existsSync(sshConfigPath)) {
        const { default: SSHConfig } = await import("@jeanp413/ssh-config");
        const SSHConfigAny = SSHConfig as any;
        const configContent = fs.readFileSync(sshConfigPath, "utf-8");
        const parsedConfig = SSHConfigAny.parse(configContent);
        const hostConfig = parsedConfig.compute(targetHost) as Record<string, string>;
        resolvedHostName = hostConfig["HostName"];
        resolvedUser = hostConfig["User"];
      }
    } catch (error) {
      logError(output, "terminal-ssh.colorResolve", error);
    }
  }

  const { resolveTerminalColors } = await import("./hostColorResolver.js");
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
  isFromConfigFile: boolean,
  context: vscode.ExtensionContext,
  terminalColors: TerminalColors,
  messages: ExtensionMessages,
  output: vscode.OutputChannel,
  privateKeyPath?: string,
  onConnectionExit?: (info: {
    code: number | null;
    signal: NodeJS.Signals | null;
    stderrTail: string;
  }) => void
): Promise<void> {
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: messages.connecting.replace("{0}", targetHost),
      cancellable: false,
    },
    async () => {
      const { SSHTerminal } = await import("./sshTerminal.js");
      const sshTerminal = new SSHTerminal(context);

      if (isFromConfigFile) {
        const resolvedPath = resolveSshConfigPath();
        output.appendLine(
          `[connect] sshConfigPath configured='${resolvedPath.configuredPath || "(empty)"}' effective='${resolvedPath.effectivePath}' usedDefault=${resolvedPath.usedDefault}`
        );

        if (!fs.existsSync(resolvedPath.effectivePath)) {
          vscode.window.showErrorMessage(
            `${messages.sshConfigNotFound.replace("{0}", resolvedPath.effectivePath)} (setting: terminal-ssh.sshConfigPath='${resolvedPath.configuredPath || "(empty)"}')`
          );
          return;
        }
        await sshTerminal.connect(
          targetHost,
          true,
          resolvedPath.effectivePath,
          terminalColors,
          undefined,
          onConnectionExit
        );
      } else {
        await sshTerminal.connect(
          targetHost,
          false,
          undefined,
          terminalColors,
          privateKeyPath,
          onConnectionExit
        );
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
      vscode.window.setStatusBarMessage(
        messages.connected.replace("{0}", targetHost),
        2000
      );
    }
  );
}

async function promptPrivateKeyPath(
  messages: ExtensionMessages
): Promise<string | undefined> {
  const selectedFiles = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    openLabel: messages.privateKeyPath,
    title: messages.enterPrivateKeyPath,
  });

  if (!selectedFiles || selectedFiles.length === 0) {
    return undefined;
  }

  return expandPathPlaceholders(selectedFiles[0].fsPath);
}

export function shouldSuggestPrivateKeyRetry(
  code: number | null,
  stderrTail: string
): boolean {
  if (code === 0) {
    return false;
  }

  const normalized = stderrTail.toLowerCase();
  return (
    normalized.includes("permission denied (publickey") ||
    normalized.includes("permission denied (publickey,gssapi-keyex,gssapi-with-mic") ||
    normalized.includes("no such identity") ||
    normalized.includes("sign_and_send_pubkey")
  );
}

async function handleTerminalConnection(
  selectedItem: vscode.QuickPickItem | undefined,
  inputValue: string | undefined,
  context: vscode.ExtensionContext,
  _split: boolean,
  messages: ExtensionMessages,
  output: vscode.OutputChannel
): Promise<void> {
  let targetHost = "";
  let isFromConfigFile = true;
  let privateKeyPath: string | undefined;

  if (selectedItem && selectedItem.label.includes(messages.newConnection)) {
    const hostname = await vscode.window.showInputBox({
      placeHolder: messages.hostname,
      prompt: messages.enterHostname,
    });
    if (!hostname) {
      return;
    }

    const username = await vscode.window.showInputBox({
      placeHolder: messages.username,
      prompt: messages.enterUsername,
    });
    if (!username) {
      return;
    }

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
    return;
  }

  const terminalColors = await getTerminalColorsForHost(targetHost, isFromConfigFile, output);
  output.appendLine(
    `[connect] target='${targetHost}' isFromConfigFile=${isFromConfigFile} privateKeyProvided=${Boolean(
      privateKeyPath
    )} privateKeyFile='${
      privateKeyPath ? path.basename(privateKeyPath) : "(none)"
    }' colors=${JSON.stringify(terminalColors)}`
  );
  await connectWithProgress(
    targetHost,
    isFromConfigFile,
    context,
    terminalColors,
    messages,
    output,
    privateKeyPath,
    async (info) => {
      if (isFromConfigFile || privateKeyPath) {
        return;
      }

      if (!shouldSuggestPrivateKeyRetry(info.code, info.stderrTail)) {
        return;
      }

      const action = await vscode.window.showWarningMessage(
        messages.privateKeyRetryPrompt,
        messages.privateKeyRetryAction
      );
      if (action !== messages.privateKeyRetryAction) {
        return;
      }

      const selectedKeyPath = await promptPrivateKeyPath(messages);
      if (!selectedKeyPath) {
        return;
      }
      if (!fs.existsSync(selectedKeyPath)) {
        await vscode.window.showErrorMessage(
          messages.privateKeyNotFound.replace("{0}", selectedKeyPath)
        );
        return;
      }

      output.appendLine(
        `[connect] retryWithPrivateKey target='${targetHost}' privateKeyFile='${path.basename(
          selectedKeyPath
        )}'`
      );
      await connectWithProgress(
        targetHost,
        false,
        context,
        terminalColors,
        messages,
        output,
        selectedKeyPath
      );
    }
  );
}

async function runDiagnostics(
  output: vscode.OutputChannel,
  context: vscode.ExtensionContext
): Promise<void> {
  const extension =
    vscode.extensions.getExtension("omni-kobo.internal-terminal-ssh") ??
    vscode.extensions.getExtension("internal-terminal-ssh");
  const commands = await vscode.commands.getCommands(true);
  const requiredCommands = [
    "terminal-ssh.newTerminal",
    "terminal-ssh.splitTerminal",
    "terminal-ssh.diagnose",
  ];

  output.appendLine("=== Terminal-SSH Diagnostics ===");
  output.appendLine(`time: ${new Date().toISOString()}`);
  output.appendLine(`vscode.language: ${vscode.env.language}`);
  output.appendLine(`platform: ${process.platform} ${process.arch}`);
  output.appendLine(`extension.id: ${extension?.id ?? "(not found)"}`);
  output.appendLine(
    `extension.version: ${extension?.packageJSON?.version ?? "(unknown)"}`
  );
  output.appendLine(`extension.path: ${context.extensionPath}`);
  const terminalConfig = vscode.workspace.getConfiguration("terminal-ssh");
  const sshConfigPathSetting = terminalConfig.get<string>("sshConfigPath") ?? "";
  const defaultColors = terminalConfig.get<unknown>("defaultColors");
  const hostColors = terminalConfig.get<Record<string, unknown>>("hostColors", {});
  const resolvedPath = resolveSshConfigPath();
  const nlsJaPath = path.join(context.extensionPath, "package.nls.ja.json");
  const nlsEnPath = path.join(context.extensionPath, "package.nls.json");
  output.appendLine(
    `config.terminal-ssh.sshConfigPath(raw): ${JSON.stringify(sshConfigPathSetting)}`
  );
  output.appendLine(
    `config.terminal-ssh.sshConfigPath(effective): ${resolvedPath.effectivePath}`
  );
  output.appendLine(
    `config.terminal-ssh.sshConfigPath.exists: ${fs.existsSync(resolvedPath.effectivePath)}`
  );
  output.appendLine(
    `config.terminal-ssh.defaultColors: ${JSON.stringify(defaultColors)}`
  );
  output.appendLine(
    `config.terminal-ssh.hostColors.keys: ${Object.keys(hostColors).length}`
  );
  output.appendLine(`nls.package.nls.json.exists: ${fs.existsSync(nlsEnPath)}`);
  output.appendLine(`nls.package.nls.ja.json.exists: ${fs.existsSync(nlsJaPath)}`);

  for (const commandId of requiredCommands) {
    output.appendLine(
      `${commandId}: ${commands.includes(commandId) ? "registered" : "missing"}`
    );
  }

  output.show(true);
  await vscode.window.showInformationMessage(
    "Terminal-SSH diagnostics written to Output: Terminal-SSH"
  );
}

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel("Terminal-SSH");
  context.subscriptions.push(output);
  output.appendLine("[activate] Terminal-SSH activation started");

  const runSafely =
    (commandId: string, fn: () => Promise<void>) =>
    async (): Promise<void> => {
      try {
        await fn();
      } catch (error) {
        logError(output, commandId, error);
        await vscode.window.showErrorMessage(
          "Terminal-SSH failed. See Output: Terminal-SSH"
        );
      }
    };

  const newTerminalDisposable = vscode.commands.registerCommand(
    "terminal-ssh.newTerminal",
    runSafely("terminal-ssh.newTerminal", async () => {
      const messages = await loadMessages(output);
      const { selectedItem, inputValue } = await showSSHQuickPick(messages, output);
      await handleTerminalConnection(
        selectedItem,
        inputValue,
        context,
        false,
        messages,
        output
      );
    })
  );

  const splitTerminalDisposable = vscode.commands.registerCommand(
    "terminal-ssh.splitTerminal",
    runSafely("terminal-ssh.splitTerminal", async () => {
      const messages = await loadMessages(output);
      const { selectedItem, inputValue } = await showSSHQuickPick(messages, output);
      await handleTerminalConnection(
        selectedItem,
        inputValue,
        context,
        true,
        messages,
        output
      );
    })
  );

  const diagnoseDisposable = vscode.commands.registerCommand(
    "terminal-ssh.diagnose",
    runSafely("terminal-ssh.diagnose", async () => {
      await runDiagnostics(output, context);
    })
  );

  context.subscriptions.push(
    newTerminalDisposable,
    splitTerminalDisposable,
    diagnoseDisposable
  );
  output.appendLine("[activate] commands registered");
}

export function deactivate(): void {}
