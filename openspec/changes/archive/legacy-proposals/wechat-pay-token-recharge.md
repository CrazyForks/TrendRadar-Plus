# 微信支付 Token 充值方案

## 需求概述

用户通过微信支付购买 Token 额度，用于 AI 总结功能。

## 支付方式

### Phase 1：Native 支付（当前实现）
- PC 端：显示二维码，用户扫码支付
- 移动端：显示二维码，长按识别或截图扫码

### Phase 2：H5 支付（后续）
- 手机浏览器直接跳转微信支付
- 需要在商户平台申请开通

### Phase 3：JSAPI 支付（可选）
- 微信内浏览器直接拉起支付
- 需要关联公众号

## 商业方案

### 定价档位（3 档）

| 档位 | 价格 | Token 额度 | 约可总结 | 有效期 |
|------|------|------------|----------|--------|
| 轻量版 | ¥9.9 | 500,000 | ~100篇 | 1年 |
| 标准版 | ¥29 | 2,000,000 | ~400篇 | 1年 |
| 专业版 | ¥99 | 7,500,000 | ~1500篇 | 1年 |

### 成本分析（qwen-plus）
- 输入：¥0.0008/千tokens
- 输出：¥0.002/千tokens
- 单次总结成本：~¥0.005

### 规则
- 额度 1 年有效，过期清零
- 多次充值额度累加，有效期各自独立
- 新用户注册已有 100k token 体验额度

---

## 技术方案

### 1. 支付流程

```
用户选择档位 → 创建订单 → 调用微信 Native 支付 → 返回二维码
     ↓
用户扫码支付 → 微信回调通知 → 验证签名 → 更新订单状态 → 增加用户 Token
     ↓
前端轮询订单状态 → 支付成功 → 刷新余额显示
```

### 2. 数据库设计

#### 2.1 充值套餐表 `recharge_plans`

```sql
CREATE TABLE IF NOT EXISTS recharge_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,              -- 套餐名称：轻量版/标准版/专业版
    price_cents INTEGER NOT NULL,    -- 价格（分）：990/2900/9900
    tokens INTEGER NOT NULL,         -- Token 数量
    validity_days INTEGER DEFAULT 365, -- 有效期（天）
    is_active INTEGER DEFAULT 1,     -- 是否上架
    sort_order INTEGER DEFAULT 0,    -- 排序
    created_at INTEGER NOT NULL
);

-- 初始数据
INSERT INTO recharge_plans (name, price_cents, tokens, validity_days, sort_order, created_at) VALUES
('轻量版', 990, 500000, 365, 1, strftime('%s', 'now')),
('标准版', 2900, 2000000, 365, 2, strftime('%s', 'now')),
('专业版', 9900, 7500000, 365, 3, strftime('%s', 'now'));
```

#### 2.2 订单表 `payment_orders`

```sql
CREATE TABLE IF NOT EXISTS payment_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_no TEXT UNIQUE NOT NULL,   -- 商户订单号（唯一）
    user_id INTEGER NOT NULL,        -- 用户 ID
    plan_id INTEGER NOT NULL,        -- 套餐 ID
    amount_cents INTEGER NOT NULL,   -- 支付金额（分）
    tokens INTEGER NOT NULL,         -- 购买的 Token 数量
    status TEXT DEFAULT 'pending',   -- pending/paid/expired/refunded
    wx_prepay_id TEXT,               -- 微信预支付 ID
    wx_transaction_id TEXT,          -- 微信支付订单号
    wx_pay_time INTEGER,             -- 微信支付时间
    code_url TEXT,                   -- 二维码链接
    expire_at INTEGER NOT NULL,      -- 订单过期时间（30分钟）
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (plan_id) REFERENCES recharge_plans(id)
);

CREATE INDEX idx_payment_orders_user ON payment_orders(user_id);
CREATE INDEX idx_payment_orders_status ON payment_orders(status);
CREATE INDEX idx_payment_orders_order_no ON payment_orders(order_no);
```

#### 2.3 Token 充值记录表 `token_recharge_logs`

```sql
CREATE TABLE IF NOT EXISTS token_recharge_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    order_id INTEGER NOT NULL,       -- 关联订单
    tokens INTEGER NOT NULL,         -- 充值数量
    expire_at INTEGER NOT NULL,      -- Token 过期时间
    remaining INTEGER NOT NULL,      -- 剩余数量（消费时扣减）
    created_at INTEGER NOT NULL,
    
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (order_id) REFERENCES payment_orders(id)
);

CREATE INDEX idx_token_recharge_user ON token_recharge_logs(user_id);
CREATE INDEX idx_token_recharge_expire ON token_recharge_logs(expire_at);
```

### 3. 微信支付配置

