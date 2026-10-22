from pathlib import Path
from database import get_connection


def main():
    sql_path = Path(__file__).resolve().parent / 'database.sql'
    sql = sql_path.read_text(encoding='utf-8')
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(sql)
        conn.commit()
        print('Database schema and functions initialized successfully.')
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == '__main__':
    main()
