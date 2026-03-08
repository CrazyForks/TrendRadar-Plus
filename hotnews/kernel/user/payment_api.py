# coding=utf-8
"""
WeChat Pay API for Token Recharge

Implements Native Payment (扫码支付) for PC and mobile web.
"""

import os
import time
import json
import uuid
import hashlib
import logging
from typing import Optional, Tuple, List, Dict, Any

logger = logging.getLogger(__name__)

# ============================================
# Configuration
# ============================================

def get_wechat_pay_config() -> Dict[str, str]:
    """Get WeChat Pay configuration from environment."""
    return {
        "mchid": os.environ.get("WECHAT_PAY_MCHID", ""),
        "appid": os.environ.get("WECHAT_PAY_APPID", ""),
        "api_v3_key": os.environ.get("WECHAT_PAY_API_V3_KEY", ""),
        "cert_serial_no": os.environ.get("WECHAT_PAY_CERT_SERIAL_NO", ""),
        "private_key_path": os.environ.get("WECHAT_PAY_PRIVATE_KEY_PATH", ""),
        "notify_url": os.environ.get("WECHAT_PAY_NOTIFY_URL", ""),
    }


def is_wechat_pay_configured() -> bool:
    """Check if WeChat Pay is properly configured."""
    config = get_wechat_pay_config()
    required = ["mchid", "appid", "api_v3_key", "cert_serial_no", "private_key_path"]
    return all(config.get(k) for k in required)


# ============================================
# Database Schema
# ============================================

