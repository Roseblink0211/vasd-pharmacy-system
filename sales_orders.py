from datetime import date
from decimal import Decimal
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field, model_validator

from database import get_connection
from authz import require_access


router = APIRouter(tags=["Sales Orders"])
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

        print("Database error - sales POS :", exc)

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
        "token_type": result.get("token_type"),
    }


# ============================================================
# REQUEST MODELS
# ============================================================

class SellingPriceRequest(BaseModel):
    selling_price: Decimal = Field(gt=0)

    @model_validator(mode="after")
    def validate_selling_price(self):
        if self.selling_price != self.selling_price.to_integral_value():
            raise ValueError(
                "Giá bán phải là số nguyên lớn hơn 0"
            )

        return self



class SalesCustomerCreateRequest(BaseModel):
    full_name: str = Field(min_length=1, max_length=150)
    phone: str = Field(min_length=10, max_length=10)
    birth_date: Optional[date] = None
    address: Optional[str] = Field(default=None, max_length=300)

    @model_validator(mode="after")
    def normalize_customer(self):
        self.full_name = " ".join(self.full_name.split())

        self.phone = "".join(
            character
            for character in self.phone
            if character.isdigit()
        )

        if (
            len(self.phone) != 10
            or not self.phone.startswith("0")
        ):
            raise ValueError(
                "Số điện thoại phải gồm 10 chữ số và bắt đầu bằng 0"
            )

        if (
            self.birth_date is not None
            and self.birth_date > date.today()
        ):
            raise ValueError(
                "Ngày sinh không được lớn hơn ngày hiện tại"
            )

        if self.address is not None:
            self.address = " ".join(self.address.split()) or None

        return self


class SalesCustomerUpdateRequest(BaseModel):
    full_name: str = Field(min_length=1, max_length=150)
    birth_date: Optional[date] = None
    address: Optional[str] = Field(default=None, max_length=300)

    @model_validator(mode="after")
    def normalize_customer(self):
        self.full_name = " ".join(self.full_name.split())

        if (
            self.birth_date is not None
            and self.birth_date > date.today()
        ):
            raise ValueError(
                "Ngày sinh không được lớn hơn ngày hiện tại"
            )

        if self.address is not None:
            self.address = " ".join(self.address.split()) or None

        return self


class SalesOrderCreateRequest(BaseModel):
    warehouse_id: int = Field(gt=0)
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    customer_birth_date: Optional[date] = None
    customer_address: Optional[str] = None
    note: Optional[str] = None

    @model_validator(mode="after")
    def normalize_data(self):
        phone = (
            self.customer_phone.strip()
            if self.customer_phone is not None
            else ""
        )

        name = (
            self.customer_name.strip()
            if self.customer_name is not None
            else ""
        )

        if bool(name) != bool(phone):
            raise ValueError(
                "Khách có thông tin phải nhập đầy đủ cả tên và số điện thoại"
            )

        if phone and (
            not phone.isdigit()
            or len(phone) != 10
            or not phone.startswith("0")
        ):
            raise ValueError(
                "Số điện thoại phải gồm 10 chữ số và bắt đầu bằng 0"
            )

        self.customer_phone = phone or None
        self.customer_name = name or None

        if (
            (self.customer_birth_date is not None or self.customer_address)
            and not (self.customer_name and self.customer_phone)
        ):
            raise ValueError(
                "Muốn lưu ngày sinh hoặc địa chỉ thì phải có tên và số điện thoại khách hàng"
            )

        if (
            self.customer_birth_date is not None
            and self.customer_birth_date > date.today()
        ):
            raise ValueError(
                "Ngày sinh khách hàng không được lớn hơn ngày hiện tại"
            )

        if self.customer_address is not None:
            self.customer_address = (
                " ".join(self.customer_address.split()) or None
            )

        if self.note is not None:
            self.note = self.note.strip() or None

        return self


