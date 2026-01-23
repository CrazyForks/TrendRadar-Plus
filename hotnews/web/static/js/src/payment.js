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
        script.src = 'https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js';
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
        
        const canvas = document.createElement('canvas');
        await QRCode.toCanvas(canvas, codeUrl, {
            width: 200,
            margin: 2,
            color: {
                dark: '#1d1d1f',
                light: '#ffffff'
            }
        });
        
        container.appendChild(canvas);
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
    const maxAttempts = 180; // 30 minutes at 10s intervals
    
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
    }, 10000); // Poll every 10 seconds
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

export { formatTokens };
