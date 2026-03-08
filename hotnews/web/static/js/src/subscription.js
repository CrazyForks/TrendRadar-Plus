/**
 * Subscription Module - VIP 订阅支付
 * 支持月付和年付订阅
 */

import { authState } from './auth-state.js';

// QR Code library (loaded dynamically)
let QRCode = null;

// State
let currentOrderNo = null;
let pollTimer = null;
let countdownTimer = null;
let countdownSeconds = 0;

// QR code validity period (5 minutes)
const QR_VALIDITY_SECONDS = 5 * 60;

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
 * Get subscription status
 */
export async function getSubscriptionStatus() {
    try {
        const res = await fetch('/api/subscription/status', { credentials: 'include' });
        if (!res.ok) return null;
        return await res.json();
    } catch (err) {
        console.error('Get subscription status error:', err);
        return null;
    }
}

/**
 * Open subscription modal
 */
export async function openSubscriptionModal() {
    const user = authState.getUser();
    if (!user) {
        window.Toast?.show('请先登录', 'error');
        window.openLoginModal?.();
        return;
    }
    
    let modal = document.getElementById('subscriptionModal');
    if (!modal) {
        modal = createSubscriptionModal();
        document.body.appendChild(modal);
    }
    
    currentOrderNo = null;
    stopPolling();
    
    modal.classList.add('open');
    await loadSubscriptionPlans();
}

/**
 * Close subscription modal
 */
export function closeSubscriptionModal() {
    const modal = document.getElementById('subscriptionModal');
    if (modal) {
        modal.classList.remove('open');
    }
    stopPolling();
    stopCountdown();
    currentOrderNo = null;
}

/**
 * Create subscription modal HTML
 */
function createSubscriptionModal() {
    const modal = document.createElement('div');
    modal.id = 'subscriptionModal';
    modal.className = 'subscription-modal';
    
    modal.innerHTML = `
        <div class="subscription-modal-backdrop" onclick="closeSubscriptionModal()"></div>
        <div class="subscription-modal-content">
            <button class="subscription-modal-close" onclick="closeSubscriptionModal()">×</button>
            
            <div class="subscription-modal-header">
                <h2>👑 开通会员</h2>
                <p class="subscription-status-hint" id="subscriptionStatusHint"></p>
            </div>
            
            <div class="subscription-modal-body">
                <!-- Plans Section -->
                <div id="subscriptionPlansSection" class="subscription-plans-section">
                    <div class="subscription-loading"><div class="tr-skeleton-inline"><div class="tr-skeleton-bar"></div><div class="tr-skeleton-bar"></div><div class="tr-skeleton-bar"></div></div></div>
                </div>
                
                <!-- QR Code Section -->
                <div id="subscriptionQRSection" class="subscription-qr-section" style="display:none;">
                    <div class="subscription-qr-back" onclick="showSubscriptionPlans()">
                        <span>← 返回选择套餐</span>
                    </div>
                    <div class="subscription-qr-container">
                        <div id="subscriptionQRCode" class="subscription-qr-code"></div>
                        <div class="subscription-qr-hint">请使用微信扫码支付</div>
                        <div id="subscriptionCountdown" class="subscription-countdown">有效期 <span id="subCountdownTime">5:00</span></div>
                    </div>
                    <div class="subscription-order-info">
                        <div class="subscription-order-amount">¥<span id="subscriptionOrderAmount">--</span></div>
                        <div class="subscription-order-plan"><span id="subscriptionOrderPlan">--</span></div>
                    </div>
                    <div id="subscriptionStatus" class="subscription-status">等待支付...</div>
                    <div class="subscription-refresh-hint">
                        已支付？<a href="javascript:void(0)" onclick="manualCheckSubscription()">刷新状态</a>
                    </div>
                </div>
                
                <!-- Success Section -->
                <div id="subscriptionSuccessSection" class="subscription-success-section" style="display:none;">
                    <div class="subscription-success-icon">🎉</div>
                    <div class="subscription-success-title">开通成功</div>
                    <div class="subscription-success-desc">您已成为 VIP 会员</div>
                    <button class="subscription-success-btn" onclick="closeSubscriptionModal()">完成</button>
                </div>
            </div>
        </div>
    `;
    
    ensureSubscriptionStyles();
    return modal;
}

/**
 * Load subscription plans
 */
