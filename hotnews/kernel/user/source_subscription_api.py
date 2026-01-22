"""
Source Subscription API
Handles user subscriptions to RSS sources and custom sources.
"""

import sqlite3
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Request, HTTPException, Query
from pydantic import BaseModel


router = APIRouter(prefix="/api/sources", tags=["source-subscription"])


class SubscribeRequest(BaseModel):
    source_type: str  # 'rss' or 'custom'
    source_id: str


def _get_user_db_conn(request: Request) -> sqlite3.Connection:
    """Get user database connection from request state."""
    from hotnews.web.user_db import get_user_db_conn
    return get_user_db_conn(request.app.state.project_root)


def _get_online_db_conn(request: Request) -> sqlite3.Connection:
    """Get online database connection."""
    from hotnews.web.db_online import get_online_db_conn
    return get_online_db_conn(request.app.state.project_root)


def _get_current_user_id(request: Request) -> Optional[int]:
    """Get current authenticated user ID from request."""
    from hotnews.kernel.auth.auth_api import _get_session_token
    from hotnews.kernel.auth.auth_service import validate_session
    
    session_token = _get_session_token(request)
    if not session_token:
        return None
    
    conn = _get_user_db_conn(request)
    is_valid, user_info = validate_session(conn, session_token)
    if not is_valid or not user_info:
        return None
    
    return user_info.get("id")


@router.get("/search")
async def search_sources(
    request: Request,
    q: str = Query("", description="Search query"),
    type: str = Query("all", description="Source type: all, rss, custom"),
    limit: int = Query(20, description="Max results")
):
    """
    Search RSS sources and custom sources.
    Returns sources matching the query with subscription status.
    """
    query = q.strip().lower()
    if not query or len(query) < 2:
        return {"ok": True, "sources": []}
    
    online_conn = _get_online_db_conn(request)
    user_id = _get_current_user_id(request)
    
    # Get user's subscribed sources
    subscribed_set = set()
    if user_id:
        user_conn = _get_user_db_conn(request)
        cur = user_conn.execute(
            "SELECT source_id FROM user_rss_subscriptions WHERE user_id = ?",
            (user_id,)
        )
        for row in cur.fetchall():
            subscribed_set.add(str(row[0]).strip())
    
    sources = []
    
    # Search RSS sources
    if type in ("all", "rss"):
        try:
            cur = online_conn.execute("""
                SELECT id, name, url, category
                FROM rss_sources
                WHERE enabled = 1
                  AND (LOWER(name) LIKE ? OR LOWER(url) LIKE ?)
                LIMIT ?
            """, (f"%{query}%", f"%{query}%", limit))
            
            for row in cur.fetchall():
                source_id = str(row[0]).strip()
                sources.append({
                    "id": source_id,
                    "type": "rss",
                    "name": str(row[1] or "").strip() or source_id,
                    "url": str(row[2] or "").strip(),
                    "category": str(row[3] or "").strip(),
                    "is_subscribed": source_id in subscribed_set,
                })
        except Exception as e:
            print(f"[SourceAPI] RSS search error: {e}")
    
    # Search custom sources
    if type in ("all", "custom"):
        try:
            cur = online_conn.execute("""
                SELECT id, name, url
                FROM custom_sources
                WHERE enabled = 1
                  AND (LOWER(name) LIKE ? OR LOWER(url) LIKE ?)
                LIMIT ?
            """, (f"%{query}%", f"%{query}%", limit))
            
            for row in cur.fetchall():
                source_id = f"custom-{row[0]}"
                sources.append({
                    "id": source_id,
                    "type": "custom",
                    "name": str(row[1] or "").strip(),
                    "url": str(row[2] or "").strip(),
                    "category": "自定义",
                    "is_subscribed": source_id in subscribed_set,
                })
        except Exception as e:
            print(f"[SourceAPI] Custom source search error: {e}")
    
    return {"ok": True, "sources": sources[:limit]}


@router.get("/preview/{source_id}")
async def preview_source(request: Request, source_id: str, limit: int = Query(10, ge=1, le=20)):
    """
    Get preview of latest entries from a source.
    """
    source_id = source_id.strip()
    if not source_id:
        return {"ok": False, "error": "Invalid source ID"}
    
    online_conn = _get_online_db_conn(request)
    
    import time as time_module
    MIN_TIMESTAMP = 946684800  # 2000-01-01
    MAX_TIMESTAMP = int(time_module.time()) + (7 * 24 * 60 * 60)
    
    try:
        # Get source info
        src_cur = online_conn.execute(
            "SELECT name, url, category FROM rss_sources WHERE id = ?",
            (source_id,)
        )
        src_row = src_cur.fetchone()
        if not src_row:
            return {"ok": False, "error": "Source not found"}
        
        source_name = str(src_row[0] or "").strip() or source_id
        source_url = str(src_row[1] or "").strip()
        source_category = str(src_row[2] or "").strip()
        
        # Get latest entries
        cur = online_conn.execute(
            """
            SELECT id, title, url, published_at
            FROM rss_entries
            WHERE source_id = ?
              AND published_at > 0
              AND published_at >= ?
              AND published_at <= ?
            ORDER BY published_at DESC
            LIMIT ?
            """,
            (source_id, MIN_TIMESTAMP, MAX_TIMESTAMP, limit)
        )
        
        entries = []
        for row in cur.fetchall():
            entries.append({
                "id": row[0],
                "title": str(row[1] or "").strip(),
                "url": str(row[2] or "").strip(),
                "published_at": row[3],
            })
        
        return {
            "ok": True,
            "source": {
                "id": source_id,
                "name": source_name,
                "url": source_url,
                "category": source_category,
            },
            "entries": entries,
            "count": len(entries),
        }
    except Exception as e:
        print(f"[SourceAPI] Preview error: {e}")
        return {"ok": False, "error": "Failed to load preview"}


