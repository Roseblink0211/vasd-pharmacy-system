# VASD User API - Local Source

## Chạy local

1. Tạo môi trường:

```powershell
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

2. Copy `.env.example` thành `.env` và điền mật khẩu PostgreSQL thật.

3. Đảm bảo database `internship_db` đã tồn tại.

4. Khởi tạo bảng + function:

```powershell
python init_db.py
```

5. Chạy API:

```powershell
python -m uvicorn main:app --reload
```

6. Mở Swagger:

`http://127.0.0.1:8000/docs`

## API

- POST `/users/register`
- POST `/users/login`
- GET `/users/me` (Bearer token)
- PUT `/users/profile` (Bearer token)
- PUT `/users/change-password` (Bearer token)
- POST `/users/logout` (Bearer token)

## Token test vô thời hạn

Chạy file `create_test_token.sql` trong pgAdmin. Sau khi nhận token gốc từ `fn_create_test_token`, lưu ngay token đó. Database chỉ lưu hash nên không đọc lại token gốc được.

Không đưa `.env`, mật khẩu DB hoặc token thật lên GitHub.
