const PATHS = {
    dashboard: '<rect x="3" y="3" width="8" height="8"/><rect x="13" y="3" width="8" height="5"/><rect x="13" y="10" width="8" height="11"/><rect x="3" y="13" width="8" height="8"/>',
    folder: '<path d="M4 7h6l2 2h8v10H4z"/>',
    warehouse: '<path d="M3 21V10l9-6 9 6v11"/><path d="M9 21v-8h6v8"/>',
    package: '<path d="M21 8l-9-5-9 5v8l9 5 9-5V8z"/><path d="M3.5 7.5L12 12l8.5-4.5"/><path d="M12 12v9"/>',
    smartphone: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
    chart: '<path d="M4 19V5"/><path d="M4 19h16"/><path d="M8 15l3-4 3 2 5-6"/>',
    star: '<path d="M12 3l2.4 5.6L20 9.3l-4.2 3.8L17 19l-5-3-5 3 1.2-5.9L4 9.3l5.6-.7z"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9c.3.6.9 1 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 5-6 8-6s6.5 2 8 6"/>',
    users: '<circle cx="9" cy="8" r="3"/><path d="M3 20c.8-3 3.2-5 6-5"/><circle cx="16" cy="8" r="3"/><path d="M13 15c3 0 5.5 2 6.3 5"/>',
    briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M3 12h18"/>',
    truck: '<path d="M3 7h11v10H3z"/><path d="M14 10h4l3 3v4h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
    building: '<path d="M4 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16"/><path d="M14 9h5a1 1 0 0 1 1 1v11"/><path d="M8 8h2M8 12h2M8 16h2M17 13h1M17 17h1"/>',
    pencil: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z"/>',
    trash: '<path d="M4 7h16"/><path d="M9 7V5h6v2"/><path d="M6 7l1 14h10l1-14"/>',
    lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3-3"/>',
    eye: '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="2.5"/>',
    check: '<path d="M5 13l4 4L19 7"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 8h.01"/>',
    pin: '<path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    map: '<path d="M9 4l-5 2v14l5-2 6 2 5-2V4l-5 2-6-2z"/><path d="M9 4v14M15 6v14"/>',
    send: '<path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/>',
    inbox: '<path d="M4 8l8-5 8 5v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M4 12h4l2 3h4l2-3h4"/>',
    message: '<path d="M21 12a8 8 0 0 1-8 8H7l-4 3V12a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8z"/>',
    archive: '<rect x="3" y="4" width="18" height="4"/><path d="M5 8v12h14V8"/><path d="M10 13h4"/>',
    camera: '<path d="M4 8h4l2-3h4l2 3h4v12H4z"/><circle cx="12" cy="14" r="4"/>',
    flag: '<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>',
    file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h6"/>',
    id: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="9" cy="12" r="2"/><path d="M14 11h5M14 15h3"/>',
    alert: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17h.01"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 4v6h-6"/>',
    logout: '<path d="M10 7V5a2 2 0 0 1 2-2h7v18h-7a2 2 0 0 1-2-2v-2"/><path d="M4 12h11M12 9l3 3-3 3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    qr: '<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4z"/><path d="M14 14h3v3M20 14v3M14 20h3M20 20h.01"/>',
    sheet: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    calendar: '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M8 3v4M16 3v4M4 11h16"/>',
    thumbsup: '<path d="M7 11v10H4a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z"/><path d="M7 11l4-7a2 2 0 0 1 2 2v4h6l-1.5 8.5a2 2 0 0 1-2 1.5H7"/>',
    thumbsdown: '<path d="M7 13V3H4a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1z"/><path d="M7 13l4 7a2 2 0 0 0 2-2v-4h6l-1.5-8.5A2 2 0 0 0 15.5 4H7"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    print: '<path d="M6 9V3h12v6"/><path d="M6 17H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2"/><rect x="6" y="13" width="12" height="8"/>',
    phone: '<path d="M7 3h4l1 5-2 1a12 12 0 0 0 5 5l1-2 5 1v4c0 1-1 2-2 2C9 19 5 15 5 5c0-1 1-2 2-2z"/>',
    mail: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 8l9 6 9-6"/>',
};

