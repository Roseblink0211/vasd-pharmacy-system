from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field, field_validator

from database import get_connection
from authz import require_access


router = APIRouter(tags=["Warehouses"])
security = HTTPBearer(auto_error=False)


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

        print("Database error - warehouses:", exc)

        raise HTTPException(
            status_code=500,
            detail=detail,
        )

    finally:
        if cursor:
            cursor.close()

        if conn:
            conn.close()


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


class WarehouseCreateRequest(BaseModel):
    warehouse_code: str = Field(
        min_length=1,
        max_length=50,
    )

    name: str = Field(
        min_length=1,
        max_length=150,
    )

    warehouse_type: str = Field(
        min_length=1,
        max_length=20,
    )

    description: Optional[str] = Field(
        default=None,
        max_length=500,
    )

    can_receive_purchase_override: Optional[bool] = None

    can_sell_override: Optional[bool] = None

    @field_validator(
        "warehouse_code",
        "name",
        "warehouse_type",
        mode="before",
    )
    @classmethod
    def strip_required_text(
        cls,
        value,
    ):
        if isinstance(value, str):
            return value.strip()

        return value

    @field_validator(
        "warehouse_code",
        mode="after",
    )
    @classmethod
    def normalize_code(
        cls,
        value: str,
    ):
        return value.upper()

    @field_validator(
        "warehouse_type",
        mode="after",
    )
    @classmethod
    def normalize_type(
        cls,
        value: str,
    ):
        return value.upper()

    @field_validator(
        "description",
        mode="before",
    )
    @classmethod
    def normalize_optional_text(
        cls,
        value,
    ):
        if value is None:
            return None

        value = str(value).strip()

        return value or None


class WarehouseUpdateRequest(
    WarehouseCreateRequest
):
    pass


class WarehouseStatusRequest(BaseModel):
    is_active: bool


@router.get("/warehouse-types")
def list_warehouse_types(
    auth: dict = Depends(get_current_auth),
):
    require_access(auth, "WAREHOUSE_VIEW")

    return call_db_function(
        """
        SELECT public.fn_list_warehouse_types(
            %s::text
        )
        """,
        (
            auth["token"],
        ),
    )


@router.get("/warehouses")
def list_warehouses(
    is_active: Optional[bool] = Query(
        default=None,
    ),
    auth: dict = Depends(get_current_auth),
):
    require_access(auth, "WAREHOUSE_VIEW")

    return call_db_function(
        """
        SELECT public.fn_list_warehouses(
            %s::text,
            %s::boolean
        )
        """,
        (
            auth["token"],
            is_active,
        ),
    )


@router.post("/warehouses")
def create_warehouse(
    data: WarehouseCreateRequest,
    auth: dict = Depends(get_current_auth),
):
    require_access(auth, "WAREHOUSE_MANAGE")

    return call_db_function(
        """
        SELECT public.fn_create_warehouse(
            %s::text,
            %s::text,
            %s::text,
            %s::text,
            %s::text,
            %s::boolean,
            %s::boolean
        )
        """,
        (
            auth["token"],
            data.warehouse_code,
            data.name,
            data.warehouse_type,
            data.description,
            data.can_receive_purchase_override,
            data.can_sell_override,
        ),
    )


@router.put("/warehouses/{warehouse_id}")
def update_warehouse(
    warehouse_id: int,
    data: WarehouseUpdateRequest,
    auth: dict = Depends(get_current_auth),
):
    require_access(auth, "WAREHOUSE_MANAGE")

    if warehouse_id <= 0:
        raise HTTPException(
            status_code=422,
            detail="warehouse_id không hợp lệ",
        )

    return call_db_function(
        """
        SELECT public.fn_update_warehouse(
            %s::text,
            %s::bigint,
            %s::text,
            %s::text,
            %s::text,
            %s::text,
            %s::boolean,
            %s::boolean
        )
        """,
        (
            auth["token"],
            warehouse_id,
            data.warehouse_code,
            data.name,
            data.warehouse_type,
            data.description,
            data.can_receive_purchase_override,
            data.can_sell_override,
        ),
    )


@router.patch(
    "/warehouses/{warehouse_id}/status"
)
def set_warehouse_status(
    warehouse_id: int,
    data: WarehouseStatusRequest,
    auth: dict = Depends(get_current_auth),
):
    require_access(auth, "WAREHOUSE_MANAGE")

    if warehouse_id <= 0:
        raise HTTPException(
            status_code=422,
            detail="warehouse_id không hợp lệ",
        )

    return call_db_function(
        """
        SELECT public.fn_set_warehouse_active(
            %s::text,
            %s::bigint,
            %s::boolean
        )
        """,
        (
            auth["token"],
            warehouse_id,
            data.is_active,
        ),
    )
