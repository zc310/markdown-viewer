import {ExportPDF, InitialPath, OpenFile, OpenExternal, PendingPaths, ReadAsset, ReadDocument, ResolveDocumentLink, StartWatching, StopWatching} from '../wailsjs/go/main/App';
import {EventsOn, OnFileDrop, BrowserOpenURL, ClipboardGetText, WindowSetTitle} from '../wailsjs/runtime/runtime.js';
import MarkdownIt from 'markdown-it';
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
const appVersion = '0.0.3';
const recentFilesStorageKey = 'markdown-viewer-recent-files';
const maxRecentFiles = 12;

function loadRecentFiles() {
    try {
        const files = JSON.parse(localStorage.getItem(recentFilesStorageKey) || '[]');
        if (!Array.isArray(files)) return [];
        const seen = new Set();
        return files.filter((file) => {
            if (!file || typeof file.path !== 'string' || !file.path || seen.has(file.path)) return false;
            seen.add(file.path);
            return true;
        }).slice(0, maxRecentFiles);
    } catch (_) {
        return [];
    }
}

const app = document.querySelector('#app');
const state = {
    path: '',
    document: null,
    tabs: [],
    outline: [],
    outlineVisible: true,
    fontScale: 1,
    theme: localStorage.getItem('markdown-viewer-theme') || 'adw-everforest',
    recentFiles: loadRecentFiles(),
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
                <button class="tool-button recent-button" id="recent-button" title="查看最近打开的文件" aria-expanded="false" aria-controls="recent-menu"><span class="button-icon">◷</span>最近</button>
                <button class="tool-button" id="paste-button" title="粘贴剪贴板中的 Markdown 文本"><span class="button-icon">↳</span>粘贴</button>
                <button class="tool-button" id="export-button" title="导出当前文档为 PDF" disabled><span class="button-icon">↓</span>PDF</button>
                <button class="icon-button outline-toggle" id="outline-button" type="button" title="显示文档导航" aria-label="显示文档导航" aria-expanded="false" aria-pressed="false" hidden>☰</button>
                <button class="icon-button about-button" id="about-button" type="button" title="关于 Markdown Viewer" aria-label="关于 Markdown Viewer">!</button>
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
        <section class="recent-menu" id="recent-menu" aria-label="最近打开的文件" hidden>
            <div class="recent-header">
                <div>
                    <div class="recent-kicker">HISTORY</div>
                    <div class="recent-title">最近打开</div>
                </div>
                <button class="recent-clear" id="recent-clear" type="button">清空</button>
            </div>
            <div class="recent-list" id="recent-list"></div>
            <div class="recent-empty" id="recent-empty">还没有最近打开的文件</div>
        </section>
        <nav class="tabbar" id="tabbar" aria-label="已打开的文档" hidden></nav>
        <main class="workspace">
            <aside class="document-outline" id="document-outline" hidden>
                <div class="outline-header">
                    <div>
                        <div class="outline-kicker">ON THIS PAGE</div>
                        <div class="outline-title">文档导航</div>
                    </div>
                    <button class="outline-close" id="outline-close" type="button" title="关闭文档导航" aria-label="关闭文档导航">×</button>
                </div>
                <nav class="outline-nav" id="outline-nav" aria-label="文档标题导航"></nav>
            </aside>
            <section class="reader-panel" id="drop-target">
                <div class="drop-hint" id="drop-hint">
                    <div class="empty-symbol">#</div>
                    <h1>打开一篇 Markdown 文档</h1>
                    <p>将 .md 文件拖到这里，或使用打开按钮开始阅读。</p>
                    <div class="empty-actions">
                        <button class="tool-button primary empty-button" id="empty-open-button">选择文件</button>
                        <button class="tool-button empty-button" id="empty-paste-button">粘贴 Markdown</button>
                    </div>
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
        <div class="about-overlay" id="about-dialog" hidden>
            <section class="about-card" role="dialog" aria-modal="true" aria-labelledby="about-title" aria-describedby="about-description" tabindex="-1">
                <button class="about-close" id="about-close" type="button" title="关闭关于窗口" aria-label="关闭关于窗口">×</button>
                <div class="about-icon" aria-hidden="true">!</div>
                <div class="about-kicker">ABOUT</div>
                <h2 id="about-title">Markdown Viewer</h2>
                <a class="about-version" id="about-version" href="https://github.com/zc310/markdown-viewer">版本 ${appVersion}</a>
                <p id="about-description">一个专注于本地 Markdown 阅读的桌面应用，让文档回归清晰、安静和易读。</p>
                <div class="about-tech">Wails · markdown-it · 本地优先</div>
                <button class="tool-button primary about-confirm" id="about-confirm" type="button">知道了</button>
            </section>
        </div>
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
const recentButton = document.querySelector('#recent-button');
const recentMenu = document.querySelector('#recent-menu');
const recentList = document.querySelector('#recent-list');
const recentEmpty = document.querySelector('#recent-empty');
const recentClear = document.querySelector('#recent-clear');
const themeSelect = document.querySelector('#theme-select');
const backToTop = document.querySelector('#back-to-top');
const exportButton = document.querySelector('#export-button');
const pasteButton = document.querySelector('#paste-button');
const emptyPasteButton = document.querySelector('#empty-paste-button');
const outline = document.querySelector('#document-outline');
const outlineNav = document.querySelector('#outline-nav');
const outlineButton = document.querySelector('#outline-button');
const outlineClose = document.querySelector('#outline-close');
const aboutButton = document.querySelector('#about-button');
const aboutDialog = document.querySelector('#about-dialog');
const aboutClose = document.querySelector('#about-close');
const aboutConfirm = document.querySelector('#about-confirm');
const aboutVersion = document.querySelector('#about-version');
let lastScrollTop = 0;
let aboutReturnFocus = null;
let clipboardPreviewCount = 0;

function rememberScrollPosition() {
    const activeTab = state.tabs.find((tab) => tab.path === state.path);
    if (activeTab) activeTab.scrollTop = Math.max(0, readerPanel.scrollTop);
}

function restoreScrollPosition(tab, scrollTop) {
    readerPanel.scrollTop = Math.max(0, scrollTop || 0);
    tab.scrollTop = readerPanel.scrollTop;
    lastScrollTop = readerPanel.scrollTop;
    updateOutlineActive();
    backToTop.classList.toggle('is-visible', readerPanel.scrollTop > readerPanel.clientHeight);
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[character]));
}