class SalesOrderUpdateRequest(BaseModel):
    warehouse_id: int = Field(gt=0)
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    customer_birth_date: Optional[date] = None
    customer_address: Optional[str] = None
    note: Optional[str] = None

    @model_validator(mode="after")
    def normalize_data(self):
        phone = (
            self.customer_phone.strip()
            if self.customer_phone is not None
            else ""
        )

        name = (
            self.customer_name.strip()
            if self.customer_name is not None
            else ""
        )

        if bool(name) != bool(phone):
            raise ValueError(
                "Khách có thông tin phải nhập đầy đủ cả tên và số điện thoại"
            )

        if phone and (
            not phone.isdigit()
            or len(phone) != 10
            or not phone.startswith("0")
        ):
            raise ValueError(
                "Số điện thoại phải gồm 10 chữ số và bắt đầu bằng 0"
            )

        self.customer_phone = phone or None
        self.customer_name = name or None

        if (
            (self.customer_birth_date is not None or self.customer_address)
            and not (self.customer_name and self.customer_phone)
        ):
            raise ValueError(
                "Muốn lưu ngày sinh hoặc địa chỉ thì phải có tên và số điện thoại khách hàng"
            )

        if (
            self.customer_birth_date is not None
            and self.customer_birth_date > date.today()
        ):
            raise ValueError(
                "Ngày sinh khách hàng không được lớn hơn ngày hiện tại"
            )

        if self.customer_address is not None:
            self.customer_address = (
                " ".join(self.customer_address.split()) or None
            )

        if self.note is not None:
            self.note = self.note.strip() or None

        return self


class SalesOrderItemRequest(BaseModel):
    medicine_id: int = Field(gt=0)
    quantity: Decimal = Field(gt=0)

    @model_validator(mode="after")
    def validate_quantity(self):
        if self.quantity != self.quantity.to_integral_value():
            raise ValueError(
                "Số lượng phải là số nguyên lớn hơn 0"
            )

        return self


# ============================================================
# SELLING PRICE
# ============================================================

@router.put(
    "/medicines/{medicine_id}/selling-price"
)
def set_medicine_selling_price(
    medicine_id: int,
    data: SellingPriceRequest,
    auth: dict = Depends(get_current_auth),
):
    require_access(auth, "MEDICINE_MANAGE")

    return call_db_function(
        """
        SELECT public.fn_set_medicine_selling_price(
            %s::text,
            %s::bigint,
            %s::numeric
        )
        """,
        (
            auth["token"],
            medicine_id,
            data.selling_price,
        ),
    )


# ============================================================
# POS MEDICINES
#
# PHẢI đặt trước /sales-orders/{sale_id}
# để FastAPI không hiểu "medicines" là sale_id.
# ============================================================

@router.get("/sales-orders/medicines")
def list_sale_medicines(
    warehouse_id: int = Query(gt=0),
    search: Optional[str] = Query(default=None),
    auth: dict = Depends(get_current_auth),
):
    require_access(auth, "SALES_VIEW", warehouse_id)

    return call_db_function(
        """
        SELECT public.fn_list_sale_medicines(
            %s::text,
            %s::bigint,
            %s::text
        )
        """,
        (
            auth["token"],
            warehouse_id,
            search,
        ),
    )


@router.get(
    "/sales-orders/medicines/{medicine_id}"
)
def get_sale_medicine_info(
    medicine_id: int,
    warehouse_id: int = Query(gt=0),
    auth: dict = Depends(get_current_auth),
):
    require_access(auth, "SALES_VIEW", warehouse_id)

    return call_db_function(
        """
        SELECT public.fn_get_sale_medicine_info(
            %s::text,
            %s::bigint,
            %s::bigint
        )
        """,
        (
            auth["token"],
            warehouse_id,
            medicine_id,
        ),
    )


# ============================================================
# SALES CUSTOMERS / PATIENT PROFILES
#
# Phone-first:
# - exact SĐT mới trả đúng người
# - tên không dùng làm định danh
# ============================================================

@router.get("/sales-customers/by-phone/{phone}")
def get_sales_customer_by_phone(
    phone: str,
    auth: dict = Depends(get_current_auth),
):
    require_access(auth, "CUSTOMER_VIEW")

    return call_db_function(
        """
        SELECT public.fn_get_sales_customer_by_phone(
            %s::text,
            %s::text
        )
        """,
        (
            auth["token"],
            phone,
        ),
    )


@router.get(
    "/sales-customers/by-phone/{phone}/purchase-history"
)
def get_sales_customer_purchase_history(
    phone: str,
    limit: int = Query(
        default=50,
        ge=1,
        le=200,
    ),
    auth: dict = Depends(get_current_auth),
):
    require_access(auth, "CUSTOMER_VIEW")

    return call_db_function(
        """
        SELECT public.fn_get_sales_customer_purchase_history(
            %s::text,
            %s::text,
            %s::integer
        )
        """,
        (
            auth["token"],
            phone,
            limit,
        ),
    )


