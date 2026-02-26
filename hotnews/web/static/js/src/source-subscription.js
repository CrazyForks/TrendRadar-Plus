/**
 * Source Subscription Module
 * Handles the "订阅" tab for subscribing to RSS sources and custom sources.
 * Integrated with authState for reactive auth updates.
 */

import { authState } from './auth-state.js';
import { Toast } from './auth-ui.js';
import { events } from './events.js';

const SOURCE_SUB_TAB_ID = 'source-subscription';
let sourceSubLoaded = false;
let sourceSubLoading = false;

// State
const state = {
    view: 'my-subscriptions', // 'my-subscriptions' | 'discover'
    searchQuery: '',
    searchResults: [],
    subscriptions: [],
    loading: false,
};

// Debounce helper
function debounce(fn, delay) {
    let timer = null;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

/**
 * Search sources via API
 */
async function searchSources(query) {
    if (!query || query.length < 2) {
        state.searchResults = [];
        renderSourceList();
        return;
    }

    state.loading = true;
    renderLoading();

    try {
        const res = await fetch(`/api/sources/search?q=${encodeURIComponent(query)}&limit=20`);
        if (!res.ok) throw new Error('Search failed');

        const data = await res.json();
        state.searchResults = data.sources || [];
        state.loading = false;
        renderSourceList();
    } catch (e) {
        console.error('[SourceSub] Search error:', e);
        state.loading = false;
        state.searchResults = [];
        renderSourceList();
    }
}

/**
 * Load user subscriptions
 */
async function loadSubscriptions() {
    if (!authState.isLoggedIn()) {
        state.subscriptions = [];
        renderSourceList();
        return;
    }

    state.loading = true;
    renderLoading();

    try {
        const res = await fetch('/api/sources/subscriptions');
        if (!res.ok) throw new Error('Failed to load subscriptions');

        const data = await res.json();
        state.subscriptions = data.subscriptions || [];
        state.loading = false;
        renderSourceList();
    } catch (e) {
        console.error('[SourceSub] Load subscriptions error:', e);
        state.loading = false;
        state.subscriptions = [];
        renderSourceList();
    }
}

/**
 * Subscribe to a source
 */
async function subscribe(sourceType, sourceId) {
    if (!authState.isLoggedIn()) {
        Toast.show('请先登录', 'info');
        window.location.href = '/api/auth/page';
        return;
    }

    try {
        const res = await fetch('/api/sources/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ source_type: sourceType, source_id: sourceId }),
        });

        if (!res.ok) throw new Error('Subscribe failed');

        Toast.show('订阅成功', 'success');

        // Update local state
        if (state.view === 'discover') {
            const source = state.searchResults.find(s => s.id === sourceId);
            if (source) source.is_subscribed = true;
            renderSourceList();
        }

        // Reload subscriptions
        await loadSubscriptions();

    } catch (e) {
        console.error('[SourceSub] Subscribe error:', e);
        Toast.show('订阅失败', 'error');
    }
}

/**
 * Unsubscribe from a source
 */
async function unsubscribe(sourceType, sourceId) {
    try {
        const res = await fetch('/api/sources/unsubscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ source_type: sourceType, source_id: sourceId }),
        });

        if (!res.ok) throw new Error('Unsubscribe failed');

        Toast.show('已取消订阅', 'success');

        // Update local state
        state.subscriptions = state.subscriptions.filter(s => s.id !== sourceId);
        if (state.view === 'discover') {
            const source = state.searchResults.find(s => s.id === sourceId);
            if (source) source.is_subscribed = false;
        }
        renderSourceList();

    } catch (e) {
        console.error('[SourceSub] Unsubscribe error:', e);
        Toast.show('取消订阅失败', 'error');
    }
}

/**
 * Render loading state
 */
function renderLoading() {
    const container = document.getElementById('sourceSubGrid');
    if (!container) return;

    container.innerHTML = `
        <div class="source-sub-loading">
            <div class="tr-skeleton-inline"><div class="tr-skeleton-bar"></div><div class="tr-skeleton-bar"></div><div class="tr-skeleton-bar"></div></div>
        </div>
    `;
}

/**
 * Render the source list (subscriptions or search results)
 */
