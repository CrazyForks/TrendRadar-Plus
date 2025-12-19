# Project Context

## Purpose
TrendRadar 是一个多平台热点新闻聚合与 AI 分析工具，用于：
- 监控 35+ 平台的热点新闻（抖音、知乎、B站、微博、华尔街见闻、财联社等）
- 智能关键词筛选和热度权重计算
- 自动推送到企业微信、飞书、钉钉、Telegram 等渠道
- 通过 MCP (Model Context Protocol) 提供 AI 对话分析能力

## Tech Stack
- **语言**: Python 3.10+
- **包管理**: UV (astral-sh/uv)
- **MCP框架**: FastMCP
- **数据存储**: SQLite（本地）/ S3兼容存储（远程）
- **部署方式**: Docker / GitHub Actions / 本地运行

## Project Conventions

### Code Style
- 遵循 PEP 8 Python 代码风格
- 使用类型注解 (Type Hints)
- 函数和类使用 docstring 文档
- 中文注释和文档

### Architecture Patterns
- 爬虫模块化设计：每个平台一个爬虫类
- MCP 工具分离：每个功能独立的 MCP 工具
- 配置驱动：通过 config/config.yaml 管理配置

### Testing Strategy
- 功能测试：手动触发爬取验证
- MCP 工具测试：通过 AI 客户端调用验证

### Git Workflow
- main 分支为稳定版本
- 功能开发使用 feature/* 分支
- Conventional Commits 提交规范

## Domain Context
- 新闻聚合：从多个平台 API 或网页抓取热点新闻
- 热度计算：基于排名、平台权重计算综合热度分数
- 情感分析：分析新闻标题的情感倾向
- 趋势追踪：跟踪话题的热度变化趋势

## Important Constraints
- 爬虫频率需遵守各平台限制
- 数据存储需考虑隐私合规
- MCP 工具需保持低延迟响应

## External Dependencies
- 各平台热榜 API（知乎、微博、B站等）
- S3 兼容存储（Cloudflare R2、阿里云 OSS 等）
- 推送服务（企业微信、飞书、钉钉 Webhook）
