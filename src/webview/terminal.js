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
            console.log("FitAddon used for resizing");
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

resizeHandle.addEventListener('mousedown', function (e) {
    isResizing = true;
    lastX = e.clientX;
    lastY = e.clientY;
    e.preventDefault();
});

document.addEventListener('mousemove', function (e) {
    if (!isResizing) {
        return;
    }

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

document.addEventListener('mouseup', function (e) {
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
terminalContainer.addEventListener('wheel', function (e) {
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
            term.write('\r\n\r\nConnection closed (exit code: ' + message.code + ')\r\n');
            break;
    }
});

// FitAddonのロードを試みる（読み込みが遅延している可能性があるため）
setTimeout(() => {
    if (loadFitAddon()) {
        console.log("Successfully loaded FitAddon");
        fitAddon.fit();
        console.log("FitAddon used for resizing");
    }

    // 初期化完了を通知
    term.focus();
    vscode.postMessage({ type: 'ready' });
    term.write('Connecting to SSH server...\r\n');
}, 300);