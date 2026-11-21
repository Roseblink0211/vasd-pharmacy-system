from database import get_connection

def section(title):
    print()
    print("=" * 120)
    print(title)
    print("=" * 120)

def print_rows(cur, sql, params=None):
    cur.execute(sql, params or ())
    cols = [d.name for d in cur.description]
    print(" | ".join(cols))
    rows = cur.fetchall()

    if not rows:
        print("(không có dữ liệu)")
        return []

    for row in rows:
        print(" | ".join(
            "" if v is None else str(v)
            for v in row
        ))
    return rows

def main():
    conn = get_connection()

    try:
        with conn.cursor() as cur:

            section("QUY TẮC NGHIỆP VỤ AUDIT")
            print("SALES_ORDER: UNPAID -> ACTIVE")
            print("WAREHOUSE_TRANSFER: DRAFT / RETURNED / PENDING -> ACTIVE")
            print("SUPPLIER_RETURN: PENDING -> ACTIVE")
            print("PAID / APPROVED / COMPLETED -> không được còn ACTIVE")
            print("REJECTED / CANCELLED -> không được còn ACTIVE")

            # ====================================================
            # 1. ACTIVE RESERVATION PHẢI THUỘC CHỨNG TỪ ĐANG MỞ
            # ====================================================
            section("1. ACTIVE RESERVATIONS + TRẠNG THÁI CHỨNG TỪ")

            print_rows(
                cur,
                """
                SELECT
                    sr.id,
                    sr.reference_type,
                    sr.reference_id,
                    sr.reference_item_id,
                    sr.warehouse_id,
                    sr.batch_id,
                    sr.quantity,
                    sr.status AS reservation_status,

                    CASE
                        WHEN sr.reference_type = 'SALES_ORDER'
                            THEN so.sale_code
                        WHEN sr.reference_type = 'WAREHOUSE_TRANSFER'
                            THEN wt.transfer_code
                        WHEN sr.reference_type = 'SUPPLIER_RETURN'
                            THEN spr.return_code
                        ELSE NULL
                    END AS reference_code,

                    CASE
                        WHEN sr.reference_type = 'SALES_ORDER'
                            THEN so.status
                        WHEN sr.reference_type = 'WAREHOUSE_TRANSFER'
                            THEN wt.status
                        WHEN sr.reference_type = 'SUPPLIER_RETURN'
                            THEN spr.status
                        ELSE NULL
                    END AS reference_status

                FROM public.stock_reservations sr

                LEFT JOIN public.sales_orders so
                    ON sr.reference_type = 'SALES_ORDER'
                   AND so.id = sr.reference_id

                LEFT JOIN public.warehouse_transfers wt
                    ON sr.reference_type = 'WAREHOUSE_TRANSFER'
                   AND wt.id = sr.reference_id

                LEFT JOIN public.supplier_returns spr
                    ON sr.reference_type = 'SUPPLIER_RETURN'
                   AND spr.id = sr.reference_id

                WHERE sr.status = 'ACTIVE'

                ORDER BY
                    sr.reference_type,
                    sr.reference_id,
                    sr.id;
                """
            )

            # ====================================================
            # 2. ACTIVE SAI NGHIỆP VỤ
            # ====================================================
            section("2. ACTIVE RESERVATIONS SAI NGHIỆP VỤ")

            bad_active = print_rows(
                cur,
                """
                SELECT
                    sr.id,
                    sr.reference_type,
                    sr.reference_id,
                    sr.reference_item_id,
                    sr.quantity,

                    CASE
                        WHEN sr.reference_type = 'SALES_ORDER'
                            THEN so.status
                        WHEN sr.reference_type = 'WAREHOUSE_TRANSFER'
                            THEN wt.status
                        WHEN sr.reference_type = 'SUPPLIER_RETURN'
                            THEN spr.status
                        ELSE NULL
                    END AS reference_status

                FROM public.stock_reservations sr

                LEFT JOIN public.sales_orders so
                    ON sr.reference_type = 'SALES_ORDER'
                   AND so.id = sr.reference_id

                LEFT JOIN public.warehouse_transfers wt
                    ON sr.reference_type = 'WAREHOUSE_TRANSFER'
                   AND wt.id = sr.reference_id

                LEFT JOIN public.supplier_returns spr
                    ON sr.reference_type = 'SUPPLIER_RETURN'
                   AND spr.id = sr.reference_id

                WHERE sr.status = 'ACTIVE'
                  AND NOT (
                        (
                            sr.reference_type = 'SALES_ORDER'
                            AND so.status = 'UNPAID'
                        )
                        OR
                        (
                            sr.reference_type = 'WAREHOUSE_TRANSFER'
                            AND wt.status IN ('DRAFT', 'RETURNED', 'PENDING')
                        )
                        OR
                        (
                            sr.reference_type = 'SUPPLIER_RETURN'
                            AND spr.status = 'PENDING'
                        )
                  )

                ORDER BY sr.id;
                """
            )

            # ====================================================
            # 3. TỒN BỊ OVER-RESERVED
            # ====================================================
            section("3. INVENTORY OVER-RESERVED")

            over_reserved = print_rows(
                cur,
                """
                SELECT
                    v.inventory_id,
                    v.warehouse_id,
                    v.warehouse_name,
                    v.batch_id,
                    v.medicine_id,
                    v.medicine_name,
                    v.lot_number,
                    v.physical_quantity,
                    v.reserved_quantity,
                    v.available_quantity,
                    v.is_over_reserved
                FROM public.v_inventory_availability v
                WHERE v.is_over_reserved = TRUE
                   OR v.available_quantity < 0
                ORDER BY
                    v.warehouse_id,
                    v.medicine_id,
                    v.batch_id;
                """
            )

            # ====================================================
            # 4. CHỨNG TỪ ĐANG MỞ NHƯNG KHÔNG ĐỦ RESERVATION
            # ====================================================
            section("4. CHỨNG TỪ ĐANG MỞ KHÔNG ĐỦ RESERVATION")

            pending_missing = print_rows(
                cur,
                """
                WITH transfer_expected AS (
                    SELECT
                        'WAREHOUSE_TRANSFER'::text AS reference_type,
                        wt.id AS reference_id,
                        wti.id AS reference_item_id,
                        wt.transfer_code AS reference_code,
                        wt.status,
                        wti.quantity AS expected_quantity,
                        COALESCE(SUM(sr.quantity), 0) AS active_reserved
                    FROM public.warehouse_transfers wt
                    JOIN public.warehouse_transfer_items wti
                      ON wti.transfer_id = wt.id
                    LEFT JOIN public.stock_reservations sr
                      ON sr.reference_type = 'WAREHOUSE_TRANSFER'
                     AND sr.reference_id = wt.id
                     AND sr.reference_item_id = wti.id
                     AND sr.status = 'ACTIVE'
                    WHERE wt.status IN ('DRAFT', 'RETURNED', 'PENDING')
                    GROUP BY
                        wt.id,
                        wti.id,
                        wt.transfer_code,
                        wt.status,
                        wti.quantity
                ),

                return_expected AS (
                    SELECT
                        'SUPPLIER_RETURN'::text AS reference_type,
                        spr.id AS reference_id,
                        sri.id AS reference_item_id,
                        spr.return_code AS reference_code,
                        spr.status,
                        sri.quantity AS expected_quantity,
                        COALESCE(SUM(sr.quantity), 0) AS active_reserved
                    FROM public.supplier_returns spr
                    JOIN public.supplier_return_items sri
                      ON sri.return_id = spr.id
                    LEFT JOIN public.stock_reservations sr
                      ON sr.reference_type = 'SUPPLIER_RETURN'
                     AND sr.reference_id = spr.id
                     AND sr.reference_item_id = sri.id
                     AND sr.status = 'ACTIVE'
                    WHERE spr.status = 'PENDING'
                    GROUP BY
                        spr.id,
                        sri.id,
                        spr.return_code,
                        spr.status,
                        sri.quantity
                ),

                all_open AS (
                    SELECT * FROM transfer_expected
                    UNION ALL
                    SELECT * FROM return_expected
                )

                SELECT *
                FROM all_open
                WHERE expected_quantity <> active_reserved
                ORDER BY
                    reference_type,
                    reference_id,
                    reference_item_id;
                """
            )

            # ====================================================
            # 5. APPROVED/PAID NHƯNG CÒN ACTIVE
            # ====================================================
            section("5. ĐÃ HOÀN TẤT NHƯNG CÒN ACTIVE RESERVATION")

            finalized_active = print_rows(
                cur,
                """
                SELECT
                    sr.id,
                    sr.reference_type,
                    sr.reference_id,
                    sr.reference_item_id,
                    sr.quantity,

                    CASE
                        WHEN sr.reference_type = 'SALES_ORDER'
                            THEN so.status
                        WHEN sr.reference_type = 'WAREHOUSE_TRANSFER'
                            THEN wt.status
                        WHEN sr.reference_type = 'SUPPLIER_RETURN'
                            THEN spr.status
                        ELSE NULL
                    END AS reference_status

                FROM public.stock_reservations sr

                LEFT JOIN public.sales_orders so
                    ON sr.reference_type = 'SALES_ORDER'
                   AND so.id = sr.reference_id

                LEFT JOIN public.warehouse_transfers wt
                    ON sr.reference_type = 'WAREHOUSE_TRANSFER'
                   AND wt.id = sr.reference_id

                LEFT JOIN public.supplier_returns spr
                    ON sr.reference_type = 'SUPPLIER_RETURN'
                   AND spr.id = sr.reference_id

                WHERE sr.status = 'ACTIVE'
                  AND (
                        so.status = 'PAID'
                     OR wt.status IN ('APPROVED', 'COMPLETED', 'REJECTED', 'CANCELLED')
                     OR spr.status IN ('APPROVED', 'REJECTED', 'CANCELLED')
                  )

                ORDER BY sr.id;
                """
            )

            # ====================================================
            # 6. SUMMARY THEO STATUS
            # ====================================================
            section("6. RESERVATION SUMMARY")

            print_rows(
                cur,
                """
                SELECT
                    reference_type,
                    status,
                    COUNT(*) AS reservation_count,
                    SUM(quantity) AS total_quantity
                FROM public.stock_reservations
                GROUP BY reference_type, status
                ORDER BY reference_type, status;
                """
            )

            # ====================================================
            # 7. TỔNG QUAN TỒN KHẢ DỤNG
            # ====================================================
            section("7. INVENTORY AVAILABILITY SUMMARY")

            print_rows(
                cur,
                """
                SELECT
                    warehouse_id,
                    warehouse_name,
                    SUM(physical_quantity) AS physical_quantity,
                    SUM(reserved_quantity) AS reserved_quantity,
                    SUM(available_quantity) AS available_quantity
                FROM public.v_inventory_availability
                GROUP BY
                    warehouse_id,
                    warehouse_name
                ORDER BY warehouse_id;
                """
            )

            # ====================================================
            # 8. KẾT LUẬN
            # ====================================================
            section("8. AUDIT RESULT")

            problems = []

            if bad_active:
                problems.append(
                    f"{len(bad_active)} ACTIVE reservation sai trạng thái chứng từ"
                )

            if over_reserved:
                problems.append(
                    f"{len(over_reserved)} dòng tồn bị over-reserved"
                )

            if pending_missing:
                problems.append(
                    f"{len(pending_missing)} item chứng từ đang mở thiếu/sai reservation"
                )

            if finalized_active:
                problems.append(
                    f"{len(finalized_active)} reservation ACTIVE ở chứng từ đã kết thúc"
                )

            if problems:
                print("FAIL")
                for problem in problems:
                    print("-", problem)
            else:
                print("PASS")
                print(
                    "Reservation và tồn khả dụng đang nhất quán theo luồng nghiệp vụ."
                )

    finally:
        conn.close()

if __name__ == "__main__":
    main()
