from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field, model_validator

from authz import require_access
from database import get_connection


router = APIRouter(
    prefix="/admin",
    tags=["User Access"],
)

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
            "Database error - user access:",
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


class UserPositionRequest(BaseModel):
    position_id: int = Field(gt=0)


class UserWarehousesRequest(BaseModel):
    warehouse_ids: list[int] = Field(
        default_factory=list,
    )

    @model_validator(mode="after")
    def validate_ids(self):
        if any(
            warehouse_id <= 0
            for warehouse_id
            in self.warehouse_ids
        ):
            raise ValueError(
                "warehouse_ids phải là số nguyên dương"
            )

        self.warehouse_ids = sorted(
            set(self.warehouse_ids)
        )

        return self


class UserPermissionOverridesRequest(BaseModel):
    allowed_codes: list[str] = Field(
        default_factory=list,
    )

    denied_codes: list[str] = Field(
        default_factory=list,
    )

    @model_validator(mode="after")
    def normalize_codes(self):
        self.allowed_codes = sorted(
            {
                code.strip().upper()
                for code
                in self.allowed_codes
                if code.strip()
            }
        )

        self.denied_codes = sorted(
            {
                code.strip().upper()
                for code
                in self.denied_codes
                if code.strip()
            }
        )

        overlap = (
            set(self.allowed_codes)
            & set(self.denied_codes)
        )

        if overlap:
            raise ValueError(
                "Một quyền không thể vừa cấp thêm vừa thu hồi"
            )

        return self



class AdminUserCreateRequest(BaseModel):
    full_name: str = Field(min_length=1, max_length=150)
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=8, max_length=128)
    phone: Optional[str] = Field(default=None, max_length=20)
    address: Optional[str] = Field(default=None, max_length=300)
    position_id: int = Field(gt=0)
    warehouse_ids: list[int] = Field(default_factory=list)

    @model_validator(mode="after")
    def normalize_values(self):
        self.full_name = " ".join(self.full_name.split())
        self.email = self.email.strip().lower()

        if self.phone is not None:
            self.phone = "".join(
                character
                for character in self.phone
                if character.isdigit()
            ) or None

        if (
            self.phone is not None
            and (
                len(self.phone) != 10
                or not self.phone.startswith("0")
            )
        ):
            raise ValueError(
                "Số điện thoại phải gồm 10 chữ số và bắt đầu bằng 0"
            )

        if self.address is not None:
            self.address = " ".join(self.address.split()) or None

        self.warehouse_ids = sorted(set(self.warehouse_ids))
        return self


class AdminUserUpdateRequest(BaseModel):
    full_name: str = Field(min_length=1, max_length=150)
    email: str = Field(min_length=3, max_length=255)
    phone: Optional[str] = Field(default=None, max_length=20)
    address: Optional[str] = Field(default=None, max_length=300)

    @model_validator(mode="after")
    def normalize_values(self):
        self.full_name = " ".join(self.full_name.split())
        self.email = self.email.strip().lower()

        if self.phone is not None:
            self.phone = "".join(
                character
                for character in self.phone
                if character.isdigit()
            ) or None

        if (
            self.phone is not None
            and (
                len(self.phone) != 10
                or not self.phone.startswith("0")
            )
        ):
            raise ValueError(
                "Số điện thoại phải gồm 10 chữ số và bắt đầu bằng 0"
            )

        if self.address is not None:
            self.address = " ".join(self.address.split()) or None

        return self


class AdminUserStatusRequest(BaseModel):
    is_active: bool


class AdminResetPasswordRequest(BaseModel):
    new_password: str = Field(min_length=8, max_length=128)


@router.get("/positions")
def list_positions(
    is_active: Optional[bool] = Query(
        default=None,
    ),
    auth: dict = Depends(get_current_auth),
):
    require_access(
        auth,
        "USER_VIEW",
    )

    return call_db_function(
        """
        SELECT public.fn_list_positions(
            %s::text,
            %s::boolean
        )
        """,
        (
            auth["token"],
            is_active,
        ),
    )


@router.get("/permissions")
def list_permissions(
    auth: dict = Depends(get_current_auth),
):
    require_access(
        auth,
        "USER_VIEW",
    )

    return call_db_function(
        """
        SELECT public.fn_list_permissions(
            %s::text
        )
        """,
        (
            auth["token"],
        ),
    )


@router.get("/users")
def list_managed_users(
    search: Optional[str] = Query(
        default=None,
    ),
    is_active: Optional[bool] = Query(
        default=None,
    ),
    auth: dict = Depends(get_current_auth),
):
    require_access(
        auth,
        "USER_VIEW",
    )

    return call_db_function(
        """
        SELECT public.fn_list_managed_users(
            %s::text,
            %s::text,
            %s::boolean
        )
        """,
        (
            auth["token"],
            search,
            is_active,
        ),
    )



@router.get("/warehouses")
def list_admin_warehouses(
    auth: dict = Depends(get_current_auth),
):
    require_access(auth, "USER_VIEW")

    return call_db_function(
        """
        SELECT public.fn_list_warehouses(
            %s::text,
            TRUE
        )
        """,
        (auth["token"],),
    )


