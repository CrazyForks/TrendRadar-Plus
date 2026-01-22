# Token 充值系统 - 微信支付集成

## 概述

为 HotNews 项目实现基于微信支付的 Token 充值系统，用户可通过微信支付购买 Token 用于 AI 摘要功能。

## 文件结构

```
payment-integration/
├── README.md          # 本文件，项目概述
├── spec.md           # 详细技术规范和实现方案
└── merchant-config-template.md  # 商户配置模板（待填写）
```

## 核心功能

1. **充值套餐管理** - 配置多档位充值套餐
2. **微信支付集成** - JSAPI/H5/Native 支付
3. **订单管理** - 订单创建、状态追踪、回调处理
4. **Token 发放** - 自动到账、交易记录
5. **充值记录** - 用户充值历史查询

## 当前状态

- [x] 技术方案设计完成
- [ ] 商户信息配置
- [ ] 数据库表创建
- [ ] 后端 API 实现
- [ ] 前端 UI 开发
- [ ] 测试与部署

## 下一步

查看 [spec.md](./spec.md) 了解详细实现方案，填写 [merchant-config-template.md](./merchant-config-template.md) 提供商户信息。
