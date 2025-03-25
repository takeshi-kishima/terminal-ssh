# Terminal SSH

This extension allows you to easily establish SSH connections using VSCode's terminal.

## Features
- Start SSH connections directly within VSCode's terminal.
- Connect by selecting hosts from your existing SSH configuration file (`~/.ssh/config`).
- Choose hosts from a quick pick menu or manually enter new connection information.

## Limitations
Due to the limited functionality of VSCode's terminal API, there are several constraints:
- Terminal naming when splitting is only available manually.
- Terminal icon color specification is only available manually.
- The extension cannot monitor the status of SSH sessions.
- The extension operates within VSCode's native terminal, so it depends on terminal-specific settings.

## Usage
1. Open the command palette (`Ctrl + Shift + P`).
1. Execute the `Terminal-SSH: ◯◯◯` command.
1. You can also select from the `Open a Remote Window` option.
![menu](resources/img-01.png)
1. When you connect to a selected host, a new terminal will be opened.

## Configuration
You can specify a custom SSH configuration file in `settings.json`:
```json
{
  "terminal-ssh.sshConfigPath": "C:\\tmp\\custom-config"
}
```