from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field, model_validator

from database import get_connection
from authz import require_access


router = APIRouter(tags=["Customer Returns"])
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
        db_message = getattr(
            diag,
            "message_primary",
            None,
        )

        detail = (
            db_message
            or str(exc).strip()
            or "Database error"
        )

        print(
            "Database error - customer returns :",
            exc,
        )

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
        "token_type": result.get(
            "token_type"
        ),
    }


# ============================================================
# REQUEST MODELS
# ============================================================

class CustomerReturnCreateRequest(BaseModel):
    sale_id: int = Field(gt=0)
    reason: str = Field(
        min_length=1,
        max_length=500,
    )
    note: Optional[str] = Field(
        default=None,
        max_length=500,
    )

    @model_validator(mode="after")
    def normalize(self):
        self.reason = " ".join(
            self.reason.split()
        )

        if self.note is not None:
            self.note = (
                " ".join(self.note.split())
                or None
            )

        return self


class CustomerReturnItemCreateRequest(BaseModel):
    sale_item_id: int = Field(gt=0)
    quantity: Decimal = Field(gt=0)

    @model_validator(mode="after")
    def validate_quantity(self):
        if (
            self.quantity
            != self.quantity.to_integral_value()
        ):
            raise ValueError(
                "Số lượng hoàn phải là số nguyên lớn hơn 0"
            )

        return self


class CustomerReturnItemUpdateRequest(BaseModel):
    quantity: Decimal = Field(gt=0)

    @model_validator(mode="after")
    def validate_quantity(self):
        if (
            self.quantity
            != self.quantity.to_integral_value()
        ):
            raise ValueError(
                "Số lượng hoàn phải là số nguyên lớn hơn 0"
            )

        return self


class CustomerReturnCancelRequest(BaseModel):
    reason: Optional[str] = Field(
        default=None,
        max_length=500,
    )

    @model_validator(mode="after")
    def normalize(self):
        if self.reason is not None:
            self.reason = (
                " ".join(self.reason.split())
                or None
            )

        return self


# ============================================================
# RETURNABLE ITEMS
# ============================================================

@router.get(
    "/customer-returns/sales/{sale_id}/returnable-items"
)
def get_customer_returnable_items(
    sale_id: int,
    return_id: Optional[int] = Query(
        default=None,
        gt=0,
    ),
    auth: dict = Depends(get_current_auth),
):
    require_access(auth, "SALES_RETURN_VIEW")

    if sale_id <= 0:
        raise HTTPException(
            status_code=422,
            detail="sale_id không hợp lệ",
        )

    return call_db_function(
        """
        SELECT public.fn_get_customer_returnable_items(
            %s::text,
            %s::bigint,
            %s::bigint
        )
        """,
        (
            auth["token"],
            sale_id,
            return_id,
        ),
    )


# ============================================================
# CREATE
# ============================================================

@router.post("/customer-returns")
def create_customer_return(
    data: CustomerReturnCreateRequest,
    auth: dict = Depends(get_current_auth),
):
    require_access(auth, "SALES_RETURN_CREATE")

    return call_db_function(
        """
        SELECT public.fn_create_customer_return(
            %s::text,
            %s::bigint,
            %s::text,
            %s::text
        )
        """,
        (
            auth["token"],
            data.sale_id,
            data.reason,
            data.note,
        ),
    )


# ============================================================
# LIST
# ============================================================

@router.get("/customer-returns")
def list_customer_returns(
    phone: Optional[str] = Query(
        default=None,
    ),
    status: Optional[str] = Query(
        default=None,
    ),
    search: Optional[str] = Query(
        default=None,
    ),
    auth: dict = Depends(get_current_auth),
):
    require_access(auth, "SALES_RETURN_VIEW")

    return call_db_function(
        """
        SELECT public.fn_list_customer_returns(
            %s::text,
            %s::text,
            %s::text,
            %s::text
        )
        """,
        (
            auth["token"],
            phone,
            status,
            search,
        ),
    )


# ============================================================
# GET DETAIL
# ============================================================

@router.get(
    "/customer-returns/{return_id}"
)
def get_customer_return(
    return_id: int,
    auth: dict = Depends(get_current_auth),
):
    require_access(auth, "SALES_RETURN_VIEW")

    if return_id <= 0:
        raise HTTPException(
            status_code=422,
            detail="return_id không hợp lệ",
        )

    return call_db_function(
        """
        SELECT public.fn_get_customer_return(
            %s::text,
            %s::bigint
        )
        """,
        (
            auth["token"],
            return_id,
        ),
    )


# ============================================================
# ITEMS
# ============================================================

@router.post(
    "/customer-returns/{return_id}/items"
)
def add_customer_return_item(
    return_id: int,
    data: CustomerReturnItemCreateRequest,
    auth: dict = Depends(get_current_auth),
):
    require_access(auth, "SALES_RETURN_CREATE")

    return call_db_function(
        """
        SELECT public.fn_add_customer_return_item(
            %s::text,
            %s::bigint,
            %s::bigint,
            %s::numeric
        )
        """,
        (
            auth["token"],
            return_id,
            data.sale_item_id,
            data.quantity,
        ),
    )


@router.put(
    "/customer-returns/{return_id}/items/{item_id}"
)
def update_customer_return_item(
    return_id: int,
    item_id: int,
    data: CustomerReturnItemUpdateRequest,
    auth: dict = Depends(get_current_auth),
):
    require_access(auth, "SALES_RETURN_CREATE")

    return call_db_function(
        """
        SELECT public.fn_update_customer_return_item(
            %s::text,
            %s::bigint,
            %s::bigint,
            %s::numeric
        )
        """,
        (
            auth["token"],
            return_id,
            item_id,
            data.quantity,
        ),
    )


@router.delete(
    "/customer-returns/{return_id}/items/{item_id}"
)
def delete_customer_return_item(
    return_id: int,
    item_id: int,
    auth: dict = Depends(get_current_auth),
):
    require_access(auth, "SALES_RETURN_CREATE")

    return call_db_function(
        """
        SELECT public.fn_delete_customer_return_item(
            %s::text,
            %s::bigint,
            %s::bigint
        )
        """,
        (
            auth["token"],
            return_id,
            item_id,
        ),
    )


# ============================================================
# COMPLETE / CANCEL
# ============================================================

@router.post(
    "/customer-returns/{return_id}/complete"
)
def complete_customer_return(
    return_id: int,
    auth: dict = Depends(get_current_auth),
):
    require_access(auth, "SALES_RETURN_CREATE")

    return call_db_function(
        """
        SELECT public.fn_complete_customer_return(
            %s::text,
            %s::bigint
        )
        """,
        (
            auth["token"],
            return_id,
        ),
    )


@router.post(
    "/customer-returns/{return_id}/cancel"
)
def cancel_customer_return(
    return_id: int,
    data: CustomerReturnCancelRequest,
    auth: dict = Depends(get_current_auth),
):
    require_access(auth, "SALES_RETURN_CREATE")

    return call_db_function(
        """
        SELECT public.fn_cancel_customer_return(
            %s::text,
            %s::bigint,
            %s::text
        )
        """,
        (
            auth["token"],
            return_id,
            data.reason,
        ),
    )
