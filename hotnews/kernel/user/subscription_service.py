# coding=utf-8
"""
Subscription Service - 订阅业务逻辑

处理用户订阅状态、套餐管理和配额管理。
"""

import time
import logging
from typing import Optional, Dict, Any, List

logger = logging.getLogger(__name__)


# ============================================
# Subscription Plan Management
# ============================================

def get_active_subscription_plans(conn) -> List[Dict[str, Any]]:
    """获取所有激活的订阅套餐"""
    cur = conn.execute("""
        SELECT id, name, plan_type, price_cents, duration_days, usage_quota, badge
        FROM subscription_plans
        WHERE is_active = 1
        ORDER BY sort_order
    """)
    
    plans = []
    for row in cur.fetchall():
        plans.append({
            "id": row[0],
            "name": row[1],
            "plan_type": row[2],
            "price": row[3] / 100,
            "price_cents": row[3],
            "duration_days": row[4],
            "usage_quota": row[5],
            "badge": row[6],
        })
    return plans


def get_subscription_plan_by_id(conn, plan_id: int) -> Optional[Dict[str, Any]]:
    """根据ID获取订阅套餐"""
    cur = conn.execute("""
        SELECT id, name, plan_type, price_cents, duration_days, usage_quota, badge
        FROM subscription_plans
        WHERE id = ? AND is_active = 1
    """, (plan_id,))
    
    row = cur.fetchone()
    if not row:
        return None
    
    return {
        "id": row[0],
        "name": row[1],
        "plan_type": row[2],
        "price": row[3] / 100,
        "price_cents": row[3],
        "duration_days": row[4],
        "usage_quota": row[5],
        "badge": row[6],
    }


# ============================================
# User Subscription Management
# ============================================

# 免费用户每月赠送次数
FREE_MONTHLY_QUOTA = 50


def ensure_user_subscription(conn, user_id: int) -> bool:
    """
    确保用户有订阅记录（默认免费，赠送50次/月）
    Returns True if created, False if already exists.
    """
    cur = conn.execute(
        "SELECT id FROM user_subscriptions WHERE user_id = ?",
        (user_id,)
    )
    if cur.fetchone():
        return False
    
    now = int(time.time())
    conn.execute("""
        INSERT INTO user_subscriptions (user_id, plan_type, usage_quota, usage_used, last_reset_at, created_at, updated_at)
        VALUES (?, 'free', ?, 0, ?, ?, ?)
    """, (user_id, FREE_MONTHLY_QUOTA, now, now, now))
    conn.commit()
    return True


def get_user_subscription(conn, user_id: int) -> Optional[Dict[str, Any]]:
    """获取用户订阅信息"""
    cur = conn.execute("""
        SELECT id, user_id, plan_type, start_at, expire_at, 
               usage_quota, usage_used, last_reset_at, auto_renew,
               created_at, updated_at
        FROM user_subscriptions
        WHERE user_id = ?
    """, (user_id,))
    
    row = cur.fetchone()
    if not row:
        return None
    
    now = int(time.time())
    expire_at = row[4]
    usage_quota = row[5] or 0
    usage_used = row[6] or 0
    
    # 计算剩余天数和次数
    days_remaining = None
    if expire_at and expire_at > now:
        days_remaining = (expire_at - now) // 86400
    
    return {
        "id": row[0],
        "user_id": row[1],
        "plan_type": row[2],
        "start_at": row[3],
        "expire_at": expire_at,
        "usage_quota": usage_quota,
        "usage_used": usage_used,
        "usage_remaining": max(0, usage_quota - usage_used),
        "last_reset_at": row[7],
        "auto_renew": row[8],
        "days_remaining": days_remaining,
        "is_vip": row[2] in ('monthly', 'yearly', 'lifetime') and expire_at and expire_at > now,
    }


