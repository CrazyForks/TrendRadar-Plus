import{a as w,b as h}from"./chunk-EFNBCGWM.js";var d=null,c=null,p=null,y=null,u=0,b=null,L=5*60;async function T(){return d||new Promise((e,n)=>{if(window.QRCode){d=window.QRCode,e(d);return}let t=document.createElement("script");t.src="/static/js/lib/qrcode.min.js",t.onload=()=>{d=window.QRCode,e(d)},t.onerror=n,document.head.appendChild(t)})}function l(e){return e>=1e6?(e/1e6).toFixed(1).replace(/\.0$/,"")+"M":e>=1e3?(e/1e3).toFixed(0)+"K":e.toString()}async function R(){if(!h({toast:"\u8BF7\u5148\u767B\u5F55"}))return;let e=document.getElementById("paymentModal");e||(e=$(),document.body.appendChild(e)),c=null,b=null,o(),e.classList.add("open"),await C()}function Q(){let e=document.getElementById("paymentModal");e&&e.classList.remove("open"),o(),m(),c=null,b=null}function $(){let e=document.createElement("div");return e.id="paymentModal",e.className="payment-modal",e.innerHTML=`
        <div class="payment-modal-backdrop" onclick="closePaymentModal()"></div>
        <div class="payment-modal-content">
            <button class="payment-modal-close" onclick="closePaymentModal()">\xD7</button>
            
            <div class="payment-modal-header">
                <h2>\u2728 Token \u5145\u503C</h2>
                <p class="payment-balance-hint">\u5F53\u524D\u4F59\u989D: <span id="paymentCurrentBalance">--</span></p>
            </div>
            
            <div class="payment-modal-body">
                <!-- Plans Section -->
                <div id="paymentPlansSection" class="payment-plans-section">
                    <div class="payment-loading"><div class="tr-skeleton-inline"><div class="tr-skeleton-bar"></div><div class="tr-skeleton-bar"></div><div class="tr-skeleton-bar"></div></div></div>
                </div>
                
                <!-- QR Code Section (hidden initially) -->
                <div id="paymentQRSection" class="payment-qr-section" style="display:none;">
                    <div class="payment-qr-back" onclick="showPlansSection()">
                        <span>\u2190 \u8FD4\u56DE\u9009\u62E9\u5957\u9910</span>
                    </div>
                    <div class="payment-qr-container">
                        <div id="paymentQRCode" class="payment-qr-code"></div>
                        <div class="payment-qr-hint">\u8BF7\u4F7F\u7528\u5FAE\u4FE1\u626B\u7801\u652F\u4ED8</div>
                        <div id="paymentCountdown" class="payment-countdown">\u6709\u6548\u671F <span id="countdownTime">5:00</span></div>
                    </div>
                    <div class="payment-order-info">
                        <div class="payment-order-amount">\xA5<span id="paymentOrderAmount">--</span></div>
                        <div class="payment-order-tokens"><span id="paymentOrderTokens">--</span> Tokens</div>
                    </div>
                    <div id="paymentStatus" class="payment-status">\u7B49\u5F85\u652F\u4ED8...</div>
                    <div class="payment-refresh-hint">
                        \u5DF2\u652F\u4ED8\uFF1F<a href="javascript:void(0)" onclick="manualCheckPayment()">\u5237\u65B0\u72B6\u6001</a>
                    </div>
                </div>
                
                <!-- Success Section (hidden initially) -->
                <div id="paymentSuccessSection" class="payment-success-section" style="display:none;">
                    <div class="payment-success-icon">\u{1F389}</div>
                    <div class="payment-success-title">\u5145\u503C\u6210\u529F</div>
                    <div class="payment-success-tokens">+<span id="paymentSuccessTokens">--</span> Tokens</div>
                    <button class="payment-success-btn" onclick="closePaymentModal()">\u5B8C\u6210</button>
                </div>
            </div>
        </div>
    `,e}async function C(){let e=document.getElementById("paymentPlansSection"),n=document.getElementById("paymentCurrentBalance");try{let[t,a]=await Promise.all([fetch("/api/payment/plans"),fetch("/api/payment/balance")]),s=await t.json(),i=await a.json();if(n&&(n.textContent=l(i.total||0)),!s.configured){e.innerHTML=`
                <div class="payment-not-configured">
                    <div class="payment-not-configured-icon">\u{1F527}</div>
                    <div>\u652F\u4ED8\u670D\u52A1\u6682\u672A\u5F00\u653E</div>
                </div>
            `;return}let r=s.plans||[];if(r.length===0){e.innerHTML='<div class="payment-loading">\u6682\u65E0\u53EF\u7528\u5957\u9910</div>';return}e.innerHTML=`
            <div class="payment-plans-grid">
                ${r.map((g,f)=>j(g,f===1)).join("")}
            </div>
            <div class="payment-plans-note">
                <span>\u{1F4A1}</span> \u5145\u503C\u540E 1 \u5E74\u5185\u6709\u6548\uFF0C\u53EF\u7528\u4E8E AI \u667A\u80FD\u603B\u7ED3
            </div>
        `}catch(t){console.error("Load plans error:",t),e.innerHTML=`
            <div class="payment-error">
                <div>\u52A0\u8F7D\u5931\u8D25</div>
                <button onclick="loadPlans()">\u91CD\u8BD5</button>
            </div>
        `}}function j(e,n=!1){let t=Math.floor(e.tokens/5e3);return`
        <div class="payment-plan-card ${n?"recommended":""}" 
             data-plan-id="${e.id}"
             onclick="selectPlan(${e.id})">
            ${n?'<div class="payment-plan-badge">\u63A8\u8350</div>':""}
            <div class="payment-plan-name">${e.name}</div>
            <div class="payment-plan-price">
                <span class="payment-plan-currency">\xA5</span>
                <span class="payment-plan-amount">${e.price}</span>
            </div>
            <div class="payment-plan-tokens">${l(e.tokens)} Tokens</div>
            <div class="payment-plan-desc">\u7EA6 ${t} \u6B21\u603B\u7ED3</div>
        </div>
    `}async function S(e){b=e,document.querySelectorAll(".payment-plan-card").forEach(s=>{s.classList.toggle("selected",s.dataset.planId==e)});let n=document.getElementById("paymentPlansSection"),t=document.getElementById("paymentQRSection"),a=document.getElementById("paymentStatus");n.style.display="none",t.style.display="block",a.textContent="\u6B63\u5728\u521B\u5EFA\u8BA2\u5355...",a.className="payment-status";try{let s=await fetch("/api/payment/create",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({plan_id:e})});if(!s.ok){let r=await s.json();throw new Error(r.detail||"\u521B\u5EFA\u8BA2\u5355\u5931\u8D25")}let i=await s.json();c=i.order_no,document.getElementById("paymentOrderAmount").textContent=i.amount,document.getElementById("paymentOrderTokens").textContent=l(i.tokens),await q(i.code_url),a.textContent="\u7B49\u5F85\u652F\u4ED8...",D(),N()}catch(s){console.error("Create order error:",s),a.textContent=s.message||"\u521B\u5EFA\u8BA2\u5355\u5931\u8D25",a.className="payment-status error"}}async function q(e){let n=document.getElementById("paymentQRCode");n.innerHTML="";try{await T(),new d(n,{text:e,width:200,height:200,colorDark:"#1d1d1f",colorLight:"#ffffff",correctLevel:d.CorrectLevel.M})}catch(t){console.error("QR code error:",t),n.innerHTML='<div class="payment-qr-error">\u4E8C\u7EF4\u7801\u751F\u6210\u5931\u8D25</div>'}}function E(){o(),m(),c=null,document.getElementById("paymentPlansSection").style.display="block",document.getElementById("paymentQRSection").style.display="none",document.getElementById("paymentSuccessSection").style.display="none"}function D(){o();let e=0,n=600;p=setInterval(async()=>{if(!c){o();return}if(e++,e>n){o();let t=document.getElementById("paymentStatus");t.textContent="\u8BA2\u5355\u5DF2\u8D85\u65F6\uFF0C\u8BF7\u91CD\u65B0\u4E0B\u5355",t.className="payment-status error";return}try{let a=await(await fetch(`/api/payment/status?order_no=${c}`)).json();if(a.status==="paid")o(),I(a.tokens_added||a.tokens);else if(a.status==="expired"){o();let s=document.getElementById("paymentStatus");s.textContent="\u8BA2\u5355\u5DF2\u8FC7\u671F\uFF0C\u8BF7\u91CD\u65B0\u4E0B\u5355",s.className="payment-status error"}}catch(t){console.error("Poll status error:",t)}},1e3)}function o(){p&&(clearInterval(p),p=null)}function N(){m(),u=L,k(),y=setInterval(()=>{u--,k(),u<=0&&(m(),H())},1e3)}function m(){y&&(clearInterval(y),y=null)}function k(){let e=document.getElementById("countdownTime");if(!e)return;let n=Math.floor(u/60),t=u%60;e.textContent=`${n}:${t.toString().padStart(2,"0")}`;let a=document.getElementById("paymentCountdown");a&&a.classList.toggle("warning",u<=60)}function H(){o();let e=document.getElementById("paymentStatus");e&&(e.textContent="\u4E8C\u7EF4\u7801\u5DF2\u8FC7\u671F",e.className="payment-status error");let n=document.getElementById("paymentQRCode");n&&(n.innerHTML=`
            <div class="payment-qr-expired">
                <div class="payment-qr-expired-icon">\u23F0</div>
                <div class="payment-qr-expired-text">\u4E8C\u7EF4\u7801\u5DF2\u8FC7\u671F</div>
                <button class="payment-qr-refresh-btn" onclick="refreshQRCode()">\u5237\u65B0\u4E8C\u7EF4\u7801</button>
            </div>
        `)}async function z(){let e=document.querySelector(".payment-plan-card.selected");if(!e){E();return}let n=parseInt(e.dataset.planId);await S(n)}function I(e){m(),document.getElementById("paymentPlansSection").style.display="none",document.getElementById("paymentQRSection").style.display="none",document.getElementById("paymentSuccessSection").style.display="flex",document.getElementById("paymentSuccessTokens").textContent=l(e),window.dispatchEvent(new CustomEvent("payment-success",{detail:{tokens:e}}))}async function U(){if(!c)return;let e=document.getElementById("paymentStatus");e.textContent="\u6B63\u5728\u67E5\u8BE2...",e.className="payment-status";try{let t=await(await fetch(`/api/payment/status?order_no=${c}`)).json();t.status==="paid"?(o(),I(t.tokens_added||t.tokens)):t.status==="expired"?(o(),e.textContent="\u8BA2\u5355\u5DF2\u8FC7\u671F\uFF0C\u8BF7\u91CD\u65B0\u4E0B\u5355",e.className="payment-status error"):(e.textContent="\u5C1A\u672A\u652F\u4ED8\uFF0C\u8BF7\u5B8C\u6210\u652F\u4ED8\u540E\u518D\u8BD5",e.className="payment-status")}catch(n){console.error("Manual check error:",n),e.textContent="\u67E5\u8BE2\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u518D\u8BD5",e.className="payment-status error"}}window.openTokenPaymentModal=R;window.closePaymentModal=Q;window.selectPlan=S;window.showPlansSection=E;window.loadPlans=C;window.openUsageModal=O;window.closeUsageModal=A;window.refreshUsageData=_;window.manualCheckPayment=U;window.refreshQRCode=z;async function _(){let e=document.querySelector(".usage-refresh-btn");e&&(e.classList.add("spinning"),e.disabled=!0);try{await M()}finally{e&&(e.classList.remove("spinning"),e.disabled=!1)}}async function O(){if(!h({toast:"\u8BF7\u5148\u767B\u5F55"}))return;let e=document.getElementById("usageModal");e||(e=V(),document.body.appendChild(e)),e.classList.add("open"),await M()}function A(){let e=document.getElementById("usageModal");e&&e.classList.remove("open")}function V(){let e=document.createElement("div");return e.id="usageModal",e.className="usage-modal",e.innerHTML=`
        <div class="usage-modal-backdrop" onclick="closeUsageModal()"></div>
        <div class="usage-modal-content">
            <button class="usage-modal-close" onclick="closeUsageModal()">\xD7</button>
            
            <div class="usage-modal-header">
                <h2>\u{1F4CA} \u8D26\u6237\u660E\u7EC6</h2>
                <button class="usage-refresh-btn" onclick="refreshUsageData()" title="\u5237\u65B0\u6570\u636E">\u{1F504}</button>
            </div>
            
            <div class="usage-modal-body">
                <!-- Stats Section -->
                <div class="usage-stats-section">
                    <div class="usage-stat-card">
                        <div class="usage-stat-label">\u5F53\u524D\u4F59\u989D</div>
                        <div class="usage-stat-value" id="usageBalanceValue">--</div>
                    </div>
                    <div class="usage-stat-card consumption">
                        <div class="usage-stat-label">\u7D2F\u8BA1\u6D88\u8D39</div>
                        <div class="usage-stat-value" id="usageTotalValue">--</div>
                    </div>
                </div>
                
                <!-- Recharge History -->
                <div class="usage-section">
                    <div class="usage-section-title">\u5145\u503C\u8BB0\u5F55</div>
                    <div id="rechargeHistoryList" class="usage-history-list">
                        <div class="usage-loading"><div class="tr-skeleton-inline"><div class="tr-skeleton-bar"></div><div class="tr-skeleton-bar"></div></div></div>
                    </div>
                </div>
            </div>
        </div>
    `,J(),e}async function M(){let e=document.getElementById("usageBalanceValue"),n=document.getElementById("usageTotalValue"),t=document.getElementById("rechargeHistoryList"),s=w.getUser()?.id;try{let[i,r,g]=await Promise.all([fetch("/api/payment/balance",{credentials:"include"}),fetch(`/api/payment/usage?user_id=${s}&limit=1`,{credentials:"include"}),fetch("/api/payment/orders?limit=50",{credentials:"include"})]),f=await i.json(),P=await r.json(),B=await g.json();e&&(e.textContent=l(f.total||0)),n&&(n.textContent=l(P.total_consumption||0));let x=(B.orders||[]).filter(v=>v.status==="paid");if(x.length===0){t.innerHTML='<div class="usage-empty">\u6682\u65E0\u5145\u503C\u8BB0\u5F55</div>';return}t.innerHTML=x.map(v=>F(v)).join("")}catch(i){console.error("Load usage data error:",i),t.innerHTML=`
            <div class="usage-error">
                <div>\u52A0\u8F7D\u5931\u8D25</div>
                <button onclick="loadUsageData()">\u91CD\u8BD5</button>
            </div>
        `}}function F(e){let n=new Date(e.paid_at||e.created_at),t=n.toLocaleDateString("zh-CN",{month:"short",day:"numeric"}),a=n.toLocaleTimeString("zh-CN",{hour:"2-digit",minute:"2-digit"});return`
        <div class="usage-record">
            <div class="usage-record-left">
                <div class="usage-record-title">\u5145\u503C \xA5${e.amount}</div>
                <div class="usage-record-time">${t} ${a}</div>
            </div>
            <div class="usage-record-tokens recharge">+${l(e.tokens)}</div>
        </div>
    `}function J(){if(document.getElementById("usage-modal-styles"))return;let e=document.createElement("style");e.id="usage-modal-styles",e.textContent=`
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
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        .usage-modal-header h2 {
            margin: 0;
            font-size: 18px;
            font-weight: 600;
            color: #f1f5f9;
        }
        .usage-refresh-btn {
            background: rgba(255, 255, 255, 0.1);
            border: none;
            border-radius: 8px;
            padding: 6px 10px;
            font-size: 14px;
            cursor: pointer;
            transition: all 0.2s;
            color: #94a3b8;
        }
        .usage-refresh-btn:hover {
            background: rgba(255, 255, 255, 0.2);
            color: #f1f5f9;
        }
        .usage-refresh-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
        .usage-refresh-btn.spinning {
            animation: spin 1s linear infinite;
        }
        @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
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
    `,document.head.appendChild(e)}export{Q as closePaymentModal,A as closeUsageModal,l as formatTokens,R as openPaymentModal,O as openUsageModal};