需要的配置项（存入环境变量）：

```bash
# 微信支付配置
WECHAT_PAY_MCHID=商户号
WECHAT_PAY_APPID=关联的AppID
WECHAT_PAY_API_V3_KEY=APIv3密钥
WECHAT_PAY_CERT_SERIAL_NO=证书序列号
WECHAT_PAY_PRIVATE_KEY_PATH=/path/to/apiclient_key.pem
WECHAT_PAY_NOTIFY_URL=https://your-domain.com/api/payment/notify
```

### 4. API 设计

#### 4.1 获取套餐列表

```
GET /api/payment/plans

Response:
{
    "plans": [
        {"id": 1, "name": "轻量版", "price": 9.9, "tokens": 500000, "validity_days": 365},
        {"id": 2, "name": "标准版", "price": 29, "tokens": 2000000, "validity_days": 365},
        {"id": 3, "name": "专业版", "price": 99, "tokens": 7500000, "validity_days": 365}
    ]
}
```

#### 4.2 创建订单（获取支付二维码）

```
POST /api/payment/create
Body: {"plan_id": 2}

Response:
{
    "order_no": "HN20260123123456789",
    "code_url": "weixin://wxpay/bizpayurl?pr=xxx",  -- 用于生成二维码
    "amount": 29.00,
    "expire_at": 1737612345
}
```

#### 4.3 查询订单状态

```
GET /api/payment/status?order_no=HN20260123123456789

Response:
{
    "status": "paid",  -- pending/paid/expired
    "tokens_added": 2000000  -- 支付成功时返回
}
```

#### 4.4 微信支付回调

```
POST /api/payment/notify

-- 微信服务器调用，验证签名后更新订单状态
```

#### 4.5 获取用户 Token 余额

```
GET /api/user/token-balance

Response:
{
    "total": 2500000,
    "details": [
        {"tokens": 500000, "remaining": 300000, "expire_at": 1768147200},
        {"tokens": 2000000, "remaining": 2000000, "expire_at": 1768147200}
    ]
}
```

### 5. 前端界面

#### 5.1 充值入口
- 用户设置页面添加"充值"按钮
- Token 不足时弹窗提示充值

#### 5.2 充值弹窗
- 显示 3 个套餐卡片
- 选择后显示微信支付二维码
- 轮询订单状态，支付成功后自动关闭

#### 5.3 余额显示
- 用户设置页显示当前余额和过期时间
- 总结时显示剩余额度

### 6. Token 消费逻辑

修改现有的 Token 扣减逻辑，优先消费即将过期的额度：

```python
def consume_tokens(user_id: int, amount: int) -> bool:
    """
    消费 Token，按过期时间优先消费
    返回是否成功
    """
    # 1. 查询用户所有未过期的充值记录，按过期时间排序
    # 2. 依次扣减，直到满足 amount
    # 3. 如果总余额不足，返回 False
```

### 7. 安全考虑

1. **签名验证**：所有微信回调必须验证签名
2. **幂等处理**：同一订单多次回调只处理一次
3. **订单过期**：30 分钟未支付自动过期
4. **金额校验**：回调金额必须与订单金额一致

### 8. 实现步骤

#### Phase 1: 基础设施
1. [x] 创建数据库表（recharge_plans, payment_orders, token_recharge_logs）
2. [x] 添加微信支付配置到 .env（需要填入 APIv3 密钥）
3. [x] 安装依赖（cryptography, httpx 已在 requirements.txt）

#### Phase 2: 后端 API
4. [x] 实现套餐列表 API (`GET /api/payment/plans`)
5. [x] 实现创建订单 API (`POST /api/payment/create`)
6. [x] 实现支付回调处理 (`POST /api/payment/notify`)
7. [x] 实现订单状态查询 API (`GET /api/payment/status`)
8. [x] 实现 Token 余额查询 (`GET /api/payment/balance`)
9. [x] Token 消费逻辑（支持多笔充值，按过期时间优先消费）

#### Phase 3: 前端界面
10. [x] 充值弹窗组件
11. [x] 二维码显示（使用 qrcode.js）
12. [x] 订单状态轮询
13. [ ] 余额显示优化

#### Phase 4: 测试部署
14. [ ] 配置微信支付证书（上传 pub_key.pem 到服务器）
15. [ ] 部署到生产环境
16. [ ] 真实支付测试

---

## 依赖

```txt
wechatpayv3>=1.2.0  # 微信支付 V3 SDK
qrcode>=7.0         # 二维码生成（可选，前端也可生成）
```

## 注意事项

1. 微信支付需要 HTTPS 域名
2. 回调地址需要在微信商户后台配置
3. 证书文件需要安全存储，不要提交到 Git