const EMOJI_TO_ICON = {
    '📊': 'dashboard', '📁': 'folder', '🏭': 'warehouse', '📦': 'package',
    '📱': 'smartphone', '📈': 'chart', '⭐': 'star', '⚙️': 'settings',
    '👤': 'user', '👥': 'users', '👔': 'briefcase', '🚚': 'truck',
    '🏢': 'building', '✏️': 'pencil', '🗑️': 'trash', '🔍': 'search',
    '✅': 'check', '❌': 'x', 'ℹ️': 'info', '📍': 'pin', '🗺️': 'map',
    '🚀': 'send', '📭': 'inbox', '💬': 'message', '🗂️': 'archive',
    '📷': 'camera', '📸': 'camera', '✍️': 'pencil', '🏁': 'flag',
    '📝': 'file', '🪪': 'id', '⚠️': 'alert', '🔄': 'refresh',
    '🚪': 'logout', '➕': 'plus', '✕': 'x', '👍': 'thumbsup',
    '👎': 'thumbsdown', '☰': 'menu', '📅': 'calendar', '📞': 'phone',
    '📧': 'mail', '💼': 'briefcase', '🧾': 'file', '🖨': 'print', '🖨️': 'print',
};

function svgMarkup(name) {
    const inner = PATHS[name];
    if (!inner) return '';
    return `<svg class="tms-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">${inner}</svg>`;
}

export function icon(name) {
    return svgMarkup(name);
}

function ensureCss() {
    if (document.getElementById('tms-icons-css')) return;
    const link = document.createElement('link');
    link.id = 'tms-icons-css';
    link.rel = 'stylesheet';
    link.href = new URL('../../css/icons.css', import.meta.url).href;
    document.head.appendChild(link);
}

function fillDataIcons(root) {
    root.querySelectorAll('[data-icon]').forEach((el) => {
        if (el.querySelector('.tms-icon')) return;
        const markup = svgMarkup(el.dataset.icon);
        if (markup) el.insertAdjacentHTML('afterbegin', markup);
    });
}

function replaceEmojiInTextNode(node) {
    const value = node.nodeValue;
    if (!value) return;
    const keys = Object.keys(EMOJI_TO_ICON);
    if (!keys.some((emoji) => value.includes(emoji))) return;

    const frag = document.createDocumentFragment();
    const parts = value.split(new RegExp(`(${keys.map((e) => e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g'));
    parts.forEach((part) => {
        const iconName = EMOJI_TO_ICON[part];
        if (iconName) {
            const wrap = document.createElement('span');
            wrap.className = 'tms-icon-wrap';
            wrap.innerHTML = svgMarkup(iconName);
            frag.appendChild(wrap);
            frag.appendChild(document.createTextNode(' '));
            return;
        }
        if (part) frag.appendChild(document.createTextNode(part.replace(/^\s+/, '')));
    });
    node.parentNode.replaceChild(frag, node);
}

function walkEmojis(root) {
    const skip = 'SCRIPT,STYLE,TEXTAREA,INPUT,SELECT,OPTION,CODE,PRE';
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
            const parent = node.parentElement;
            if (!parent || skip.includes(parent.tagName) || parent.closest('.tms-icon-wrap')) {
                return NodeFilter.FILTER_REJECT;
            }
            if (!node.nodeValue || !Object.keys(EMOJI_TO_ICON).some((emoji) => node.nodeValue.includes(emoji))) {
                return NodeFilter.FILTER_REJECT;
            }
            return NodeFilter.FILTER_ACCEPT;
        },
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(replaceEmojiInTextNode);
}

export function applyLineIcons(root = document) {
    ensureCss();
    fillDataIcons(root);
    walkEmojis(root);
}

export function initLineIcons() {
    ensureCss();
    const run = () => applyLineIcons(document.body || document);
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', run, { once: true });
    } else {
        run();
    }
    if (window.__tmsIconsObserver) return;
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (node.nodeType === 1) applyLineIcons(node);
            });
        });
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.__tmsIconsObserver = observer;
}
