from datetime import date
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field, model_validator

from database import get_connection
from authz import require_access


router = APIRouter(tags=["Purchase Receipts"])
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

        print("Database error - purchase receipts:", exc)
        raise HTTPException(status_code=500, detail="Database error")

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

class PurchaseReceiptCreateRequest(BaseModel):
    supplier_id: int = Field(gt=0)
    warehouse_id: int = Field(gt=0)
    invoice_number: str
    invoice_serial: Optional[str] = None
    invoice_date: date
    note: Optional[str] = None


class PurchaseReceiptUpdateRequest(BaseModel):
    supplier_id: int = Field(gt=0)
    warehouse_id: int = Field(gt=0)
    invoice_number: str
    invoice_serial: Optional[str] = None
    invoice_date: date
    note: Optional[str] = None


class PurchaseReceiptItemRequest(BaseModel):
    medicine_id: int = Field(gt=0)
    lot_number: str
    expiry_date: date
    quantity: Decimal = Field(gt=0)
    unit_price: Decimal = Field(gt=0)

    @model_validator(mode="after")
    def validate_item(self):
        self.lot_number = self.lot_number.strip()

        if not self.lot_number:
            raise ValueError("Số lô không được để trống")

        if self.expiry_date <= date.today():
            raise ValueError(
                "Hạn sử dụng phải lớn hơn ngày hiện tại"
            )

        if self.quantity != self.quantity.to_integral_value():
            raise ValueError(
                "Số lượng phải là số nguyên lớn hơn 0"
            )

        if self.unit_price != self.unit_price.to_integral_value():
            raise ValueError(
                "Đơn giá phải là số nguyên lớn hơn 0"
            )

        return self


class PurchaseReceiptRejectRequest(BaseModel):
    reason: Optional[str] = None
    rejection_reason: Optional[str] = None

    @model_validator(mode="after")
    def validate_reason(self):
        value = (self.reason or self.rejection_reason or "").strip()

        if not value:
            raise ValueError("Vui lòng nhập lý do từ chối")

        self.reason = value
        return self


# ============================================================
# PURCHASE RECEIPTS - LIST / DETAIL
# ============================================================

@router.get("/purchase-receipts")
def list_purchase_receipts(
    status: Optional[str] = Query(default=None),
    supplier_id: Optional[int] = Query(default=None),
    search: Optional[str] = Query(default=None),
    auth: dict = Depends(get_current_auth),
):
    require_access(auth, "PURCHASE_VIEW")

    return call_db_function(
        "SELECT public.fn_list_purchase_receipts(%s,%s,%s,%s)",
        (
            auth["token"],
            status,
            supplier_id,
            search,
        ),
    )


@router.get("/purchase-receipts/{receipt_id}")
def get_purchase_receipt(
    receipt_id: int,
    auth: dict = Depends(get_current_auth),
):
    require_access(auth, "PURCHASE_VIEW")

    return call_db_function(
        "SELECT public.fn_get_purchase_receipt(%s,%s)",
        (auth["token"], receipt_id),
    )


@router.get("/purchase-receipts/{receipt_id}/batches")
def get_purchase_receipt_batches(
    receipt_id: int,
    auth: dict = Depends(get_current_auth),
):
    require_access(auth, "PURCHASE_VIEW")

    if receipt_id <= 0:
        raise HTTPException(
            status_code=422,
            detail="receipt_id không hợp lệ",
        )

    return call_db_function(
        "SELECT public.fn_get_purchase_receipt_batches(%s,%s)",
        (
            auth["token"],
            receipt_id,
        ),
    )


# ============================================================
# CREATE / UPDATE HEADER
# ============================================================

@router.post("/purchase-receipts")
def create_purchase_receipt(
    data: PurchaseReceiptCreateRequest,
    auth: dict = Depends(get_current_auth),
):
    require_access(auth, "PURCHASE_CREATE", data.warehouse_id)

    return call_db_function(
        "SELECT public.fn_create_purchase_receipt(%s,%s,%s,%s,%s,%s,%s)",
        (
            auth["token"],
            data.supplier_id,
            data.warehouse_id,
            data.invoice_number,
            data.invoice_serial,
            data.invoice_date,
            data.note,
        ),
    )


@router.put("/purchase-receipts/{receipt_id}")
def update_purchase_receipt(
    receipt_id: int,
    data: PurchaseReceiptUpdateRequest,
    auth: dict = Depends(get_current_auth),
):
    require_access(auth, "PURCHASE_CREATE", data.warehouse_id)

    return call_db_function(
        "SELECT public.fn_update_purchase_receipt(%s,%s,%s,%s,%s,%s,%s,%s)",
        (
            auth["token"],
            receipt_id,
            data.supplier_id,
            data.warehouse_id,
            data.invoice_number,
            data.invoice_serial,
            data.invoice_date,
            data.note,
        ),
    )


