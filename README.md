# VASD Pharmacy

VASD Pharmacy là hệ thống quản lý nhà thuốc và kho thuốc được xây dựng nhằm hỗ trợ quản lý nhập thuốc, chuyển kho, bán thuốc, hoàn thuốc, trả nhà cung cấp, tồn kho và phân quyền người dùng.

Hệ thống được phát triển theo mô hình:

**PostgreSQL → PostgreSQL Functions → FastAPI → React + TypeScript**

---

## Chức năng chính

### Quản lý thuốc

- Quản lý danh mục thuốc.
- Theo dõi mã thuốc, tên thuốc, hàm lượng và các thông tin liên quan.
- Theo dõi thuốc theo từng lô.

### Quản lý kho

- Quản lý nhiều kho.
- Phân biệt Kho chính, Kho bán và các loại kho khác.
- Theo dõi tồn kho theo:

```text
warehouse_id + batch_id
```

Mỗi dòng tồn kho gồm:

```text
physical_quantity
reserved_quantity
available_quantity
```

Trong đó:

```text
available_quantity = physical_quantity - reserved_quantity
```

---

## Nhập thuốc

Quy trình:

```text
Tạo phiếu
→ Kiểm tra phiếu
→ Nhập kho
→ Hoàn tất
```

Hệ thống hỗ trợ:

- Chọn kho nhận thuốc.
- Nhập nhiều thuốc trong một phiếu.
- Kiểm tra số lượng và đơn giá.
- Theo dõi số lô.
- Theo dõi ngày hết hạn.
- Tạo lô thuốc sau khi nhập kho.
- Truy vết ID lô sau khi nhập.

---

## Chuyển kho

Quy trình:

```text
DRAFT
→ PENDING
→ APPROVED
```

Phiếu có thể được trả lại để chỉnh sửa:

```text
PENDING
→ RETURNED
→ chỉnh sửa
→ gửi duyệt lại
```

Hệ thống sử dụng reservation để giữ số lượng thuốc trong quá trình chờ xử lý.

---

## Bán thuốc

Trạng thái chính:

```text
UNPAID
→ PAID
```

Khi lập phiếu bán:

```text
physical_quantity không thay đổi
reserved_quantity tăng
available_quantity giảm
```

Khi thanh toán thành công:

```text
physical_quantity giảm
reserved_quantity giảm
reservation → CONSUMED
```

Hệ thống sử dụng nguyên tắc **FEFO** để ưu tiên xuất thuốc có hạn sử dụng gần nhất.

Nếu hủy phiếu chưa thanh toán:

```text
reservation → RELEASED
```

và tồn kho vật lý không bị thay đổi.

---

## Hoàn khách hàng

Hệ thống hỗ trợ hoàn thuốc từ phiếu bán đã thanh toán.

Có thể kiểm tra:

- Số lượng đã mua.
- Số lượng đã hoàn.
- Số lượng đang được giữ bởi phiếu nháp khác.
- Số lượng còn được hoàn.
- ID lô thuốc đã xuất.
- ID lô được hoàn lại.

Khi hoàn thành:

```text
physical_quantity tăng
CUSTOMER_RETURN được ghi vào lịch sử kho
```

Thuốc được hoàn về đúng lô đã xuất trước đó.

---

## Trả nhà cung cấp

Quy trình:

```text
DRAFT
→ PENDING
→ APPROVED
```

Khi gửi duyệt:

```text
reservation → ACTIVE
```

Khi duyệt:

```text
physical_quantity giảm
reservation → CONSUMED
RETURN_SUPPLIER được ghi vào lịch sử kho
```

Nếu từ chối hoặc hủy:

```text
reservation → RELEASED
```

---

## Reservation

Reservation được sử dụng để tránh tình trạng nhiều nghiệp vụ cùng sử dụng một lượng thuốc.

Các nghiệp vụ sử dụng reservation gồm:

```text
SALES_ORDER
WAREHOUSE_TRANSFER
SUPPLIER_RETURN
```

Các trạng thái chính:

```text
ACTIVE
CONSUMED
RELEASED
```

---

## Lịch sử kho

Hệ thống ghi nhận các loại biến động:

```text
IMPORT
TRANSFER_OUT
TRANSFER_IN
SALE_OUT
CUSTOMER_RETURN
RETURN_SUPPLIER
```