async function loadSubscriptionPlans() {
    const section = document.getElementById('subscriptionPlansSection');
    const hintEl = document.getElementById('subscriptionStatusHint');
    
    try {
        const [plansRes, statusRes] = await Promise.all([
            fetch('/api/subscription/plans'),
            fetch('/api/subscription/status', { credentials: 'include' })
        ]);
        
        const plansData = await plansRes.json();
        const statusData = await statusRes.json();
        
        // Update status hint
        if (hintEl) {
            if (statusData.is_vip) {
                if (statusData.plan_type === 'lifetime' || statusData.days_remaining > 30000) {
                    hintEl.innerHTML = `<span class="vip-badge">VIP</span> 终身有效 · 专属 ${statusData.usage_quota} 个追踪额度`;
                } else {
                    const expireDate = new Date(statusData.expire_at * 1000);
                    hintEl.innerHTML = `<span class="vip-badge">VIP</span> 到期: ${expireDate.toLocaleDateString('zh-CN')} · 剩余 ${statusData.usage_remaining} 个额度`;
                }
            } else {
                hintEl.textContent = '开通会员，解锁专属追踪主题';
            }
        }
        
        const plans = plansData.plans || [];
        if (plans.length === 0) {
            section.innerHTML = '<div class="subscription-loading">暂无可用套餐</div>';
            return;
        }
        
        section.innerHTML = `
            <div class="subscription-plans-grid">
                ${plans.map((plan, idx) => renderSubscriptionPlanCard(plan, idx === 1)).join('')}
            </div>
            <div class="subscription-benefits">
                <div class="subscription-benefit" style="white-space: nowrap;">✓ 专属自定义主题追踪</div>
                <div class="subscription-benefit" style="white-space: nowrap;">✓ 第一时间获取关注新闻</div>
                <div class="subscription-benefit" style="white-space: nowrap;">✓ 重点关注即时送达</div>
            </div>
        `;
        
    } catch (err) {
        console.error('Load subscription plans error:', err);
        section.innerHTML = `
            <div class="subscription-error">
                <div>加载失败</div>
                <button onclick="loadSubscriptionPlans()">重试</button>
            </div>
        `;
    }
}

/**
 * Render subscription plan card
 */
function renderSubscriptionPlanCard(plan, isRecommended = false) {
    const badge = plan.badge ? `<div class="subscription-plan-badge">${plan.badge}</div>` : '';
    
    let periodText = `/${plan.plan_type === 'yearly' ? '年' : '月'}`;
    let durationText = `<div class="subscription-plan-duration">${plan.duration_days} 天有效期</div>`;
    
    if (plan.plan_type === 'lifetime') {
        periodText = '';
        durationText = `<div class="subscription-plan-duration">永久有效</div>`;
    }
    
    return `
        <div class="subscription-plan-card ${isRecommended ? 'recommended' : ''}" 
             data-plan-id="${plan.id}"
             onclick="selectSubscriptionPlan(${plan.id})">
            ${badge}
            <div class="subscription-plan-name">${plan.name}</div>
            <div class="subscription-plan-price">
                <span class="subscription-plan-currency">¥</span>
                <span class="subscription-plan-amount">${plan.price}</span>
                <span class="subscription-plan-period">${periodText}</span>
            </div>
            <div class="subscription-plan-quota">专属追踪 ${plan.usage_quota} 个主题</div>
            ${durationText}
        </div>
    `;
}

/**
 * Select subscription plan and create order
 */
async function selectSubscriptionPlan(planId) {
    const plansSection = document.getElementById('subscriptionPlansSection');
    const qrSection = document.getElementById('subscriptionQRSection');
    const statusEl = document.getElementById('subscriptionStatus');
    
    plansSection.style.display = 'none';
    qrSection.style.display = 'block';
    statusEl.textContent = '正在创建订单...';
    statusEl.className = 'subscription-status';
    
    try {
        const res = await fetch('/api/subscription/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ plan_id: planId })
        });
        
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || err.detail || '创建订单失败');
        }
        
        const order = await res.json();
        currentOrderNo = order.order_no;
        
        document.getElementById('subscriptionOrderAmount').textContent = order.amount;
        document.getElementById('subscriptionOrderPlan').textContent = order.plan_name;
        
        await generateSubscriptionQRCode(order.code_url);
        
        statusEl.textContent = '等待支付...';
        startPolling();
        startCountdown();
        
    } catch (err) {
        console.error('Create subscription order error:', err);
        statusEl.textContent = err.message || '创建订单失败';
        statusEl.className = 'subscription-status error';
    }
}

/**
 * Generate QR code for subscription
 */
async function generateSubscriptionQRCode(codeUrl) {
    const container = document.getElementById('subscriptionQRCode');
    container.innerHTML = '';
    
    try {
        await loadQRCodeLib();
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
        container.innerHTML = '<div class="subscription-qr-error">二维码生成失败</div>';
    }
}

/**
 * Show plans section
 */