@router.post("/sales-customers")
def create_sales_customer(
    data: SalesCustomerCreateRequest,
    auth: dict = Depends(get_current_auth),
):
    require_access(auth, "CUSTOMER_MANAGE")

    return call_db_function(
        """
        SELECT public.fn_create_sales_customer(
            %s::text,
            %s::text,
            %s::text,
            %s::date,
            %s::text
        )
        """,
        (
            auth["token"],
            data.full_name,
            data.phone,
            data.birth_date,
            data.address,
        ),
    )


@router.put("/sales-customers/{customer_id}")
def update_sales_customer(
    customer_id: int,
    data: SalesCustomerUpdateRequest,
    auth: dict = Depends(get_current_auth),
):
    require_access(auth, "CUSTOMER_MANAGE")

    if customer_id <= 0:
        raise HTTPException(
            status_code=422,
            detail="customer_id không hợp lệ",
        )

    return call_db_function(
        """
        SELECT public.fn_update_sales_customer_profile(
            %s::text,
            %s::bigint,
            %s::text,
            %s::date,
            %s::text
        )
        """,
        (
            auth["token"],
            customer_id,
            data.full_name,
            data.birth_date,
            data.address,
        ),
    )


# Giữ endpoint directory cũ để tương thích các màn hình khác.
@router.get("/sales-customers")
def list_sales_customers(
    search: Optional[str] = Query(default=None),
    auth: dict = Depends(get_current_auth),
):
    require_access(auth, "CUSTOMER_VIEW")

    return call_db_function(
        """
        SELECT public.fn_list_sales_customers(
            %s::text,
            %s::text
        )
        """,
        (
            auth["token"],
            search,
        ),
    )


# ============================================================
# LIST SALES ORDERS
# ============================================================

@router.get("/sales-orders")
def list_sales_orders(
    status: Optional[str] = Query(default=None),
    warehouse_id: Optional[int] = Query(
        default=None,
        gt=0,
    ),
    search: Optional[str] = Query(default=None),
    auth: dict = Depends(get_current_auth),
):
    require_access(auth, "SALES_VIEW")

    normalized_status = (
        status.strip().upper()
        if status and status.strip()
        else None
    )

    if normalized_status not in (
        None,
        "UNPAID",
        "PAID",
        "CANCELLED",
    ):
        raise HTTPException(
            status_code=422,
            detail=(
                "Trạng thái chỉ nhận "
                "UNPAID, PAID hoặc CANCELLED"
            ),
        )

    return call_db_function(
        """
        SELECT public.fn_list_sales_orders(
            %s::text,
            %s::text,
            %s::bigint,
            %s::text
        )
        """,
        (
            auth["token"],
            normalized_status,
            warehouse_id,
            search,
        ),
    )


# ============================================================
# CREATE SALES ORDER
# ============================================================

@router.post("/sales-orders")
def create_sales_order(
    data: SalesOrderCreateRequest,
    auth: dict = Depends(get_current_auth),
):
    require_access(auth, "SALES_CREATE", data.warehouse_id)

    return call_db_function(
        """
        SELECT public.fn_create_sales_order(
            %s::text,
            %s::bigint,
            %s::text,
            %s::text,
            %s::date,
            %s::text,
            %s::text
        )
        """,
        (
            auth["token"],
            data.warehouse_id,
            data.customer_name,
            data.customer_phone,
            data.customer_birth_date,
            data.customer_address,
            data.note,
        ),
    )


# ============================================================
# LOOKUP SALES ORDER BY PUBLIC ID / QR
#
# PHẢI đặt trước /sales-orders/{sale_id}
# để FastAPI không hiểu "lookup" là sale_id.
# ============================================================

@router.get("/sales-orders/lookup/{public_id}")
def lookup_sales_order_by_public_id(
    public_id: UUID,
    auth: dict = Depends(get_current_auth),
):
    require_access(auth, "SALES_VIEW")

    return call_db_function(
        """
        SELECT public.fn_lookup_sales_order_by_public_id(
            %s::text,
            %s::uuid
        )
        """,
        (
            auth["token"],
            str(public_id),
        ),
    )


# ============================================================
# GET SALES ORDER DETAIL
#
# Đặt sau /sales-orders/medicines và /sales-orders/lookup.
# ============================================================

@router.get("/sales-orders/{sale_id}")
def get_sales_order(
    sale_id: int,
    auth: dict = Depends(get_current_auth),
):
    require_access(auth, "SALES_VIEW")

    return call_db_function(
        """
        SELECT public.fn_get_sales_order(
            %s::text,
            %s::bigint
        )
        """,
        (
            auth["token"],
            sale_id,
        ),
    )