# ============================================================
# ITEMS
# ============================================================

@router.post("/purchase-receipts/{receipt_id}/items")
def add_purchase_receipt_item(
    receipt_id: int,
    data: PurchaseReceiptItemRequest,
    auth: dict = Depends(get_current_auth),
):
    require_access(auth, "PURCHASE_CREATE")

    return call_db_function(
        "SELECT public.fn_add_purchase_receipt_item(%s,%s,%s,%s,%s,%s,%s)",
        (
            auth["token"],
            receipt_id,
            data.medicine_id,
            data.lot_number,
            data.expiry_date,
            data.quantity,
            data.unit_price,
        ),
    )


@router.put("/purchase-receipts/{receipt_id}/items/{item_id}")
def update_purchase_receipt_item(
    receipt_id: int,
    item_id: int,
    data: PurchaseReceiptItemRequest,
    auth: dict = Depends(get_current_auth),
):
    require_access(auth, "PURCHASE_CREATE")

    return call_db_function(
        "SELECT public.fn_update_purchase_receipt_item(%s,%s,%s,%s,%s,%s,%s,%s)",
        (
            auth["token"],
            receipt_id,
            item_id,
            data.medicine_id,
            data.lot_number,
            data.expiry_date,
            data.quantity,
            data.unit_price,
        ),
    )


@router.delete("/purchase-receipts/{receipt_id}/items/{item_id}")
def delete_purchase_receipt_item(
    receipt_id: int,
    item_id: int,
    auth: dict = Depends(get_current_auth),
):
    require_access(auth, "PURCHASE_CREATE")

    return call_db_function(
        "SELECT public.fn_delete_purchase_receipt_item(%s,%s,%s)",
        (
            auth["token"],
            receipt_id,
            item_id,
        ),
    )


# ============================================================
# WORKFLOW - TỰ KIỂM TRA, KHÔNG GỬI NGƯỜI KHÁC DUYỆT
#
# DRAFT/RETURNED -> /review -> PENDING ("Đang kiểm tra")
# PENDING -> /complete -> APPROVED
# PENDING -> /reject -> DRAFT
#
# Tất cả đều dùng PURCHASE_CREATE.
# ============================================================

@router.post("/purchase-receipts/{receipt_id}/review")
def review_purchase_receipt(
    receipt_id: int,
    auth: dict = Depends(get_current_auth),
):
    require_access(auth, "PURCHASE_CREATE")

    return call_db_function(
        "SELECT public.fn_review_purchase_receipt(%s,%s)",
        (
            auth["token"],
            receipt_id,
        ),
    )


@router.post("/purchase-receipts/{receipt_id}/complete")
def complete_purchase_receipt(
    receipt_id: int,
    auth: dict = Depends(get_current_auth),
):
    require_access(auth, "PURCHASE_CREATE")

    return call_db_function(
        "SELECT public.fn_complete_purchase_receipt(%s,%s)",
        (
            auth["token"],
            receipt_id,
        ),
    )


@router.post("/purchase-receipts/{receipt_id}/reject")
def reject_purchase_receipt(
    receipt_id: int,
    data: PurchaseReceiptRejectRequest,
    auth: dict = Depends(get_current_auth),
):
    require_access(auth, "PURCHASE_CREATE")

    return call_db_function(
        "SELECT public.fn_reject_purchase_receipt(%s,%s,%s)",
        (
            auth["token"],
            receipt_id,
            data.reason,
        ),
    )


# ============================================================
# LEGACY ALIASES
# ============================================================

@router.post("/purchase-receipts/{receipt_id}/submit")
def legacy_submit_purchase_receipt(
    receipt_id: int,
    auth: dict = Depends(get_current_auth),
):
    require_access(auth, "PURCHASE_CREATE")

    return call_db_function(
        "SELECT public.fn_review_purchase_receipt(%s,%s)",
        (
            auth["token"],
            receipt_id,
        ),
    )


@router.post("/purchase-receipts/{receipt_id}/approve")
def legacy_approve_purchase_receipt(
    receipt_id: int,
    auth: dict = Depends(get_current_auth),
):
    require_access(auth, "PURCHASE_CREATE")

    return call_db_function(
        "SELECT public.fn_complete_purchase_receipt(%s,%s)",
        (
            auth["token"],
            receipt_id,
        ),
    )