function showSubscriptionPlans() {
    stopPolling();
    stopCountdown();
    currentOrderNo = null;
    
    document.getElementById('subscriptionPlansSection').style.display = 'block';
    document.getElementById('subscriptionQRSection').style.display = 'none';
    document.getElementById('subscriptionSuccessSection').style.display = 'none';
}

/**
 * Start polling for payment status
 */
function startPolling() {
    stopPolling();
    
    let attempts = 0;
    const maxAttempts = 600;
    
    pollTimer = setInterval(async () => {
        if (!currentOrderNo) {
            stopPolling();
            return;
        }
        
        attempts++;
        if (attempts > maxAttempts) {
            stopPolling();
            const statusEl = document.getElementById('subscriptionStatus');
            statusEl.textContent = '订单已超时，请重新下单';
            statusEl.className = 'subscription-status error';
            return;
        }
        
        try {
            const res = await fetch(`/api/payment/status?order_no=${currentOrderNo}`);
            const data = await res.json();
            
            if (data.status === 'paid') {
                stopPolling();
                showSubscriptionSuccess();
            } else if (data.status === 'expired') {
                stopPolling();
                const statusEl = document.getElementById('subscriptionStatus');
                statusEl.textContent = '订单已过期，请重新下单';
                statusEl.className = 'subscription-status error';
            }
        } catch (err) {
            console.error('Poll status error:', err);
        }
    }, 1000);
}

function stopPolling() {
    if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
    }
}

function startCountdown() {
    stopCountdown();
    countdownSeconds = QR_VALIDITY_SECONDS;
    updateCountdownDisplay();
    
    countdownTimer = setInterval(() => {
        countdownSeconds--;
        updateCountdownDisplay();
        
        if (countdownSeconds <= 0) {
            stopCountdown();
        }
    }, 1000);
}

function stopCountdown() {
    if (countdownTimer) {
        clearInterval(countdownTimer);
        countdownTimer = null;
    }
}

function updateCountdownDisplay() {
    const el = document.getElementById('subCountdownTime');
    if (!el) return;
    
    const minutes = Math.floor(countdownSeconds / 60);
    const seconds = countdownSeconds % 60;
    el.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function showSubscriptionSuccess() {
    stopCountdown();
    document.getElementById('subscriptionPlansSection').style.display = 'none';
    document.getElementById('subscriptionQRSection').style.display = 'none';
    document.getElementById('subscriptionSuccessSection').style.display = 'flex';
    
    window.dispatchEvent(new CustomEvent('subscription-success'));
}

async function manualCheckSubscription() {
    if (!currentOrderNo) return;
    
    const statusEl = document.getElementById('subscriptionStatus');
    statusEl.textContent = '正在查询...';
    
    try {
        const res = await fetch(`/api/payment/status?order_no=${currentOrderNo}`);
        const data = await res.json();
        
        if (data.status === 'paid') {
            stopPolling();
            showSubscriptionSuccess();
        } else {
            statusEl.textContent = '尚未支付，请完成支付后再试';
        }
    } catch (err) {
        statusEl.textContent = '查询失败，请稍后再试';
        statusEl.className = 'subscription-status error';
    }
}

function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(0) + 'K';
    return num.toString();
}

/**
 * Ensure subscription modal styles
 */