const codeLanguageAliases = {
    js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
    ts: 'typescript', tsx: 'typescript', py: 'python', rb: 'ruby', rs: 'rust',
    sh: 'shell', bash: 'shell', zsh: 'shell', yml: 'yaml', html: 'markup',
    xml: 'markup', svg: 'markup', cc: 'cpp', cp: 'cpp', cxx: 'cpp', hpp: 'cpp',
    'c++': 'cpp', cs: 'csharp', 'c#': 'csharp', md: 'markdown', plaintext: 'text',
};

const codeLanguageLabels = {
    text: 'Plain Text', javascript: 'JavaScript', typescript: 'TypeScript',
    python: 'Python', go: 'Go', rust: 'Rust', ruby: 'Ruby', shell: 'Shell',
    json: 'JSON', yaml: 'YAML', markup: 'HTML/XML', css: 'CSS', sql: 'SQL',
    java: 'Java', c: 'C', cpp: 'C++', csharp: 'C#', dockerfile: 'Dockerfile',
    diff: 'Diff', markdown: 'Markdown',
};

const slashCodeRules = [
    ['comment', '//[^\n]*|/\\*[\\s\\S]*?\\*/'],
    ['string', '`(?:\\\\.|[^`\\\\])*`|"(?:\\\\.|[^"\\\\])*"|' + "'(?:\\\\.|[^'\\\\])*'"],
    ['number', '\\b(?:0[xX][\\da-fA-F]+|0[bB][01]+|(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][+-]?\\d+)?)\\b'],
];
const hashCodeRules = [
    ['comment', '#[^\n]*'],
    ['string', '"(?:\\\\.|[^"\\\\])*"|' + "'(?:\\\\.|[^'\\\\])*'"],
    ['number', '\\b(?:0[xX][\\da-fA-F]+|0[bB][01]+|(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][+-]?\\d+)?)\\b'],
];
const sqlCodeRules = [
    ['comment', '--[^\n]*|/\\*[\\s\\S]*?\\*/'],
    ['string', "'(?:''|\\\\.|[^'])*'|\"(?:\"\"|\\\\.|[^\"])*\""],
    ['number', '\\b(?:0[xX][\\da-fA-F]+|(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][+-]?\\d+)?)\\b'],
];
const markupCodeRules = [
    ['comment', '<!--[\\s\\S]*?-->'],
    ['tag', '</?[A-Za-z][^>]*?>'],
    ['string', '"(?:\\\\.|[^"\\\\])*"|' + "'(?:\\\\.|[^'\\\\])*'"],
    ['number', '\\b\\d+(?:\\.\\d+)?\\b'],
];