# ============================================================
# UPDATE HEADER - ONLY UNPAID
# ============================================================

@router.put("/sales-orders/{sale_id}")
def update_sales_order(
    sale_id: int,
    data: SalesOrderUpdateRequest,
    auth: dict = Depends(get_current_auth),
):
    require_access(auth, "SALES_CREATE", data.warehouse_id)

    return call_db_function(
        """
        SELECT public.fn_update_sales_order(
            %s::text,
            %s::bigint,
            %s::bigint,
            %s::text,
            %s::text,
            %s::date,
            %s::text,
            %s::text
        )
        """,
        (
            auth["token"],
            sale_id,
            data.warehouse_id,
            data.customer_name,
            data.customer_phone,
            data.customer_birth_date,
            data.customer_address,
            data.note,
        ),
    )


# ============================================================
# ADD ITEM
#
# Frontend chỉ gửi:
#   medicine_id
#   quantity
#
# unit_price KHÔNG lấy từ frontend.
# Function PostgreSQL hiện giữ signature cũ nên truyền dummy = 1.
# PostgreSQL sẽ bỏ giá dummy này và dùng medicines.selling_price.
# ============================================================

@router.post("/sales-orders/{sale_id}/items")
def add_sales_order_item(
    sale_id: int,
    data: SalesOrderItemRequest,
    auth: dict = Depends(get_current_auth),
):
    require_access(auth, "SALES_CREATE")

    return call_db_function(
        """
        SELECT public.fn_add_sales_order_item(
            %s::text,
            %s::bigint,
            %s::bigint,
            %s::numeric,
            %s::numeric
        )
        """,
        (
            auth["token"],
            sale_id,
            data.medicine_id,
            data.quantity,
            Decimal("1"),
        ),
    )


# ============================================================
# UPDATE ITEM
# ============================================================

@router.put(
    "/sales-orders/{sale_id}/items/{item_id}"
)
def update_sales_order_item(
    sale_id: int,
    item_id: int,
    data: SalesOrderItemRequest,
    auth: dict = Depends(get_current_auth),
):
    require_access(auth, "SALES_CREATE")

    return call_db_function(
        """
        SELECT public.fn_update_sales_order_item(
            %s::text,
            %s::bigint,
            %s::bigint,
            %s::bigint,
            %s::numeric,
            %s::numeric
        )
        """,
        (
            auth["token"],
            sale_id,
            item_id,
            data.medicine_id,
            data.quantity,
            Decimal("1"),
        ),
    )


# ============================================================
# DELETE ITEM
# ============================================================

@router.delete(
    "/sales-orders/{sale_id}/items/{item_id}"
)
def delete_sales_order_item(
    sale_id: int,
    item_id: int,
    auth: dict = Depends(get_current_auth),
):
    require_access(auth, "SALES_CREATE")

    return call_db_function(
        """
        SELECT public.fn_delete_sales_order_item(
            %s::text,
            %s::bigint,
            %s::bigint
        )
        """,
        (
            auth["token"],
            sale_id,
            item_id,
        ),
    )


# ============================================================
# CANCEL SALES ORDER
#
# UNPAID -> CANCELLED
# - release toàn bộ ACTIVE reservation
# - không trừ tồn vật lý
# - không xóa item để giữ lịch sử
# ============================================================

@router.post("/sales-orders/{sale_id}/cancel")
def cancel_sales_order(
    sale_id: int,
    auth: dict = Depends(get_current_auth),
):
    require_access(auth, "SALES_CREATE")

    return call_db_function(
        """
        SELECT public.fn_cancel_sales_order(
            %s::text,
            %s::bigint
        )
        """,
        (
            auth["token"],
            sale_id,
        ),
    )


# ============================================================
# PAYMENT
#
# Đây là hành động duy nhất:
#   UNPAID -> FEFO -> SALE_OUT -> PAID
#
# Không còn:
#   submit
#   approve
#   return
#   reject
# ============================================================

@router.post("/sales-orders/{sale_id}/pay")
def pay_sales_order(
    sale_id: int,
    auth: dict = Depends(get_current_auth),
):
    require_access(auth, "SALES_PAY")

    return call_db_function(
        """
        SELECT public.fn_pay_sales_order(
            %s::text,
            %s::bigint
        )
        """,
        (
            auth["token"],
            sale_id,
        ),
    )