def init_payment_tables(conn):
    """Initialize payment-related database tables."""
    
    # Recharge plans table (Token充值套餐)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS recharge_plans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            price_cents INTEGER NOT NULL,
            tokens INTEGER NOT NULL,
            validity_days INTEGER DEFAULT 365,
            is_active INTEGER DEFAULT 1,
            sort_order INTEGER DEFAULT 0,
            created_at INTEGER NOT NULL
        )
    """)
    
    # Payment orders table
    conn.execute("""
        CREATE TABLE IF NOT EXISTS payment_orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_no TEXT UNIQUE NOT NULL,
            user_id INTEGER NOT NULL,
            plan_id INTEGER NOT NULL,
            amount_cents INTEGER NOT NULL,
            tokens INTEGER NOT NULL,
            status TEXT DEFAULT 'pending',
            wx_prepay_id TEXT,
            wx_transaction_id TEXT,
            wx_pay_time INTEGER,
            code_url TEXT,
            expire_at INTEGER NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            order_type TEXT DEFAULT 'token',
            subscription_plan_id INTEGER
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_payment_orders_user ON payment_orders(user_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_payment_orders_status ON payment_orders(status)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_payment_orders_order_no ON payment_orders(order_no)")
    
    # Migration: add new columns to existing payment_orders table (must be before index creation)
    try:
        conn.execute("ALTER TABLE payment_orders ADD COLUMN order_type TEXT DEFAULT 'token'")
    except:
        pass  # Column already exists
    try:
        conn.execute("ALTER TABLE payment_orders ADD COLUMN subscription_plan_id INTEGER")
    except:
        pass  # Column already exists
    
    # Now create index on order_type (after column exists)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_payment_orders_type ON payment_orders(order_type)")
    
    # Token recharge logs table
    conn.execute("""
        CREATE TABLE IF NOT EXISTS token_recharge_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            order_id INTEGER NOT NULL,
            tokens INTEGER NOT NULL,
            expire_at INTEGER NOT NULL,
            remaining INTEGER NOT NULL,
            created_at INTEGER NOT NULL
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_token_recharge_user ON token_recharge_logs(user_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_token_recharge_expire ON token_recharge_logs(expire_at)")
    
    # Token usage logs table (consumption history)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS token_usage_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            news_id TEXT,
            title TEXT,
            tokens_used INTEGER NOT NULL,
            created_at INTEGER NOT NULL
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_token_usage_user ON token_usage_logs(user_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_token_usage_created ON token_usage_logs(created_at DESC)")
    
    # ============================================
    # Subscription tables (订阅制)
    # ============================================
    
    # Subscription plans table (订阅套餐)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS subscription_plans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            plan_type TEXT NOT NULL,
            price_cents INTEGER NOT NULL,
            duration_days INTEGER NOT NULL,
            usage_quota INTEGER NOT NULL,
            badge TEXT,
            is_active INTEGER DEFAULT 1,
            sort_order INTEGER DEFAULT 0,
            created_at INTEGER NOT NULL
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_sub_plans_active ON subscription_plans(is_active)")
    
    # User subscriptions table (用户订阅状态)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS user_subscriptions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL UNIQUE,
            plan_type TEXT NOT NULL DEFAULT 'free',
            start_at INTEGER,
            expire_at INTEGER,
            usage_quota INTEGER DEFAULT 0,
            usage_used INTEGER DEFAULT 0,
            last_reset_at INTEGER,
            auto_renew INTEGER DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_user_sub_user ON user_subscriptions(user_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_user_sub_expire ON user_subscriptions(expire_at)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_user_sub_type ON user_subscriptions(plan_type)")
    
    # Insert default token recharge plans if not exist
    cur = conn.execute("SELECT COUNT(*) FROM recharge_plans")
    if cur.fetchone()[0] == 0:
        now = int(time.time())
        conn.execute("""
            INSERT INTO recharge_plans (name, price_cents, tokens, validity_days, sort_order, created_at)
            VALUES 
                ('轻量版', 990, 500000, 365, 1, ?),
                ('标准版', 2900, 2000000, 365, 2, ?),
                ('专业版', 9900, 7500000, 365, 3, ?)
        """, (now, now, now))
    
    # Insert default subscription plans if not exist
    cur = conn.execute("SELECT COUNT(*) FROM subscription_plans")
    if cur.fetchone()[0] == 0:
        now = int(time.time())
        conn.execute("""
            INSERT INTO subscription_plans (name, plan_type, price_cents, duration_days, usage_quota, badge, sort_order, created_at)
            VALUES 
                ('基础会员', 'monthly', 990, 30, 3, NULL, 1, ?),
                ('专业会员', 'monthly', 2990, 30, 10, '推荐', 2, ?)
        """, (now, now))
    
    conn.commit()


# ============================================
# Plan Management
# ============================================

def get_active_plans(conn) -> List[Dict[str, Any]]:
    """Get all active recharge plans."""
    cur = conn.execute("""
        SELECT id, name, price_cents, tokens, validity_days
        FROM recharge_plans
        WHERE is_active = 1
        ORDER BY sort_order
    """)
    
    plans = []
    for row in cur.fetchall():
        plans.append({
            "id": row[0],
            "name": row[1],
            "price": row[2] / 100,  # Convert cents to yuan
            "price_cents": row[2],
            "tokens": row[3],
            "validity_days": row[4],
        })
    return plans


def get_plan_by_id(conn, plan_id: int) -> Optional[Dict[str, Any]]:
    """Get a specific plan by ID."""
    cur = conn.execute("""
        SELECT id, name, price_cents, tokens, validity_days
        FROM recharge_plans
        WHERE id = ? AND is_active = 1
    """, (plan_id,))
    
    row = cur.fetchone()
    if not row:
        return None
    
    return {
        "id": row[0],
        "name": row[1],
        "price": row[2] / 100,
        "price_cents": row[2],
        "tokens": row[3],
        "validity_days": row[4],
    }


# ============================================
# Order Management
# ============================================

def generate_order_no() -> str:
    """Generate unique order number."""
    timestamp = time.strftime("%Y%m%d%H%M%S")
    random_part = uuid.uuid4().hex[:8].upper()
    return f"HN{timestamp}{random_part}"


def create_order(
    conn,
    user_id: int,
    plan_id: int,
    amount_cents: int,
    tokens: int,
    code_url: str = "",
    wx_prepay_id: str = ""
) -> Tuple[str, int]:
    """
    Create a new payment order.
    Returns (order_no, order_id)
    """
    order_no = generate_order_no()
    now = int(time.time())
    expire_at = now + 30 * 60  # 30 minutes expiry
    
    cur = conn.execute("""
        INSERT INTO payment_orders 
        (order_no, user_id, plan_id, amount_cents, tokens, status, code_url, wx_prepay_id, expire_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)
    """, (order_no, user_id, plan_id, amount_cents, tokens, code_url, wx_prepay_id, expire_at, now, now))
    
    conn.commit()
    return order_no, cur.lastrowid


def get_order_by_no(conn, order_no: str) -> Optional[Dict[str, Any]]:
    """Get order by order number."""
    cur = conn.execute("""
        SELECT id, order_no, user_id, plan_id, amount_cents, tokens, status, 
               wx_prepay_id, wx_transaction_id, wx_pay_time, code_url, expire_at, created_at,
               order_type, subscription_plan_id
        FROM payment_orders
        WHERE order_no = ?
    """, (order_no,))
    
    row = cur.fetchone()
    if not row:
        return None
    
    return {
        "id": row[0],
        "order_no": row[1],
        "user_id": row[2],
        "plan_id": row[3],
        "amount_cents": row[4],
        "tokens": row[5],
        "status": row[6],
        "wx_prepay_id": row[7],
        "wx_transaction_id": row[8],
        "wx_pay_time": row[9],
        "code_url": row[10],
        "expire_at": row[11],
        "created_at": row[12],
        "order_type": row[13] or "token",
        "subscription_plan_id": row[14],
    }


def update_order_paid(
    conn,
    order_no: str,
    wx_transaction_id: str,
    wx_pay_time: int
) -> bool:
    """
    Mark order as paid.
    Returns True if updated, False if already paid or not found.
    """
    now = int(time.time())
    
    # Only update if status is pending (idempotent)
    cur = conn.execute("""
        UPDATE payment_orders
        SET status = 'paid', wx_transaction_id = ?, wx_pay_time = ?, updated_at = ?
        WHERE order_no = ? AND status = 'pending'
    """, (wx_transaction_id, wx_pay_time, now, order_no))
    
    conn.commit()
    return cur.rowcount > 0


def expire_old_orders(conn):
    """Mark expired pending orders."""
    now = int(time.time())
    conn.execute("""
        UPDATE payment_orders
        SET status = 'expired', updated_at = ?
        WHERE status = 'pending' AND expire_at < ?
    """, (now, now))
    conn.commit()


# ============================================
# Token Balance Management
# ============================================

# Free quota constants
FREE_QUOTA_TOKENS = 100000  # 100K tokens
FREE_QUOTA_VALIDITY_DAYS = 36500  # ~100 years (effectively never expires)


def ensure_user_free_quota(conn, user_id: int) -> bool:
    """
    Ensure user has free quota record in token_recharge_logs.
    Creates one if not exists (order_id=0 indicates free quota).
    Returns True if created, False if already exists.
    """
    # Check if user already has free quota (order_id=0)
    cur = conn.execute(
        "SELECT id FROM token_recharge_logs WHERE user_id = ? AND order_id = 0",
        (user_id,)
    )
    if cur.fetchone():
        return False  # Already has free quota
    
    # Create free quota record
    now = int(time.time())
    expire_at = now + FREE_QUOTA_VALIDITY_DAYS * 24 * 3600
    
    conn.execute("""
        INSERT INTO token_recharge_logs (user_id, order_id, tokens, expire_at, remaining, created_at)
        VALUES (?, 0, ?, ?, ?, ?)
    """, (user_id, FREE_QUOTA_TOKENS, expire_at, FREE_QUOTA_TOKENS, now))
    conn.commit()
    
    return True


def add_tokens_to_user(
    conn,
    user_id: int,
    order_id: int,
    tokens: int,
    validity_days: int = 365
) -> int:
    """
    Add tokens to user account.
    Returns the recharge log ID.
    """
    now = int(time.time())
    expire_at = now + validity_days * 24 * 3600
    
    cur = conn.execute("""
        INSERT INTO token_recharge_logs (user_id, order_id, tokens, expire_at, remaining, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (user_id, order_id, tokens, expire_at, tokens, now))
    
    conn.commit()
    return cur.lastrowid


def get_user_token_balance(conn, user_id: int) -> Dict[str, Any]:
    """
    Get user's token balance.
    Returns total available tokens and breakdown by recharge.
    """
    import logging
    now = int(time.time())
    
    # Get all non-expired recharge logs with remaining tokens
    cur = conn.execute("""
        SELECT id, tokens, remaining, expire_at, created_at
        FROM token_recharge_logs
        WHERE user_id = ? AND expire_at > ? AND remaining > 0
        ORDER BY expire_at ASC
    """, (user_id, now))
    
    details = []
    total = 0
    
    for row in cur.fetchall():
        remaining = row[2]
        total += remaining
        details.append({
            "id": row[0],
            "tokens": row[1],
            "remaining": remaining,
            "expire_at": row[3],
            "created_at": row[4],
        })
    
    logging.info(f"[TokenBalance] user_id={user_id}, total={total}, details_count={len(details)}")
    
    return {
        "total": total,
        "details": details,
    }


def consume_tokens(conn, user_id: int, amount: int, news_id: str = None, title: str = None) -> bool:
    """
    Consume tokens from user account.
    Consumes from earliest expiring balance first.
    Also logs the consumption for history tracking.
    Returns True if successful, False if insufficient balance.
    """
    import logging
    now = int(time.time())
    
    # Get available balances ordered by expiry
    cur = conn.execute("""
        SELECT id, remaining
        FROM token_recharge_logs
        WHERE user_id = ? AND expire_at > ? AND remaining > 0
        ORDER BY expire_at ASC
    """, (user_id, now))
    
    balances = cur.fetchall()
    
    # Calculate total available
    total_available = sum(b[1] for b in balances)
    logging.info(f"[TokenConsume] user_id={user_id}, amount={amount}, total_available={total_available}, balances_count={len(balances)}")
    
    if total_available < amount:
        logging.warning(f"[TokenConsume] Insufficient balance: {total_available} < {amount}")
        return False
    
    # Consume from each balance
    remaining_to_consume = amount
    for balance_id, balance_remaining in balances:
        if remaining_to_consume <= 0:
            break
        
        consume_from_this = min(remaining_to_consume, balance_remaining)
        new_remaining = balance_remaining - consume_from_this
        
        logging.info(f"[TokenConsume] Updating balance_id={balance_id}: {balance_remaining} -> {new_remaining}")
        conn.execute("""
            UPDATE token_recharge_logs
            SET remaining = ?
            WHERE id = ?
        """, (new_remaining, balance_id))
        
        remaining_to_consume -= consume_from_this
    
    # Log the consumption for history tracking
    if amount > 0:
        conn.execute("""
            INSERT INTO token_usage_logs (user_id, news_id, title, tokens_used, created_at)
            VALUES (?, ?, ?, ?, ?)
        """, (user_id, news_id, title, amount, now))
        logging.info(f"[TokenConsume] Logged consumption: user_id={user_id}, tokens={amount}")
    
    conn.commit()
    logging.info(f"[TokenConsume] Committed successfully for user_id={user_id}")
    return True


# ============================================
# WeChat Pay API Integration
# ============================================

async def create_native_payment(
    plan_id: int,
    user_id: int,
    conn
) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    """
    Create a Native payment order and get QR code URL.
    Returns (result_dict, error_message)
    """
    import httpx
    from datetime import datetime, timezone
    
    if not is_wechat_pay_configured():
        return None, "微信支付未配置"
    
    # Get plan
    plan = get_plan_by_id(conn, plan_id)
    if not plan:
        return None, "套餐不存在"
    
    config = get_wechat_pay_config()
    
    # Generate order
    order_no = generate_order_no()
    amount_cents = plan["price_cents"]
    tokens = plan["tokens"]
    
    # Prepare request body
    body = {
        "appid": config["appid"],
        "mchid": config["mchid"],
        "description": f"HotNews Token充值 - {plan['name']}",
        "out_trade_no": order_no,
        "notify_url": config["notify_url"],
        "amount": {
            "total": amount_cents,
            "currency": "CNY"
        }
    }
    
    try:
        # Load private key
        private_key_path = config["private_key_path"]
        if not os.path.exists(private_key_path):
            return None, "支付证书未配置"
        
        with open(private_key_path, "r") as f:
            private_key_content = f.read()
        
        # Generate signature
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import padding
        from cryptography.hazmat.backends import default_backend
        import base64
        
        timestamp = str(int(time.time()))
        nonce_str = uuid.uuid4().hex
        
        # Build sign string
        method = "POST"
        url_path = "/v3/pay/transactions/native"
        body_str = json.dumps(body)
        sign_str = f"{method}\n{url_path}\n{timestamp}\n{nonce_str}\n{body_str}\n"
        
        # Sign with RSA-SHA256
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
        
        # Build authorization header
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
        
        # Call WeChat API
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
            
            logger.info(f"WeChat Pay API result: code_url={code_url}")
            
            if not code_url:
                return None, "未获取到支付二维码"
            
            # Save order to database
            now = int(time.time())
            expire_at = now + 30 * 60
            
            cur = conn.execute("""
                INSERT INTO payment_orders 
                (order_no, user_id, plan_id, amount_cents, tokens, status, code_url, expire_at, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)
            """, (order_no, user_id, plan_id, amount_cents, tokens, code_url, expire_at, now, now))
            conn.commit()
            
            return {
                "order_no": order_no,
                "code_url": code_url,
                "amount": plan["price"],
                "amount_cents": amount_cents,
                "tokens": tokens,
                "plan_name": plan["name"],
                "expire_at": expire_at,
            }, None
            
    except Exception as e:
        logger.exception(f"Create payment error: {e}")
        return None, f"创建支付订单失败: {str(e)}"


def verify_wechat_callback(
    headers: Dict[str, str],
    body: bytes,
    api_v3_key: str
) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    """
    Verify and decrypt WeChat payment callback.
    Returns (decrypted_data, error_message)
    """
    import base64
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    
    try:
        data = json.loads(body)
        resource = data.get("resource", {})
        
        # Get encrypted data
        ciphertext = resource.get("ciphertext")
        nonce = resource.get("nonce")
        associated_data = resource.get("associated_data", "")
        
        if not ciphertext or not nonce:
            return None, "回调数据不完整"
        
        # Decrypt with AES-GCM
        key = api_v3_key.encode()
        aesgcm = AESGCM(key)
        
        ciphertext_bytes = base64.b64decode(ciphertext)
        nonce_bytes = nonce.encode()
        associated_data_bytes = associated_data.encode() if associated_data else b""
        
        plaintext = aesgcm.decrypt(nonce_bytes, ciphertext_bytes, associated_data_bytes)
        decrypted = json.loads(plaintext.decode())
        
        return decrypted, None
        
    except Exception as e:
        logger.exception(f"Verify callback error: {e}")
        return None, f"验证回调失败: {str(e)}"


async def handle_payment_callback(
    conn,
    decrypted_data: Dict[str, Any]
) -> Tuple[bool, str]:
    """
    Handle successful payment callback.
    Supports both token recharge and subscription orders.
    Returns (success, message)
    """
    try:
        order_no = decrypted_data.get("out_trade_no")
        trade_state = decrypted_data.get("trade_state")
        transaction_id = decrypted_data.get("transaction_id")
        
        if not order_no:
            return False, "订单号缺失"
        
        if trade_state != "SUCCESS":
            logger.info(f"Payment not successful: {order_no} - {trade_state}")
            return True, "非成功状态，忽略"
        
        # Get order
        order = get_order_by_no(conn, order_no)
        if not order:
            return False, "订单不存在"
        
        if order["status"] == "paid":
            return True, "订单已处理"
        
        # Verify amount
        amount_in_callback = decrypted_data.get("amount", {}).get("total", 0)
        if amount_in_callback != order["amount_cents"]:
            logger.error(f"Amount mismatch: order={order['amount_cents']}, callback={amount_in_callback}")
            return False, "金额不匹配"
        
        # Update order status
        pay_time = int(time.time())
        success_time = decrypted_data.get("success_time")
        if success_time:
            from datetime import datetime
            try:
                dt = datetime.fromisoformat(success_time.replace("Z", "+00:00"))
                pay_time = int(dt.timestamp())
            except:
                pass
        
        updated = update_order_paid(conn, order_no, transaction_id, pay_time)
        if not updated:
            return True, "订单状态未变更"
        
        # 根据订单类型处理
        order_type = order.get("order_type", "token")
        
        if order_type == "subscription":
            # 订阅订单：激活用户订阅
            return await _handle_subscription_callback(conn, order)
        else:
            # Token充值订单：添加Token
            return await _handle_token_callback(conn, order)
        
    except Exception as e:
        logger.exception(f"Handle callback error: {e}")
        return False, f"处理失败: {str(e)}"


async def _handle_token_callback(conn, order: Dict[str, Any]) -> Tuple[bool, str]:
    """处理Token充值订单回调"""
    plan = get_plan_by_id(conn, order["plan_id"])
    validity_days = plan["validity_days"] if plan else 365
    
    add_tokens_to_user(
        conn,
        order["user_id"],
        order["id"],
        order["tokens"],
        validity_days
    )
    
    logger.info(f"Token payment success: order={order['order_no']}, user={order['user_id']}, tokens={order['tokens']}")
    return True, "处理成功"


async def _handle_subscription_callback(conn, order: Dict[str, Any]) -> Tuple[bool, str]:
    """处理订阅订单回调"""
    from .subscription_service import get_subscription_plan_by_id, create_or_update_subscription
    
    # 获取订阅套餐信息
    plan_id = order.get("subscription_plan_id") or order.get("plan_id")
    plan = get_subscription_plan_by_id(conn, plan_id)
    
    if not plan:
        logger.error(f"Subscription plan not found: plan_id={plan_id}")
        return False, "订阅套餐不存在"
    
    # 激活用户订阅
    create_or_update_subscription(
        conn,
        order["user_id"],
        plan["plan_type"],
        plan["duration_days"],
        plan["usage_quota"]
    )
    
    logger.info(f"Subscription payment success: order={order['order_no']}, user={order['user_id']}, plan={plan['name']}")
    return True, "处理成功"
