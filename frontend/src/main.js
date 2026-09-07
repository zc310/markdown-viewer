import {ExportPDF, InitialPath, OpenFile, OpenExternal, PendingPaths, ReadAsset, ReadDocument, ResolveDocumentLink, StartWatching, StopWatching} from '../wailsjs/go/main/App';
import {EventsOn, OnFileDrop, BrowserOpenURL, WindowSetTitle} from '../wailsjs/runtime/runtime.js';
import './style.css';
import './app.css';

const themes = {
    'adw-dracula': {label: 'adw-dracula'},
    'adw-everforest': {label: 'adw-everforest'},
    'adw-gruvbox': {label: 'adw-gruvbox'},
    'adw-nord': {label: 'adw-nord'},
    'adw-solarized': {label: 'adw-solarized'},
    'Peninsula-dark': {label: 'Peninsula-dark'},
    'Plano2': {label: 'Plano2'},
};

const app = document.querySelector('#app');
const state = {
    path: '',
    document: null,
    tabs: [],
    fontScale: 1,
    theme: localStorage.getItem('markdown-viewer-theme') || 'adw-everforest',
};
if (!themes[state.theme]) state.theme = 'adw-everforest';

app.innerHTML = `
    <div class="shell" data-theme="${state.theme}">
        <header class="topbar">
            <div class="brand-mark" aria-hidden="true">M</div>
            <div class="title-area">
                <div class="app-name">Markdown Viewer</div>
                <div class="file-title" id="file-title">未打开文件</div>
            </div>
            <div class="toolbar">
                <button class="tool-button primary" id="open-button" title="打开文件 (Ctrl+O)"><span class="button-icon">+</span>打开</button>
                <button class="tool-button" id="export-button" title="导出当前文档为 PDF" disabled><span class="button-icon">↓</span>PDF</button>
                <label class="theme-picker" title="选择主题">
                    <span class="theme-swatch" aria-hidden="true"></span>
                    <select id="theme-select" aria-label="选择主题">
                        ${Object.entries(themes).map(([value, theme]) => `<option value="${value}"${value === state.theme ? ' selected' : ''}>${theme.label}</option>`).join('')}
                    </select>
                </label>
                <button class="icon-button" id="decrease-button" title="减小字号" aria-label="减小字号">A−</button>
                <button class="icon-button" id="increase-button" title="增大字号" aria-label="增大字号">A+</button>
            </div>
        </header>
        <nav class="tabbar" id="tabbar" aria-label="已打开的文档" hidden></nav>
        <main class="workspace">
            <section class="reader-panel" id="drop-target">
                <div class="drop-hint" id="drop-hint">
                    <div class="empty-symbol">#</div>
                    <h1>打开一篇 Markdown 文档</h1>
                    <p>将 .md 文件拖到这里，或使用打开按钮开始阅读。</p>
                    <button class="tool-button primary empty-button" id="empty-open-button">选择文件</button>
                </div>
                <article class="markdown-body" id="markdown-body" hidden></article>
            </section>
        </main>
        <footer class="statusbar">
            <span class="status-dot" id="status-dot"></span>
            <span id="status-text">等待打开文件</span>
            <span class="status-spacer"></span>
            <span id="status-meta"></span>
        </footer>
        <button class="back-to-top" id="back-to-top" type="button" title="返回顶部" aria-label="返回顶部">↑</button>
        <div class="toast" id="toast" role="status" aria-live="polite"></div>
    </div>
`;

const shell = document.querySelector('.shell');
const body = document.querySelector('#markdown-body');
const dropHint = document.querySelector('#drop-hint');
const fileTitle = document.querySelector('#file-title');
const statusText = document.querySelector('#status-text');
const statusMeta = document.querySelector('#status-meta');
const statusDot = document.querySelector('#status-dot');
const readerPanel = document.querySelector('#drop-target');
const toast = document.querySelector('#toast');
const topbar = document.querySelector('.topbar');
const tabbar = document.querySelector('#tabbar');
const themeSelect = document.querySelector('#theme-select');
const backToTop = document.querySelector('#back-to-top');
const exportButton = document.querySelector('#export-button');
let lastScrollTop = 0;

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[character]));
}