function codeProfile(keywords, types, rules = slashCodeRules) {
    return {
        keywords: new Set(keywords.split(' ').filter(Boolean).map((word) => word.toLowerCase())),
        types: new Set(types.split(' ').filter(Boolean).map((word) => word.toLowerCase())),
        literals: new Set('true false null undefined nan infinity none nil'.split(' ')),
        rules,
    };
}

const codeProfiles = {
    javascript: codeProfile(
        'as async await break case catch class const continue debugger default delete do else export extends finally for from function get if import in instanceof let new of return set static super switch throw try typeof var void while with yield',
        'Array Boolean Date Error Function Map Math Number Object Promise RegExp Set String Symbol JSON console',
    ),
    typescript: codeProfile(
        'as async await break case catch class const continue debugger default delete do else export extends finally for from function get if implements import in instanceof interface keyof let namespace new of private protected public readonly return set static super switch throw try typeof type var void while with yield',
        'Array Boolean Date Error Function Map Math Number Object Promise RegExp Set String Symbol JSON console',
    ),
    go: codeProfile(
        'break default func interface select case defer go map struct chan else goto package switch const fallthrough if range type continue for import return var',
        'bool byte complex64 complex128 error float32 float64 int int8 int16 int32 int64 rune string uint uint8 uint16 uint32 uint64 uintptr any comparable',
    ),
    rust: codeProfile(
        'as async await break const continue crate else enum extern false fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait true type unsafe use where while dyn',
        'bool char str i8 i16 i32 i64 i128 isize u8 u16 u32 u64 u128 usize f32 f64',
    ),
    python: codeProfile(
        'and as assert async await break case class continue def del elif else except finally for from global if import in is lambda match nonlocal not or pass raise return try while with yield',
        'bool bytes complex dict float frozenset int list object set str tuple type',
        hashCodeRules,
    ),
    ruby: codeProfile(
        'BEGIN END alias and begin break case class def defined do else elsif end ensure false for if in module next nil not or redo rescue retry return self super then true undef unless until when while yield',
        'Array Hash Integer Float String Symbol Time',
        hashCodeRules,
    ),
    shell: codeProfile(
        'if then else elif fi for while in do done case esac function select time coproc return exit export local readonly declare source unset',
        'true false',
        hashCodeRules,
    ),
    json: codeProfile('', '', [
        ['string', '"(?:\\\\.|[^"\\\\])*"'],
        ['number', '-?\\b(?:0|[1-9]\\d*)(?:\\.\\d+)?(?:[eE][+-]?\\d+)?\\b'],
    ]),
    yaml: codeProfile('', '', hashCodeRules),
    markup: codeProfile('', '', markupCodeRules),
    css: codeProfile('important media supports import charset namespace layer', 'inherit initial unset none block inline flex grid absolute relative fixed sticky'),
    sql: codeProfile(
        'select from where and or not insert into values update set delete create alter drop table view index join inner left right full outer on as distinct group by order having limit offset union all null is in exists like between asc desc case when then else end primary key foreign references database',
        'integer bigint decimal numeric real float double varchar char text date timestamp boolean',
        sqlCodeRules,
    ),
    java: codeProfile(
        'abstract assert break case catch class const continue default do else enum extends final finally for goto if implements import instanceof interface native new package private protected public return static strictfp super switch synchronized this throw throws transient try volatile while',
        'boolean byte char double float int long short void String Object Integer Boolean',
    ),
    c: codeProfile(
        'auto break case const continue default do else enum extern for goto if inline register restrict return sizeof static struct switch typedef union unsigned volatile while',
        'char double float int long short void size_t uint8_t uint16_t uint32_t uint64_t',
    ),
    cpp: codeProfile(
        'alignas alignof asm auto bool break case catch class const constexpr continue co_await co_return co_yield decltype default delete do else enum explicit export extern for friend goto if inline mutable namespace new noexcept nullptr operator private protected public register reinterpret_cast requires return static static_assert static_cast struct switch template this thread_local throw try typedef typeid typename union unsigned using virtual void volatile while',
        'char double float int long short void size_t string vector map set',
    ),
    csharp: codeProfile(
        'abstract as base bool break byte case catch char checked class const continue decimal default delegate do double else enum event explicit extern finally fixed float for foreach goto if implicit in int interface internal is lock long namespace new null object operator out override params private protected public readonly ref return sbyte sealed short sizeof stackalloc static string struct switch this throw try typeof uint ulong unchecked unsafe ushort using virtual void volatile while async await var',
        'String Object DateTime Task List Dictionary',
    ),
    dockerfile: codeProfile(
        'from as run cmd label maintainer expose env add copy entrypoint volume user workdir arg onbuild stopsignal healthcheck shell',
        '',
        hashCodeRules,
    ),
    diff: codeProfile('', '', [
        ['comment', '^@@[^\n]*'],
        ['code-add', '^\\+[^\n]*'],
        ['code-remove', '^-{1}[^\n]*'],
    ]),
    markdown: codeProfile('', '', [
        ['comment', '<!--[\\s\\S]*?-->'],
        ['string', '`[^`]*`'],
        ['number', '^#{1,6}[^\n]*'],
    ]),
};

