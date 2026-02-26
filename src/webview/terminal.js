// VSCode API access
const vscode = acquireVsCodeApi();

// DOM elements
const terminalContainer = document.getElementById('terminal-container');
const statusElement = document.getElementById('status');
const colorMenu = document.getElementById('color-menu');
const colorMenuToggle = document.getElementById('color-menu-toggle');
const colorMenuHandle = document.getElementById('color-menu-handle');
const foregroundInput = document.getElementById('foreground-input');
const backgroundInput = document.getElementById('background-input');
const applyColorsButton = document.getElementById('apply-colors');

const DEFAULT_COLORS = {
    background: '#1e1e1e',
    foreground: '#f0f0f0'
};
let currentColors = { ...DEFAULT_COLORS };

// Create terminal
const term = new Terminal({
    fontFamily: 'Consolas, "Courier New", monospace',
    fontSize: 14,
    theme: {
        background: DEFAULT_COLORS.background,
        foreground: DEFAULT_COLORS.foreground
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

// Open terminal
term.open(terminalContainer);

// FitAddon state
let fitAddon = null;

function loadFitAddon() {
    try {
        if (typeof window.FitAddon === 'function') {
            fitAddon = new window.FitAddon();
        } else if (window.FitAddon && typeof window.FitAddon.FitAddon === 'function') {
            fitAddon = new window.FitAddon.FitAddon();
        } else {
            return false;
        }

        term.loadAddon(fitAddon);
        return true;
    } catch (e) {
        console.error('Error loading FitAddon:', e);
        fitAddon = null;
        return false;
    }
}

function updateTerminalSize() {
    if (fitAddon) {
        try {
            fitAddon.fit();
        } catch (e) {
            console.error('Error using fitAddon:', e);
        }
    }
}

function ensureScrollVisibility() {
    const viewport = document.querySelector('.xterm-viewport');
    if (viewport) {
        setTimeout(() => {
            viewport.scrollTop = viewport.scrollHeight;
        }, 50);
    }
}

function setStatus(message) {
    if (!statusElement) {
        return;
    }
    statusElement.textContent = message;
    if (message) {
        setTimeout(() => {
            if (statusElement.textContent === message) {
                statusElement.textContent = '';
            }
        }, 2000);
    }
}

function isValidCssColor(value) {
    return typeof value === 'string' && value.trim().length > 0 && CSS.supports('color', value.trim());
}

function applyTerminalColors(foreground, background, showStatus = true) {
    const nextForeground = typeof foreground === 'string' && foreground.trim() !== ''
        ? foreground.trim()
        : currentColors.foreground;
    const nextBackground = typeof background === 'string' && background.trim() !== ''
        ? background.trim()
        : currentColors.background;

    if (!isValidCssColor(nextForeground) || !isValidCssColor(nextBackground)) {
        if (showStatus) {
            setStatus('Invalid color code');
        }
        return;
    }

    currentColors = {
        foreground: nextForeground,
        background: nextBackground
    };

    term.options.theme = {
        ...(term.options.theme || {}),
        foreground: currentColors.foreground,
        background: currentColors.background
    };
    terminalContainer.style.backgroundColor = currentColors.background;
    if (showStatus) {
        setStatus('Color updated');
    }
}

function setupColorMenu() {
    if (!colorMenu || !colorMenuToggle || !applyColorsButton || !foregroundInput || !backgroundInput) {
        return;
    }

    foregroundInput.value = currentColors.foreground;
    backgroundInput.value = currentColors.background;

    let suppressToggleClick = false;

    colorMenuToggle.addEventListener('click', () => {
        if (suppressToggleClick) {
            suppressToggleClick = false;
            return;
        }
        colorMenu.classList.toggle('is-collapsed');
    });

    const applyFromInputs = () => {
        applyTerminalColors(foregroundInput.value, backgroundInput.value);
    };

    applyColorsButton.addEventListener('click', applyFromInputs);
    foregroundInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            applyFromInputs();
        }
    });
    backgroundInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            applyFromInputs();
        }
    });

    let dragging = false;
    let moved = false;
    let dragOffsetX = 0;
    let dragOffsetY = 0;
    let activePointerId = null;

    const startDrag = (event) => {
        if (event.button !== 0) {
            return;
        }
        dragging = true;
        moved = false;
        activePointerId = event.pointerId;
        const rect = colorMenu.getBoundingClientRect();
        dragOffsetX = event.clientX - rect.left;
        dragOffsetY = event.clientY - rect.top;
        colorMenu.style.right = 'auto';
        colorMenu.style.bottom = 'auto';
        event.preventDefault();
    };

    const moveDrag = (event) => {
        if (!dragging || activePointerId !== event.pointerId) {
            return;
        }

        moved = true;
        const maxLeft = Math.max(0, window.innerWidth - colorMenu.offsetWidth);
        const maxTop = Math.max(0, window.innerHeight - colorMenu.offsetHeight);
        const nextLeft = Math.min(Math.max(0, event.clientX - dragOffsetX), maxLeft);
        const nextTop = Math.min(Math.max(0, event.clientY - dragOffsetY), maxTop);

        colorMenu.style.left = `${nextLeft}px`;
        colorMenu.style.top = `${nextTop}px`;
    };

    const endDrag = (event) => {
        if (!dragging || activePointerId !== event.pointerId) {
            return;
        }
        dragging = false;
        activePointerId = null;

        if (moved) {
            suppressToggleClick = true;
            setTimeout(() => {
                suppressToggleClick = false;
            }, 0);
        }
    };

    colorMenuToggle.addEventListener('pointerdown', startDrag);
    if (colorMenuHandle) {
        colorMenuHandle.addEventListener('pointerdown', startDrag);
    }

    window.addEventListener('pointermove', moveDrag);
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
}

window.addEventListener('resize', updateTerminalSize);

if (window.ResizeObserver) {
    new ResizeObserver(updateTerminalSize).observe(terminalContainer);
}

terminalContainer.addEventListener('wheel', function () {
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

term.onData((data) => {
    vscode.postMessage({ type: 'input', data: data });
});

window.addEventListener('message', (event) => {
    const message = event.data;

    switch (message.type) {
        case 'output':
            term.write(message.data);
            ensureScrollVisibility();
            break;
        case 'exit':
            vscode.postMessage({ type: 'closePanel' });
            break;
        case 'setBackground':
            applyTerminalColors(currentColors.foreground, message.color);
            break;
        case 'setColors':
            if (message.colors) {
                applyTerminalColors(message.colors.foreground, message.colors.background, false);
                if (foregroundInput) {
                    foregroundInput.value = currentColors.foreground;
                }
                if (backgroundInput) {
                    backgroundInput.value = currentColors.background;
                }
            }
            break;
    }
});

setupColorMenu();

setTimeout(() => {
    if (loadFitAddon()) {
        fitAddon.fit();
    }

    term.focus();
    vscode.postMessage({ type: 'ready' });
    term.write('Connecting to SSH server...\r\n');
}, 300);