function safeUrl(url) {
    const value = String(url || '').trim();
    if (/^(https?:\/\/|mailto:)/i.test(value)) return value;
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/i.test(value)) return '';
    return value;
}

function safeImageUrl(url) {
    const value = String(url || '').trim();
    if (/^https?:\/\//i.test(value)) return value;
    if (/^data:image\/(?:png|jpe?g|gif|webp|svg\+xml);/i.test(value)) return value;
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/i.test(value)) return '';
    return value;
}

function decodeLocalPath(path) {
    try {
        return decodeURIComponent(path);
    } catch (_) {
        return path;
    }
}

function renderInline(value) {
    const tokens = [];
    const token = (html) => {
        const key = `\u0000${tokens.length}\u0000`;
        tokens.push(html);
        return key;
    };
    let text = escapeHtml(value);
    const imageToken = (alt, url, title) => {
        const cleanUrl = safeImageUrl(url.trim());
        if (!cleanUrl) return escapeHtml(alt);
        const attributes = `class="md-image" data-src="${escapeHtml(cleanUrl)}" alt="${escapeHtml(alt)}"${title ? ` title="${escapeHtml(title)}"` : ''}`;
        return token(`<img ${attributes} src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=" />`);
    };
    text = text.replace(/!\[([^\]]*)\]\(<([^>]+)>(?:\s+["']([^"']*)["'])?\)/g, (_, alt, url, title) => imageToken(alt, url, title));
    text = text.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+["']([^"']*)["'])?\)/g, (_, alt, url, title) => imageToken(alt, url, title));
    text = text.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+["']([^"']*)["'])?\)/g, (_, label, url, title) => {
        const cleanUrl = safeUrl(url);
        if (!cleanUrl) return label;
        return token(`<a class="md-link" data-href="${escapeHtml(cleanUrl)}"${title ? ` title="${escapeHtml(title)}"` : ''}>${label}</a>`);
    });
    text = text.replace(/`([^`]+)`/g, (_, code) => token(`<code>${code}</code>`));
    text = text.replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, (_, strongA, strongB) => `<strong>${strongA || strongB}</strong>`);
    text = text.replace(/~~([^~]+)~~/g, '<del>$1</del>');
    text = text.replace(/\*([^*]+)\*|_([^_]+)_/g, (_, emphasisA, emphasisB) => `<em>${emphasisA || emphasisB}</em>`);
    text = text.replace(/  $/g, '<br>');
    return text.replace(/\u0000(\d+)\u0000/g, (_, index) => tokens[Number(index)]);
}

function isTableDivider(line) {
    return /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function splitTableRow(line) {
    let value = line.trim();
    if (value.startsWith('|')) value = value.slice(1);
    if (value.endsWith('|')) value = value.slice(0, -1);
    return value.split('|').map((cell) => cell.trim());
}

function renderMarkdown(source) {
    const lines = String(source || '').replace(/\r\n?/g, '\n').split('\n');
    const html = [];
    let index = 0;
    let paragraph = [];
    let listType = '';
    let inQuote = false;

    const closeList = () => {
        if (listType) {
            html.push(`</${listType}>`);
            listType = '';
        }
    };
    const closeQuote = () => {
        if (inQuote) {
            html.push('</blockquote>');
            inQuote = false;
        }
    };
    const flushParagraph = () => {
        if (paragraph.length) {
            html.push(`<p>${paragraph.map(renderInline).join('<br>')}</p>`);
            paragraph = [];
        }
    };

    while (index < lines.length) {
        const line = lines[index];
        const fence = line.match(/^\s*(```+|~~~+)\s*([^\s]*)\s*$/);
        if (fence) {
            flushParagraph(); closeList(); closeQuote();
            const marker = fence[1][0];
            const code = [];
            index += 1;
            while (index < lines.length && !new RegExp(`^\\s*${marker}{3,}\\s*$`).test(lines[index])) {
                code.push(lines[index]); index += 1;
            }
            if (index < lines.length) index += 1;
            html.push(`<pre><code class="language-${escapeHtml(fence[2] || 'text')}">${escapeHtml(code.join('\n'))}</code></pre>`);
            continue;
        }
        const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
        if (heading) {
            flushParagraph(); closeList(); closeQuote();
            const level = heading[1].length;
            html.push(`<h${level} id="heading-${html.length}">${renderInline(heading[2])}</h${level}>`);
            index += 1; continue;
        }
        if (index + 1 < lines.length && line.includes('|') && isTableDivider(lines[index + 1])) {
            flushParagraph(); closeList(); closeQuote();
            const header = splitTableRow(line);
            index += 2;
            const rows = [];
            while (index < lines.length && lines[index].includes('|') && lines[index].trim() !== '') {
                rows.push(splitTableRow(lines[index])); index += 1;
            }
            html.push('<div class="table-wrap"><table><thead><tr>' + header.map((cell) => `<th>${renderInline(cell)}</th>`).join('') + '</tr></thead><tbody>');
            rows.forEach((row) => {
                html.push('<tr>' + header.map((_, cellIndex) => `<td>${renderInline(row[cellIndex] || '')}</td>`).join('') + '</tr>');
            });
            html.push('</tbody></table></div>');
            continue;
        }
        const quote = line.match(/^\s{0,3}> ?(.*)$/);
        if (quote) {
            flushParagraph(); closeList();
            if (!inQuote) { html.push('<blockquote>'); inQuote = true; }
            html.push(`<p>${renderInline(quote[1])}</p>`);
            index += 1; continue;
        }
        if (line.trim() === '') {
            flushParagraph(); closeList(); closeQuote(); index += 1; continue;
        }
        const list = line.match(/^\s{0,3}([-+*]|\d+[.)])\s+(.*)$/);
        if (list) {
            flushParagraph(); closeQuote();
            const type = /^\d/.test(list[1]) ? 'ol' : 'ul';
            if (listType && listType !== type) closeList();
            if (!listType) { listType = type; html.push(`<${type}>`); }
            let item = list[2];
            const task = item.match(/^\[([ xX])\]\s+(.*)$/);
            if (task) item = `<label class="task"><input type="checkbox" disabled ${task[1].toLowerCase() === 'x' ? 'checked' : ''}><span>${renderInline(task[2])}</span></label>`;
            else item = renderInline(item);
            html.push(`<li>${item}</li>`);
            index += 1; continue;
        }
        if (/^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
            flushParagraph(); closeList(); closeQuote(); html.push('<hr>'); index += 1; continue;
        }
        closeList(); closeQuote(); paragraph.push(line); index += 1;
    }
    flushParagraph(); closeList(); closeQuote();
    return html.join('\n');
}