function normalizeCodeLanguage(value) {
    const requested = String(value || '').trim().toLowerCase();
    const safeName = requested.replace(/[^a-z0-9+#._-]/g, '');
    return codeLanguageAliases[safeName] || safeName || 'text';
}

function highlightPlainCode(source, profile) {
    const tokenPattern = /[A-Za-z_$][\w$]*|\b\d+(?:\.\d+)?\b/g;
    const html = [];
    let cursor = 0;
    let match;
    while ((match = tokenPattern.exec(source))) {
        html.push(escapeHtml(source.slice(cursor, match.index)));
        const value = match[0];
        const lower = value.toLowerCase();
        let tokenClass = '';
        if (profile.keywords.has(lower)) tokenClass = 'keyword';
        else if (profile.types.has(lower)) tokenClass = 'type';
        else if (profile.literals.has(lower)) tokenClass = 'literal';
        else if (/^\s*\(/.test(source.slice(match.index + value.length))) tokenClass = 'function';
        html.push(tokenClass ? `<span class="code-token-${tokenClass}">${escapeHtml(value)}</span>` : escapeHtml(value));
        cursor = match.index + value.length;
    }
    html.push(escapeHtml(source.slice(cursor)));
    return html.join('');
}

function highlightCode(source, language) {
    const profile = codeProfiles[language];
    if (!profile) return escapeHtml(source);
    const rules = profile.rules || [];
    if (!rules.length) return highlightPlainCode(source, profile);
    const pattern = new RegExp(rules.map((rule) => `(${rule[1]})`).join('|'), 'gm');
    const html = [];
    let cursor = 0;
    let match;
    while ((match = pattern.exec(source))) {
        html.push(highlightPlainCode(source.slice(cursor, match.index), profile));
        const ruleIndex = match.slice(1).findIndex((part) => part !== undefined);
        const tokenClass = rules[ruleIndex]?.[0] || 'plain';
        const className = tokenClass.startsWith('code-') ? tokenClass : `code-token-${tokenClass}`;
        html.push(`<span class="${className}">${escapeHtml(match[0])}</span>`);
        cursor = match.index + match[0].length;
    }
    html.push(highlightPlainCode(source.slice(cursor), profile));
    return html.join('');
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

async function copyCode(button) {
    const code = button.closest('.code-block')?.querySelector('code');
    if (!code) return;
    const value = code.textContent || '';
    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(value);
        } else {
            const textarea = document.createElement('textarea');
            textarea.value = value;
            textarea.setAttribute('readonly', '');
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.append(textarea);
            textarea.select();
            try {
                if (!document.execCommand('copy')) throw new Error('copy failed');
            } finally {
                textarea.remove();
            }
        }
        button.textContent = '已复制';
        clearTimeout(button.copyTimeout);
        button.copyTimeout = setTimeout(() => { button.textContent = '复制'; }, 1600);
    } catch (_) {
        showToast('复制代码失败');
    }
}

function createHeadingId(value, usedIds) {
    const base = String(value || '').trim().toLowerCase().replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '') || 'heading';
    let id = base;
    let suffix = 2;
    while (usedIds.has(id)) id = `${base}-${suffix++}`;
    usedIds.add(id);
    return id;
}

function headingText(token) {
    return (token.children || []).filter((child) => child.type !== 'image').map((child) => child.content).join('').trim() || token.content.trim();
}

const markdown = new MarkdownIt({
    html: false,
    breaks: true,
    linkify: false,
    typographer: false,
});

function taskLists(md) {
    md.core.ruler.after('inline', 'task-lists', (state) => {
        state.tokens.forEach((token, index) => {
            if (token.type !== 'list_item_open') return;
            let inline;
            for (let cursor = index + 1; cursor < state.tokens.length; cursor += 1) {
                const candidate = state.tokens[cursor];
                if (candidate.type === 'list_item_close' && candidate.level === token.level) break;
                if (candidate.type === 'inline' && candidate.level > token.level) {
                    inline = candidate;
                    break;
                }
            }
            const task = inline?.content.match(/^\[([ xX])\]\s+/);
            if (!task) return;

            token.attrJoin('class', 'task-list-item');
            for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
                const list = state.tokens[cursor];
                if ((list.type === 'bullet_list_open' || list.type === 'ordered_list_open') && list.level < token.level) {
                    const classes = list.attrGet('class') || '';
                    if (!classes.split(/\s+/).includes('contains-task-list')) list.attrSet('class', `${classes} contains-task-list`.trim());
                    break;
                }
            }
            inline.content = inline.content.slice(task[0].length);
            const firstText = inline.children?.find((child) => child.type === 'text');
            if (firstText?.content.startsWith(task[0])) firstText.content = firstText.content.slice(task[0].length);
            inline.children = inline.children || [];
            inline.children.unshift({
                type: 'task_checkbox',
                tag: 'input',
                nesting: 0,
                attrs: [['class', 'task-list-item-checkbox'], ['type', 'checkbox'], ['disabled', 'disabled']],
                content: '',
                level: inline.level,
            });
            if (task[1].toLowerCase() === 'x') inline.children[0].attrs.push(['checked', 'checked']);
        });
    });
    md.renderer.rules.task_checkbox = (tokens, index) => {
        const checked = tokens[index].attrs?.some(([name]) => name === 'checked') ? ' checked' : '';
        return `<input class="task-list-item-checkbox" type="checkbox" disabled${checked}>`;
    };
}
markdown.use(taskLists);
markdown.renderer.rules.heading_open = (tokens, index, _options, env) => {
    const token = tokens[index];
    const heading = tokens[index + 1];
    const usedIds = env.headingIds || (env.headingIds = new Set());
    const id = createHeadingId(headingText(heading), usedIds);
    env.outline.push({level: Number(token.tag.slice(1)), id, text: headingText(heading)});
    return `<${token.tag} id="${escapeHtml(id)}">`;
};
markdown.renderer.rules.fence = (tokens, index) => {
    const token = tokens[index];
    const language = normalizeCodeLanguage(token.info.trim().split(/\s+/)[0]);
    const label = codeLanguageLabels[language] || language;
    const code = token.content.replace(/\n$/, '');
    return `<div class="code-block"><div class="code-toolbar"><span class="code-language">${escapeHtml(label)}</span><button class="code-copy" type="button">复制</button></div><pre><code class="language-${escapeHtml(language)}">${highlightCode(code, language)}</code></pre></div>\n`;
};
markdown.renderer.rules.table_open = () => '<div class="table-wrap"><table>\n';
markdown.renderer.rules.table_close = () => '</table></div>\n';
markdown.renderer.rules.image = (tokens, index) => {
    const token = tokens[index];
    const cleanUrl = safeImageUrl(token.attrGet('src'));
    if (!cleanUrl) return escapeHtml(token.content);
    const title = token.attrGet('title');
    return `<img class="md-image" data-src="${escapeHtml(cleanUrl)}" alt="${escapeHtml(token.content)}"${title ? ` title="${escapeHtml(title)}"` : ''} src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=" />`;
};
markdown.renderer.rules.link_open = (tokens, index) => {
    const token = tokens[index];
    const cleanUrl = safeUrl(token.attrGet('href'));
    token.meta = {safe: Boolean(cleanUrl)};
    if (!cleanUrl) return '<span class="md-unsafe-link">';
    const title = token.attrGet('title');
    return `<a class="md-link" data-href="${escapeHtml(cleanUrl)}"${title ? ` title="${escapeHtml(title)}"` : ''}>`;
};
markdown.renderer.rules.link_close = (tokens, index) => {
    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
        if (tokens[cursor].type === 'link_open' && tokens[cursor].level === tokens[index].level) {
            return tokens[cursor].meta?.safe ? '</a>' : '</span>';
        }
    }
    return '</span>';
};

