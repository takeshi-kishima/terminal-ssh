# Change Log

All notable changes to the "terminal-ssh" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

- エディタの分割機能を使って接続 -> 表示できるようにしたい

## [0.9.2] - 2026-02-26

### Added

- ターミナル Webview にカラー設定メニューを追加
- カラーメニューのドラッグ移動に対応
- メニューの展開/折りたたみ UI を追加（初期は折りたたみ）
- 文字色・背景色の入力と適用機能を追加
- `terminal-ssh.defaultColors` と `terminal-ssh.hostColors` 設定を追加
- README に色設定の説明を追加

## [0.9.0] - 2025-05-06

### Added

- VS Code のエディタペイン上で SSH 接続を表示する機能を追加

### Changed

- 「Open a Remote Window」経由でも接続できる導線を追加

## [0.0.1] - 2025-04-06

### Added

- Initial release
- SSH 設定ファイルからホストを読み込んで接続する基本機能
- VS Code 上で SSH ターミナルを起動する基本機能