function setStatus(text, tone = 'ready') {
    statusText.textContent = text;
    statusDot.dataset.tone = tone;
}

function showToast(message) {
    toast.textContent = message;
    toast.classList.add('visible');
    clearTimeout(showToast.timeout);
    showToast.timeout = setTimeout(() => toast.classList.remove('visible'), 2600);
}

async function hydrateImages() {
    const images = [...body.querySelectorAll('.md-image')];
    await Promise.all(images.map(async (image) => {
        const source = image.dataset.src;
        if (/^https?:\/\//i.test(source)) {
            image.src = source;
            return;
        }
        if (/^data:image\//i.test(source)) {
            image.src = source;
            return;
        }
        try {
            const asset = await ReadAsset(state.path, decodeLocalPath(source));
            image.src = asset.dataURI;
            image.removeAttribute('data-src');
        } catch (_) {
            image.replaceWith(Object.assign(document.createElement('span'), {className: 'missing-image', textContent: `[图片无法加载: ${source}]`}));
        }
    }));
}

function renderTabs() {
    tabbar.replaceChildren();
    tabbar.hidden = state.tabs.length < 2;
    state.tabs.forEach((tab) => {
        const item = document.createElement('div');
        item.className = `tab-item${tab.path === state.path ? ' is-active' : ''}`;
        item.dataset.path = tab.path;

        const select = document.createElement('button');
        select.className = 'tab-select';
        select.type = 'button';
        select.textContent = tab.document.name;
        select.title = tab.path;

        const close = document.createElement('button');
        close.className = 'tab-close';
        close.type = 'button';
        close.title = `关闭 ${tab.document.name}`;
        close.setAttribute('aria-label', `关闭 ${tab.document.name}`);
        close.textContent = '×';

        item.append(select, close);
        tabbar.append(item);
    });
}

