import{a as m}from"./chunk-YRL7WKAS.js";var d=null,c=null,y=null,g=null,u=0,x=null,B=5*60;async function T(){return d||new Promise((e,t)=>{if(window.QRCode){d=window.QRCode,e(d);return}let n=document.createElement("script");n.src="/static/js/lib/qrcode.min.js",n.onload=()=>{d=window.QRCode,e(d)},n.onerror=t,document.head.appendChild(n)})}function r(e){return e>=1e6?(e/1e6).toFixed(1).replace(/\.0$/,"")+"M":e>=1e3?(e/1e3).toFixed(0)+"K":e.toString()}async function L(){if(!m.getUser()){window.Toast?.show("\u8BF7\u5148\u767B\u5F55","error"),window.openLoginModal?.();return}let t=document.getElementById("paymentModal");t||(t=Q(),document.body.appendChild(t)),c=null,x=null,o(),t.classList.add("open"),await C()}function R(){let e=document.getElementById("paymentModal");e&&e.classList.remove("open"),o(),p(),c=null,x=null}function Q(){let e=document.createElement("div");return e.id="paymentModal",e.className="payment-modal",e.innerHTML=`
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
                    <div class="payment-loading">\u52A0\u8F7D\u4E2D...</div>
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
    `,e}async function C(){let e=document.getElementById("paymentPlansSection"),t=document.getElementById("paymentCurrentBalance");try{let[n,a]=await Promise.all([fetch("/api/payment/plans"),fetch("/api/payment/balance")]),s=await n.json(),i=await a.json();if(t&&(t.textContent=r(i.total||0)),!s.configured){e.innerHTML=`
                <div class="payment-not-configured">
                    <div class="payment-not-configured-icon">\u{1F527}</div>
                    <div>\u652F\u4ED8\u670D\u52A1\u6682\u672A\u5F00\u653E</div>
                </div>
            `;return}let l=s.plans||[];if(l.length===0){e.innerHTML='<div class="payment-loading">\u6682\u65E0\u53EF\u7528\u5957\u9910</div>';return}e.innerHTML=`
            <div class="payment-plans-grid">
                ${l.map((f,v)=>$(f,v===1)).join("")}
            </div>
            <div class="payment-plans-note">
                <span>\u{1F4A1}</span> \u5145\u503C\u540E 1 \u5E74\u5185\u6709\u6548\uFF0C\u53EF\u7528\u4E8E AI \u667A\u80FD\u603B\u7ED3
            </div>
        `}catch(n){console.error("Load plans error:",n),e.innerHTML=`
            <div class="payment-error">
                <div>\u52A0\u8F7D\u5931\u8D25</div>
                <button onclick="loadPlans()">\u91CD\u8BD5</button>
            </div>
        `}}function $(e,t=!1){let n=Math.floor(e.tokens/5e3);return`
        <div class="payment-plan-card ${t?"recommended":""}" 
             data-plan-id="${e.id}"
             onclick="selectPlan(${e.id})">
            ${t?'<div class="payment-plan-badge">\u63A8\u8350</div>':""}
            <div class="payment-plan-name">${e.name}</div>
            <div class="payment-plan-price">
                <span class="payment-plan-currency">\xA5</span>
                <span class="payment-plan-amount">${e.price}</span>
            </div>
            <div class="payment-plan-tokens">${r(e.tokens)} Tokens</div>
            <div class="payment-plan-desc">\u7EA6 ${n} \u6B21\u603B\u7ED3</div>
        </div>
    `}async function S(e){x=e,document.querySelectorAll(".payment-plan-card").forEach(s=>{s.classList.toggle("selected",s.dataset.planId==e)});let t=document.getElementById("paymentPlansSection"),n=document.getElementById("paymentQRSection"),a=document.getElementById("paymentStatus");t.style.display="none",n.style.display="block",a.textContent="\u6B63\u5728\u521B\u5EFA\u8BA2\u5355...",a.className="payment-status";try{let s=await fetch("/api/payment/create",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({plan_id:e})});if(!s.ok){let l=await s.json();throw new Error(l.detail||"\u521B\u5EFA\u8BA2\u5355\u5931\u8D25")}let i=await s.json();c=i.order_no,document.getElementById("paymentOrderAmount").textContent=i.amount,document.getElementById("paymentOrderTokens").textContent=r(i.tokens),await j(i.code_url),a.textContent="\u7B49\u5F85\u652F\u4ED8...",q(),D()}catch(s){console.error("Create order error:",s),a.textContent=s.message||"\u521B\u5EFA\u8BA2\u5355\u5931\u8D25",a.className="payment-status error"}}async function j(e){let t=document.getElementById("paymentQRCode");t.innerHTML="";try{await T(),new d(t,{text:e,width:200,height:200,colorDark:"#1d1d1f",colorLight:"#ffffff",correctLevel:d.CorrectLevel.M})}catch(n){console.error("QR code error:",n),t.innerHTML='<div class="payment-qr-error">\u4E8C\u7EF4\u7801\u751F\u6210\u5931\u8D25</div>'}}function k(){o(),p(),c=null,document.getElementById("paymentPlansSection").style.display="block",document.getElementById("paymentQRSection").style.display="none",document.getElementById("paymentSuccessSection").style.display="none"}function q(){o();let e=0,t=600;y=setInterval(async()=>{if(!c){o();return}if(e++,e>t){o();let n=document.getElementById("paymentStatus");n.textContent="\u8BA2\u5355\u5DF2\u8D85\u65F6\uFF0C\u8BF7\u91CD\u65B0\u4E0B\u5355",n.className="payment-status error";return}try{let a=await(await fetch(`/api/payment/status?order_no=${c}`)).json();if(a.status==="paid")o(),E(a.tokens_added||a.tokens);else if(a.status==="expired"){o();let s=document.getElementById("paymentStatus");s.textContent="\u8BA2\u5355\u5DF2\u8FC7\u671F\uFF0C\u8BF7\u91CD\u65B0\u4E0B\u5355",s.className="payment-status error"}}catch(n){console.error("Poll status error:",n)}},1e3)}function o(){y&&(clearInterval(y),y=null)}function D(){p(),u=B,b(),g=setInterval(()=>{u--,b(),u<=0&&(p(),N())},1e3)}function p(){g&&(clearInterval(g),g=null)}function b(){let e=document.getElementById("countdownTime");if(!e)return;let t=Math.floor(u/60),n=u%60;e.textContent=`${t}:${n.toString().padStart(2,"0")}`;let a=document.getElementById("paymentCountdown");a&&a.classList.toggle("warning",u<=60)}function N(){o();let e=document.getElementById("paymentStatus");e&&(e.textContent="\u4E8C\u7EF4\u7801\u5DF2\u8FC7\u671F",e.className="payment-status error");let t=document.getElementById("paymentQRCode");t&&(t.innerHTML=`
            <div class="payment-qr-expired">
                <div class="payment-qr-expired-icon">\u23F0</div>
                <div class="payment-qr-expired-text">\u4E8C\u7EF4\u7801\u5DF2\u8FC7\u671F</div>
                <button class="payment-qr-refresh-btn" onclick="refreshQRCode()">\u5237\u65B0\u4E8C\u7EF4\u7801</button>
            </div>
        `)}async function U(){let e=document.querySelector(".payment-plan-card.selected");if(!e){k();return}let t=parseInt(e.dataset.planId);await S(t)}function E(e){p(),document.getElementById("paymentPlansSection").style.display="none",document.getElementById("paymentQRSection").style.display="none",document.getElementById("paymentSuccessSection").style.display="flex",document.getElementById("paymentSuccessTokens").textContent=r(e),window.dispatchEvent(new CustomEvent("payment-success",{detail:{tokens:e}}))}async function H(){if(!c)return;let e=document.getElementById("paymentStatus");e.textContent="\u6B63\u5728\u67E5\u8BE2...",e.className="payment-status";try{let n=await(await fetch(`/api/payment/status?order_no=${c}`)).json();n.status==="paid"?(o(),E(n.tokens_added||n.tokens)):n.status==="expired"?(o(),e.textContent="\u8BA2\u5355\u5DF2\u8FC7\u671F\uFF0C\u8BF7\u91CD\u65B0\u4E0B\u5355",e.className="payment-status error"):(e.textContent="\u5C1A\u672A\u652F\u4ED8\uFF0C\u8BF7\u5B8C\u6210\u652F\u4ED8\u540E\u518D\u8BD5",e.className="payment-status")}catch(t){console.error("Manual check error:",t),e.textContent="\u67E5\u8BE2\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u518D\u8BD5",e.className="payment-status error"}}window.openTokenPaymentModal=L;window.closePaymentModal=R;window.selectPlan=S;window.showPlansSection=k;window.loadPlans=C;window.openUsageModal=_;window.closeUsageModal=O;window.refreshUsageData=z;window.manualCheckPayment=H;window.refreshQRCode=U;async function z(){let e=document.querySelector(".usage-refresh-btn");e&&(e.classList.add("spinning"),e.disabled=!0);try{await I()}finally{e&&(e.classList.remove("spinning"),e.disabled=!1)}}async function _(){if(!m.getUser()){window.Toast?.show("\u8BF7\u5148\u767B\u5F55","error"),window.openLoginModal?.();return}let t=document.getElementById("usageModal");t||(t=A(),document.body.appendChild(t)),t.classList.add("open"),await I()}function O(){let e=document.getElementById("usageModal");e&&e.classList.remove("open")}function A(){let e=document.createElement("div");return e.id="usageModal",e.className="usage-modal",e.innerHTML=`
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
                        <div class="usage-loading">\u52A0\u8F7D\u4E2D...</div>
                    </div>
                </div>
            </div>
        </div>
    `,F(),e}async function I(){let e=document.getElementById("usageBalanceValue"),t=document.getElementById("usageTotalValue"),n=document.getElementById("rechargeHistoryList"),s=m.getUser()?.id;try{let[i,l,f]=await Promise.all([fetch("/api/payment/balance",{credentials:"include"}),fetch(`/api/payment/usage?user_id=${s}&limit=1`,{credentials:"include"}),fetch("/api/payment/orders?limit=50",{credentials:"include"})]),v=await i.json(),M=await l.json(),P=await f.json();e&&(e.textContent=r(v.total||0)),t&&(t.textContent=r(M.total_consumption||0));let w=(P.orders||[]).filter(h=>h.status==="paid");if(w.length===0){n.innerHTML='<div class="usage-empty">\u6682\u65E0\u5145\u503C\u8BB0\u5F55</div>';return}n.innerHTML=w.map(h=>V(h)).join("")}catch(i){console.error("Load usage data error:",i),n.innerHTML=`
            <div class="usage-error">
                <div>\u52A0\u8F7D\u5931\u8D25</div>
                <button onclick="loadUsageData()">\u91CD\u8BD5</button>
            </div>
        `}}function V(e){let t=new Date(e.paid_at||e.created_at),n=t.toLocaleDateString("zh-CN",{month:"short",day:"numeric"}),a=t.toLocaleTimeString("zh-CN",{hour:"2-digit",minute:"2-digit"});return`
        <div class="usage-record">
            <div class="usage-record-left">
                <div class="usage-record-title">\u5145\u503C \xA5${e.amount}</div>
                <div class="usage-record-time">${n} ${a}</div>
            </div>
            <div class="usage-record-tokens recharge">+${r(e.tokens)}</div>
        </div>
    `}function F(){if(document.getElementById("usage-modal-styles"))return;let e=document.createElement("style");e.id="usage-modal-styles",e.textContent=`
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
    `,document.head.appendChild(e)}export{R as closePaymentModal,O as closeUsageModal,r as formatTokens,L as openPaymentModal,_ as openUsageModal};