function renderMarkdown(source) {
    const env = {headingIds: new Set(), outline: []};
    const rendered = markdown.render(String(source || ''), env);
    state.outline = env.outline;
    return rendered;
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

function setAboutOpen(open) {
    const visible = Boolean(open);
    if (visible) aboutReturnFocus = document.activeElement;
    aboutDialog.hidden = !visible;
    document.body.classList.toggle('about-open', visible);
    if (visible) {
        aboutClose.focus();
    } else if (aboutReturnFocus instanceof HTMLElement) {
        aboutReturnFocus.focus();
        aboutReturnFocus = null;
    }
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

function renderOutline() {
    outlineNav.replaceChildren();
    outline.hidden = state.outline.length === 0;
    outlineButton.hidden = state.outline.length === 0;
    outline.classList.toggle('is-collapsed', !state.outlineVisible);
    updateOutlineButton();
    state.outline.forEach((entry) => {
        const link = document.createElement('a');
        link.className = 'outline-item';
        link.dataset.headingId = entry.id;
        link.dataset.level = String(entry.level);
        link.href = `#${entry.id}`;
        link.textContent = entry.text;
        link.title = entry.text;
        outlineNav.append(link);
    });
}

function setOutlineOpen(open) {
    const visible = Boolean(open && state.outline.length);
    outline.classList.toggle('is-open', visible);
    updateOutlineButton();
}

function setOutlineVisibility(visible) {
    state.outlineVisible = Boolean(visible && state.outline.length);
    outline.classList.toggle('is-collapsed', !state.outlineVisible);
    if (!state.outlineVisible) outline.classList.remove('is-open');
    updateOutlineButton();
}

function updateOutlineButton() {
    const mobile = window.matchMedia('(max-width: 800px)').matches;
    const active = mobile ? outline.classList.contains('is-open') : state.outlineVisible;
    outlineButton.setAttribute('aria-expanded', String(mobile && active));
    outlineButton.setAttribute('aria-pressed', String(active));
    outlineButton.title = active ? '隐藏文档导航' : '显示文档导航';
    outlineButton.setAttribute('aria-label', outlineButton.title);
}

function updateOutlineActive() {
    if (!state.outline.length) return;
    const threshold = readerPanel.getBoundingClientRect().top + 80;
    let active = state.outline[0].id;
    for (const entry of state.outline) {
        const heading = document.getElementById(entry.id);
        if (heading && heading.getBoundingClientRect().top <= threshold) active = entry.id;
    }
    outlineNav.querySelectorAll('.outline-item').forEach((link) => link.classList.toggle('is-active', link.dataset.headingId === active));
}

function scrollToHeading(id) {
    const heading = document.getElementById(id);
    if (!heading) return;
    const panelTop = readerPanel.getBoundingClientRect().top;
    const headingTop = heading.getBoundingClientRect().top;
    readerPanel.scrollBy({top: headingTop - panelTop - 24, behavior: 'smooth'});
    setOutlineOpen(false);
    setTimeout(updateOutlineActive, 120);
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
        select.title = tab.temporary ? '剪贴板中的临时 Markdown 预览' : tab.path;

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

function saveRecentFiles() {
    try {
        localStorage.setItem(recentFilesStorageKey, JSON.stringify(state.recentFiles));
    } catch (_) {
        // Recent files are a convenience and should not interrupt opening a document.
    }
}

function renderRecentFiles() {
    recentList.replaceChildren();
    recentEmpty.hidden = state.recentFiles.length > 0;
    recentClear.disabled = state.recentFiles.length === 0;
    state.recentFiles.forEach((file) => {
        const item = document.createElement('button');
        item.className = 'recent-item';
        item.type = 'button';
        item.dataset.path = file.path;
        item.title = file.path;

        const name = document.createElement('span');
        name.className = 'recent-item-name';
        name.textContent = file.name || file.path;
        const path = document.createElement('span');
        path.className = 'recent-item-path';
        path.textContent = file.path;
        item.append(name, path);
        recentList.append(item);
    });
}

function rememberRecentFile(documentData) {
    state.recentFiles = [
        {path: documentData.path, name: documentData.name},
        ...state.recentFiles.filter((file) => file.path !== documentData.path),
    ].slice(0, maxRecentFiles);
    saveRecentFiles();
    renderRecentFiles();
}

function setRecentMenuOpen(open) {
    const visible = Boolean(open);
    if (visible) {
        const buttonRect = recentButton.getBoundingClientRect();
        recentMenu.hidden = false;
        recentMenu.style.top = `${buttonRect.bottom + 7}px`;
        recentMenu.style.left = `${Math.max(15, Math.min(buttonRect.left, window.innerWidth - recentMenu.offsetWidth - 15))}px`;
    } else {
        recentMenu.hidden = true;
    }
    recentButton.setAttribute('aria-expanded', String(visible));
}

async function clearDocument() {
    await StopWatching();
    state.path = '';
    state.document = null;
    state.outline = [];
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
    renderOutline();
    setOutlineOpen(false);
    renderTabs();
}

async function renderTemporaryDocument(tab) {
    rememberScrollPosition();
    await StopWatching();
    const previousScrollTop = tab.scrollTop || 0;
    state.path = tab.path;
    state.document = tab.document;
    body.innerHTML = renderMarkdown(tab.document.content);
    renderOutline();
    setOutlineOpen(false);
    body.hidden = false;
    dropHint.hidden = true;
    fileTitle.textContent = tab.document.name;
    fileTitle.title = '来自系统剪贴板的临时预览';
    statusMeta.textContent = `${formatBytes(tab.document.size)}  ·  临时预览`;
    setStatus('已粘贴预览', 'ready');
    WindowSetTitle(`${tab.document.name} - Markdown Viewer`);
    topbar.classList.remove('is-hidden');
    exportButton.disabled = true;
    renderTabs();
    updateOutlineActive();
    await hydrateImages();
    const restoreScroll = () => restoreScrollPosition(tab, previousScrollTop);
    restoreScroll();
    requestAnimationFrame(restoreScroll);
}

async function pasteMarkdown() {
    let content;
    try {
        try {
            content = await ClipboardGetText();
        } catch (nativeError) {
            if (!navigator.clipboard?.readText) throw nativeError;
            content = await navigator.clipboard.readText();
        }
    } catch (error) {
        showToast(error?.message || '无法读取剪贴板，请检查剪贴板权限');
        return;
    }
    if (!String(content || '').trim()) {
        showToast('剪贴板中没有可预览的 Markdown 文本');
        return;
    }

    const contentText = String(content);
    const tab = {
        path: `clipboard://${Date.now()}-${clipboardPreviewCount}`,
        temporary: true,
        scrollTop: 0,
        document: {
            path: '',
            name: `剪贴板 Markdown ${++clipboardPreviewCount}`,
            content: contentText,
            size: new Blob([contentText]).size,
            modifiedAt: '',
        },
    };
    state.tabs.push(tab);
    await renderTemporaryDocument(tab);
    showToast('已粘贴 Markdown 文本');
}

async function closeTab(path) {
    rememberScrollPosition();
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
        await activateTab(nextTab.path);
    } else {
        renderTabs();
    }
}

async function activateTab(path) {
    const tab = state.tabs.find((candidate) => candidate.path === path);
    if (!tab) return;
    if (tab.temporary) await renderTemporaryDocument(tab);
    else await openPath(tab.path, false);
}

async function loadPath(path, announce = true) {
    if (!path) return;
    rememberScrollPosition();
    const isReload = state.path === path && Boolean(state.document);
    const targetTab = state.tabs.find((tab) => tab.path === path);
    const previousScrollTop = isReload ? readerPanel.scrollTop : targetTab?.scrollTop || 0;
    setStatus('正在读取…', 'busy');
    try {
        const documentData = await ReadDocument(path);
        rememberRecentFile(documentData);
        state.path = documentData.path;
        state.document = documentData;
        const existingTab = state.tabs.find((tab) => tab.path === documentData.path);
        if (existingTab) {
            existingTab.document = documentData;
        } else {
            state.tabs.push({path: documentData.path, document: documentData, scrollTop: 0});
        }
        const activeTab = existingTab || state.tabs[state.tabs.length - 1];
        renderTabs();
        body.innerHTML = renderMarkdown(documentData.content);
        renderOutline();
        setOutlineOpen(false);
        body.hidden = false;
        dropHint.hidden = true;
        fileTitle.textContent = documentData.name;
        fileTitle.title = documentData.path;
        statusMeta.textContent = `${formatBytes(documentData.size)}  ·  ${formatDate(documentData.modifiedAt)}`;
        setStatus('已打开', 'ready');
        WindowSetTitle(`${documentData.name} - Markdown Viewer`);
        topbar.classList.remove('is-hidden');
        exportButton.disabled = false;
        await StartWatching(documentData.path);
        await hydrateImages();
        const restoreScroll = () => {
            restoreScrollPosition(activeTab, previousScrollTop);
        };
        restoreScroll();
        requestAnimationFrame(restoreScroll);
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
    updateOutlineActive();
    const activeTab = state.tabs.find((tab) => tab.path === state.path);
    if (activeTab) activeTab.scrollTop = currentScrollTop;
    lastScrollTop = currentScrollTop;
});

recentButton.addEventListener('click', () => setRecentMenuOpen(recentMenu.hidden));
window.addEventListener('resize', () => {
    if (!recentMenu.hidden) setRecentMenuOpen(true);
});
recentClear.addEventListener('click', () => {
    state.recentFiles = [];
    saveRecentFiles();
    renderRecentFiles();
});
recentList.addEventListener('click', async (event) => {
    const item = event.target.closest('.recent-item');
    if (!item) return;
    setRecentMenuOpen(false);
    await openPath(item.dataset.path);
});
document.addEventListener('click', (event) => {
    if (!recentMenu.hidden && !recentMenu.contains(event.target) && !recentButton.contains(event.target)) {
        setRecentMenuOpen(false);
    }
});

backToTop.addEventListener('click', () => {
    readerPanel.scrollTo({top: 0, behavior: 'smooth'});
    topbar.classList.remove('is-hidden');
});

outlineButton.addEventListener('click', () => {
    if (window.matchMedia('(max-width: 800px)').matches) setOutlineOpen(!outline.classList.contains('is-open'));
    else setOutlineVisibility(!state.outlineVisible);
});
outlineClose.addEventListener('click', () => setOutlineOpen(false));
outlineNav.addEventListener('click', (event) => {
    const link = event.target.closest('.outline-item');
    if (!link) return;
    event.preventDefault();
    scrollToHeading(link.dataset.headingId);
});

tabbar.addEventListener('click', async (event) => {
    const item = event.target.closest('.tab-item');
    if (!item) return;
    if (event.target.closest('.tab-close')) {
        await closeTab(item.dataset.path);
    } else {
        await activateTab(item.dataset.path);
    }
});

document.querySelector('#open-button').addEventListener('click', chooseFile);
document.querySelector('#empty-open-button').addEventListener('click', chooseFile);
pasteButton.addEventListener('click', pasteMarkdown);
emptyPasteButton.addEventListener('click', pasteMarkdown);
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
aboutButton.addEventListener('click', () => setAboutOpen(true));
aboutClose.addEventListener('click', () => setAboutOpen(false));
aboutConfirm.addEventListener('click', () => setAboutOpen(false));
aboutDialog.addEventListener('click', (event) => {
    if (event.target === aboutDialog) setAboutOpen(false);
});
aboutVersion.addEventListener('click', async (event) => {
    event.preventDefault();
    try { await OpenExternal(aboutVersion.href); } catch (_) { BrowserOpenURL(aboutVersion.href); }
});

renderRecentFiles();

body.addEventListener('click', async (event) => {
    const copyButton = event.target.closest('.code-copy');
    if (copyButton) {
        event.preventDefault();
        await copyCode(copyButton);
        return;
    }
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
    if (event.key === 'Escape' && !aboutDialog.hidden) {
        event.preventDefault();
        setAboutOpen(false);
        return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'o') { event.preventDefault(); await chooseFile(); }
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'v') { event.preventDefault(); await pasteMarkdown(); }
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