async function clearDocument() {
    await StopWatching();
    state.path = '';
    state.document = null;
    body.replaceChildren();
    body.hidden = true;
    dropHint.hidden = false;
    fileTitle.textContent = '未打开文件';
    fileTitle.removeAttribute('title');
    statusMeta.textContent = '';
    setStatus('等待打开文件', 'ready');
    WindowSetTitle('Markdown Viewer');
    readerPanel.scrollTop = 0;
    lastScrollTop = 0;
    topbar.classList.remove('is-hidden');
    backToTop.classList.remove('is-visible');
    exportButton.disabled = true;
    renderTabs();
}

async function closeTab(path) {
    const index = state.tabs.findIndex((tab) => tab.path === path);
    if (index < 0) return;
    const wasActive = state.tabs[index].path === state.path;
    state.tabs.splice(index, 1);
    if (!state.tabs.length) {
        await clearDocument();
        return;
    }
    if (wasActive) {
        const nextTab = state.tabs[Math.min(index, state.tabs.length - 1)];
        await openPath(nextTab.path, false);
    } else {
        renderTabs();
    }
}

async function loadPath(path, announce = true) {
    if (!path) return;
    setStatus('正在读取…', 'busy');
    try {
        const documentData = await ReadDocument(path);
        state.path = documentData.path;
        state.document = documentData;
        const existingTab = state.tabs.find((tab) => tab.path === documentData.path);
        if (existingTab) {
            existingTab.document = documentData;
        } else {
            state.tabs.push({path: documentData.path, document: documentData});
        }
        renderTabs();
        body.innerHTML = renderMarkdown(documentData.content);
        body.hidden = false;
        dropHint.hidden = true;
        fileTitle.textContent = documentData.name;
        fileTitle.title = documentData.path;
        statusMeta.textContent = `${formatBytes(documentData.size)}  ·  ${formatDate(documentData.modifiedAt)}`;
        setStatus('已打开', 'ready');
        WindowSetTitle(`${documentData.name} - Markdown Viewer`);
        readerPanel.scrollTop = 0;
        lastScrollTop = 0;
        topbar.classList.remove('is-hidden');
        exportButton.disabled = false;
        backToTop.classList.remove('is-visible');
        await StartWatching(documentData.path);
        hydrateImages();
        if (announce) showToast(`已打开 ${documentData.name}`);
    } catch (error) {
        setStatus('打开失败', 'error');
        showToast(error?.message || String(error));
    }
}

let openSequence = Promise.resolve();
function openPath(path, announce = true) {
    openSequence = openSequence.then(() => loadPath(path, announce));
    return openSequence;
}

function formatBytes(size) {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.valueOf()) ? '' : date.toLocaleString([], {dateStyle: 'short', timeStyle: 'short'});
}

async function chooseFile() {
    try {
        const path = await OpenFile();
        if (path) await openPath(path);
    } catch (error) {
        showToast(error?.message || String(error));
    }
}

