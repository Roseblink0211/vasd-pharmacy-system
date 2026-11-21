from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from database import get_connection
from authz import require_access


router = APIRouter(tags=["Expiry Alerts"])
security = HTTPBearer(auto_error=False)


# ============================================================
# DATABASE HELPER
# ============================================================

def call_db_function(sql: str, params: tuple = ()):
    conn = None
    cursor = None

    try:
        conn = get_connection()
        cursor = conn.cursor()

        cursor.execute(sql, params)

        row = cursor.fetchone()

        conn.commit()

        return None if row is None else row[0]

    except HTTPException:
        if conn:
            conn.rollback()
        raise

    except Exception as exc:
        if conn:
            conn.rollback()

        print("Database error - expiry alerts:", exc)

        raise HTTPException(
            status_code=500,
            detail="Database error",
        )

    finally:
        if cursor:
            cursor.close()

        if conn:
            conn.close()


# ============================================================
# AUTH
# ============================================================

def get_current_auth(
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    if credentials is None:
        raise HTTPException(
            status_code=401,
            detail="Bearer token is required",
        )

    token = credentials.credentials

    result = call_db_function(
        "SELECT public.fn_validate_token(%s)",
        (token,),
    )

    if not result or result.get("success") is not True:
        raise HTTPException(
            status_code=401,
            detail=(result or {}).get(
                "message",
                "Invalid token",
            ),
        )

    return {
        "token": token,
        "user_id": result.get("user_id"),
        "token_type": result.get("token_type"),
    }


# ============================================================
# GET EXPIRY ALERT LIST
# ============================================================

@router.get("/expiry-alerts")
def list_expiry_alerts(
    warehouse_id: Optional[int] = Query(
        default=None,
        gt=0,
        description="Lọc theo kho",
    ),
    status: Optional[str] = Query(
        default=None,
        description=(
            "EXPIRED | EXPIRES_TODAY | EXPIRING_SOON | WATCH"
        ),
    ),
    search: Optional[str] = Query(
        default=None,
        description=(
            "Tìm theo mã thuốc, tên thuốc, hoạt chất hoặc số lô"
        ),
    ),
    auth: dict = Depends(get_current_auth),
):
    require_access(auth, "INVENTORY_VIEW", warehouse_id)

    allowed_statuses = {
        "EXPIRED",
        "EXPIRES_TODAY",
        "EXPIRING_SOON",
        "WATCH",
    }

    normalized_status = None

    if status is not None and status.strip():
        normalized_status = status.strip().upper()

        if normalized_status not in allowed_statuses:
            raise HTTPException(
                status_code=422,
                detail=(
                    "Trạng thái không hợp lệ. "
                    "Chỉ chấp nhận EXPIRED, EXPIRES_TODAY, "
                    "EXPIRING_SOON hoặc WATCH."
                ),
            )

    return call_db_function(
        """
        SELECT public.fn_list_expiry_alerts(
            %s::text,
            %s::bigint,
            %s::text,
            %s::text
        )
        """,
        (
            auth["token"],
            warehouse_id,
            normalized_status,
            search,
        ),
    )


# ============================================================
# GET EXPIRY ALERT SUMMARY
# ============================================================

@router.get("/expiry-alerts/summary")
def expiry_alert_summary(
    warehouse_id: Optional[int] = Query(
        default=None,
        gt=0,
        description="Lọc tổng hợp theo kho",
    ),
    auth: dict = Depends(get_current_auth),
):
    require_access(auth, "INVENTORY_VIEW", warehouse_id)

    return call_db_function(
        """
        SELECT public.fn_expiry_alert_summary(
            %s::text,
            %s::bigint
        )
        """,
        (
            auth["token"],
            warehouse_id,
        ),
    )
