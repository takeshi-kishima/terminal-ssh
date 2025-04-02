import * as fs from "fs";
import * as path from "path";

// コピー元とコピー先のディレクトリ
const resourcesToCopy = [
  {
    from: "node_modules/xterm/lib/xterm.js",
    to: "media/xterm/lib/xterm.js",
  },
  {
    from: "node_modules/xterm/css/xterm.css",
    to: "media/xterm/css/xterm.css",
  },
  {
    from: "node_modules/xterm-addon-fit/lib/xterm-addon-fit.js",
    to: "media/xterm-addon-fit/lib/xterm-addon-fit.js",
  },
  {
    from: "src/webview/terminal.html",
    to: "media/webview/terminal.html",
  },
  {
    from: "src/webview/terminal.css",
    to: "media/webview/terminal.css",
  },
  {
    from: "src/webview/terminal.js",
    to: "media/webview/terminal.js",
  },
];

// リソースの型定義
interface Resource {
  from: string;
  to: string;
}

// ディレクトリが存在しない場合は作成する
function ensureDirectoryExists(filePath: string): boolean {
  const dirname = path.dirname(filePath);
  if (fs.existsSync(dirname)) {
    return true;
  }
  ensureDirectoryExists(dirname);
  fs.mkdirSync(dirname);
  return true;
}

// ファイルをコピーする
resourcesToCopy.forEach((resource: Resource) => {
  try {
    ensureDirectoryExists(resource.to);
    fs.copyFileSync(resource.from, resource.to);
    console.log(`Copied: ${resource.from} -> ${resource.to}`);
  } catch (err: any) {
    console.error(`Error copying ${resource.from}: ${err.message}`);
  }
});