Trên giao diện hiển thị tương ứng:

```text
Nhập kho
Chuyển kho - Xuất
Chuyển kho - Nhập
Bán thuốc
Hoàn khách hàng
Trả NCC
```

---

## Phân quyền

Hệ thống sử dụng phân quyền theo role và permission.

### ADMIN

Có toàn quyền quản lý hệ thống.

### WAREHOUSE

Phụ trách các nghiệp vụ kho:

- Nhập thuốc.
- Chuyển kho.
- Trả nhà cung cấp.
- Xem tồn kho.
- Xem lịch sử kho.

Không có quyền duyệt nghiệp vụ.

### APPROVER

Phụ trách kiểm tra và duyệt nghiệp vụ:

- Chuyển kho.
- Trả nhà cung cấp.

Không trực tiếp tạo hoặc chỉnh sửa nghiệp vụ kho.

### PHARMACIST

Phụ trách:

- Bán thuốc.
- Thanh toán.
- Hoàn khách hàng.
- Tra cứu thuốc và tồn kho.

### CASHIER

Có thể:

- Lập phiếu bán.
- Thanh toán.
- Xem lịch sử hoàn khách hàng.

Không có quyền tạo phiếu hoàn thuốc.

---

# Công nghệ sử dụng

## Backend

- Python
- FastAPI
- PostgreSQL
- PL/pgSQL

## Frontend

- React
- TypeScript
- Vite
- Ant Design

---

# Cấu trúc thư mục

```text
VASD_User_API_Test/
│
├── main.py
├── database.py
├── database.sql
│
├── authz.py
├── user_access.py
├── warehouses.py
├── purchase_receipts.py
├── warehouse_transfers.py
├── sales_orders.py
├── customer_returns.py
├── stock_thresholds.py
├── expiry_alerts.py
│
├── audit_inventory_reservations.py
│
├── requirements.txt
├── .env.example
│
└── frontend/
    ├── src/
    │   ├── api/
    │   ├── components/
    │   ├── layouts/
    │   └── pages/
    │
    ├── package.json
    ├── vite.config.ts
    └── tsconfig.json
```

---

# Cài đặt Backend

Tạo môi trường Python:

```bash
python -m venv venv
```

Kích hoạt môi trường trên Windows:

```bash
venv\Scripts\activate
```

Cài thư viện:

```bash
pip install -r requirements.txt
```

Tạo file `.env` dựa trên:

```text
.env.example
```

Sau đó cấu hình kết nối PostgreSQL.

Khởi chạy backend:

```bash
uvicorn main:app --reload
```

Swagger API:

```text
http://127.0.0.1:8000/docs
```

---

# Cài đặt Frontend

Di chuyển vào thư mục:

```bash
cd frontend
```

Cài thư viện:

```bash
npm install
```

Chạy môi trường phát triển:

```bash
npm run dev
```

Frontend mặc định:

```text
http://localhost:5173
```

---

# Kiểm tra Production Build

```bash
cd frontend
npm run build
```

Build hiện tại đã được kiểm tra thành công với TypeScript và Vite.

---

# Kiểm tra Reservation

Có thể chạy:

```bash
python audit_inventory_reservations.py
```

để kiểm tra tính nhất quán giữa reservation và trạng thái nghiệp vụ.

---

# Nguyên tắc quản lý tồn kho

Hệ thống không chỉ sử dụng số lượng tồn vật lý mà tách thành:

```text
Physical
Reserved
Available
```

Nhờ đó hệ thống hạn chế tình trạng một lượng thuốc được sử dụng đồng thời bởi nhiều nghiệp vụ.

---

# Nguyên tắc truy vết lô

Mỗi lô thuốc được quản lý bằng `batch_id`.

Các nghiệp vụ như:

- Nhập thuốc
- Chuyển kho
- Bán thuốc
- Hoàn khách hàng
- Trả nhà cung cấp

đều có thể truy vết về lô thuốc tương ứng.

Điều này giúp kiểm tra chính xác quá trình nhập, xuất, chuyển và hoàn thuốc.

---

# Repository

GitHub:

```text
https://github.com/Roseblink0211/vasd-pharmacy-backend
```

---

# Tác giả

**Mai Trần Ngọc Trân**

VASD Pharmacy Project
