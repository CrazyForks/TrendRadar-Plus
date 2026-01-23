# coding=utf-8
"""
Payment API Routes

Provides endpoints for WeChat Pay Token recharge.
"""

import logging
from typing import Optional
from fastapi import APIRouter, Request, HTTPException, Body
from fastapi.responses import JSONResponse

from hotnews.kernel.user.payment_api import (
    get_active_plans,
    get_plan_by_id,
    get_order_by_no,
    get_user_token_balance,
    create_native_payment,
    verify_wechat_callback,
    handle_payment_callback,
    get_wechat_pay_config,
    is_wechat_pay_configured,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/payment", tags=["payment"])


def _get_online_db(request: Request):
    """Get online database connection."""
    from hotnews.web.db_online import get_online_db_conn
    return get_online_db_conn(request.app.state.project_root)


def _get_current_user_id(request: Request) -> Optional[int]:
    """Get current logged-in user ID from session."""
    session_data = getattr(request.state, "session", None)
    if session_data and isinstance(session_data, dict):
        return session_data.get("user_id")
    
    # Try cookie-based auth
    from hotnews.web.user_db import resolve_user_id_by_cookie_token, get_user_db_conn
    tok = (request.cookies.get("rss_uid") or "").strip()
    if tok:
        try:
            return resolve_user_id_by_cookie_token(
                conn=get_user_db_conn(request.app.state.project_root),
                token=tok
            )
        except:
            pass
    return None


def _require_login(request: Request) -> int:
    """Require user to be logged in, return user_id or raise 401."""
    user_id = _get_current_user_id(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="请先登录")
    return user_id


@router.get("/plans")
async def list_plans(request: Request):
    """
    Get available recharge plans.
    
    Returns:
        List of plans with id, name, price, tokens, validity_days
    """
    conn = _get_online_db(request)
    plans = get_active_plans(conn)
    
    return {
        "plans": plans,
        "configured": is_wechat_pay_configured(),
    }


@router.post("/create")
async def create_payment(
    request: Request,
    plan_id: int = Body(..., embed=True)
):
    """
    Create a payment order and get QR code URL.
    
    Args:
        plan_id: ID of the recharge plan
        
    Returns:
        order_no, code_url (for QR code), amount, expire_at
    """
    user_id = _require_login(request)
    
    if not is_wechat_pay_configured():
        raise HTTPException(status_code=503, detail="支付服务未配置")
    
    conn = _get_online_db(request)
    
    result, error = await create_native_payment(plan_id, user_id, conn)
    
    if error:
        raise HTTPException(status_code=400, detail=error)
    
    return result


@router.get("/status")
async def check_order_status(
    request: Request,
    order_no: str
):
    """
    Check payment order status.
    
    Args:
        order_no: Order number
        
    Returns:
        status (pending/paid/expired), tokens_added (if paid)
    """
    user_id = _require_login(request)
    conn = _get_online_db(request)
    
    order = get_order_by_no(conn, order_no)
    
    if not order:
        raise HTTPException(status_code=404, detail="订单不存在")
    
    # Security: only allow user to check their own orders
    if order["user_id"] != user_id:
        raise HTTPException(status_code=403, detail="无权查看此订单")
    
    result = {
        "status": order["status"],
        "order_no": order["order_no"],
        "amount": order["amount_cents"] / 100,
        "tokens": order["tokens"],
    }
    
    if order["status"] == "paid":
        result["tokens_added"] = order["tokens"]
        result["paid_at"] = order["wx_pay_time"]
    
    return result


@router.post("/notify")
async def payment_notify(request: Request):
    """
    WeChat Pay callback notification.
    
    This endpoint is called by WeChat servers when payment status changes.
    Must return proper response format for WeChat.
    """
    try:
        # Get raw body
        body = await request.body()
        headers = dict(request.headers)
        
        config = get_wechat_pay_config()
        api_v3_key = config.get("api_v3_key", "")
        
        if not api_v3_key:
            logger.error("WeChat Pay API v3 key not configured")
            return JSONResponse(
                status_code=500,
                content={"code": "FAIL", "message": "服务配置错误"}
            )
        
        # Verify and decrypt callback
        decrypted, error = verify_wechat_callback(headers, body, api_v3_key)
        
        if error:
            logger.error(f"Callback verification failed: {error}")
            return JSONResponse(
                status_code=400,
                content={"code": "FAIL", "message": error}
            )
        
        # Handle the payment
        conn = _get_online_db(request)
        success, message = await handle_payment_callback(conn, decrypted)
        
        if success:
            # Return success to WeChat (empty 200 response)
            return JSONResponse(
                status_code=200,
                content={"code": "SUCCESS", "message": "OK"}
            )
        else:
            logger.error(f"Payment handling failed: {message}")
            return JSONResponse(
                status_code=500,
                content={"code": "FAIL", "message": message}
            )
            
    except Exception as e:
        logger.exception(f"Payment notify error: {e}")
        return JSONResponse(
            status_code=500,
            content={"code": "FAIL", "message": str(e)}
        )


@router.get("/balance")
async def get_balance(request: Request):
    """
    Get user's token balance.
    
    Returns:
        total: Total available tokens
        details: List of recharge records with remaining tokens
    """
    user_id = _require_login(request)
    conn = _get_online_db(request)
    
    balance = get_user_token_balance(conn, user_id)
    
    return balance


@router.get("/orders")
async def list_orders(
    request: Request,
    limit: int = 20
):
    """
    Get user's payment order history.
    
    Args:
        limit: Max number of orders to return
        
    Returns:
        List of orders
    """
    user_id = _require_login(request)
    conn = _get_online_db(request)
    
    cur = conn.execute("""
        SELECT id, order_no, plan_id, amount_cents, tokens, status, 
               wx_pay_time, created_at
        FROM payment_orders
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT ?
    """, (user_id, min(limit, 100)))
    
    orders = []
    for row in cur.fetchall():
        orders.append({
            "id": row[0],
            "order_no": row[1],
            "plan_id": row[2],
            "amount": row[3] / 100,
            "tokens": row[4],
            "status": row[5],
            "paid_at": row[6],
            "created_at": row[7],
        })
    
    return {"orders": orders}
