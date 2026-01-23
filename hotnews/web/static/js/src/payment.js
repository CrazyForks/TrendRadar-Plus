/**
 * Payment Module - WeChat Pay Token Recharge
 * Modern, minimalist, human-centered design
 */

import { authState } from './auth-state.js';

// QR Code library (loaded dynamically)
let QRCode = null;

// State
let currentOrderNo = null;
let pollTimer = null;
let selectedPlanId = null;

/**
 * Load QRCode library dynamically
 */
async function loadQRCodeLib() {
    if (QRCode) return QRCode;
    
    return new Promise((resolve, reject) => {
        if (window.QRCode) {
            QRCode = window.QRCode;
            resolve(QRCode);
            return;
        }
        
        const script = document.createElement('script');
        // Use local qrcodejs library
        script.src = '/static/js/lib/qrcode.min.js';
        script.onload = () => {
            QRCode = window.QRCode;
            resolve(QRCode);
        };
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

/**
 * Format token count for display
 */
function formatTokens(tokens) {
    if (tokens >= 1000000) {
        return (tokens / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    }
    if (tokens >= 1000) {
        return (tokens / 1000).toFixed(0) + 'K';
    }
    return tokens.toString();
}

/**
 * Create and show payment modal
 */
export async function openPaymentModal() {
    // Check login
    const user = authState.getUser();
    if (!user) {
        window.Toast?.show('请先登录', 'error');
        window.openLoginModal?.();
        return;
    }
    
    // Create modal if not exists
    let modal = document.getElementById('paymentModal');
    if (!modal) {
        modal = createPaymentModal();
        document.body.appendChild(modal);
    }
    
    // Reset state
    currentOrderNo = null;
    selectedPlanId = null;
    stopPolling();
    
    // Show modal
    modal.classList.add('open');
    
    // Load plans
    await loadPlans();
}

/**
 * Close payment modal
 */
export function closePaymentModal() {
    const modal = document.getElementById('paymentModal');
    if (modal) {
        modal.classList.remove('open');
    }
    stopPolling();
    currentOrderNo = null;
    selectedPlanId = null;
}

/**
 * Create payment modal HTML
 */
function createPaymentModal() {
    const modal = document.createElement('div');
    modal.id = 'paymentModal';
    modal.className = 'payment-modal';
    
    modal.innerHTML = `
        <div class="payment-modal-backdrop" onclick="closePaymentModal()"></div>
        <div class="payment-modal-content">
            <button class="payment-modal-close" onclick="closePaymentModal()">×</button>
            
            <div class="payment-modal-header">
                <h2>✨ Token 充值</h2>
                <p class="payment-balance-hint">当前余额: <span id="paymentCurrentBalance">--</span></p>
            </div>
            
            <div class="payment-modal-body">
                <!-- Plans Section -->
                <div id="paymentPlansSection" class="payment-plans-section">
                    <div class="payment-loading">加载中...</div>
                </div>
                
                <!-- QR Code Section (hidden initially) -->
                <div id="paymentQRSection" class="payment-qr-section" style="display:none;">
                    <div class="payment-qr-back" onclick="showPlansSection()">
                        <span>← 返回选择套餐</span>
                    </div>
                    <div class="payment-qr-container">
                        <div id="paymentQRCode" class="payment-qr-code"></div>
                        <div class="payment-qr-hint">请使用微信扫码支付</div>
                    </div>
                    <div class="payment-order-info">
                        <div class="payment-order-amount">¥<span id="paymentOrderAmount">--</span></div>
                        <div class="payment-order-tokens"><span id="paymentOrderTokens">--</span> Tokens</div>
                    </div>
                    <div id="paymentStatus" class="payment-status">等待支付...</div>
                </div>
                
                <!-- Success Section (hidden initially) -->
                <div id="paymentSuccessSection" class="payment-success-section" style="display:none;">
                    <div class="payment-success-icon">🎉</div>
                    <div class="payment-success-title">充值成功</div>
                    <div class="payment-success-tokens">+<span id="paymentSuccessTokens">--</span> Tokens</div>
                    <button class="payment-success-btn" onclick="closePaymentModal()">完成</button>
                </div>
            </div>
        </div>
    `;
    
    return modal;
}

/**
 * Load and display plans
 */
async function loadPlans() {
    const section = document.getElementById('paymentPlansSection');
    const balanceEl = document.getElementById('paymentCurrentBalance');
    
    try {
        // Fetch plans and balance in parallel
        const [plansRes, balanceRes] = await Promise.all([
            fetch('/api/payment/plans'),
            fetch('/api/payment/balance')
        ]);
        
        const plansData = await plansRes.json();
        const balanceData = await balanceRes.json();
        
        // Update balance
        if (balanceEl) {
            balanceEl.textContent = formatTokens(balanceData.total || 0);
        }
        
        // Check if configured
        if (!plansData.configured) {
            section.innerHTML = `
                <div class="payment-not-configured">
                    <div class="payment-not-configured-icon">🔧</div>
                    <div>支付服务暂未开放</div>
                </div>
            `;
            return;
        }
        
        // Render plans
        const plans = plansData.plans || [];
        if (plans.length === 0) {
            section.innerHTML = '<div class="payment-loading">暂无可用套餐</div>';
            return;
        }
        
        section.innerHTML = `
            <div class="payment-plans-grid">
                ${plans.map((plan, idx) => renderPlanCard(plan, idx === 1)).join('')}
            </div>
            <div class="payment-plans-note">
                <span>💡</span> 充值后 1 年内有效，可用于 AI 智能总结
            </div>
        `;
        
    } catch (err) {
        console.error('Load plans error:', err);
        section.innerHTML = `
            <div class="payment-error">
                <div>加载失败</div>
                <button onclick="loadPlans()">重试</button>
            </div>
        `;
    }
}

/**
 * Render a single plan card
 */
function renderPlanCard(plan, isRecommended = false) {
    const summaryCount = Math.floor(plan.tokens / 5000); // ~5k tokens per summary
    
    return `
        <div class="payment-plan-card ${isRecommended ? 'recommended' : ''}" 
             data-plan-id="${plan.id}"
             onclick="selectPlan(${plan.id})">
            ${isRecommended ? '<div class="payment-plan-badge">推荐</div>' : ''}
            <div class="payment-plan-name">${plan.name}</div>
            <div class="payment-plan-price">
                <span class="payment-plan-currency">¥</span>
                <span class="payment-plan-amount">${plan.price}</span>
            </div>
            <div class="payment-plan-tokens">${formatTokens(plan.tokens)} Tokens</div>
            <div class="payment-plan-desc">约 ${summaryCount} 次总结</div>
        </div>
    `;
}

/**
 * Select a plan and create order
 */
async function selectPlan(planId) {
    selectedPlanId = planId;
    
    // Update UI
    document.querySelectorAll('.payment-plan-card').forEach(card => {
        card.classList.toggle('selected', card.dataset.planId == planId);
    });
    
    // Show QR section
    const plansSection = document.getElementById('paymentPlansSection');
    const qrSection = document.getElementById('paymentQRSection');
    const statusEl = document.getElementById('paymentStatus');
    
    plansSection.style.display = 'none';
    qrSection.style.display = 'block';
    statusEl.textContent = '正在创建订单...';
    statusEl.className = 'payment-status';
    
    try {
        // Create order
        const res = await fetch('/api/payment/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ plan_id: planId })
        });
        
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || '创建订单失败');
        }
        
        const order = await res.json();
        currentOrderNo = order.order_no;
        
        // Update order info
        document.getElementById('paymentOrderAmount').textContent = order.amount;
        document.getElementById('paymentOrderTokens').textContent = formatTokens(order.tokens);
        
        // Generate QR code
        await generateQRCode(order.code_url);
        
        // Update status
        statusEl.textContent = '等待支付...';
        
        // Start polling
        startPolling();
        
    } catch (err) {
        console.error('Create order error:', err);
        statusEl.textContent = err.message || '创建订单失败';
        statusEl.className = 'payment-status error';
    }
}

/**
 * Generate QR code
 */
async function generateQRCode(codeUrl) {
    const container = document.getElementById('paymentQRCode');
    container.innerHTML = '';
    
    try {
        await loadQRCodeLib();
        
        // qrcodejs API - creates QR code directly in container
        new QRCode(container, {
            text: codeUrl,
            width: 200,
            height: 200,
            colorDark: '#1d1d1f',
            colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.M
        });
    } catch (err) {
        console.error('QR code error:', err);
        container.innerHTML = '<div class="payment-qr-error">二维码生成失败</div>';
    }
}

/**
 * Show plans section (go back from QR)
 */
function showPlansSection() {
    stopPolling();
    currentOrderNo = null;
    
    document.getElementById('paymentPlansSection').style.display = 'block';
    document.getElementById('paymentQRSection').style.display = 'none';
    document.getElementById('paymentSuccessSection').style.display = 'none';
}

/**
 * Start polling for payment status
 */
function startPolling() {
    stopPolling();
    
    let attempts = 0;
    const maxAttempts = 600; // 10 minutes at 1s intervals
    
    pollTimer = setInterval(async () => {
        if (!currentOrderNo) {
            stopPolling();
            return;
        }
        
        attempts++;
        if (attempts > maxAttempts) {
            stopPolling();
            const statusEl = document.getElementById('paymentStatus');
            statusEl.textContent = '订单已超时，请重新下单';
            statusEl.className = 'payment-status error';
            return;
        }
        
        try {
            const res = await fetch(`/api/payment/status?order_no=${currentOrderNo}`);
            const data = await res.json();
            
            if (data.status === 'paid') {
                stopPolling();
                showSuccess(data.tokens_added || data.tokens);
            } else if (data.status === 'expired') {
                stopPolling();
                const statusEl = document.getElementById('paymentStatus');
                statusEl.textContent = '订单已过期，请重新下单';
                statusEl.className = 'payment-status error';
            }
        } catch (err) {
            console.error('Poll status error:', err);
        }
    }, 1000); // Poll every 1 second for faster feedback
}

/**
 * Stop polling
 */
function stopPolling() {
    if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
    }
}