@router.post("/users")
def create_managed_user(
    data: AdminUserCreateRequest,
    auth: dict = Depends(get_current_auth),
):
    require_access(auth, "USER_MANAGE")

    return call_db_function(
        """
        SELECT public.fn_admin_create_user(
            %s::text,
            %s::text,
            %s::text,
            %s::text,
            %s::text,
            %s::text,
            %s::bigint,
            %s::bigint[]
        )
        """,
        (
            auth["token"],
            data.full_name,
            data.email,
            data.password,
            data.phone,
            data.address,
            data.position_id,
            data.warehouse_ids,
        ),
    )


@router.put("/users/{user_id}")
def update_managed_user(
    user_id: int,
    data: AdminUserUpdateRequest,
    auth: dict = Depends(get_current_auth),
):
    if user_id <= 0:
        raise HTTPException(
            status_code=422,
            detail="user_id không hợp lệ",
        )

    require_access(auth, "USER_MANAGE")

    return call_db_function(
        """
        SELECT public.fn_admin_update_user(
            %s::text,
            %s::bigint,
            %s::text,
            %s::text,
            %s::text,
            %s::text
        )
        """,
        (
            auth["token"],
            user_id,
            data.full_name,
            data.email,
            data.phone,
            data.address,
        ),
    )


@router.patch("/users/{user_id}/status")
def set_managed_user_status(
    user_id: int,
    data: AdminUserStatusRequest,
    auth: dict = Depends(get_current_auth),
):
    if user_id <= 0:
        raise HTTPException(
            status_code=422,
            detail="user_id không hợp lệ",
        )

    require_access(auth, "USER_MANAGE")

    return call_db_function(
        """
        SELECT public.fn_admin_set_user_active(
            %s::text,
            %s::bigint,
            %s::boolean
        )
        """,
        (
            auth["token"],
            user_id,
            data.is_active,
        ),
    )


@router.put("/users/{user_id}/reset-password")
def reset_managed_user_password(
    user_id: int,
    data: AdminResetPasswordRequest,
    auth: dict = Depends(get_current_auth),
):
    if user_id <= 0:
        raise HTTPException(
            status_code=422,
            detail="user_id không hợp lệ",
        )

    require_access(auth, "USER_MANAGE")

    return call_db_function(
        """
        SELECT public.fn_admin_reset_user_password(
            %s::text,
            %s::bigint,
            %s::text
        )
        """,
        (
            auth["token"],
            user_id,
            data.new_password,
        ),
    )


@router.get("/users/{user_id}/access")
def get_user_access(
    user_id: int,
    auth: dict = Depends(get_current_auth),
):
    if user_id <= 0:
        raise HTTPException(
            status_code=422,
            detail="user_id không hợp lệ",
        )

    require_access(
        auth,
        "USER_VIEW",
    )

    return call_db_function(
        """
        SELECT public.fn_get_user_access(
            %s::text,
            %s::bigint
        )
        """,
        (
            auth["token"],
            user_id,
        ),
    )


@router.put("/users/{user_id}/position")
def set_user_position(
    user_id: int,
    data: UserPositionRequest,
    auth: dict = Depends(get_current_auth),
):
    if user_id <= 0:
        raise HTTPException(
            status_code=422,
            detail="user_id không hợp lệ",
        )

    require_access(
        auth,
        "USER_MANAGE",
    )

    return call_db_function(
        """
        SELECT public.fn_admin_set_user_position(
            %s::text,
            %s::bigint,
            %s::bigint
        )
        """,
        (
            auth["token"],
            user_id,
            data.position_id,
        ),
    )


@router.put("/users/{user_id}/warehouses")
def replace_user_warehouses(
    user_id: int,
    data: UserWarehousesRequest,
    auth: dict = Depends(get_current_auth),
):
    if user_id <= 0:
        raise HTTPException(
            status_code=422,
            detail="user_id không hợp lệ",
        )

    require_access(
        auth,
        "USER_MANAGE",
    )

    return call_db_function(
        """
        SELECT public.fn_admin_replace_user_warehouses(
            %s::text,
            %s::bigint,
            %s::bigint[]
        )
        """,
        (
            auth["token"],
            user_id,
            data.warehouse_ids,
        ),
    )


@router.put(
    "/users/{user_id}/permission-overrides"
)
def replace_user_permission_overrides(
    user_id: int,
    data: UserPermissionOverridesRequest,
    auth: dict = Depends(get_current_auth),
):
    if user_id <= 0:
        raise HTTPException(
            status_code=422,
            detail="user_id không hợp lệ",
        )

    require_access(
        auth,
        "USER_MANAGE",
    )

    return call_db_function(
        """
        SELECT public.fn_admin_replace_user_permission_overrides(
            %s::text,
            %s::bigint,
            %s::text[],
            %s::text[]
        )
        """,
        (
            auth["token"],
            user_id,
            data.allowed_codes,
            data.denied_codes,
        ),
    )
