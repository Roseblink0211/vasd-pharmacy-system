from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field

from database import get_connection
from authz import require_access


router = APIRouter(tags=["Stock Thresholds"])
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

        print("Database error - stock thresholds:", exc)

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
# REQUEST MODELS
# ============================================================

class StockThresholdUpdateRequest(BaseModel):
    minimum_stock: Decimal = Field(
        ge=0,
        description="Ngưỡng tồn tối thiểu của thuốc tại kho",
    )

    reorder_quantity: Decimal = Field(
        default=Decimal("0"),
        ge=0,
        description="Số lượng đề nghị nhập khi thuốc xuống thấp",
    )


# ============================================================
# GET LIST
# ============================================================

@router.get("/stock-thresholds")
def list_stock_thresholds(
    warehouse_id: Optional[int] = Query(
        default=None,
        gt=0,
        description="Lọc theo kho",
    ),
    search: Optional[str] = Query(
        default=None,
        description="Tìm theo mã thuốc, tên thuốc hoặc hoạt chất",
    ),
    status: Optional[str] = Query(
        default=None,
        description=(
            "UNCONFIGURED | OUT_OF_STOCK | LOW_STOCK | NORMAL"
        ),
    ),
    auth: dict = Depends(get_current_auth),
):
    require_access(auth, "INVENTORY_VIEW", warehouse_id)

    allowed_statuses = {
        "UNCONFIGURED",
        "OUT_OF_STOCK",
        "LOW_STOCK",
        "NORMAL",
    }

    normalized_status = None

    if status is not None and status.strip():
        normalized_status = status.strip().upper()

        if normalized_status not in allowed_statuses:
            raise HTTPException(
                status_code=422,
                detail=(
                    "Trạng thái không hợp lệ. "
                    "Chỉ chấp nhận UNCONFIGURED, OUT_OF_STOCK, "
                    "LOW_STOCK hoặc NORMAL."
                ),
            )

    return call_db_function(
        """
        SELECT public.fn_list_stock_thresholds(
            %s::text,
            %s::bigint,
            %s::text,
            %s::text
        )
        """,
        (
            auth["token"],
            warehouse_id,
            search,
            normalized_status,
        ),
    )


# ============================================================
# UPDATE / UPSERT THRESHOLD
# ============================================================

@router.put(
    "/stock-thresholds/{medicine_id}/{warehouse_id}"
)
def set_stock_threshold(
    medicine_id: int,
    warehouse_id: int,
    data: StockThresholdUpdateRequest,
    auth: dict = Depends(get_current_auth),
):
    require_access(auth, "WAREHOUSE_MANAGE", warehouse_id)

    if medicine_id <= 0:
        raise HTTPException(
            status_code=422,
            detail="medicine_id phải lớn hơn 0",
        )

    if warehouse_id <= 0:
        raise HTTPException(
            status_code=422,
            detail="warehouse_id phải lớn hơn 0",
        )

    return call_db_function(
        """
        SELECT public.fn_set_stock_threshold(
            %s::text,
            %s::bigint,
            %s::bigint,
            %s::numeric,
            %s::numeric
        )
        """,
        (
            auth["token"],
            medicine_id,
            warehouse_id,
            data.minimum_stock,
            data.reorder_quantity,
        ),
    )


# ============================================================
# ALERT LIST
# ============================================================

@router.get("/stock-alerts")
def list_stock_alerts(
    warehouse_id: Optional[int] = Query(
        default=None,
        gt=0,
        description="Lọc cảnh báo theo kho",
    ),
    search: Optional[str] = Query(
        default=None,
        description="Tìm thuốc trong danh sách cảnh báo",
    ),
    auth: dict = Depends(get_current_auth),
):
    require_access(auth, "INVENTORY_VIEW", warehouse_id)

    result = call_db_function(
        """
        SELECT public.fn_list_stock_thresholds(
            %s::text,
            %s::bigint,
            %s::text,
            NULL::text
        )
        """,
        (
            auth["token"],
            warehouse_id,
            search,
        ),
    )

    if not result or result.get("success") is not True:
        return result

    rows = result.get("data") or []

    alerts = [
        row
        for row in rows
        if row.get("stock_status")
        in {"OUT_OF_STOCK", "LOW_STOCK"}
    ]

    return {
        "success": True,
        "count": len(alerts),
        "data": alerts,
    }


# ============================================================
# ALERT SUMMARY
# ============================================================

@router.get("/stock-alerts/summary")
def stock_alert_summary(
    warehouse_id: Optional[int] = Query(
        default=None,
        gt=0,
        description="Lọc tổng hợp cảnh báo theo kho",
    ),
    auth: dict = Depends(get_current_auth),
):
    require_access(auth, "INVENTORY_VIEW", warehouse_id)

    return call_db_function(
        """
        SELECT public.fn_stock_alert_summary(
            %s::text,
            %s::bigint
        )
        """,
        (
            auth["token"],
            warehouse_id,
        ),
    )
