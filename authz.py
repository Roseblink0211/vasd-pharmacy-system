from typing import Optional

from fastapi import HTTPException

from database import get_connection


def _call_authorize(
    token: str,
    permission_code: str,
    warehouse_id: Optional[int] = None,
):
    conn = None
    cursor = None

    try:
        conn = get_connection()
        cursor = conn.cursor()

        cursor.execute(
            """
            SELECT public.fn_authorize_token(
                %s::text,
                %s::text,
                %s::bigint
            )
            """,
            (
                token,
                permission_code,
                warehouse_id,
            ),
        )

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
            or "Authorization database error"
        )

        print(
            "Authorization database error:",
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


def require_access(
    auth: dict,
    permission_code: str,
    warehouse_id: Optional[int] = None,
):
    token = auth.get("token")

    if not token:
        raise HTTPException(
            status_code=401,
            detail="Bearer token is required",
        )

    result = _call_authorize(
        token,
        permission_code,
        warehouse_id,
    )

    if not result:
        raise HTTPException(
            status_code=500,
            detail="Không nhận được kết quả kiểm tra quyền",
        )

    if result.get("success") is not True:
        reason = result.get(
            "reason",
            "PERMISSION_DENIED",
        )

        status_code = (
            401
            if reason in {
                "INVALID_TOKEN",
                "TOKEN_EXPIRED",
            }
            else 403
        )

        raise HTTPException(
            status_code=status_code,
            detail=result.get(
                "message",
                "Bạn không có quyền thực hiện thao tác này",
            ),
        )

    return result