@router.get("/subscriptions")
async def get_subscriptions(request: Request):
    """
    Get user's subscribed sources.
    Requires authentication.
    """
    user_id = _get_current_user_id(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    user_conn = _get_user_db_conn(request)
    online_conn = _get_online_db_conn(request)
    
    # Get subscriptions
    cur = user_conn.execute(
        "SELECT source_id, display_name, created_at FROM user_rss_subscriptions WHERE user_id = ? ORDER BY updated_at DESC",
        (user_id,)
    )
    
    subscriptions = []
    for row in cur.fetchall():
        source_id = str(row[0]).strip()
        display_name = str(row[1] or "").strip()
        created_at = int(row[2] or 0)
        
        # Determine source type
        source_type = "custom" if source_id.startswith("custom-") else "rss"
        
        # Get source details
        name = display_name
        url = ""
        
        if source_type == "rss" and not display_name:
            try:
                cur2 = online_conn.execute(
                    "SELECT name, url FROM rss_sources WHERE id = ?",
                    (source_id,)
                )
                row2 = cur2.fetchone()
                if row2:
                    name = str(row2[0] or "").strip() or source_id
                    url = str(row2[1] or "").strip()
            except Exception:
                pass
        
        subscriptions.append({
            "id": source_id,
            "type": source_type,
            "name": name or source_id,
            "url": url,
            "subscribed_at": created_at,
        })
    
    return {"ok": True, "subscriptions": subscriptions}


@router.post("/subscribe")
async def subscribe_source(request: Request, data: SubscribeRequest):
    """
    Subscribe to a source.
    Requires authentication.
    """
    user_id = _get_current_user_id(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    source_type = data.source_type.strip().lower()
    source_id = data.source_id.strip()
    
    if source_type not in ("rss", "custom"):
        raise HTTPException(status_code=400, detail="Invalid source type")
    
    if not source_id:
        raise HTTPException(status_code=400, detail="Invalid source ID")
    
    # Normalize source_id for custom sources
    if source_type == "custom" and not source_id.startswith("custom-"):
        source_id = f"custom-{source_id}"
    
    import time
    now = int(time.time())
    
    user_conn = _get_user_db_conn(request)
    
    try:
        # Get display name from source
        display_name = ""
        online_conn = _get_online_db_conn(request)
        
        if source_type == "rss":
            cur = online_conn.execute(
                "SELECT name FROM rss_sources WHERE id = ?",
                (source_id,)
            )
            row = cur.fetchone()
            if row:
                display_name = str(row[0] or "").strip()
        elif source_type == "custom":
            custom_id = source_id.replace("custom-", "")
            cur = online_conn.execute(
                "SELECT name FROM custom_sources WHERE id = ?",
                (custom_id,)
            )
            row = cur.fetchone()
            if row:
                display_name = str(row[0] or "").strip()
        
        # Insert subscription
        user_conn.execute("""
            INSERT OR REPLACE INTO user_rss_subscriptions
            (user_id, source_id, display_name, column, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (user_id, source_id, display_name, "RSS", now, now))
        user_conn.commit()
        
        return {"ok": True, "message": "订阅成功"}
    
    except Exception as e:
        print(f"[SourceAPI] Subscribe error: {e}")
        raise HTTPException(status_code=500, detail="订阅失败")


@router.post("/unsubscribe")
async def unsubscribe_source(request: Request, data: SubscribeRequest):
    """
    Unsubscribe from a source.
    Requires authentication.
    """
    user_id = _get_current_user_id(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    source_type = data.source_type.strip().lower()
    source_id = data.source_id.strip()
    
    if source_type not in ("rss", "custom"):
        raise HTTPException(status_code=400, detail="Invalid source type")
    
    if not source_id:
        raise HTTPException(status_code=400, detail="Invalid source ID")
    
    # Normalize source_id for custom sources
    if source_type == "custom" and not source_id.startswith("custom-"):
        source_id = f"custom-{source_id}"
    
    user_conn = _get_user_db_conn(request)
    
    try:
        user_conn.execute(
            "DELETE FROM user_rss_subscriptions WHERE user_id = ? AND source_id = ?",
            (user_id, source_id)
        )
        user_conn.commit()
        
        return {"ok": True, "message": "已取消订阅"}
    
    except Exception as e:
        print(f"[SourceAPI] Unsubscribe error: {e}")
        raise HTTPException(status_code=500, detail="取消订阅失败")
