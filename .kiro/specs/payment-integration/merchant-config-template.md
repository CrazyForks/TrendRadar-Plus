# 微信支付商户配置

> [!IMPORTANT]
> 请填写以下信息以完成支付系统配置。**请勿将此文件提交到公开仓库！**

## 商户基本信息

### 微信支付商户
```yaml
# 商户号
mch_id: "填写你的商户号"

# 商户名称
merchant_name: "填写你的商户名称"

# API 密钥 (32位)
# 在 微信商户平台 -> 账户中心 -> API安全 -> 设置API密钥
api_key: "填写你的API密钥"

# API v3 密钥 (32位)
# 在 微信商户平台 -> 账户中心 -> API安全 -> 设置APIv3密钥
api_v3_key: "填写你的APIv3密钥"
```

### 公众号信息（JSAPI 支付必填）
```yaml
# 公众号 AppID
appid: "填写你的公众号AppID"

# 公众号 AppSecret
app_secret: "填写你的AppSecret"
```

### API 证书
```yaml
# 证书序列号
# 在 微信商户平台 -> 账户中心 -> API安全 -> 管理证书
certificate_serial_no: "填写证书序列号"

# 证书文件路径
# 下载的 apiclient_cert.pem 和 apiclient_key.pem
cert_path: "/path/to/apiclient_cert.pem"
key_path: "/path/to/apiclient_key.pem"
```

---

## 支付方式配置

### 你选择启用哪些支付方式？
- [ ] JSAPI 支付（微信内网页，推荐）
- [ ] H5 支付（微信外浏览器）
- [ ] Native 支付（PC 扫码）

---

## 充值套餐配置

### 套餐定价方案

```yaml
packages:
  - id: 1
    name: "体验套餐"
    price: 10.00          # 价格（元）
    token_amount: 10000   # Token 数量
    bonus_tokens: 0       # 赠送 Token
    display_tag: ""       # 显示标签
    
  - id: 2
    name: "标准套餐"
    price: 50.00
    token_amount: 60000
    bonus_tokens: 10000
    display_tag: "推荐"
    
  - id: 3
    name: "专业套餐"
    price: 100.00
    token_amount: 150000
    bonus_tokens: 50000
    display_tag: "最超值"
```

### Token 消耗规则
```yaml
# AI 摘要每次消耗
ai_summary_cost: 500  # Token/次

# 其他功能消耗（待定）
# ...
```

---

## 回调配置

### 回调地址
```yaml
# 支付成功回调 URL（必须是 HTTPS）
notify_url: "https://yourdomain.com/api/payment/wechat/callback"

# 前端支付完成跳转地址
return_url: "https://yourdomain.com/recharge/success"
```

### 域名配置
```yaml
# 网站域名
domain: "yourdomain.com"

# ICP 备案号
icp_number: "填写备案号"
```

---

## 安全配置

### IP 白名单
在微信商户平台配置服务器 IP 白名单：
```
服务器 IP: 填写你的服务器公网IP
```

### 回调地址白名单
在微信商户平台配置支付回调地址：
```
https://yourdomain.com/api/payment/wechat/callback
```

---

## 环境变量配置

将以上信息配置到环境变量或配置文件：

```bash
# .env 示例
WECHAT_PAY_MCH_ID=your_mch_id
WECHAT_PAY_API_KEY=your_api_key
WECHAT_PAY_API_V3_KEY=your_api_v3_key
WECHAT_PAY_APPID=your_appid
WECHAT_PAY_CERT_PATH=/path/to/cert.pem
WECHAT_PAY_KEY_PATH=/path/to/key.pem
WECHAT_PAY_NOTIFY_URL=https://yourdomain.com/api/payment/wechat/callback
```

---

## 配置完成检查清单

- [ ] 填写商户号和 API 密钥
- [ ] 下载并配置 API 证书
- [ ] 配置公众号信息（如使用 JSAPI）
- [ ] 设计充值套餐方案
- [ ] 配置回调 URL（确保 HTTPS）
- [ ] 在微信商户平台设置 IP 白名单
- [ ] 在微信商户平台设置回调地址白名单
- [ ] 设置环境变量

---

> [!CAUTION]
> **安全提醒**：
> - 请妥善保管 API 密钥和证书文件
> - 不要将此文件提交到代码仓库
> - 建议将敏感信息配置到环境变量或密钥管理系统
> - 定期更换 API 密钥
