from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field, model_validator

from database import get_connection
from authz import require_access


router = APIRouter(tags=["Warehouse Transfers"])
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

        diag = getattr(exc, "diag", None)
        db_message = getattr(diag, "message_primary", None)
        detail = db_message or str(exc).strip() or "Database error"

        print("Database error - warehouse transfers :", exc)

        raise HTTPException(
            status_code=500,
            detail=detail,
        )

    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


# ============================================================
# AUTH DEPENDENCY
# ============================================================

def get_current_auth(
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    if credentials is None:
        raise HTTPException(status_code=401, detail="Bearer token is required")

    token = credentials.credentials

    result = call_db_function(
        "SELECT public.fn_validate_token(%s)",
        (token,),
    )

    if not result or result.get("success") is not True:
        raise HTTPException(
            status_code=401,
            detail=(result or {}).get("message", "Invalid token"),
        )

    return {
        "token": token,
        "user_id": result.get("user_id"),
        "token_type": result.get("token_type"),
    }


# ============================================================
# REQUEST MODELS
# ============================================================

class WarehouseTransferCreateRequest(BaseModel):
    source_warehouse_id: int = Field(gt=0)
    destination_warehouse_id: int = Field(gt=0)
    note: Optional[str] = None

    @model_validator(mode="after")
    def validate_warehouses(self):
        if self.source_warehouse_id == self.destination_warehouse_id:
            raise ValueError("Kho nguồn và kho đích không được giống nhau")
        return self


class WarehouseTransferUpdateRequest(BaseModel):
    source_warehouse_id: int = Field(gt=0)
    destination_warehouse_id: int = Field(gt=0)
    note: Optional[str] = None

    @model_validator(mode="after")
    def validate_warehouses(self):
        if self.source_warehouse_id == self.destination_warehouse_id:
            raise ValueError("Kho nguồn và kho đích không được giống nhau")
        return self


class WarehouseTransferItemRequest(BaseModel):
    batch_id: int = Field(gt=0)
    quantity: int = Field(gt=0)


class WarehouseTransferReturnRequest(BaseModel):
    reason: Optional[str] = None
    return_reason: Optional[str] = None

    @model_validator(mode="after")
    def validate_reason(self):
        value = (self.reason or self.return_reason or "").strip()

        if not value:
            raise ValueError("Vui lòng nhập lý do trả về chỉnh sửa")

        self.reason = value
        return self


class WarehouseTransferRejectRequest(BaseModel):
    reason: Optional[str] = None
    rejection_reason: Optional[str] = None

    @model_validator(mode="after")
    def validate_reason(self):
        value = (self.reason or self.rejection_reason or "").strip()

        if not value:
            raise ValueError("Vui lòng nhập lý do từ chối phiếu")

        self.reason = value
        return self


# ============================================================
# LIST / PENDING / DETAIL
# Lưu ý: route /pending phải đặt trước /{transfer_id}.
# ============================================================

@router.get("/warehouse-transfers")
def list_warehouse_transfers(
    status: Optional[str] = Query(default=None),
    source_warehouse_id: Optional[int] = Query(default=None),
    destination_warehouse_id: Optional[int] = Query(default=None),
    search: Optional[str] = Query(default=None),
    auth: dict = Depends(get_current_auth),
):
    require_access(auth, "TRANSFER_VIEW", source_warehouse_id)
    require_access(auth, "TRANSFER_VIEW", destination_warehouse_id)

    return call_db_function(
        """
        SELECT public.fn_list_warehouse_transfers(
            %s::text,
            %s::text,
            %s::bigint,
            %s::bigint,
            %s::text
        )
        """,
        (
            auth["token"],
            status,
            source_warehouse_id,
            destination_warehouse_id,
            search,
        ),
    )


@router.get("/warehouse-transfers/pending")
def list_pending_warehouse_transfers(
    search: Optional[str] = Query(default=None),
    auth: dict = Depends(get_current_auth),
):
    require_access(auth, "TRANSFER_APPROVE")

    return call_db_function(
        """
        SELECT public.fn_list_pending_warehouse_transfers(
            %s::text,
            %s::text
        )
        """,
        (
            auth["token"],
            search,
        ),
    )


@router.get("/warehouse-transfers/{transfer_id}")
def get_warehouse_transfer(
    transfer_id: int,
    auth: dict = Depends(get_current_auth),
):
    require_access(auth, "TRANSFER_VIEW")

    return call_db_function(
        """
        SELECT public.fn_get_warehouse_transfer(
            %s::text,
            %s::bigint
        )
        """,
        (
            auth["token"],
            transfer_id,
        ),
    )


# ============================================================
# CREATE / UPDATE HEADER
# ============================================================

@router.post("/warehouse-transfers")
def create_warehouse_transfer(
    data: WarehouseTransferCreateRequest,
    auth: dict = Depends(get_current_auth),
):
    require_access(auth, "TRANSFER_CREATE", data.source_warehouse_id)
    require_access(auth, "TRANSFER_CREATE", data.destination_warehouse_id)

    return call_db_function(
        """
        SELECT public.fn_create_warehouse_transfer(
            %s::text,
            %s::bigint,
            %s::bigint,
            %s::text
        )
        """,
        (
            auth["token"],
            data.source_warehouse_id,
            data.destination_warehouse_id,
            data.note,
        ),
    )


@router.put("/warehouse-transfers/{transfer_id}")
def update_warehouse_transfer(
    transfer_id: int,
    data: WarehouseTransferUpdateRequest,
    auth: dict = Depends(get_current_auth),
):
    require_access(auth, "TRANSFER_CREATE", data.source_warehouse_id)
    require_access(auth, "TRANSFER_CREATE", data.destination_warehouse_id)

    return call_db_function(
        """
        SELECT public.fn_update_warehouse_transfer(
            %s::text,
            %s::bigint,
            %s::bigint,
            %s::bigint,
            %s::text
        )
        """,
        (
            auth["token"],
            transfer_id,
            data.source_warehouse_id,
            data.destination_warehouse_id,
            data.note,
        ),
    )


# ============================================================
# ITEMS
# ============================================================

@router.post("/warehouse-transfers/{transfer_id}/items")
def add_warehouse_transfer_item(
    transfer_id: int,
    data: WarehouseTransferItemRequest,
    auth: dict = Depends(get_current_auth),
):
    require_access(auth, "TRANSFER_CREATE")

    return call_db_function(
        """
        SELECT public.fn_add_warehouse_transfer_item(
            %s::text,
            %s::bigint,
            %s::bigint,
            %s::numeric
        )
        """,
        (
            auth["token"],
            transfer_id,
            data.batch_id,
            data.quantity,
        ),
    )


@router.put("/warehouse-transfers/{transfer_id}/items/{item_id}")
def update_warehouse_transfer_item(
    transfer_id: int,
    item_id: int,
    data: WarehouseTransferItemRequest,
    auth: dict = Depends(get_current_auth),
):
    require_access(auth, "TRANSFER_CREATE")

    return call_db_function(
        """
        SELECT public.fn_update_warehouse_transfer_item(
            %s::text,
            %s::bigint,
            %s::bigint,
            %s::bigint,
            %s::numeric
        )
        """,
        (
            auth["token"],
            transfer_id,
            item_id,
            data.batch_id,
            data.quantity,
        ),
    )


@router.delete("/warehouse-transfers/{transfer_id}/items/{item_id}")
def delete_warehouse_transfer_item(
    transfer_id: int,
    item_id: int,
    auth: dict = Depends(get_current_auth),
):
    require_access(auth, "TRANSFER_CREATE")

    return call_db_function(
        """
        SELECT public.fn_delete_warehouse_transfer_item(
            %s::text,
            %s::bigint,
            %s::bigint
        )
        """,
        (
            auth["token"],
            transfer_id,
            item_id,
        ),
    )


# ============================================================
# WORKFLOW
# ============================================================

@router.post("/warehouse-transfers/{transfer_id}/submit")
def submit_warehouse_transfer(
    transfer_id: int,
    auth: dict = Depends(get_current_auth),
):
    require_access(auth, "TRANSFER_CREATE")

    return call_db_function(
        """
        SELECT public.fn_submit_warehouse_transfer(
            %s::text,
            %s::bigint
        )
        """,
        (
            auth["token"],
            transfer_id,
        ),
    )


@router.post("/warehouse-transfers/{transfer_id}/return")
def return_warehouse_transfer(
    transfer_id: int,
    data: WarehouseTransferReturnRequest,
    auth: dict = Depends(get_current_auth),
):
    require_access(auth, "TRANSFER_APPROVE")

    return call_db_function(
        """
        SELECT public.fn_return_warehouse_transfer(
            %s::text,
            %s::bigint,
            %s::text
        )
        """,
        (
            auth["token"],
            transfer_id,
            data.reason,
        ),
    )


@router.post("/warehouse-transfers/{transfer_id}/reject")
def reject_warehouse_transfer(
    transfer_id: int,
    data: WarehouseTransferRejectRequest,
    auth: dict = Depends(get_current_auth),
):
    require_access(auth, "TRANSFER_APPROVE")

    return call_db_function(
        """
        SELECT public.fn_reject_warehouse_transfer(
            %s::text,
            %s::bigint,
            %s::text
        )
        """,
        (
            auth["token"],
            transfer_id,
            data.reason,
        ),
    )


@router.post("/warehouse-transfers/{transfer_id}/approve")
def approve_warehouse_transfer(
    transfer_id: int,
    auth: dict = Depends(get_current_auth),
):
    require_access(auth, "TRANSFER_APPROVE")

    return call_db_function(
        """
        SELECT public.fn_approve_warehouse_transfer(
            %s::text,
            %s::bigint
        )
        """,
        (
            auth["token"],
            transfer_id,
        ),
    )
