# 订阅制方案

## 计费模式

| 档位 | 价格 | 权益 |
|------|------|------|
| 免费版 | ¥0 | 100K Token（约20篇），用完即止 |
| 月度会员 | ¥19.9/月 | 150次/月使用配额 |
| 年度会员 | ¥159/年 | 1800次/年使用配额（省33%） |

## 核心逻辑

### 免费用户
- 保持现有 Token 机制
- 注册赠送 100K Token
- Token 用完后提示订阅
- Token 消耗正常记录

### 会员用户
- 订阅有效期内享有使用次数配额
- 月付用户：150次/月，每月重置
- 年付用户：1800次/年，不按月重置
- Token 消耗仅记录，不扣减余额（用于统计）
- 订阅到期后回退为免费用户

## 数据库设计

### 新增表：user_subscriptions

```sql
CREATE TABLE IF NOT EXISTS user_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE,
    plan_type TEXT NOT NULL DEFAULT 'free',  -- 'free', 'monthly', 'yearly'
    start_at INTEGER,           -- 订阅开始时间
    expire_at INTEGER,          -- 订阅到期时间
    usage_quota INTEGER DEFAULT 0,   -- 总配额
    usage_used INTEGER DEFAULT 0,    -- 已使用次数
    last_reset_at INTEGER,      -- 上次重置时间（月付用户）
    auto_renew INTEGER DEFAULT 0,  -- 是否自动续费
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_user_sub_user ON user_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sub_expire ON user_subscriptions(expire_at);
```

### 新增表：subscription_plans

```sql
CREATE TABLE IF NOT EXISTS subscription_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,           -- '月度会员', '年度会员'
    plan_type TEXT NOT NULL,      -- 'monthly', 'yearly'
    price_cents INTEGER NOT NULL, -- 1990, 15900
    duration_days INTEGER NOT NULL, -- 30, 365
    usage_quota INTEGER NOT NULL, -- 150, 1800
    badge TEXT,                   -- null, '省33%'
    is_active INTEGER DEFAULT 1,
    sort_order INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL
);
```

### 修改表：payment_orders

添加字段区分 Token 充值和订阅购买：
```sql
ALTER TABLE payment_orders ADD COLUMN order_type TEXT DEFAULT 'token';  -- 'token', 'subscription'
ALTER TABLE payment_orders ADD COLUMN subscription_plan_id INTEGER;
```

## API 设计

### 获取订阅状态
```
GET /api/subscription/status

Response:
{
    "plan_type": "free",  // "free", "monthly", "yearly"
    "is_vip": false,
    "expire_at": null,
    "days_remaining": null,
    "usage_quota": 0,        // 总配额
    "usage_used": 0,         // 已使用
    "usage_remaining": 0,    // 剩余次数
    "token_balance": 85000   // 免费用户显示
}
```

### 获取订阅套餐
```
GET /api/subscription/plans

Response:
{
    "plans": [
        {"id": 1, "name": "月度会员", "price": 19.9, "duration_days": 30, "usage_quota": 150},
        {"id": 2, "name": "年度会员", "price": 159, "duration_days": 365, "usage_quota": 1800, "badge": "省33%"}
    ]
}
```

### 创建订阅订单
```
POST /api/subscription/create
Body: {"plan_id": 1}

Response:
{
    "order_no": "SUB20260124...",
    "code_url": "weixin://...",
    "amount": 9.9,
    "expire_at": 1737612345
}
```

## 权限检查逻辑

```python
def can_use_summary(user_id: int) -> Tuple[bool, str, dict]:
    """
    检查用户是否可以使用总结功能
    Returns: (can_use, permission_type, extra_info)
    
    permission_type:
    - "vip": VIP用户且有剩余次数
    - "token": 免费用户且有Token余额
    - "quota_exceeded": VIP用户但次数用完
    - "no_quota": 免费用户且Token用完
    """
    # 1. 检查是否是会员且有剩余次数
    subscription = get_user_subscription(user_id)
    if subscription and subscription['expire_at'] > now:
        if subscription['usage_remaining'] > 0:
            return True, "vip", {"usage_remaining": subscription['usage_remaining']}
        else:
            return False, "quota_exceeded", {"expire_at": subscription['expire_at']}
    
    # 2. 非会员检查 Token 余额
    balance = get_user_token_balance(user_id)
    if balance['total'] > 0:
        return True, "token", {"token_balance": balance['total']}
    
    return False, "no_quota", {}
```

## 前端改动

### 总结按钮
- 会员：显示 VIP 标识和剩余次数
- 免费用户：显示剩余 Token，不足时弹出订阅窗口

### 用户设置页
- 显示当前会员状态
- 会员到期时间和剩余次数
- 订阅/续费按钮

### 订阅弹窗
- 两个套餐卡片（月付¥19.9/150次，年付¥159/1800次）
- 年付显示"省33%"标签
- 微信支付二维码

## 实现步骤

1. [ ] 创建数据库表（subscription_plans, user_subscriptions）
2. [ ] 实现订阅状态 API
3. [ ] 实现订阅套餐 API
4. [ ] 实现创建订阅订单 API
5. [ ] 修改支付回调处理订阅订单
6. [ ] 修改权限检查逻辑
7. [ ] 前端订阅弹窗
8. [ ] 前端会员状态显示
