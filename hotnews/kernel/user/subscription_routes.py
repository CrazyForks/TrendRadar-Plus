# coding=utf-8
"""
Subscription Routes - 订阅API端点

提供订阅套餐查询、订阅状态查询和创建订阅订单的API。
"""

import os
import time
import json
import uuid
import logging
from typing import Optional, Dict, Any, Tuple

from fastapi import APIRouter, Request, HTTPException, Body

from .subscription_service import (
    get_active_subscription_plans,
    get_subscription_plan_by_id,
    get_subscription_status,
    create_or_update_subscription,
)
from .payment_api import (
    get_wechat_pay_config,
    is_wechat_pay_configured,
    generate_order_no,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/subscription", tags=["subscription"])


def _get_online_db_conn(request: Request):
    from hotnews.web.db_online import get_online_db_conn
    return get_online_db_conn(request.app.state.project_root)


from hotnews.kernel.auth.deps import get_current_user as _get_current_user


@router.get("/plans")
async def handle_get_plans(request: Request):
    """获取订阅套餐列表"""
    try:
        conn = _get_online_db_conn(request)
        plans = get_active_subscription_plans(conn)
        return {"plans": plans}
    except Exception as e:
        logger.exception(f"Get subscription plans error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/status")
async def handle_get_status(request: Request):
    """获取用户订阅状态"""
    try:
        user = _get_current_user(request)
        conn = _get_online_db_conn(request)
        
        # 获取订阅状态（已包含使用次数信息）
        status = get_subscription_status(conn, user["id"])
        
        return status
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Get subscription status error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/create")
async def handle_create_order(
    request: Request,
    plan_id: int = Body(..., embed=True)
):
    """创建订阅订单"""
    try:
        user = _get_current_user(request)
        conn = _get_online_db_conn(request)
        
        # 创建订阅支付订单
        result, error = await create_subscription_payment(plan_id, user["id"], conn)
        
        if error:
            raise HTTPException(status_code=400, detail=error)
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Create subscription order error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


async def create_subscription_payment(
    plan_id: int,
    user_id: int,
    conn
) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    """
    创建订阅支付订单
    Returns (result_dict, error_message)
    """
    import httpx
    
    if not is_wechat_pay_configured():
        return None, "微信支付未配置"
    
    # 获取订阅套餐
    plan = get_subscription_plan_by_id(conn, plan_id)
    if not plan:
        return None, "套餐不存在"
    
    config = get_wechat_pay_config()
    
    # 生成订单号
    order_no = generate_order_no()
    amount_cents = plan["price_cents"]
    
    # 准备请求体
    body = {
        "appid": config["appid"],
        "mchid": config["mchid"],
        "description": f"HotNews会员 - {plan['name']}",
        "out_trade_no": order_no,
        "notify_url": config["notify_url"],
        "amount": {
            "total": amount_cents,
            "currency": "CNY"
        }
    }
    
    try:
        # 加载私钥
        private_key_path = config["private_key_path"]
        if not os.path.exists(private_key_path):
            return None, "支付证书未配置"
        
        with open(private_key_path, "r") as f:
            private_key_content = f.read()
        
        # 生成签名
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import padding
        from cryptography.hazmat.backends import default_backend
        import base64
        
        timestamp = str(int(time.time()))
        nonce_str = uuid.uuid4().hex
        
        method = "POST"
        url_path = "/v3/pay/transactions/native"
        body_str = json.dumps(body)
        sign_str = f"{method}\n{url_path}\n{timestamp}\n{nonce_str}\n{body_str}\n"
        
        private_key = serialization.load_pem_private_key(
            private_key_content.encode(),
            password=None,
            backend=default_backend()
        )
        signature = private_key.sign(
            sign_str.encode(),
            padding.PKCS1v15(),
            hashes.SHA256()
        )
        signature_b64 = base64.b64encode(signature).decode()
        
        auth_header = (
            f'WECHATPAY2-SHA256-RSA2048 '
            f'mchid="{config["mchid"]}",'
            f'nonce_str="{nonce_str}",'
            f'signature="{signature_b64}",'
            f'timestamp="{timestamp}",'
            f'serial_no="{config["cert_serial_no"]}"'
        )
        
        headers = {
            "Authorization": auth_header,
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        
        # 调用微信支付API
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                "https://api.mch.weixin.qq.com/v3/pay/transactions/native",
                headers=headers,
                content=body_str
            )
            
            logger.info(f"WeChat Pay API response: status={resp.status_code}")
            
            if resp.status_code != 200:
                error_data = resp.json() if resp.content else {}
                error_msg = error_data.get("message", f"微信支付错误: {resp.status_code}")
                logger.error(f"WeChat Pay API error: {resp.status_code} - {resp.text}")
                return None, error_msg
            
            result = resp.json()
            code_url = result.get("code_url")
            
            if not code_url:
                return None, "未获取到支付二维码"
            
            # 保存订单到数据库
            now = int(time.time())
            expire_at = now + 30 * 60
            
            conn.execute("""
                INSERT INTO payment_orders 
                (order_no, user_id, plan_id, amount_cents, tokens, status, code_url, 
                 expire_at, created_at, updated_at, order_type, subscription_plan_id)
                VALUES (?, ?, ?, ?, 0, 'pending', ?, ?, ?, ?, 'subscription', ?)
            """, (order_no, user_id, plan_id, amount_cents, code_url, expire_at, now, now, plan_id))
            conn.commit()
            
            logger.info(f"Subscription order created: order_no={order_no}, user={user_id}, plan={plan['name']}")
            
            return {
                "order_no": order_no,
                "code_url": code_url,
                "amount": plan["price"],
                "amount_cents": amount_cents,
                "plan_name": plan["name"],
                "duration_days": plan["duration_days"],
                "usage_quota": plan["usage_quota"],
                "expire_at": expire_at,
            }, None
            
    except Exception as e:
        logger.exception(f"Create subscription payment error: {e}")
        return None, f"创建支付订单失败: {str(e)}"
