from typing import Optional
from pydantic import BaseModel


class RegisterRequest(BaseModel):
    full_name: str
    email: str
    password: str
    phone: Optional[str] = None
    address: Optional[str] = None


class LoginRequest(BaseModel):
    email: str
    password: str


class UpdateProfileRequest(BaseModel):
    full_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str

from typing import Optional
from pydantic import BaseModel


# ==============================
# SUPPLIER
# ==============================

class SupplierCreateRequest(BaseModel):
    name: str
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    tax_code: Optional[str] = None
    contact_person: Optional[str] = None
    note: Optional[str] = None


class SupplierUpdateRequest(BaseModel):
    name: str
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    tax_code: Optional[str] = None
    contact_person: Optional[str] = None
    note: Optional[str] = None


class StatusRequest(BaseModel):
    is_active: bool


# ==============================
# MEDICINE
# ==============================

class MedicineCreateRequest(BaseModel):
    name: str
    active_ingredient: str

    strength: Optional[str] = None

    dosage_form: Optional[str] = None

    unit: Optional[str] = None

    route_of_administration: Optional[str] = None

    usage_instructions: Optional[str] = None

    packaging: Optional[str] = None

    manufacturer: Optional[str] = None

    country_of_origin: Optional[str] = None

    registration_number: Optional[str] = None

    supplier_id: int

    note: Optional[str] = None


class MedicineUpdateRequest(BaseModel):
    name: str
    active_ingredient: str

    strength: Optional[str] = None

    dosage_form: Optional[str] = None

    unit: Optional[str] = None

    route_of_administration: Optional[str] = None

    usage_instructions: Optional[str] = None

    packaging: Optional[str] = None

    manufacturer: Optional[str] = None

    country_of_origin: Optional[str] = None

    registration_number: Optional[str] = None

    supplier_id: int

    note: Optional[str] = None

from datetime import date
from typing import Optional
from pydantic import BaseModel


class PurchaseReceiptCreateRequest(BaseModel):
    supplier_id: int
    invoice_number: str
    invoice_serial: Optional[str] = None
    invoice_date: Optional[date] = None
    note: Optional[str] = None


class PurchaseReceiptItemCreateRequest(BaseModel):
    medicine_id: int
    lot_number: str
    expiry_date: date
    quantity: float
    unit_price: float

class PurchaseReceiptRejectRequest(BaseModel):
    reason: str

class WarehouseTransferRequest(BaseModel):
    source_warehouse_id: int
    destination_warehouse_id: int
    batch_id: int
    quantity: float
    note: Optional[str] = None

class SupplierReturnCreateRequest(BaseModel):
    supplier_id: int
    warehouse_id: int
    reason: str
    note: Optional[str] = None


class SupplierReturnItemCreateRequest(BaseModel):
    batch_id: int
    quantity: float


class SupplierReturnRejectRequest(BaseModel):
    reason: str