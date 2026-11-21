from fastapi import Depends, FastAPI, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from database import get_connection
from authz import require_access
from purchase_receipts import router as purchase_receipts_router
from warehouses import router as warehouses_router
from warehouse_transfers import router as warehouse_transfers_router
from sales_orders import router as sales_orders_router
from customer_returns import router as customer_returns_router
from user_access import router as user_access_router
from stock_thresholds import router as stock_thresholds_router
from expiry_alerts import router as expiry_alerts_router
from schemas import (
    LoginRequest,
    UpdateProfileRequest,
    ChangePasswordRequest,

    SupplierCreateRequest,
    SupplierUpdateRequest,
    StatusRequest,

    MedicineCreateRequest,
    MedicineUpdateRequest,

    SupplierReturnCreateRequest,
    SupplierReturnItemCreateRequest,
    SupplierReturnRejectRequest,
)

from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title='VASD User API',
    description='Business logic is implemented in PostgreSQL functions; FastAPI only calls those functions.',
    version='1.0.0',
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Warehouse catalog router
app.include_router(warehouses_router)

# Purchase Receipts router (new workflow)
app.include_router(purchase_receipts_router)
# Warehouse Transfers router (header + multiple items + approval workflow)
app.include_router(warehouse_transfers_router)
# Sales Orders router (UNPAID -> PAID + FEFO/reservations)
app.include_router(sales_orders_router)

# Customer Returns router (PAID sale -> customer return -> inventory IN)
app.include_router(customer_returns_router)

# RBAC administration API
app.include_router(user_access_router)

# Minimum stock thresholds / low-stock alerts
app.include_router(stock_thresholds_router)

# Batch expiry alerts
app.include_router(expiry_alerts_router)

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
    except Exception as exc:
        if conn:
            conn.rollback()

        diag = getattr(exc, "diag", None)
        db_message = getattr(diag, "message_primary", None)
        detail = db_message or str(exc).strip() or "Database error"

        print("Database error - main :", exc)

        raise HTTPException(
            status_code=500,
            detail=detail,
        )

    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


def get_current_auth(credentials: HTTPAuthorizationCredentials = Depends(security)):
    if credentials is None:
        raise HTTPException(status_code=401, detail='Bearer token is required')

    token = credentials.credentials
    result = call_db_function('SELECT public.fn_validate_token(%s)', (token,))

    if not result or result.get('success') is not True:
        message = result.get('message', 'Invalid token') if result else 'Invalid token'
        raise HTTPException(status_code=401, detail=message)

    return {
        'token': token,
        'user_id': result.get('user_id'),
        'token_type': result.get('token_type'),
    }


@app.get('/', tags=['System'])
def home():
    return {'message': 'VASD User API is running', 'docs': '/docs'}


@app.get('/health', tags=['System'])
def health():
    conn = None
    cursor = None
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute('SELECT 1')
        cursor.fetchone()
        return {'status': 'ok', 'database': 'connected'}
    except Exception:
        raise HTTPException(status_code=503, detail='Database unavailable')
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@app.post('/users/login', tags=['Authentication'])
def login_user(data: LoginRequest):
    return call_db_function(
        'SELECT public.fn_login_user(%s, %s)',
        (data.email, data.password),
    )


@app.get('/users/me', tags=['User'])
def get_current_user(auth: dict = Depends(get_current_auth)):
    return call_db_function('SELECT public.fn_get_current_user(%s)', (auth['token'],))


@app.put('/users/profile', tags=['User'])
def update_profile(data: UpdateProfileRequest, auth: dict = Depends(get_current_auth)):
    return call_db_function(
        'SELECT public.fn_update_profile(%s, %s, %s, %s, %s)',
        (auth['token'], data.full_name, data.email, data.phone, data.address),
    )


@app.put('/users/change-password', tags=['User'])
def change_password(data: ChangePasswordRequest, auth: dict = Depends(get_current_auth)):
    return call_db_function(
        'SELECT public.fn_change_password(%s, %s, %s)',
        (auth['token'], data.old_password, data.new_password),
    )


@app.post('/users/logout', tags=['Authentication'])
def logout_user(auth: dict = Depends(get_current_auth)):
    return call_db_function('SELECT public.fn_logout_user(%s)', (auth['token'],))