function ensureSubscriptionStyles() {
    if (document.getElementById('subscription-modal-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'subscription-modal-styles';
    style.textContent = `
        .subscription-modal {
            display: none;
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            z-index: 10000;
        }
        .subscription-modal.open {
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .subscription-modal-backdrop {
            position: absolute;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0, 0, 0, 0.6);
        }
        .subscription-modal-content {
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
        .subscription-modal-close {
            position: absolute;
            top: 12px; right: 12px;
            background: none;
            border: none;
            color: #94a3b8;
            font-size: 24px;
            cursor: pointer;
            padding: 4px 8px;
            line-height: 1;
            z-index: 1;
        }
        .subscription-modal-close:hover { color: #f1f5f9; }
        .subscription-modal-header {
            padding: 20px 24px 16px;
            border-bottom: 1px solid #334155;
            text-align: center;
        }
        .subscription-modal-header h2 {
            margin: 0;
            font-size: 20px;
            font-weight: 600;
            color: #f1f5f9;
        }
        .subscription-status-hint {
            margin: 8px 0 0;
            font-size: 13px;
            color: #94a3b8;
        }
        .vip-badge {
            display: inline-block;
            background: linear-gradient(135deg, #f59e0b, #ef4444);
            color: white;
            font-size: 11px;
            font-weight: 600;
            padding: 2px 6px;
            border-radius: 4px;
            margin-right: 6px;
        }
        .subscription-modal-body {
            padding: 20px 24px;
            overflow-y: auto;
        }
        .subscription-plans-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 12px;
            margin-bottom: 20px;
        }
        .subscription-plan-card {
            position: relative;
            background: #0f172a;
            border: 2px solid #334155;
            border-radius: 12px;
            padding: 20px 16px;
            text-align: center;
            cursor: pointer;
            transition: all 0.2s;
        }
        .subscription-plan-card:hover {
            border-color: #3b82f6;
            transform: translateY(-2px);
        }
        .subscription-plan-card.recommended {
            border-color: #f59e0b;
            background: linear-gradient(135deg, rgba(245, 158, 11, 0.1), rgba(239, 68, 68, 0.1));
        }
        .subscription-plan-badge {
            position: absolute;
            top: -10px;
            right: 10px;
            background: linear-gradient(135deg, #f59e0b, #ef4444);
            color: white;
            font-size: 11px;
            font-weight: 600;
            padding: 3px 8px;
            border-radius: 4px;
        }
        .subscription-plan-name {
            font-size: 15px;
            font-weight: 600;
            color: #f1f5f9;
            margin-bottom: 12px;
        }
        .subscription-plan-price {
            margin-bottom: 8px;
        }
        .subscription-plan-currency {
            font-size: 16px;
            color: #94a3b8;
        }
        .subscription-plan-amount {
            font-size: 32px;
            font-weight: 700;
            color: #f1f5f9;
        }
        .subscription-plan-period {
            font-size: 14px;
            color: #64748b;
        }
        .subscription-plan-quota {
            font-size: 13px;
            color: #3b82f6;
            margin-bottom: 4px;
        }
        .subscription-plan-duration {
            font-size: 12px;
            color: #64748b;
        }
        .subscription-benefits {
            display: flex;
            flex-wrap: wrap;
            gap: 8px 16px;
            justify-content: center;
            padding: 16px;
            background: rgba(59, 130, 246, 0.1);
            border-radius: 8px;
        }
        .subscription-benefit {
            font-size: 13px;
            color: #94a3b8;
        }
        /* QR Section */
        .subscription-qr-section { text-align: center; }
        .subscription-qr-back {
            text-align: left;
            margin-bottom: 16px;
        }
        .subscription-qr-back span {
            color: #3b82f6;
            cursor: pointer;
            font-size: 14px;
        }
        .subscription-qr-container {
            background: white;
            border-radius: 12px;
            padding: 20px;
            display: inline-block;
            margin-bottom: 16px;
        }
        .subscription-qr-code {
            width: 200px;
            height: 200px;
            margin: 0 auto;
        }
        .subscription-qr-hint {
            margin-top: 12px;
            font-size: 13px;
            color: #64748b;
        }
        .subscription-countdown {
            margin-top: 8px;
            font-size: 12px;
            color: #94a3b8;
        }
        .subscription-order-info {
            margin-bottom: 16px;
        }
        .subscription-order-amount {
            font-size: 28px;
            font-weight: 700;
            color: #f1f5f9;
        }
        .subscription-order-plan {
            font-size: 14px;
            color: #94a3b8;
        }
        .subscription-status {
            font-size: 14px;
            color: #94a3b8;
            margin-bottom: 12px;
        }
        .subscription-status.error { color: #ef4444; }
        .subscription-refresh-hint {
            font-size: 13px;
            color: #64748b;
        }
        .subscription-refresh-hint a {
            color: #3b82f6;
            text-decoration: none;
        }
        /* Success Section */
        .subscription-success-section {
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 40px 20px;
        }
        .subscription-success-icon {
            font-size: 64px;
            margin-bottom: 16px;
        }
        .subscription-success-title {
            font-size: 24px;
            font-weight: 600;
            color: #f1f5f9;
            margin-bottom: 8px;
        }
        .subscription-success-desc {
            font-size: 14px;
            color: #94a3b8;
            margin-bottom: 24px;
        }
        .subscription-success-btn {
            background: linear-gradient(135deg, #3b82f6, #8b5cf6);
            color: white;
            border: none;
            border-radius: 8px;
            padding: 12px 32px;
            font-size: 15px;
            font-weight: 600;
            cursor: pointer;
        }
        .subscription-loading, .subscription-error {
            text-align: center;
            padding: 32px;
            color: #64748b;
        }
        .subscription-error button {
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

// Expose to window
window.openSubscriptionModal = openSubscriptionModal;
window.closeSubscriptionModal = closeSubscriptionModal;
window.selectSubscriptionPlan = selectSubscriptionPlan;
window.showSubscriptionPlans = showSubscriptionPlans;
window.manualCheckSubscription = manualCheckSubscription;
window.loadSubscriptionPlans = loadSubscriptionPlans;
