import os
from pathlib import Path

import psycopg2
from dotenv import load_dotenv


BASE_DIR = Path(__file__).resolve().parent

load_dotenv(
    BASE_DIR / ".env",
    override=True
)


def get_connection():
    # Ưu tiên cấu hình local trong .env
    db_host = os.getenv("DB_HOST")
    db_port = os.getenv("DB_PORT")
    db_name = os.getenv("DB_NAME")
    db_user = os.getenv("DB_USER")
    db_password = os.getenv("DB_PASSWORD")

    if db_host and db_name and db_user:
        return psycopg2.connect(
            host=db_host,
            port=db_port or "5432",
            database=db_name,
            user=db_user,
            password=db_password
        )

    # Chỉ dùng DATABASE_URL khi deploy
    database_url = os.getenv("DATABASE_URL")

    if database_url:
        # Chuyển SQLAlchemy-style URL sang psycopg2 URL nếu cần
        database_url = database_url.replace(
            "postgresql+psycopg2://",
            "postgresql://",
            1
        )

        return psycopg2.connect(database_url)

    raise RuntimeError(
        "Database configuration not found"
    )