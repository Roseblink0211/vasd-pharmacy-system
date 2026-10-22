from fastapi import Depends, FastAPI, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from database import get_connection
from schemas import (
    RegisterRequest,
    LoginRequest,
    UpdateProfileRequest,
    ChangePasswordRequest,

    SupplierCreateRequest,
    SupplierUpdateRequest,
    StatusRequest,

    MedicineCreateRequest,
    MedicineUpdateRequest,

    PurchaseReceiptCreateRequest,
    PurchaseReceiptItemCreateRequest,
    PurchaseReceiptRejectRequest,

    WarehouseTransferRequest,

    SupplierReturnCreateRequest,
    SupplierReturnItemCreateRequest,
    SupplierReturnRejectRequest,
)

app = FastAPI(
    title='VASD User API',
    description='Business logic is implemented in PostgreSQL functions; FastAPI only calls those functions.',
    version='1.0.0',
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
    except Exception as exc:
        if conn:
            conn.rollback()
        print('Database error:', exc)
        raise HTTPException(status_code=500, detail='Database error')
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


@app.post('/users/register', tags=['Authentication'])
def register_user(data: RegisterRequest):
    return call_db_function(
        'SELECT public.fn_register_user(%s, %s, %s, %s, %s)',
        (data.full_name, data.email, data.password, data.phone, data.address),
    )


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
    return call_db_function(
        """
        SELECT public.fn_create_supplier(
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
    return call_db_function(
        """
        SELECT public.fn_list_suppliers(
            %s::text,
            %s::boolean
        )
        """,
        (
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
    return call_db_function(
        """
        SELECT public.fn_get_supplier(
            %s::bigint
        )
        """,
        (supplier_id,),
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
    return call_db_function(
        """
        SELECT public.fn_update_supplier(
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
    return call_db_function(
        """
        SELECT public.fn_set_supplier_status(
            %s::bigint,
            %s::boolean
        )
        """,
        (
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
            %s::bigint,
            %s::text
        )
        """,
        (
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
    return call_db_function(
        """
        SELECT public.fn_list_medicines(
            %s::text,
            %s::bigint,
            %s::boolean
        )
        """,
        (
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
    return call_db_function(
        """
        SELECT public.fn_get_medicine(
            %s::bigint
        )
        """,
        (medicine_id,),
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
    return call_db_function(
        """
        SELECT public.fn_update_medicine(
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
    return call_db_function(
        """
        SELECT public.fn_set_medicine_status(
            %s::bigint,
            %s::boolean
        )
        """,
        (
            medicine_id,
            data.is_active,
        ),
    )

@app.post(
    "/purchase-receipts",
    tags=["Purchase Receipt"]
)
def create_purchase_receipt(
    data: PurchaseReceiptCreateRequest,
    auth: dict = Depends(get_current_auth),
):
    return call_db_function(
        """
        SELECT public.fn_create_purchase_receipt(
            %s::text,
            %s::bigint,
            %s::text,
            %s::text,
            %s::date,
            %s::text
        )
        """,
        (
            auth["token"],
            data.supplier_id,
            data.invoice_number,
            data.invoice_serial,
            data.invoice_date,
            data.note,
        ),
    )

@app.post(
    "/purchase-receipts/{receipt_id}/items",
    tags=["Purchase Receipt"]
)
def add_purchase_receipt_item(
    receipt_id: int,
    data: PurchaseReceiptItemCreateRequest,
    auth: dict = Depends(get_current_auth),
):
    return call_db_function(
        """
        SELECT public.fn_add_purchase_receipt_item(
            %s::text,
            %s::bigint,
            %s::bigint,
            %s::text,
            %s::date,
            %s::numeric,
            %s::numeric
        )
        """,
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

@app.post(
    "/purchase-receipts/{receipt_id}/submit",
    tags=["Purchase Receipt"]
)
def submit_purchase_receipt(
    receipt_id: int,
    auth: dict = Depends(get_current_auth),
):
    return call_db_function(
        """
        SELECT public.fn_submit_purchase_receipt(
            %s::text,
            %s::bigint
        )
        """,
        (
            auth["token"],
            receipt_id,
        ),
    )

@app.post(
    "/purchase-receipts/{receipt_id}/approve",
    tags=["Purchase Receipt"]
)
def approve_purchase_receipt(
    receipt_id: int,
    auth: dict = Depends(get_current_auth),
):
    return call_db_function(
        """
        SELECT public.fn_approve_purchase_receipt(
            %s::text,
            %s::bigint
        )
        """,
        (
            auth["token"],
            receipt_id,
        ),
    )

@app.get(
    "/purchase-receipts",
    tags=["Purchase Receipt"]
)
def list_purchase_receipts(
    status: str | None = None,
    supplier_id: int | None = None,
    search: str | None = None,
    auth: dict = Depends(get_current_auth),
):
    return call_db_function(
        """
        SELECT public.fn_list_purchase_receipts(
            %s::text,
            %s::text,
            %s::bigint,
            %s::text
        )
        """,
        (
            auth["token"],
            status,
            supplier_id,
            search,
        ),
    )

@app.get(
    "/purchase-receipts/{receipt_id}",
    tags=["Purchase Receipt"]
)
def get_purchase_receipt(
    receipt_id: int,
    auth: dict = Depends(get_current_auth),
):
    return call_db_function(
        """
        SELECT public.fn_get_purchase_receipt(
            %s::text,
            %s::bigint
        )
        """,
        (
            auth["token"],
            receipt_id,
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

@app.post(
    "/purchase-receipts/{receipt_id}/reject",
    tags=["Purchase Receipt"]
)
def reject_purchase_receipt(
    receipt_id: int,
    data: PurchaseReceiptRejectRequest,
    auth: dict = Depends(get_current_auth),
):
    return call_db_function(
        """
        SELECT public.fn_reject_purchase_receipt(
            %s::text,
            %s::bigint,
            %s::text
        )
        """,
        (
            auth["token"],
            receipt_id,
            data.reason,
        ),
    )

@app.post(
    "/warehouse-transfers",
    tags=["Warehouse Transfer"]
)
def transfer_stock(
    data: WarehouseTransferRequest,
    auth: dict = Depends(get_current_auth),
):
    return call_db_function(
        """
        SELECT public.fn_transfer_stock(
            %s::text,
            %s::bigint,
            %s::bigint,
            %s::bigint,
            %s::numeric,
            %s::text
        )
        """,
        (
            auth["token"],
            data.source_warehouse_id,
            data.destination_warehouse_id,
            data.batch_id,
            data.quantity,
            data.note,
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

@app.post(
    "/supplier-returns/{return_id}/submit",
    tags=["Supplier Return"]
)
def submit_supplier_return(
    return_id: int,
    auth: dict = Depends(get_current_auth),
):
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
    "/warehouse-transfers",
    tags=["Warehouse Transfer"]
)
def list_warehouse_transfers(
    source_warehouse_id: int | None = None,
    destination_warehouse_id: int | None = None,
    search: str | None = None,
    auth: dict = Depends(get_current_auth),
):
    return call_db_function(
        """
        SELECT public.fn_list_warehouse_transfers(
            %s::text,
            %s::bigint,
            %s::bigint,
            %s::text
        )
        """,
        (
            auth["token"],
            source_warehouse_id,
            destination_warehouse_id,
            search,
        ),
    )

@app.get(
    "/warehouse-transfers/{transfer_id}",
    tags=["Warehouse Transfer"]
)
def get_warehouse_transfer(
    transfer_id: int,
    auth: dict = Depends(get_current_auth),
):
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