/**
 * Show success section
 */
function showSuccess(tokens) {
    document.getElementById('paymentPlansSection').style.display = 'none';
    document.getElementById('paymentQRSection').style.display = 'none';
    document.getElementById('paymentSuccessSection').style.display = 'flex';
    document.getElementById('paymentSuccessTokens').textContent = formatTokens(tokens);
    
    // Refresh balance display elsewhere if needed
    window.dispatchEvent(new CustomEvent('payment-success', { detail: { tokens } }));
}

// Expose to window for onclick handlers
window.openPaymentModal = openPaymentModal;
window.closePaymentModal = closePaymentModal;
window.selectPlan = selectPlan;
window.showPlansSection = showPlansSection;
window.loadPlans = loadPlans;
window.openUsageModal = openUsageModal;
window.closeUsageModal = closeUsageModal;

export { formatTokens, openUsageModal, closeUsageModal };

/**
 * Create and show usage modal (账户明细 - 方案C：只显示统计+充值记录)
 */
async function openUsageModal() {
    // Check login
    const user = authState.getUser();
    if (!user) {
        window.Toast?.show('请先登录', 'error');
        window.openLoginModal?.();
        return;
    }
    
    // Create modal if not exists
    let modal = document.getElementById('usageModal');
    if (!modal) {
        modal = createUsageModal();
        document.body.appendChild(modal);
    }
    
    // Show modal
    modal.classList.add('open');
    
    // Load data
    await loadUsageData();
}