function setTheme(theme) {
    if (!themes[theme]) return;
    state.theme = theme;
    shell.dataset.theme = theme;
    localStorage.setItem('markdown-viewer-theme', theme);
    themeSelect.value = theme;
}

readerPanel.addEventListener('scroll', () => {
    const currentScrollTop = Math.max(0, readerPanel.scrollTop);
    if (currentScrollTop <= 8 || currentScrollTop < lastScrollTop - 4) {
        topbar.classList.remove('is-hidden');
    } else if (currentScrollTop > lastScrollTop + 4) {
        topbar.classList.add('is-hidden');
    }
    backToTop.classList.toggle('is-visible', currentScrollTop > readerPanel.clientHeight);
    lastScrollTop = currentScrollTop;
});

backToTop.addEventListener('click', () => {
    readerPanel.scrollTo({top: 0, behavior: 'smooth'});
    topbar.classList.remove('is-hidden');
});

tabbar.addEventListener('click', async (event) => {
    const item = event.target.closest('.tab-item');
    if (!item) return;
    if (event.target.closest('.tab-close')) {
        await closeTab(item.dataset.path);
    } else {
        await openPath(item.dataset.path, false);
    }
});

document.querySelector('#open-button').addEventListener('click', chooseFile);
document.querySelector('#empty-open-button').addEventListener('click', chooseFile);
themeSelect.addEventListener('change', (event) => setTheme(event.target.value));
exportButton.addEventListener('click', async () => {
    if (!state.path) return;
    try {
        await ExportPDF();
    } catch (error) {
        showToast(error?.message || String(error));
    }
});
document.querySelector('#decrease-button').addEventListener('click', () => {
    state.fontScale = Math.max(0.85, state.fontScale - 0.05);
    body.style.setProperty('--reader-scale', state.fontScale);
});
document.querySelector('#increase-button').addEventListener('click', () => {
    state.fontScale = Math.min(1.3, state.fontScale + 0.05);
    body.style.setProperty('--reader-scale', state.fontScale);
});

body.addEventListener('click', async (event) => {
    const link = event.target.closest('.md-link');
    if (!link) return;
    event.preventDefault();
    const href = link.dataset.href;
    if (/^https?:\/\//i.test(href)) {
        try { await OpenExternal(href); } catch (_) { BrowserOpenURL(href); }
    } else if (/\.(md|markdown)(?:#.*)?$/i.test(href)) {
        try { await openPath(await ResolveDocumentLink(state.path, href)); } catch (_) { showToast('无法打开相对 Markdown 链接'); }
    } else {
        showToast('此链接不支持在阅读器中打开');
    }
});

document.addEventListener('keydown', async (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'o') { event.preventDefault(); await chooseFile(); }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'r' && state.path) { event.preventDefault(); await openPath(state.path, false); }
    if ((event.ctrlKey || event.metaKey) && (event.key === '+' || event.key === '=')) { event.preventDefault(); document.querySelector('#increase-button').click(); }
    if ((event.ctrlKey || event.metaKey) && event.key === '-') { event.preventDefault(); document.querySelector('#decrease-button').click(); }
});

EventsOn('document:opened', (path) => openPath(path));
EventsOn('document:changed', (path) => {
    if (path === state.path) openPath(path, false);
});
EventsOn('document:error', (message) => {
    if (state.path) setStatus(message, 'error');
});
try {
    OnFileDrop((_, __, paths) => {
        const path = paths?.find((candidate) => /\.(md|markdown)$/i.test(candidate));
        if (path) openPath(path);
        else showToast('请选择 .md 或 .markdown 文件');
    }, true);
} catch (_) {
    // The browser preview does not provide the native Wails drag-and-drop bridge.
}

Promise.resolve().then(async () => {
    const initial = await InitialPath();
    if (initial) await openPath(initial, false);
    const pending = await PendingPaths();
    for (const path of pending || []) await openPath(path, false);
});