function renderSourceList() {
    const container = document.getElementById('sourceSubGrid');
    if (!container) return;

    const sources = state.view === 'my-subscriptions' ? state.subscriptions : state.searchResults;

    if (sources.length === 0) {
        if (state.view === 'my-subscriptions') {
            container.innerHTML = `
                <div class="source-sub-empty">
                    <div class="empty-icon">📡</div>
                    <div class="empty-title">还没有订阅任何源</div>
                    <div class="empty-desc">搜索并订阅您感兴趣的 RSS 源</div>
                </div>
            `;
        } else if (state.searchQuery.length < 2) {
            container.innerHTML = `
                <div class="source-sub-empty">
                    <div class="empty-icon">🔍</div>
                    <div class="empty-title">输入关键词搜索</div>
                    <div class="empty-desc">搜索 RSS 源名称或网址</div>
                </div>
            `;
        } else {
            container.innerHTML = `
                <div class="source-sub-empty">
                    <div class="empty-icon">😕</div>
                    <div class="empty-title">未找到相关源</div>
                    <div class="empty-desc">尝试其他关键词</div>
                </div>
            `;
        }
        return;
    }

    const cardsHtml = sources.map(source => {
        const isSubscribed = source.is_subscribed || state.subscriptions.some(s => s.id === source.id);
        const typeIcon = source.type === 'custom' ? '🛠️' : '📰';
        const sourceType = source.type || 'rss';

        return `
            <div class="source-card" data-source-id="${source.id}" data-source-type="${sourceType}">
                <div class="source-card-header">
                    <div class="source-icon">${typeIcon}</div>
                    <div class="source-info">
                        <div class="source-name">${source.name || source.id}</div>
                        <div class="source-domain">${source.url ? new URL(source.url).hostname : source.category || ''}</div>
                    </div>
                    <button class="source-sub-btn ${isSubscribed ? 'subscribed' : ''}" 
                            data-action="${isSubscribed ? 'unsubscribe' : 'subscribe'}"
                            data-source-id="${source.id}"
                            data-source-type="${sourceType}">
                        ${isSubscribed ? '已订阅 ✓' : '+ 订阅'}
                    </button>
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = cardsHtml;

    // Attach event listeners
    container.querySelectorAll('.source-sub-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const action = btn.dataset.action;
            const sourceId = btn.dataset.sourceId;
            const sourceType = btn.dataset.sourceType;

            if (action === 'subscribe') {
                subscribe(sourceType, sourceId);
            } else {
                unsubscribe(sourceType, sourceId);
            }
        });
    });
}

/**
 * Switch between views
 */
function switchView(view) {
    state.view = view;

    // Update button states
    document.querySelectorAll('.source-view-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === view);
    });

    if (view === 'my-subscriptions') {
        loadSubscriptions();
    } else {
        renderSourceList();
    }
}

/**
 * Main load function
 */
async function loadSourceSubscription(force = false) {
    console.log('[SourceSub] loadSourceSubscription called, force:', force);

    if (sourceSubLoading) return;
    if (sourceSubLoaded && !force) return;

    const container = document.getElementById('sourceSubGrid');
    if (!container) {
        console.error('[SourceSub] Container #sourceSubGrid not found!');
        return;
    }

    sourceSubLoading = true;

    // Load subscriptions if logged in
    if (authState.isLoggedIn()) {
        await loadSubscriptions();
    } else {
        renderSourceList();
    }

    sourceSubLoaded = true;
    sourceSubLoading = false;
}

/**
 * Initialize the module
 */
function init() {
    console.log('[SourceSub] Initializing...');

    // Subscribe to auth state changes
    let previousUser = authState.getUser();
    authState.subscribe((user) => {
        const wasLoggedIn = !!previousUser;
        const isLoggedIn = !!user;

        if (wasLoggedIn !== isLoggedIn) {
            console.log('[SourceSub] Auth state changed, reloading...');
            sourceSubLoaded = false;
            state.subscriptions = [];

            const activePane = document.querySelector('#tab-source-subscription.active');
            if (activePane) {
                loadSourceSubscription(true);
            }
        }
        previousUser = user;
    });

    // Listen for tab switch events
    events.on('tab:switched', (detail) => {
        const categoryId = detail?.categoryId;
        if (categoryId === SOURCE_SUB_TAB_ID) {
            loadSourceSubscription();
        }
    });

    // Set up search input
    const setupSearch = () => {
        const searchInput = document.getElementById('sourceSubSearch');
        if (searchInput) {
            const debouncedSearch = debounce((query) => {
                state.searchQuery = query;
                if (query.length >= 2) {
                    state.view = 'discover';
                    document.querySelectorAll('.source-view-btn').forEach(btn => {
                        btn.classList.toggle('active', btn.dataset.view === 'discover');
                    });
                    searchSources(query);
                } else if (query.length === 0) {
                    switchView('my-subscriptions');
                }
            }, 300);

            searchInput.addEventListener('input', (e) => {
                debouncedSearch(e.target.value.trim());
            });
        }

        // Set up view toggle buttons
        document.querySelectorAll('.source-view-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                switchView(btn.dataset.view);
            });
        });
    };

    // Wait for DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupSearch);
    } else {
        setTimeout(setupSearch, 100);
    }

    console.log('[SourceSub] Module initialized');
}

// Export for global access
if (typeof window !== 'undefined') {
    window.HotNews = window.HotNews || {};
    window.HotNews.sourceSub = {
        load: loadSourceSubscription,
        init: init,
        subscribe: subscribe,
        unsubscribe: unsubscribe,
    };
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

export { loadSourceSubscription, init, subscribe, unsubscribe };