/**
 * Close usage modal
 */
function closeUsageModal() {
    const modal = document.getElementById('usageModal');
    if (modal) {
        modal.classList.remove('open');
    }
}

/**
 * Create usage modal HTML
 */
function createUsageModal() {
    const modal = document.createElement('div');
    modal.id = 'usageModal';
    modal.className = 'usage-modal';
    
    modal.innerHTML = `
        <div class="usage-modal-backdrop" onclick="closeUsageModal()"></div>
        <div class="usage-modal-content">
            <button class="usage-modal-close" onclick="closeUsageModal()">×</button>
            
            <div class="usage-modal-header">
                <h2>📊 账户明细</h2>
            </div>
            
            <div class="usage-modal-body">
                <!-- Stats Section -->
                <div class="usage-stats-section">
                    <div class="usage-stat-card">
                        <div class="usage-stat-label">当前余额</div>
                        <div class="usage-stat-value" id="usageBalanceValue">--</div>
                    </div>
                    <div class="usage-stat-card consumption">
                        <div class="usage-stat-label">累计消费</div>
                        <div class="usage-stat-value" id="usageTotalValue">--</div>
                    </div>
                </div>
                
                <!-- Recharge History -->
                <div class="usage-section">
                    <div class="usage-section-title">充值记录</div>
                    <div id="rechargeHistoryList" class="usage-history-list">
                        <div class="usage-loading">加载中...</div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Add styles
    ensureUsageModalStyles();
    
    return modal;
}

/**
 * Load usage data (balance + total consumption + recharge history)
 */
async function loadUsageData() {
    const balanceEl = document.getElementById('usageBalanceValue');
    const totalEl = document.getElementById('usageTotalValue');
    const historyEl = document.getElementById('rechargeHistoryList');
    
    // Get user_id from authState
    const user = authState.getUser();
    const userId = user?.id;
    
    try {
        // Fetch balance, usage stats, and orders in parallel
        const [balanceRes, usageRes, ordersRes] = await Promise.all([
            fetch('/api/payment/balance', { credentials: 'include' }),
            fetch(`/api/payment/usage?user_id=${userId}&limit=1`, { credentials: 'include' }),
            fetch('/api/payment/orders?limit=50', { credentials: 'include' })
        ]);
        
        const balanceData = await balanceRes.json();
        const usageData = await usageRes.json();
        const ordersData = await ordersRes.json();
        
        // Update balance
        if (balanceEl) {
            balanceEl.textContent = formatTokens(balanceData.total || 0);
        }
        
        // Update total consumption
        if (totalEl) {
            totalEl.textContent = formatTokens(usageData.total_consumption || 0);
        }
        
        // Render recharge history (only paid orders)
        const orders = (ordersData.orders || []).filter(o => o.status === 'paid');
        if (orders.length === 0) {
            historyEl.innerHTML = '<div class="usage-empty">暂无充值记录</div>';
            return;
        }
        
        historyEl.innerHTML = orders.map(order => renderRechargeRecord(order)).join('');
        
    } catch (err) {
        console.error('Load usage data error:', err);
        historyEl.innerHTML = `
            <div class="usage-error">
                <div>加载失败</div>
                <button onclick="loadUsageData()">重试</button>
            </div>
        `;
    }
}

/**
 * Render a single recharge record
 */
function renderRechargeRecord(order) {
    const date = new Date(order.paid_at || order.created_at);
    const dateStr = date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
    const timeStr = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    
    return `
        <div class="usage-record">
            <div class="usage-record-left">
                <div class="usage-record-title">充值 ¥${order.amount}</div>
                <div class="usage-record-time">${dateStr} ${timeStr}</div>
            </div>
            <div class="usage-record-tokens recharge">+${formatTokens(order.tokens)}</div>
        </div>
    `;
}

/**
 * Ensure usage modal styles are added
 */
function ensureUsageModalStyles() {
    if (document.getElementById('usage-modal-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'usage-modal-styles';
    style.textContent = `
        .usage-modal {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            z-index: 10000;
        }
        .usage-modal.open {
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .usage-modal-backdrop {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.6);
        }
        .usage-modal-content {
            position: relative;
            background: #1e293b;
            border-radius: 16px;
            width: 90%;
            max-width: 420px;
            max-height: 80vh;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
        }
        .usage-modal-close {
            position: absolute;
            top: 12px;
            right: 12px;
            background: none;
            border: none;
            color: #94a3b8;
            font-size: 24px;
            cursor: pointer;
            padding: 4px 8px;
            line-height: 1;
            z-index: 1;
        }
        .usage-modal-close:hover {
            color: #f1f5f9;
        }
        .usage-modal-header {
            padding: 20px 24px 16px;
            border-bottom: 1px solid #334155;
        }
        .usage-modal-header h2 {
            margin: 0;
            font-size: 18px;
            font-weight: 600;
            color: #f1f5f9;
        }
        .usage-modal-body {
            padding: 20px 24px;
            overflow-y: auto;
        }
        /* Stats Section */
        .usage-stats-section {
            display: flex;
            gap: 12px;
            margin-bottom: 24px;
        }
        .usage-stat-card {
            flex: 1;
            background: linear-gradient(135deg, #3b82f6, #8b5cf6);
            border-radius: 12px;
            padding: 20px 16px;
            text-align: center;
        }
        .usage-stat-card.consumption {
            background: linear-gradient(135deg, #f97316, #ef4444);
        }
        .usage-stat-label {
            font-size: 13px;
            color: rgba(255, 255, 255, 0.8);
            margin-bottom: 8px;
        }
        .usage-stat-value {
            font-size: 28px;
            font-weight: 700;
            color: white;
        }
        /* Section */
        .usage-section {
            margin-top: 8px;
        }
        .usage-section-title {
            font-size: 14px;
            font-weight: 600;
            color: #94a3b8;
            margin-bottom: 12px;
        }
        .usage-history-list {
            display: flex;
            flex-direction: column;
            gap: 8px;
            max-height: 300px;
            overflow-y: auto;
        }
        .usage-record {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px 14px;
            background: #0f172a;
            border-radius: 8px;
        }
        .usage-record-left {
            flex: 1;
            min-width: 0;
        }
        .usage-record-title {
            font-size: 14px;
            color: #f1f5f9;
        }
        .usage-record-time {
            font-size: 12px;
            color: #64748b;
            margin-top: 4px;
        }
        .usage-record-tokens {
            font-size: 15px;
            font-weight: 600;
            margin-left: 12px;
            white-space: nowrap;
        }
        .usage-record-tokens.recharge {
            color: #4ade80;
        }
        .usage-loading, .usage-empty, .usage-error {
            text-align: center;
            padding: 32px 24px;
            color: #64748b;
            font-size: 14px;
        }
        .usage-error button {
            margin-top: 12px;
            padding: 8px 16px;
            background: #3b82f6;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
        }
    `;
    document.head.appendChild(style);
}