@app.post(
    "/suppliers",
    tags=["Supplier"]
)
def create_supplier(
    data: SupplierCreateRequest,
    auth: dict = Depends(get_current_auth),
):
    require_access(auth, "SUPPLIER_MANAGE")

    return call_db_function(
        """
        SELECT public.fn_create_supplier(
            %s::text,
            %s::text,
            %s::text,
            %s::text,
            %s::text,
            %s::text,
            %s::text,
            %s::text
        )
        """,
        (
            auth["token"],
            data.name,
            data.address,
            data.phone,
            data.email,
            data.tax_code,
            data.contact_person,
            data.note,
        ),
    )


@app.get(
    "/suppliers",
    tags=["Supplier"]
)
def list_suppliers(
    search: str | None = None,
    is_active: bool | None = None,
    auth: dict = Depends(get_current_auth),
):
    require_access(auth, "SUPPLIER_VIEW")

    return call_db_function(
        """
        SELECT public.fn_list_suppliers(
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


@app.get(
    "/suppliers/{supplier_id}",
    tags=["Supplier"]
)
def get_supplier(
    supplier_id: int,
    auth: dict = Depends(get_current_auth),
):
    require_access(auth, "SUPPLIER_VIEW")

    return call_db_function(
        """
        SELECT public.fn_get_supplier(
            %s::text,
            %s::bigint
        )
        """,
        (
            auth["token"],
            supplier_id,
        ),
    )


@app.put(
    "/suppliers/{supplier_id}",
    tags=["Supplier"]
)
def update_supplier(
    supplier_id: int,
    data: SupplierUpdateRequest,
    auth: dict = Depends(get_current_auth),
):
    require_access(auth, "SUPPLIER_MANAGE")

    return call_db_function(
        """
        SELECT public.fn_update_supplier(
            %s::text,
            %s::bigint,
            %s::text,
            %s::text,
            %s::text,
            %s::text,
            %s::text,
            %s::text,
            %s::text
        )
        """,
        (
            auth["token"],
            supplier_id,
            data.name,
            data.address,
            data.phone,
            data.email,
            data.tax_code,
            data.contact_person,
            data.note,
        ),
    )


@app.patch(
    "/suppliers/{supplier_id}/status",
    tags=["Supplier"]
)
def set_supplier_status(
    supplier_id: int,
    data: StatusRequest,
    auth: dict = Depends(get_current_auth),
):
    require_access(auth, "SUPPLIER_MANAGE")

    return call_db_function(
        """
        SELECT public.fn_set_supplier_status(
            %s::text,
            %s::bigint,
            %s::boolean
        )
        """,
        (
            auth["token"],
            supplier_id,
            data.is_active,
        ),
    )


@app.post(
    "/medicines",
    tags=["Medicine"]
)
def create_medicine(
    data: MedicineCreateRequest,
    auth: dict = Depends(get_current_auth),
):
    require_access(auth, "MEDICINE_MANAGE")

    return call_db_function(
        """
        SELECT public.fn_create_medicine(
            %s::text,
            %s::text,
            %s::text,
            %s::text,
            %s::text,
            %s::text,
            %s::text,
            %s::text,
            %s::text,
            %s::text,
            %s::text,
            %s::text,
            %s::bigint,
            %s::text
        )
        """,
        (
            auth["token"],
            data.name,
            data.active_ingredient,
            data.strength,
            data.dosage_form,
            data.unit,
            data.route_of_administration,
            data.usage_instructions,
            data.packaging,
            data.manufacturer,
            data.country_of_origin,
            data.registration_number,
            data.supplier_id,
            data.note,
        ),
    )


@app.get(
    "/medicines",
    tags=["Medicine"]
)
def list_medicines(
    search: str | None = None,
    supplier_id: int | None = None,
    is_active: bool | None = None,
    auth: dict = Depends(get_current_auth),
):
    require_access(auth, "MEDICINE_VIEW")

    return call_db_function(
        """
        SELECT public.fn_list_medicines(
            %s::text,
            %s::text,
            %s::bigint,
            %s::boolean
        )
        """,
        (
            auth["token"],
            search,
            supplier_id,
            is_active,
        ),
    )


@app.get(
    "/medicines/{medicine_id}",
    tags=["Medicine"]
)
def get_medicine(
    medicine_id: int,
    auth: dict = Depends(get_current_auth),
):
    require_access(auth, "MEDICINE_VIEW")

    return call_db_function(
        """
        SELECT public.fn_get_medicine(
            %s::text,
            %s::bigint
        )
        """,
        (
            auth["token"],
            medicine_id,
        ),
    )


@app.put(
    "/medicines/{medicine_id}",
    tags=["Medicine"]
)
def update_medicine(
    medicine_id: int,
    data: MedicineUpdateRequest,
    auth: dict = Depends(get_current_auth),
):
    require_access(auth, "MEDICINE_MANAGE")

    return call_db_function(
        """
        SELECT public.fn_update_medicine(
            %s::text,
            %s::bigint,
            %s::text,
            %s::text,
            %s::text,
            %s::text,
            %s::text,
            %s::text,
            %s::text,
            %s::text,
            %s::text,
            %s::text,
            %s::text,
            %s::bigint,
            %s::text
        )
        """,
        (
            auth["token"],
            medicine_id,
            data.name,
            data.active_ingredient,
            data.strength,
            data.dosage_form,
            data.unit,
            data.route_of_administration,
            data.usage_instructions,
            data.packaging,
            data.manufacturer,
            data.country_of_origin,
            data.registration_number,
            data.supplier_id,
            data.note,
        ),
    )


@app.patch(
    "/medicines/{medicine_id}/status",
    tags=["Medicine"]
)
def set_medicine_status(
    medicine_id: int,
    data: StatusRequest,
    auth: dict = Depends(get_current_auth),
):
    require_access(auth, "MEDICINE_MANAGE")

    return call_db_function(
        """
        SELECT public.fn_set_medicine_status(
            %s::text,
            %s::bigint,
            %s::boolean
        )
        """,
        (
            auth["token"],
            medicine_id,
            data.is_active,
        ),
    )


@app.get(
    "/inventory",
    tags=["Inventory"]
)
def list_inventory(
    warehouse_id: int | None = None,
    search: str | None = None,
    auth: dict = Depends(get_current_auth),
):
    require_access(auth, "INVENTORY_VIEW", warehouse_id)

    return call_db_function(
        """
        SELECT public.fn_list_inventory(
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


@app.get(
    "/inventory/availability",
    tags=["Inventory"]
)
def list_inventory_availability(
    warehouse_id: int | None = None,
    medicine_id: int | None = None,
    auth: dict = Depends(get_current_auth),
):
    require_access(auth, "INVENTORY_VIEW", warehouse_id)

    return call_db_function(
        """
        SELECT public.fn_list_inventory_availability(
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


@app.get(
    "/stock-reservations",
    tags=["Inventory"]
)
def list_stock_reservations(
    reference_type: str | None = None,
    reference_id: int | None = None,
    status: str | None = None,
    auth: dict = Depends(get_current_auth),
):
    require_access(auth, "INVENTORY_VIEW")

    return call_db_function(
        """
        SELECT public.fn_list_stock_reservations(
            %s::text,
            %s::text,
            %s::bigint,
            %s::text
        )
        """,
        (
            auth["token"],
            reference_type,
            reference_id,
            status,
        ),
    )


@app.post(
    "/supplier-returns",
    tags=["Supplier Return"]
)
def create_supplier_return(
    data: SupplierReturnCreateRequest,
    auth: dict = Depends(get_current_auth),
):
    require_access(auth, "SUPPLIER_RETURN_CREATE", data.warehouse_id)

    return call_db_function(
        """
        SELECT public.fn_create_supplier_return(
            %s::text,
            %s::bigint,
            %s::bigint,
            %s::text,
            %s::text
        )
        """,
        (
            auth["token"],
            data.supplier_id,
            data.warehouse_id,
            data.reason,
            data.note,
        ),
    )

@app.post(
    "/supplier-returns/{return_id}/items",
    tags=["Supplier Return"]
)
def add_supplier_return_item(
    return_id: int,
    data: SupplierReturnItemCreateRequest,
    auth: dict = Depends(get_current_auth),
):
    require_access(auth, "SUPPLIER_RETURN_CREATE")

    return call_db_function(
        """
        SELECT public.fn_add_supplier_return_item(
            %s::text,
            %s::bigint,
            %s::bigint,
            %s::numeric
        )
        """,
        (
            auth["token"],
            return_id,
            data.batch_id,
            data.quantity,
        ),
    )

@app.put(
    "/supplier-returns/{return_id}/items/{item_id}",
    tags=["Supplier Return"]
)
def update_supplier_return_item(
    return_id: int,
    item_id: int,
    data: SupplierReturnItemCreateRequest,
    auth: dict = Depends(get_current_auth),
):
    require_access(auth, "SUPPLIER_RETURN_CREATE")

    return call_db_function(
        """
        SELECT public.fn_update_supplier_return_item(
            %s::text,
            %s::bigint,
            %s::bigint,
            %s::bigint,
            %s::numeric
        )
        """,
        (
            auth["token"],
            return_id,
            item_id,
            data.batch_id,
            data.quantity,
        ),
    )


@app.delete(
    "/supplier-returns/{return_id}/items/{item_id}",
    tags=["Supplier Return"]
)
def delete_supplier_return_item(
    return_id: int,
    item_id: int,
    auth: dict = Depends(get_current_auth),
):
    require_access(auth, "SUPPLIER_RETURN_CREATE")

    return call_db_function(
        """
        SELECT public.fn_delete_supplier_return_item(
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


@app.post(
    "/supplier-returns/{return_id}/submit",
    tags=["Supplier Return"]
)
def submit_supplier_return(
    return_id: int,
    auth: dict = Depends(get_current_auth),
):
    require_access(auth, "SUPPLIER_RETURN_CREATE")

    return call_db_function(
        """
        SELECT public.fn_submit_supplier_return(
            %s::text,
            %s::bigint
        )
        """,
        (
            auth["token"],
            return_id,
        ),
    )

@app.post(
    "/supplier-returns/{return_id}/approve",
    tags=["Supplier Return"]
)
def approve_supplier_return(
    return_id: int,
    auth: dict = Depends(get_current_auth),
):
    require_access(auth, "SUPPLIER_RETURN_APPROVE")

    return call_db_function(
        """
        SELECT public.fn_approve_supplier_return(
            %s::text,
            %s::bigint
        )
        """,
        (
            auth["token"],
            return_id,
        ),
    )

@app.post(
    "/supplier-returns/{return_id}/reject",
    tags=["Supplier Return"]
)
def reject_supplier_return(
    return_id: int,
    data: SupplierReturnRejectRequest,
    auth: dict = Depends(get_current_auth),
):
    require_access(auth, "SUPPLIER_RETURN_APPROVE")

    return call_db_function(
        """
        SELECT public.fn_reject_supplier_return(
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

@app.get(
    "/supplier-returns",
    tags=["Supplier Return"]
)
def list_supplier_returns(
    status: str | None = None,
    supplier_id: int | None = None,
    warehouse_id: int | None = None,
    search: str | None = None,
    auth: dict = Depends(get_current_auth),
):
    require_access(auth, "SUPPLIER_RETURN_VIEW", warehouse_id)

    return call_db_function(
        """
        SELECT public.fn_list_supplier_returns(
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
            supplier_id,
            warehouse_id,
            search,
        ),
    )

@app.get(
    "/supplier-returns/{return_id}",
    tags=["Supplier Return"]
)
def get_supplier_return(
    return_id: int,
    auth: dict = Depends(get_current_auth),
):
    require_access(auth, "SUPPLIER_RETURN_VIEW")

    return call_db_function(
        """
        SELECT public.fn_get_supplier_return(
            %s::text,
            %s::bigint
        )
        """,
        (
            auth["token"],
            return_id,
        ),
    )


@app.get(
    "/stock-movements",
    tags=["Stock Movement"]
)
def list_stock_movements(
    warehouse_id: int | None = None,
    movement_type: str | None = None,
    medicine_id: int | None = None,
    search: str | None = None,
    auth: dict = Depends(get_current_auth),
):
    require_access(auth, "STOCK_HISTORY_VIEW", warehouse_id)

    return call_db_function(
        """
        SELECT public.fn_list_stock_movements(
            %s::text,
            %s::bigint,
            %s::text,
            %s::bigint,
            %s::text
        )
        """,
        (
            auth["token"],
            warehouse_id,
            movement_type,
            medicine_id,
            search,
        ),
    )