def create_or_update_subscription(
    conn,
    user_id: int,
    plan_type: str,
    duration_days: int,
    usage_quota: int
) -> Dict[str, Any]:
    """
    创建或更新用户订阅
    - 新订阅：设置开始时间为当前，到期时间为开始+有效期
    - 续费：在现有到期时间基础上延长，累加配额
    """
    now = int(time.time())
    
    # 获取现有订阅
    existing = get_user_subscription(conn, user_id)
    
    if existing and existing['is_vip']:
        # 续费：延长到期时间，累加配额
        new_expire_at = existing['expire_at'] + duration_days * 86400
        new_quota = existing['usage_quota'] + usage_quota
        # 如果是同类型续费，保留已使用次数；如果升级，重置
        new_used = existing['usage_used'] if existing['plan_type'] == plan_type else 0
        
        conn.execute("""
            UPDATE user_subscriptions
            SET plan_type = ?, expire_at = ?, usage_quota = ?, usage_used = ?, updated_at = ?
            WHERE user_id = ?
        """, (plan_type, new_expire_at, new_quota, new_used, now, user_id))
        
        logger.info(f"[Subscription] Renewed: user={user_id}, type={plan_type}, expire={new_expire_at}")
    else:
        # 新订阅或已过期
        start_at = now
        expire_at = now + duration_days * 86400
        
        if existing:
            conn.execute("""
                UPDATE user_subscriptions
                SET plan_type = ?, start_at = ?, expire_at = ?, 
                    usage_quota = ?, usage_used = 0, last_reset_at = ?, updated_at = ?
                WHERE user_id = ?
            """, (plan_type, start_at, expire_at, usage_quota, now, now, user_id))
        else:
            conn.execute("""
                INSERT INTO user_subscriptions 
                (user_id, plan_type, start_at, expire_at, usage_quota, usage_used, last_reset_at, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)
            """, (user_id, plan_type, start_at, expire_at, usage_quota, now, now, now))
        
        logger.info(f"[Subscription] Created: user={user_id}, type={plan_type}, expire={expire_at}")
    
    conn.commit()
    return get_user_subscription(conn, user_id)


# ============================================
# Usage Quota Management
# ============================================

def check_and_reset_monthly_quota(conn, user_id: int) -> bool:
    """
    检查并重置用户的月度配额（适用于所有用户）
    每30天重置一次使用次数
    Returns True if reset, False otherwise.
    """
    sub = get_user_subscription(conn, user_id)
    if not sub:
        return False
    
    now = int(time.time())
    last_reset = sub['last_reset_at'] or sub['start_at'] or sub['created_at'] or now
    
    # 检查是否已过30天
    if now - last_reset >= 30 * 86400:
        # 根据用户类型设置配额
        if sub['is_vip']:
            new_quota = sub['usage_quota']  # VIP保持原配额
        else:
            new_quota = FREE_MONTHLY_QUOTA  # 免费用户重置为50次
        
        conn.execute("""
            UPDATE user_subscriptions
            SET usage_used = 0, usage_quota = ?, last_reset_at = ?, updated_at = ?
            WHERE user_id = ?
        """, (new_quota, now, now, user_id))
        conn.commit()
        logger.info(f"[Subscription] Monthly quota reset: user={user_id}, quota={new_quota}")
        return True
    
    return False


def consume_usage_quota(conn, user_id: int) -> bool:
    """
    消耗一次使用配额（适用于所有用户）
    Returns True if successful, False if no quota remaining.
    """
    # 先检查是否需要重置月度配额
    check_and_reset_monthly_quota(conn, user_id)
    
    sub = get_user_subscription(conn, user_id)
    if not sub:
        return False
    
    if sub['usage_remaining'] <= 0:
        logger.warning(f"[Subscription] No quota remaining: user={user_id}")
        return False
    
    now = int(time.time())
    conn.execute("""
        UPDATE user_subscriptions
        SET usage_used = usage_used + 1, updated_at = ?
        WHERE user_id = ?
    """, (now, user_id))
    conn.commit()
    
    logger.info(f"[Subscription] Quota consumed: user={user_id}, used={sub['usage_used']+1}/{sub['usage_quota']}")
    return True


def get_subscription_status(conn, user_id: int, token_balance: int = 0) -> Dict[str, Any]:
    """
    获取用户订阅状态（用于API返回）
    """
    # 确保用户有订阅记录
    ensure_user_subscription(conn, user_id)
    
    # 检查是否需要重置月度配额
    check_and_reset_monthly_quota(conn, user_id)
    
    sub = get_user_subscription(conn, user_id)
    if not sub:
        return {
            "plan_type": "free",
            "is_vip": False,
            "expire_at": None,
            "days_remaining": None,
            "usage_quota": FREE_MONTHLY_QUOTA,
            "usage_used": 0,
            "usage_remaining": FREE_MONTHLY_QUOTA,
        }
    
    return {
        "plan_type": sub['plan_type'],
        "is_vip": sub['is_vip'],
        "expire_at": sub['expire_at'],
        "days_remaining": sub['days_remaining'],
        "usage_quota": sub['usage_quota'],
        "usage_used": sub['usage_used'],
        "usage_remaining": sub['usage_remaining'],
    }
