/**
 * TrendRadar Core Module
 * 核心工具函数和命名空间
 */

// 全局命名空间
export const TR = window.TrendRadar = window.TrendRadar || {};

// Ready 机制
const readyHandlers = [];
let isReady = false;

export function ready(handler) {
    if (isReady) {
        handler();
    } else {
        readyHandlers.push(handler);
    }
}

document.addEventListener('DOMContentLoaded', function() {
    isReady = true;
    readyHandlers.forEach(h => {
        try { h(); } catch (e) { console.error('Ready handler error:', e); }
    });
});

// 工具函数
export function escapeHtml(str) {
    return String(str || '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

export function formatUpdatedAt(value) {
    const raw = (value == null) ? '' : String(value).trim();
    if (!raw) return raw;

    const m1 = raw.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})(?::\d{2})?$/);
    if (m1) return `${m1[2]}-${m1[3]} ${m1[4]}:${m1[5]}`;

    const m2 = raw.match(/^(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/);
    if (m2) return raw;

    return raw;
}

// 挂载到 TR 命名空间
TR.ready = ready;
TR.escapeHtml = escapeHtml;
TR.formatUpdatedAt = formatUpdatedAt;
