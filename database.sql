--
-- PostgreSQL database dump
--

\restrict 80vUDfHb4Gf6aefXpOMtw6DfZqWLU5U6HgcW7nC8Qk17enIVbyZpQjOPdiFNbPs

-- Dumped from database version 18.1
-- Dumped by pg_dump version 18.1

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: fn_add_purchase_receipt_item(text, bigint, bigint, text, date, numeric, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_add_purchase_receipt_item(p_token text, p_receipt_id bigint, p_medicine_id bigint, p_lot_number text, p_expiry_date date, p_quantity numeric, p_unit_price numeric) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$

DECLARE
    v_auth JSONB;
    v_receipt_supplier_id BIGINT;
    v_medicine_supplier_id BIGINT;

BEGIN

    -- =====================================================
    -- 1. TOKEN
    -- =====================================================

    v_auth :=
        public.fn_validate_token(
            p_token
        );

    IF (v_auth ->> 'success')::BOOLEAN IS NOT TRUE THEN
        RETURN v_auth;
    END IF;


    -- =====================================================
    -- 2. LOCK PHIẾU DRAFT
    -- =====================================================
    -- Add item và Submit phải cùng lock dòng phiếu này.
    -- Nếu submit đang chạy thì add item phải chờ và ngược lại.

    SELECT
        supplier_id

    INTO
        v_receipt_supplier_id

    FROM purchase_receipts

    WHERE id = p_receipt_id
      AND status = 'DRAFT'

    FOR UPDATE;


    IF NOT FOUND THEN

        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'Phiếu không tồn tại hoặc không còn ở trạng thái nháp'
        );

    END IF;


    -- =====================================================
    -- 3. THUỐC
    -- =====================================================

    SELECT
        supplier_id

    INTO
        v_medicine_supplier_id

    FROM medicines

    WHERE id = p_medicine_id
      AND is_active = TRUE;


    IF NOT FOUND THEN

        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'Thuốc không tồn tại hoặc đã ngừng sử dụng'
        );

    END IF;


    -- =====================================================
    -- 4. ĐÚNG NHÀ CUNG CẤP
    -- =====================================================

    IF v_medicine_supplier_id
       IS DISTINCT FROM
       v_receipt_supplier_id THEN

        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'Thuốc không thuộc nhà cung cấp của phiếu nhập'
        );

    END IF;


    -- =====================================================
    -- 5. SỐ LÔ
    -- =====================================================

    IF p_lot_number IS NULL
       OR TRIM(p_lot_number) = '' THEN

        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'Số lô không được để trống'
        );

    END IF;


    -- =====================================================
    -- 6. HẠN SỬ DỤNG
    -- =====================================================

    IF p_expiry_date IS NULL THEN

        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'Hạn sử dụng không được để trống'
        );

    END IF;


    IF p_expiry_date <= CURRENT_DATE THEN

        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'Hạn sử dụng phải lớn hơn ngày hiện tại'
        );

    END IF;


    -- =====================================================
    -- 7. SỐ LƯỢNG
    -- =====================================================

    IF p_quantity IS NULL
       OR p_quantity <= 0 THEN

        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'Số lượng phải lớn hơn 0'
        );

    END IF;


    -- =====================================================
    -- 8. ĐƠN GIÁ
    -- =====================================================

    IF p_unit_price IS NULL
       OR p_unit_price < 0 THEN

        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'Đơn giá không hợp lệ'
        );

    END IF;


    -- =====================================================
    -- 9. INSERT ITEM
    -- =====================================================

    INSERT INTO purchase_receipt_items (
        receipt_id,
        medicine_id,
        lot_number,
        expiry_date,
        quantity,
        unit_price
    )
    VALUES (
        p_receipt_id,
        p_medicine_id,
        TRIM(p_lot_number),
        p_expiry_date,
        p_quantity,
        p_unit_price
    );


    RETURN jsonb_build_object(
        'success', TRUE,
        'message',
        'Đã thêm thuốc vào phiếu nhập'
    );


EXCEPTION

    WHEN unique_violation THEN

        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'Thuốc hoặc lô này đã có trong phiếu nhập'
        );

END;

$$;


--
-- Name: fn_add_supplier_return_item(text, bigint, bigint, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_add_supplier_return_item(p_token text, p_return_id bigint, p_batch_id bigint, p_quantity numeric) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$

DECLARE
    v_auth JSONB;

    v_supplier_id BIGINT;

    v_warehouse_id BIGINT;

    v_medicine_supplier_id BIGINT;

    v_inventory_quantity NUMERIC;

BEGIN

    -- =====================================================
    -- 1. TOKEN
    -- =====================================================

    v_auth :=
        public.fn_validate_token(
            p_token
        );


    IF (
        v_auth ->> 'success'
    )::BOOLEAN IS NOT TRUE THEN

        RETURN v_auth;

    END IF;


    -- =====================================================
    -- 2. LOCK PHIẾU DRAFT
    -- =====================================================
    -- Ngăn submit chạy đồng thời
    -- trong lúc đang thêm item.

    SELECT
        supplier_id,
        warehouse_id

    INTO
        v_supplier_id,
        v_warehouse_id

    FROM supplier_returns

    WHERE id = p_return_id
      AND status = 'DRAFT'

    FOR UPDATE;


    IF NOT FOUND THEN

        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'Phiếu trả không tồn tại hoặc không còn ở trạng thái nháp'
        );

    END IF;


    -- =====================================================
    -- 3. SỐ LƯỢNG
    -- =====================================================

    IF p_quantity IS NULL
       OR p_quantity <= 0 THEN

        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'Số lượng trả phải lớn hơn 0'
        );

    END IF;


    -- =====================================================
    -- 4. KIỂM TRA BATCH + NHÀ CUNG CẤP
    -- =====================================================

    SELECT
        m.supplier_id

    INTO
        v_medicine_supplier_id

    FROM batches b

    JOIN medicines m
        ON m.id = b.medicine_id

    WHERE b.id = p_batch_id;


    IF NOT FOUND THEN

        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'Không tìm thấy lô thuốc'
        );

    END IF;


    IF v_medicine_supplier_id
       IS DISTINCT FROM
       v_supplier_id THEN

        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'Thuốc trong lô này không thuộc nhà cung cấp của phiếu trả'
        );

    END IF;


    -- =====================================================
    -- 5. KIỂM TRA TỒN HIỆN TẠI
    -- =====================================================

    SELECT
        quantity

    INTO
        v_inventory_quantity

    FROM inventory

    WHERE warehouse_id =
            v_warehouse_id

      AND batch_id =
            p_batch_id;


    IF NOT FOUND THEN

        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'Lô thuốc này không tồn tại trong kho đã chọn'
        );

    END IF;


    IF v_inventory_quantity <
       p_quantity THEN

        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'Số lượng trả vượt quá tồn kho',
            'current_quantity',
            v_inventory_quantity,
            'requested_quantity',
            p_quantity
        );

    END IF;


    -- =====================================================
    -- 6. INSERT ITEM
    -- =====================================================

    INSERT INTO supplier_return_items (
        return_id,
        batch_id,
        quantity
    )
    VALUES (
        p_return_id,
        p_batch_id,
        p_quantity
    );


    RETURN jsonb_build_object(
        'success', TRUE,
        'message',
        'Đã thêm thuốc vào phiếu trả'
    );


EXCEPTION

    WHEN unique_violation THEN

        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'Lô thuốc này đã có trong phiếu trả'
        );

END;

$$;


--
-- Name: fn_approve_purchase_receipt(text, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_approve_purchase_receipt(p_token text, p_receipt_id bigint) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$

DECLARE
    v_auth JSONB;

    v_user_id BIGINT;

    v_main_warehouse_id BIGINT;

    v_item RECORD;

    v_batch_id BIGINT;

BEGIN

    -- ==========================================
    -- 1. TOKEN
    -- ==========================================

    v_auth :=
        public.fn_validate_token(
            p_token
        );


    IF (
        v_auth ->> 'success'
    )::BOOLEAN IS NOT TRUE THEN

        RETURN v_auth;

    END IF;


    v_user_id :=
        (
            v_auth ->> 'user_id'
        )::BIGINT;


    -- ==========================================
    -- 2. LOCK PHIẾU
    -- ==========================================
    -- Rất quan trọng:
    -- ngăn 2 request cùng approve.

    PERFORM 1

    FROM purchase_receipts

    WHERE id = p_receipt_id
      AND status = 'PENDING'

    FOR UPDATE;


    IF NOT FOUND THEN

        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'Phiếu không tồn tại hoặc không ở trạng thái chờ duyệt'
        );

    END IF;


    -- ==========================================
    -- 3. KHO CHÍNH
    -- ==========================================

    SELECT id

    INTO v_main_warehouse_id

    FROM warehouses

    WHERE warehouse_type = 'MAIN'
      AND is_active = TRUE

    LIMIT 1;


    IF v_main_warehouse_id IS NULL THEN

        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'Không tìm thấy Kho chính'
        );

    END IF;


    -- ==========================================
    -- 4. PHIẾU PHẢI CÓ ITEM
    -- ==========================================

    IF NOT EXISTS (

        SELECT 1

        FROM purchase_receipt_items

        WHERE receipt_id =
            p_receipt_id

    ) THEN

        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'Phiếu nhập chưa có thuốc'
        );

    END IF;


    -- ==========================================
    -- 5. XỬ LÝ TỪNG ITEM
    -- ==========================================

    FOR v_item IN

        SELECT *

        FROM purchase_receipt_items

        WHERE receipt_id =
            p_receipt_id

        ORDER BY id

    LOOP

        -- ======================================
        -- 5.1 BATCH
        -- ======================================

        INSERT INTO batches (
            medicine_id,
            lot_number,
            expiry_date
        )
        VALUES (
            v_item.medicine_id,
            v_item.lot_number,
            v_item.expiry_date
        )

        ON CONFLICT (
            medicine_id,
            lot_number,
            expiry_date
        )

        DO UPDATE

        SET lot_number =
            EXCLUDED.lot_number

        RETURNING id
        INTO v_batch_id;


        -- ======================================
        -- 5.2 INVENTORY
        -- ======================================

        INSERT INTO inventory (
            warehouse_id,
            batch_id,
            quantity
        )
        VALUES (
            v_main_warehouse_id,
            v_batch_id,
            v_item.quantity
        )

        ON CONFLICT (
            warehouse_id,
            batch_id
        )

        DO UPDATE

        SET
            quantity =
                inventory.quantity
                + EXCLUDED.quantity,

            updated_at =
                NOW();


        -- ======================================
        -- 5.3 STOCK MOVEMENT
        -- ======================================

        INSERT INTO stock_movements (
            warehouse_id,
            batch_id,
            movement_type,
            quantity,
            reference_type,
            reference_id,
            created_by,
            note
        )
        VALUES (
            v_main_warehouse_id,
            v_batch_id,
            'IMPORT',
            v_item.quantity,
            'PURCHASE_RECEIPT',
            p_receipt_id,
            v_user_id,
            'Nhập thuốc từ nhà cung cấp'
        );

    END LOOP;


    -- ==========================================
    -- 6. APPROVE
    -- ==========================================

    UPDATE purchase_receipts

    SET
        status =
            'APPROVED',

        approved_by =
            v_user_id,

        approved_at =
            NOW()

    WHERE id =
        p_receipt_id

      AND status =
        'PENDING';


    IF NOT FOUND THEN

        RAISE EXCEPTION
            'Trạng thái phiếu đã thay đổi trong quá trình duyệt';

    END IF;


    -- ==========================================
    -- 7. RESPONSE
    -- ==========================================

    RETURN jsonb_build_object(
        'success', TRUE,
        'message',
        'Duyệt phiếu thành công, thuốc đã được nhập vào Kho chính',
        'receipt_id',
        p_receipt_id,
        'status',
        'APPROVED'
    );


END;

$$;


--
-- Name: fn_approve_supplier_return(text, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_approve_supplier_return(p_token text, p_return_id bigint) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$

DECLARE
    v_auth JSONB;

    v_user_id BIGINT;

    v_warehouse_id BIGINT;

    v_supplier_id BIGINT;

    v_item RECORD;

    v_current_quantity NUMERIC;

    v_item_supplier_id BIGINT;

BEGIN

    -- =====================================================
    -- 1. TOKEN
    -- =====================================================

    v_auth :=
        public.fn_validate_token(
            p_token
        );


    IF (
        v_auth ->> 'success'
    )::BOOLEAN IS NOT TRUE THEN

        RETURN v_auth;

    END IF;


    v_user_id :=
        (
            v_auth ->> 'user_id'
        )::BIGINT;


    -- =====================================================
    -- 2. LOCK PHIẾU TRẢ
    -- =====================================================
    -- Quan trọng:
    -- ngăn approve/reject cùng lúc.

    SELECT
        warehouse_id,
        supplier_id

    INTO
        v_warehouse_id,
        v_supplier_id

    FROM supplier_returns

    WHERE id = p_return_id
      AND status = 'PENDING'

    FOR UPDATE;


    IF NOT FOUND THEN

        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'Phiếu trả không tồn tại hoặc không ở trạng thái chờ duyệt'
        );

    END IF;


    -- =====================================================
    -- 3. PHIẾU PHẢI CÓ ITEM
    -- =====================================================

    IF NOT EXISTS (

        SELECT 1

        FROM supplier_return_items

        WHERE return_id =
            p_return_id

    ) THEN

        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'Phiếu trả chưa có thuốc'
        );

    END IF;


    -- =====================================================
    -- 4. VALIDATE + LOCK TẤT CẢ INVENTORY
    -- =====================================================
    -- Chưa trừ tồn tại vòng này.

    FOR v_item IN

        SELECT
            sri.batch_id,
            sri.quantity

        FROM supplier_return_items sri

        WHERE sri.return_id =
            p_return_id

        ORDER BY sri.batch_id

    LOOP

        -- ================================================
        -- 4.1 KIỂM TRA LÔ VẪN THUỘC ĐÚNG NCC
        -- ================================================

        SELECT
            m.supplier_id

        INTO
            v_item_supplier_id

        FROM batches b

        JOIN medicines m
            ON m.id = b.medicine_id

        WHERE b.id =
            v_item.batch_id;


        IF NOT FOUND THEN

            RETURN jsonb_build_object(
                'success', FALSE,
                'message',
                'Có lô thuốc không còn tồn tại',
                'batch_id',
                v_item.batch_id
            );

        END IF;


        IF v_item_supplier_id
           IS DISTINCT FROM
           v_supplier_id THEN

            RETURN jsonb_build_object(
                'success', FALSE,
                'message',
                'Có lô thuốc không còn thuộc nhà cung cấp của phiếu trả',
                'batch_id',
                v_item.batch_id
            );

        END IF;


        -- ================================================
        -- 4.2 LOCK INVENTORY
        -- ================================================

        SELECT
            quantity

        INTO
            v_current_quantity

        FROM inventory

        WHERE warehouse_id =
                v_warehouse_id

          AND batch_id =
                v_item.batch_id

        FOR UPDATE;


        IF NOT FOUND THEN

            RETURN jsonb_build_object(
                'success', FALSE,
                'message',
                'Có lô thuốc không còn tồn tại trong kho',
                'batch_id',
                v_item.batch_id
            );

        END IF;


        -- ================================================
        -- 4.3 KIỂM TRA ĐỦ TỒN
        -- ================================================

        IF v_current_quantity <
           v_item.quantity THEN

            RETURN jsonb_build_object(
                'success', FALSE,
                'message',
                'Không đủ tồn kho để duyệt phiếu trả',
                'batch_id',
                v_item.batch_id,
                'current_quantity',
                v_current_quantity,
                'requested_quantity',
                v_item.quantity
            );

        END IF;

    END LOOP;


    -- =====================================================
    -- 5. TẤT CẢ HỢP LỆ
    -- BẮT ĐẦU TRỪ TỒN
    -- =====================================================

    FOR v_item IN

        SELECT
            sri.batch_id,
            sri.quantity

        FROM supplier_return_items sri

        WHERE sri.return_id =
            p_return_id

        ORDER BY sri.batch_id

    LOOP

        UPDATE inventory

        SET
            quantity =
                quantity -
                v_item.quantity,

            updated_at =
                NOW()

        WHERE warehouse_id =
                v_warehouse_id

          AND batch_id =
                v_item.batch_id;


        -- ================================================
        -- STOCK MOVEMENT
        -- ================================================

        INSERT INTO stock_movements (
            warehouse_id,
            batch_id,
            movement_type,
            quantity,
            reference_type,
            reference_id,
            created_by,
            note
        )
        VALUES (
            v_warehouse_id,
            v_item.batch_id,
            'RETURN_SUPPLIER',
            v_item.quantity,
            'SUPPLIER_RETURN',
            p_return_id,
            v_user_id,
            'Trả thuốc cho nhà cung cấp'
        );

    END LOOP;


    -- =====================================================
    -- 6. CHUYỂN PENDING → APPROVED
    -- =====================================================

    UPDATE supplier_returns

    SET
        status =
            'APPROVED',

        approved_by =
            v_user_id,

        approved_at =
            NOW()

    WHERE id =
        p_return_id

      AND status =
        'PENDING';


    IF NOT FOUND THEN

        RAISE EXCEPTION
            'Trạng thái phiếu trả đã thay đổi trong quá trình duyệt';

    END IF;


    -- =====================================================
    -- 7. RESPONSE
    -- =====================================================

    RETURN jsonb_build_object(
        'success', TRUE,
        'message',
        'Duyệt phiếu trả thành công, tồn kho đã được cập nhật',
        'return_id',
        p_return_id,
        'status',
        'APPROVED'
    );


END;

$$;


--
-- Name: fn_change_password(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_change_password(p_token text, p_old_password text, p_new_password text) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$

DECLARE
    v_token_result JSONB;

    v_user_id BIGINT;

    v_password_hash TEXT;

    v_current_token_hash TEXT;

BEGIN

    -- ==========================================
    -- 1. TOKEN
    -- ==========================================

    v_token_result :=
        public.fn_validate_token(
            p_token
        );


    IF (
        v_token_result ->> 'success'
    )::BOOLEAN IS NOT TRUE THEN

        RETURN v_token_result;

    END IF;


    v_user_id :=
        (
            v_token_result ->> 'user_id'
        )::BIGINT;


    -- ==========================================
    -- 2. OLD PASSWORD BẮT BUỘC
    -- ==========================================

    IF p_old_password IS NULL
       OR p_old_password = '' THEN

        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'Old password is required'
        );

    END IF;


    -- ==========================================
    -- 3. NEW PASSWORD BẮT BUỘC
    -- ==========================================

    IF p_new_password IS NULL
       OR p_new_password = '' THEN

        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'New password is required'
        );

    END IF;


    -- ==========================================
    -- 4. GET CURRENT HASH
    -- ==========================================

    SELECT password_hash

    INTO v_password_hash

    FROM users

    WHERE id = v_user_id
      AND is_active = TRUE;


    IF NOT FOUND THEN

        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'User not found'
        );

    END IF;


    -- ==========================================
    -- 5. CHECK OLD PASSWORD
    -- ==========================================

    IF crypt(
        p_old_password,
        v_password_hash
    ) IS DISTINCT FROM
       v_password_hash THEN

        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'Old password is incorrect'
        );

    END IF;


    -- ==========================================
    -- 6. VALIDATE NEW PASSWORD
    -- ==========================================

    IF NOT public.fn_validate_password(
        p_new_password
    ) THEN

        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'New password must be 8-72 bytes, contain a letter, number and special character, and contain no whitespace'
        );

    END IF;


    -- ==========================================
    -- 7. NEW != OLD
    -- ==========================================

    IF crypt(
        p_new_password,
        v_password_hash
    ) = v_password_hash THEN

        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'New password must be different from old password'
        );

    END IF;


    -- ==========================================
    -- 8. UPDATE PASSWORD
    -- ==========================================

    UPDATE users

    SET
        password_hash =
            crypt(
                p_new_password,
                gen_salt('bf')
            ),

        updated_at =
            NOW()

    WHERE id =
        v_user_id;


    -- ==========================================
    -- 9. REVOKE ACCESS TOKENS KHÁC
    -- ==========================================

    v_current_token_hash :=
        encode(
            digest(
                p_token,
                'sha256'
            ),
            'hex'
        );


    UPDATE auth_tokens

    SET is_revoked = TRUE

    WHERE user_id =
            v_user_id

      AND token_type =
            'access'

      AND is_revoked =
            FALSE

      AND token_hash <>
            v_current_token_hash;


    RETURN jsonb_build_object(
        'success', TRUE,
        'message',
        'Password changed successfully'
    );

END;

$$;


--
-- Name: fn_create_medicine(text, text, text, text, text, text, text, text, text, text, text, text, bigint, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_create_medicine(p_token text, p_name text, p_active_ingredient text, p_strength text, p_dosage_form text, p_unit text, p_route_of_administration text, p_usage_instructions text, p_packaging text, p_manufacturer text, p_country_of_origin text, p_registration_number text, p_supplier_id bigint, p_note text) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$

DECLARE
    v_auth JSONB;
    v_user_id BIGINT;
    v_medicine_id BIGINT;
    v_registration_number TEXT;

BEGIN

    -- 1. TOKEN
    v_auth := public.fn_validate_token(p_token);

    IF (v_auth ->> 'success')::BOOLEAN IS NOT TRUE THEN
        RETURN v_auth;
    END IF;

    v_user_id := (v_auth ->> 'user_id')::BIGINT;


    -- 2. TÊN THUỐC
    IF p_name IS NULL
       OR TRIM(p_name) = '' THEN

        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'Tên thuốc không được để trống'
        );

    END IF;


    -- 3. HOẠT CHẤT
    IF p_active_ingredient IS NULL
       OR TRIM(p_active_ingredient) = '' THEN

        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'Hoạt chất không được để trống'
        );

    END IF;


    -- 4. NCC PHẢI TỒN TẠI VÀ ACTIVE
    IF NOT EXISTS (
        SELECT 1
        FROM suppliers
        WHERE id = p_supplier_id
          AND is_active = TRUE
    ) THEN

        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'Nhà cung cấp không tồn tại hoặc đã ngừng hoạt động'
        );

    END IF;


    -- 5. SỐ ĐĂNG KÝ
    v_registration_number :=
        NULLIF(
            TRIM(p_registration_number),
            ''
        );


    IF v_registration_number IS NOT NULL
       AND EXISTS (
            SELECT 1
            FROM medicines
            WHERE registration_number =
                  v_registration_number
       ) THEN

        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'Số đăng ký thuốc đã tồn tại'
        );

    END IF;


    -- 6. INSERT
    INSERT INTO medicines (
        name,
        active_ingredient,
        strength,
        dosage_form,
        unit,
        route_of_administration,
        usage_instructions,
        packaging,
        manufacturer,
        country_of_origin,
        registration_number,
        supplier_id,
        note,
        created_by
    )
    VALUES (
        TRIM(p_name),

        TRIM(p_active_ingredient),

        NULLIF(TRIM(p_strength), ''),

        NULLIF(TRIM(p_dosage_form), ''),

        NULLIF(TRIM(p_unit), ''),

        NULLIF(
            TRIM(p_route_of_administration),
            ''
        ),

        NULLIF(
            TRIM(p_usage_instructions),
            ''
        ),

        NULLIF(TRIM(p_packaging), ''),

        NULLIF(TRIM(p_manufacturer), ''),

        NULLIF(TRIM(p_country_of_origin), ''),

        v_registration_number,

        p_supplier_id,

        NULLIF(TRIM(p_note), ''),

        v_user_id
    )
    RETURNING id
    INTO v_medicine_id;


    RETURN jsonb_build_object(
        'success', TRUE,
        'message', 'Thêm thuốc thành công',
        'medicine_id', v_medicine_id
    );


EXCEPTION

    WHEN unique_violation THEN

        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'Mã thuốc hoặc số đăng ký thuốc đã tồn tại'
        );

END;

$$;


--
-- Name: fn_create_purchase_receipt(text, bigint, text, text, date, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_create_purchase_receipt(p_token text, p_supplier_id bigint, p_invoice_number text, p_invoice_serial text, p_invoice_date date, p_note text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_auth JSONB;
    v_user_id BIGINT;
    v_receipt_id BIGINT;
BEGIN

    v_auth := public.fn_validate_token(p_token);

    IF (v_auth ->> 'success')::BOOLEAN IS NOT TRUE THEN
        RETURN v_auth;
    END IF;

    v_user_id :=
        (v_auth ->> 'user_id')::BIGINT;

    IF NOT EXISTS (
        SELECT 1
        FROM suppliers
        WHERE id = p_supplier_id
          AND is_active = TRUE
    ) THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'Nhà cung cấp không tồn tại hoặc đã ngừng hoạt động'
        );
    END IF;

    IF p_invoice_number IS NULL
       OR TRIM(p_invoice_number) = '' THEN

        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'Số hóa đơn không được để trống'
        );
    END IF;

    INSERT INTO purchase_receipts (
        supplier_id,
        invoice_number,
        invoice_serial,
        invoice_date,
        note,
        created_by
    )
    VALUES (
        p_supplier_id,
        TRIM(p_invoice_number),
        NULLIF(TRIM(p_invoice_serial), ''),
        p_invoice_date,
        NULLIF(TRIM(p_note), ''),
        v_user_id
    )
    RETURNING id
    INTO v_receipt_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message',
        'Tạo phiếu nhập thành công',
        'receipt_id',
        v_receipt_id
    );

END;
$$;


--
-- Name: fn_create_supplier(text, text, text, text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_create_supplier(p_token text, p_name text, p_address text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_email text DEFAULT NULL::text, p_tax_code text DEFAULT NULL::text, p_contact_person text DEFAULT NULL::text, p_note text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql
    AS $_$

DECLARE
    v_auth JSONB;
    v_user_id BIGINT;
    v_supplier_id BIGINT;

    v_email TEXT;
    v_tax_code TEXT;

BEGIN

    -- ==========================================
    -- 1. TOKEN
    -- ==========================================

    v_auth :=
        public.fn_validate_token(
            p_token
        );


    IF (
        v_auth ->> 'success'
    )::BOOLEAN IS NOT TRUE THEN

        RETURN v_auth;

    END IF;


    v_user_id :=
        (
            v_auth ->> 'user_id'
        )::BIGINT;


    -- ==========================================
    -- 2. NAME
    -- ==========================================

    IF p_name IS NULL
       OR TRIM(p_name) = '' THEN

        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'Tên nhà cung cấp không được để trống'
        );

    END IF;


    -- ==========================================
    -- 3. EMAIL
    -- ==========================================

    v_email :=
        NULLIF(
            LOWER(
                TRIM(p_email)
            ),
            ''
        );


    IF v_email IS NOT NULL
       AND v_email !~
           '^[A-Za-z0-9._%+]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
    THEN

        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'Email nhà cung cấp không hợp lệ'
        );

    END IF;


    -- ==========================================
    -- 4. TAX CODE
    -- ==========================================

    v_tax_code :=
        NULLIF(
            TRIM(p_tax_code),
            ''
        );


    IF v_tax_code IS NOT NULL
       AND EXISTS (

            SELECT 1

            FROM suppliers

            WHERE tax_code =
                v_tax_code

       ) THEN

        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'Mã số thuế đã được sử dụng'
        );

    END IF;


    -- ==========================================
    -- 5. INSERT
    -- ==========================================

    INSERT INTO suppliers (
        name,
        address,
        phone,
        email,
        tax_code,
        contact_person,
        note,
        created_by
    )
    VALUES (
        TRIM(p_name),

        NULLIF(
            TRIM(p_address),
            ''
        ),

        NULLIF(
            TRIM(p_phone),
            ''
        ),

        v_email,

        v_tax_code,

        NULLIF(
            TRIM(p_contact_person),
            ''
        ),

        NULLIF(
            TRIM(p_note),
            ''
        ),

        v_user_id
    )

    RETURNING id
    INTO v_supplier_id;


    RETURN jsonb_build_object(
        'success', TRUE,
        'message',
        'Thêm nhà cung cấp thành công',
        'supplier_id',
        v_supplier_id
    );


EXCEPTION

    WHEN unique_violation THEN

        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'Mã nhà cung cấp hoặc mã số thuế đã tồn tại'
        );

END;

$_$;


--
-- Name: fn_create_supplier_return(text, bigint, bigint, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_create_supplier_return(p_token text, p_supplier_id bigint, p_warehouse_id bigint, p_reason text, p_note text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_auth JSONB;
    v_user_id BIGINT;
    v_return_id BIGINT;
BEGIN

    v_auth := public.fn_validate_token(p_token);

    IF (v_auth ->> 'success')::BOOLEAN IS NOT TRUE THEN
        RETURN v_auth;
    END IF;

    v_user_id :=
        (v_auth ->> 'user_id')::BIGINT;


    IF NOT EXISTS (
        SELECT 1
        FROM suppliers
        WHERE id = p_supplier_id
          AND is_active = TRUE
    ) THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'Nhà cung cấp không tồn tại hoặc đã ngừng hoạt động'
        );
    END IF;


    IF NOT EXISTS (
        SELECT 1
        FROM warehouses
        WHERE id = p_warehouse_id
          AND is_active = TRUE
    ) THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'Kho không tồn tại hoặc đã ngừng hoạt động'
        );
    END IF;


    IF p_reason IS NULL
       OR TRIM(p_reason) = '' THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'Lý do trả thuốc không được để trống'
        );
    END IF;


    INSERT INTO supplier_returns (
        supplier_id,
        warehouse_id,
        reason,
        note,
        created_by
    )
    VALUES (
        p_supplier_id,
        p_warehouse_id,
        TRIM(p_reason),
        NULLIF(TRIM(p_note), ''),
        v_user_id
    )
    RETURNING id
    INTO v_return_id;


    RETURN jsonb_build_object(
        'success', TRUE,
        'message', 'Tạo phiếu trả nhà cung cấp thành công',
        'return_id', v_return_id,
        'status', 'DRAFT'
    );

END;
$$;


--
-- Name: fn_create_test_token(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_create_test_token(p_user_id bigint) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_token TEXT;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM users WHERE id = p_user_id AND is_active = TRUE
    ) THEN
        RETURN jsonb_build_object('success', false, 'message', 'User not found');
    END IF;

    UPDATE auth_tokens
    SET is_revoked = TRUE
    WHERE user_id = p_user_id
      AND token_type = 'test'
      AND is_revoked = FALSE;

    v_token := encode(gen_random_bytes(32), 'hex');

    INSERT INTO auth_tokens(user_id, token_hash, token_type, expires_at, is_revoked)
    VALUES (
        p_user_id,
        encode(digest(v_token, 'sha256'), 'hex'),
        'test',
        NULL,
        FALSE
    );

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Permanent test token created',
        'token', v_token,
        'token_type', 'test',
        'expires_at', NULL
    );
END;
$$;


--
-- Name: fn_get_current_user(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_get_current_user(p_token text) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_token_result JSONB;
    v_user_id BIGINT;
    v_user users%ROWTYPE;
BEGIN
    v_token_result := public.fn_validate_token(p_token);

    IF (v_token_result ->> 'success')::BOOLEAN IS NOT TRUE THEN
        RETURN v_token_result;
    END IF;

    v_user_id := (v_token_result ->> 'user_id')::BIGINT;

    SELECT * INTO v_user FROM users WHERE id = v_user_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'User not found');
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'user', jsonb_build_object(
            'id', v_user.id,
            'full_name', v_user.full_name,
            'email', v_user.email,
            'phone', v_user.phone,
            'address', v_user.address,
            'is_active', v_user.is_active
        )
    );
END;
$$;


--
-- Name: fn_get_medicine(text, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_get_medicine(p_token text, p_medicine_id bigint) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$

DECLARE
    v_auth JSONB;
    v_result JSONB;

BEGIN

    -- 1. TOKEN
    v_auth :=
        public.fn_validate_token(
            p_token
        );

    IF (v_auth ->> 'success')::BOOLEAN IS NOT TRUE THEN
        RETURN v_auth;
    END IF;


    -- 2. GET
    SELECT
        jsonb_build_object(

            'id',
            m.id,

            'medicine_code',
            m.medicine_code,

            'name',
            m.name,

            'active_ingredient',
            m.active_ingredient,

            'strength',
            m.strength,

            'dosage_form',
            m.dosage_form,

            'unit',
            m.unit,

            'route_of_administration',
            m.route_of_administration,

            'usage_instructions',
            m.usage_instructions,

            'packaging',
            m.packaging,

            'manufacturer',
            m.manufacturer,

            'country_of_origin',
            m.country_of_origin,

            'registration_number',
            m.registration_number,

            'supplier',
            jsonb_build_object(
                'id',
                s.id,

                'supplier_code',
                s.supplier_code,

                'name',
                s.name,

                'is_active',
                s.is_active
            ),

            'note',
            m.note,

            'is_active',
            m.is_active,

            'created_at',
            m.created_at,

            'updated_at',
            m.updated_at,

            'created_by_id',
            m.created_by,

            'created_by',
            CASE
                WHEN creator.id IS NULL
                    THEN NULL

                ELSE
                    jsonb_build_object(
                        'id',
                        creator.id,

                        'full_name',
                        creator.full_name,

                        'email',
                        creator.email
                    )
            END,

            'updated_by_id',
            m.updated_by,

            'updated_by',
            CASE
                WHEN updater.id IS NULL
                    THEN NULL

                ELSE
                    jsonb_build_object(
                        'id',
                        updater.id,

                        'full_name',
                        updater.full_name,

                        'email',
                        updater.email
                    )
            END
        )

    INTO v_result

    FROM medicines m

    JOIN suppliers s
        ON s.id =
           m.supplier_id

    LEFT JOIN users creator
        ON creator.id =
           m.created_by

    LEFT JOIN users updater
        ON updater.id =
           m.updated_by

    WHERE m.id =
        p_medicine_id;


    IF v_result IS NULL THEN

        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'Không tìm thấy thuốc'
        );

    END IF;


    RETURN jsonb_build_object(
        'success', TRUE,
        'medicine',
        v_result
    );

END;

$$;


--
-- Name: fn_get_purchase_receipt(text, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_get_purchase_receipt(p_token text, p_receipt_id bigint) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_auth JSONB;
    v_receipt JSONB;
    v_items JSONB;
BEGIN

    -- Kiểm tra token
    v_auth := public.fn_validate_token(p_token);

    IF (v_auth ->> 'success')::BOOLEAN IS NOT TRUE THEN
        RETURN v_auth;
    END IF;


    -- Lấy thông tin phiếu
    SELECT jsonb_build_object(
        'id', pr.id,
        'receipt_code', pr.receipt_code,

        'supplier',
        jsonb_build_object(
            'id', s.id,
            'supplier_code', s.supplier_code,
            'name', s.name,
            'phone', s.phone,
            'address', s.address
        ),

        'invoice_number', pr.invoice_number,
        'invoice_serial', pr.invoice_serial,
        'invoice_date', pr.invoice_date,
        'receipt_date', pr.receipt_date,

        'status', pr.status,
        'note', pr.note,

        'created_by',
        CASE
            WHEN creator.id IS NOT NULL
            THEN jsonb_build_object(
                'id', creator.id,
                'full_name', creator.full_name
            )
            ELSE NULL
        END,

        'approved_by',
        CASE
            WHEN approver.id IS NOT NULL
            THEN jsonb_build_object(
                'id', approver.id,
                'full_name', approver.full_name
            )
            ELSE NULL
        END,

        'created_at', pr.created_at,
        'approved_at', pr.approved_at,

'rejected_by',
CASE
    WHEN rejecter.id IS NOT NULL
    THEN jsonb_build_object(
        'id', rejecter.id,
        'full_name', rejecter.full_name
    )
    ELSE NULL
END,

'rejected_at', pr.rejected_at,

'rejection_reason', pr.rejection_reason
    )
    INTO v_receipt

    FROM purchase_receipts pr

    JOIN suppliers s
        ON s.id = pr.supplier_id

    LEFT JOIN users creator
        ON creator.id = pr.created_by

    LEFT JOIN users approver
        ON approver.id = pr.approved_by

    LEFT JOIN users rejecter
    ON rejecter.id = pr.rejected_by

    WHERE pr.id = p_receipt_id;


    IF v_receipt IS NULL THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'Không tìm thấy phiếu nhập'
        );
    END IF;


    -- Lấy danh sách thuốc trong phiếu
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', pri.id,

                'medicine',
                jsonb_build_object(
                    'id', m.id,
                    'medicine_code', m.medicine_code,
                    'name', m.name,
                    'active_ingredient', m.active_ingredient,
                    'strength', m.strength,
                    'dosage_form', m.dosage_form,
                    'unit', m.unit
                ),

                'lot_number', pri.lot_number,
                'expiry_date', pri.expiry_date,

                'quantity', pri.quantity,
                'unit_price', pri.unit_price,

                'line_total',
                pri.quantity * pri.unit_price
            )
            ORDER BY pri.id
        ),
        '[]'::JSONB
    )
    INTO v_items

    FROM purchase_receipt_items pri

    JOIN medicines m
        ON m.id = pri.medicine_id

    WHERE pri.receipt_id = p_receipt_id;


    RETURN jsonb_build_object(
        'success', TRUE,

        'receipt', v_receipt,

        'items', v_items,

        'item_count',
        jsonb_array_length(v_items),

        'total_amount',
        COALESCE(
            (
                SELECT SUM(
                    quantity * unit_price
                )
                FROM purchase_receipt_items
                WHERE receipt_id = p_receipt_id
            ),
            0
        )
    );

END;
$$;


--
-- Name: fn_get_supplier(text, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_get_supplier(p_token text, p_supplier_id bigint) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$

DECLARE
    v_auth JSONB;
    v_result JSONB;

BEGIN

    -- ==========================================
    -- 1. TOKEN
    -- ==========================================

    v_auth :=
        public.fn_validate_token(
            p_token
        );


    IF (
        v_auth ->> 'success'
    )::BOOLEAN IS NOT TRUE THEN

        RETURN v_auth;

    END IF;


    -- ==========================================
    -- 2. SUPPLIER
    -- ==========================================

    SELECT
        jsonb_build_object(

            'id',
            s.id,

            'supplier_code',
            s.supplier_code,

            'name',
            s.name,

            'address',
            s.address,

            'phone',
            s.phone,

            'email',
            s.email,

            'tax_code',
            s.tax_code,

            'contact_person',
            s.contact_person,

            'note',
            s.note,

            'is_active',
            s.is_active,

            'created_at',
            s.created_at,

            'updated_at',
            s.updated_at,

            'created_by_id',
            s.created_by,

            'created_by',
            CASE
                WHEN creator.id IS NULL
                    THEN NULL

                ELSE
                    jsonb_build_object(
                        'id',
                        creator.id,

                        'full_name',
                        creator.full_name,

                        'email',
                        creator.email
                    )
            END,

            'updated_by_id',
            s.updated_by,

            'updated_by',
            CASE
                WHEN updater.id IS NULL
                    THEN NULL

                ELSE
                    jsonb_build_object(
                        'id',
                        updater.id,

                        'full_name',
                        updater.full_name,

                        'email',
                        updater.email
                    )
            END

        )

    INTO v_result

    FROM suppliers s

    LEFT JOIN users creator
        ON creator.id =
           s.created_by

    LEFT JOIN users updater
        ON updater.id =
           s.updated_by

    WHERE s.id =
        p_supplier_id;


    IF v_result IS NULL THEN

        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'Không tìm thấy nhà cung cấp'
        );

    END IF;


    RETURN jsonb_build_object(
        'success', TRUE,
        'supplier',
        v_result
    );

END;

$$;


--
-- Name: fn_get_supplier_return(text, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_get_supplier_return(p_token text, p_return_id bigint) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_auth JSONB;
    v_return JSONB;
    v_items JSONB;
BEGIN

    v_auth := public.fn_validate_token(p_token);

    IF (v_auth ->> 'success')::BOOLEAN IS NOT TRUE THEN
        RETURN v_auth;
    END IF;


    SELECT jsonb_build_object(
        'id', sr.id,
        'return_code', sr.return_code,

        'supplier',
        jsonb_build_object(
            'id', s.id,
            'supplier_code', s.supplier_code,
            'name', s.name,
            'phone', s.phone,
            'address', s.address
        ),

        'warehouse',
        jsonb_build_object(
            'id', w.id,
            'warehouse_code', w.warehouse_code,
            'name', w.name,
            'warehouse_type', w.warehouse_type
        ),

        'return_date', sr.return_date,
        'reason', sr.reason,
        'note', sr.note,
        'status', sr.status,

        'created_by',
        CASE
            WHEN creator.id IS NOT NULL
            THEN jsonb_build_object(
                'id', creator.id,
                'full_name', creator.full_name
            )
            ELSE NULL
        END,

        'approved_by',
        CASE
            WHEN approver.id IS NOT NULL
            THEN jsonb_build_object(
                'id', approver.id,
                'full_name', approver.full_name
            )
            ELSE NULL
        END,

        'rejected_by',
        CASE
            WHEN rejecter.id IS NOT NULL
            THEN jsonb_build_object(
                'id', rejecter.id,
                'full_name', rejecter.full_name
            )
            ELSE NULL
        END,

        'approved_at', sr.approved_at,
        'rejected_at', sr.rejected_at,
        'rejection_reason', sr.rejection_reason,
        'created_at', sr.created_at

    )
    INTO v_return

    FROM supplier_returns sr

    JOIN suppliers s
        ON s.id = sr.supplier_id

    JOIN warehouses w
        ON w.id = sr.warehouse_id

    LEFT JOIN users creator
        ON creator.id = sr.created_by

    LEFT JOIN users approver
        ON approver.id = sr.approved_by

    LEFT JOIN users rejecter
        ON rejecter.id = sr.rejected_by

    WHERE sr.id = p_return_id;


    IF v_return IS NULL THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'Không tìm thấy phiếu trả'
        );
    END IF;


    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', sri.id,

                'batch_id', b.id,
                'lot_number', b.lot_number,
                'expiry_date', b.expiry_date,

                'medicine',
                jsonb_build_object(
                    'id', m.id,
                    'medicine_code', m.medicine_code,
                    'name', m.name,
                    'active_ingredient', m.active_ingredient,
                    'strength', m.strength,
                    'dosage_form', m.dosage_form,
                    'unit', m.unit
                ),

                'quantity', sri.quantity
            )
            ORDER BY sri.id
        ),
        '[]'::JSONB
    )
    INTO v_items

    FROM supplier_return_items sri

    JOIN batches b
        ON b.id = sri.batch_id

    JOIN medicines m
        ON m.id = b.medicine_id

    WHERE sri.return_id = p_return_id;


    RETURN jsonb_build_object(
        'success', TRUE,
        'supplier_return', v_return,
        'items', v_items,
        'item_count', jsonb_array_length(v_items)
    );

END;
$$;


--
-- Name: fn_get_warehouse_transfer(text, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_get_warehouse_transfer(p_token text, p_transfer_id bigint) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_auth JSONB;
    v_transfer JSONB;
    v_items JSONB;
BEGIN

    v_auth := public.fn_validate_token(p_token);

    IF (v_auth ->> 'success')::BOOLEAN IS NOT TRUE THEN
        RETURN v_auth;
    END IF;


    SELECT jsonb_build_object(
        'id', wt.id,
        'transfer_code', wt.transfer_code,

        'source_warehouse',
        jsonb_build_object(
            'id', sw.id,
            'warehouse_code', sw.warehouse_code,
            'name', sw.name,
            'warehouse_type', sw.warehouse_type
        ),

        'destination_warehouse',
        jsonb_build_object(
            'id', dw.id,
            'warehouse_code', dw.warehouse_code,
            'name', dw.name,
            'warehouse_type', dw.warehouse_type
        ),

        'transfer_date', wt.transfer_date,
        'status', wt.status,
        'note', wt.note,

        'created_by',
        CASE
            WHEN u.id IS NOT NULL
            THEN jsonb_build_object(
                'id', u.id,
                'full_name', u.full_name
            )
            ELSE NULL
        END,

        'created_at', wt.created_at
    )
    INTO v_transfer

    FROM warehouse_transfers wt

    JOIN warehouses sw
        ON sw.id = wt.source_warehouse_id

    JOIN warehouses dw
        ON dw.id = wt.destination_warehouse_id

    LEFT JOIN users u
        ON u.id = wt.created_by

    WHERE wt.id = p_transfer_id;


    IF v_transfer IS NULL THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'Không tìm thấy phiếu chuyển kho'
        );
    END IF;


    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', wti.id,

                'batch_id', b.id,
                'lot_number', b.lot_number,
                'expiry_date', b.expiry_date,

                'medicine',
                jsonb_build_object(
                    'id', m.id,
                    'medicine_code', m.medicine_code,
                    'name', m.name,
                    'active_ingredient', m.active_ingredient,
                    'strength', m.strength,
                    'dosage_form', m.dosage_form,
                    'unit', m.unit
                ),

                'quantity', wti.quantity
            )
            ORDER BY wti.id
        ),
        '[]'::JSONB
    )
    INTO v_items

    FROM warehouse_transfer_items wti

    JOIN batches b
        ON b.id = wti.batch_id

    JOIN medicines m
        ON m.id = b.medicine_id

    WHERE wti.transfer_id = p_transfer_id;


    RETURN jsonb_build_object(
        'success', TRUE,
        'warehouse_transfer', v_transfer,
        'items', v_items,
        'item_count', jsonb_array_length(v_items)
    );

END;
$$;


--
-- Name: fn_list_inventory(text, bigint, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_list_inventory(p_token text, p_warehouse_id bigint DEFAULT NULL::bigint, p_search text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_auth JSONB;
    v_data JSONB;
BEGIN

    -- Kiểm tra token
    v_auth := public.fn_validate_token(p_token);

    IF (v_auth ->> 'success')::BOOLEAN IS NOT TRUE THEN
        RETURN v_auth;
    END IF;


    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'inventory_id', i.id,

                'warehouse',
                jsonb_build_object(
                    'id', w.id,
                    'warehouse_code', w.warehouse_code,
                    'name', w.name,
                    'warehouse_type', w.warehouse_type
                ),

                'medicine',
                jsonb_build_object(
                    'id', m.id,
                    'medicine_code', m.medicine_code,
                    'name', m.name,
                    'active_ingredient', m.active_ingredient,
                    'strength', m.strength,
                    'dosage_form', m.dosage_form,
                    'unit', m.unit
                ),

                'supplier',
                jsonb_build_object(
                    'id', s.id,
                    'supplier_code', s.supplier_code,
                    'name', s.name
                ),

                'batch_id', b.id,
                'lot_number', b.lot_number,
                'expiry_date', b.expiry_date,

                'days_to_expiry',
                b.expiry_date - CURRENT_DATE,

                'is_expired',
                b.expiry_date < CURRENT_DATE,

                'quantity', i.quantity,

                'updated_at', i.updated_at
            )
            ORDER BY
                b.expiry_date ASC,
                m.name ASC
        ),
        '[]'::JSONB
    )
    INTO v_data

    FROM inventory i

    JOIN warehouses w
        ON w.id = i.warehouse_id

    JOIN batches b
        ON b.id = i.batch_id

    JOIN medicines m
        ON m.id = b.medicine_id

    JOIN suppliers s
        ON s.id = m.supplier_id

    WHERE
        i.quantity > 0

        AND (
            p_warehouse_id IS NULL
            OR i.warehouse_id = p_warehouse_id
        )

        AND (
            p_search IS NULL
            OR TRIM(p_search) = ''

            OR LOWER(m.name)
                LIKE '%' || LOWER(TRIM(p_search)) || '%'

            OR LOWER(m.medicine_code)
                LIKE '%' || LOWER(TRIM(p_search)) || '%'

            OR LOWER(b.lot_number)
                LIKE '%' || LOWER(TRIM(p_search)) || '%'

            OR LOWER(m.active_ingredient)
                LIKE '%' || LOWER(TRIM(p_search)) || '%'
        );


    RETURN jsonb_build_object(
        'success', TRUE,
        'count', jsonb_array_length(v_data),
        'data', v_data
    );

END;
$$;


--
-- Name: fn_list_medicines(text, text, bigint, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_list_medicines(p_token text, p_search text, p_supplier_id bigint, p_is_active boolean) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$

DECLARE
    v_auth JSONB;
    v_data JSONB;

BEGIN

    -- 1. TOKEN
    v_auth :=
        public.fn_validate_token(
            p_token
        );

    IF (v_auth ->> 'success')::BOOLEAN IS NOT TRUE THEN
        RETURN v_auth;
    END IF;


    -- 2. LIST
    SELECT
        COALESCE(
            jsonb_agg(

                jsonb_build_object(

                    'id',
                    m.id,

                    'medicine_code',
                    m.medicine_code,

                    'name',
                    m.name,

                    'active_ingredient',
                    m.active_ingredient,

                    'strength',
                    m.strength,

                    'dosage_form',
                    m.dosage_form,

                    'unit',
                    m.unit,

                    'route_of_administration',
                    m.route_of_administration,

                    'usage_instructions',
                    m.usage_instructions,

                    'packaging',
                    m.packaging,

                    'manufacturer',
                    m.manufacturer,

                    'country_of_origin',
                    m.country_of_origin,

                    'registration_number',
                    m.registration_number,

                    'supplier',
                    jsonb_build_object(
                        'id',
                        s.id,

                        'supplier_code',
                        s.supplier_code,

                        'name',
                        s.name,

                        'is_active',
                        s.is_active
                    ),

                    'note',
                    m.note,

                    'is_active',
                    m.is_active,

                    'created_at',
                    m.created_at,

                    'updated_at',
                    m.updated_at,

                    'created_by_id',
                    m.created_by,

                    'created_by',
                    CASE
                        WHEN creator.id IS NULL
                            THEN NULL

                        ELSE
                            jsonb_build_object(
                                'id',
                                creator.id,

                                'full_name',
                                creator.full_name,

                                'email',
                                creator.email
                            )
                    END,

                    'updated_by_id',
                    m.updated_by,

                    'updated_by',
                    CASE
                        WHEN updater.id IS NULL
                            THEN NULL

                        ELSE
                            jsonb_build_object(
                                'id',
                                updater.id,

                                'full_name',
                                updater.full_name,

                                'email',
                                updater.email
                            )
                    END
                )

                ORDER BY
                    m.id DESC
            ),

            '[]'::JSONB
        )

    INTO v_data

    FROM medicines m

    JOIN suppliers s
        ON s.id =
           m.supplier_id

    LEFT JOIN users creator
        ON creator.id =
           m.created_by

    LEFT JOIN users updater
        ON updater.id =
           m.updated_by

    WHERE
        (
            p_search IS NULL

            OR TRIM(p_search) = ''

            OR LOWER(m.name)
                LIKE
                '%' ||
                LOWER(TRIM(p_search)) ||
                '%'

            OR LOWER(
                COALESCE(
                    m.medicine_code,
                    ''
                )
            )
                LIKE
                '%' ||
                LOWER(TRIM(p_search)) ||
                '%'

            OR LOWER(m.active_ingredient)
                LIKE
                '%' ||
                LOWER(TRIM(p_search)) ||
                '%'

            OR LOWER(
                COALESCE(
                    m.registration_number,
                    ''
                )
            )
                LIKE
                '%' ||
                LOWER(TRIM(p_search)) ||
                '%'

            OR LOWER(
                COALESCE(
                    m.manufacturer,
                    ''
                )
            )
                LIKE
                '%' ||
                LOWER(TRIM(p_search)) ||
                '%'

            OR LOWER(
                COALESCE(
                    creator.full_name,
                    ''
                )
            )
                LIKE
                '%' ||
                LOWER(TRIM(p_search)) ||
                '%'

            OR LOWER(
                COALESCE(
                    updater.full_name,
                    ''
                )
            )
                LIKE
                '%' ||
                LOWER(TRIM(p_search)) ||
                '%'
        )

        AND (
            p_supplier_id IS NULL
            OR m.supplier_id =
               p_supplier_id
        )

        AND (
            p_is_active IS NULL
            OR m.is_active =
               p_is_active
        );


    RETURN jsonb_build_object(
        'success', TRUE,
        'count',
        jsonb_array_length(
            v_data
        ),
        'data',
        v_data
    );

END;

$$;


--
-- Name: fn_list_purchase_receipts(text, text, bigint, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_list_purchase_receipts(p_token text, p_status text DEFAULT NULL::text, p_supplier_id bigint DEFAULT NULL::bigint, p_search text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_auth JSONB;
    v_data JSONB;
BEGIN

    -- Kiểm tra token
    v_auth := public.fn_validate_token(p_token);

    IF (v_auth ->> 'success')::BOOLEAN IS NOT TRUE THEN
        RETURN v_auth;
    END IF;


    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', pr.id,
                'receipt_code', pr.receipt_code,

                'supplier',
                jsonb_build_object(
                    'id', s.id,
                    'supplier_code', s.supplier_code,
                    'name', s.name
                ),

                'invoice_number', pr.invoice_number,
                'invoice_serial', pr.invoice_serial,
                'invoice_date', pr.invoice_date,
                'receipt_date', pr.receipt_date,

                'status', pr.status,
                'note', pr.note,

                'item_count',
                (
                    SELECT COUNT(*)
                    FROM purchase_receipt_items pri
                    WHERE pri.receipt_id = pr.id
                ),

                'total_amount',
                COALESCE(
                    (
                        SELECT SUM(
                            pri.quantity * pri.unit_price
                        )
                        FROM purchase_receipt_items pri
                        WHERE pri.receipt_id = pr.id
                    ),
                    0
                ),

                'created_by',
                CASE
                    WHEN creator.id IS NOT NULL
                    THEN jsonb_build_object(
                        'id', creator.id,
                        'full_name', creator.full_name
                    )
                    ELSE NULL
                END,

                'approved_by',
                CASE
                    WHEN approver.id IS NOT NULL
                    THEN jsonb_build_object(
                        'id', approver.id,
                        'full_name', approver.full_name
                    )
                    ELSE NULL
                END,

                'created_at', pr.created_at,
                'approved_at', pr.approved_at,
                'rejection_reason', pr.rejection_reason,
                'rejected_at', pr.rejected_at
    
            )
            ORDER BY pr.id DESC
        ),
        '[]'::JSONB
    )
    INTO v_data

    FROM purchase_receipts pr

    JOIN suppliers s
        ON s.id = pr.supplier_id

    LEFT JOIN users creator
        ON creator.id = pr.created_by

    LEFT JOIN users approver
        ON approver.id = pr.approved_by

    WHERE
        (
            p_status IS NULL
            OR TRIM(p_status) = ''
            OR UPPER(pr.status) = UPPER(TRIM(p_status))
        )

        AND (
            p_supplier_id IS NULL
            OR pr.supplier_id = p_supplier_id
        )

        AND (
            p_search IS NULL
            OR TRIM(p_search) = ''

            OR LOWER(pr.receipt_code)
                LIKE '%' || LOWER(TRIM(p_search)) || '%'

            OR LOWER(pr.invoice_number)
                LIKE '%' || LOWER(TRIM(p_search)) || '%'

            OR LOWER(COALESCE(pr.invoice_serial, ''))
                LIKE '%' || LOWER(TRIM(p_search)) || '%'

            OR LOWER(s.name)
                LIKE '%' || LOWER(TRIM(p_search)) || '%'
        );


    RETURN jsonb_build_object(
        'success', TRUE,
        'count', jsonb_array_length(v_data),
        'data', v_data
    );

END;
$$;


--
-- Name: fn_list_stock_movements(text, bigint, text, bigint, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_list_stock_movements(p_token text, p_warehouse_id bigint DEFAULT NULL::bigint, p_movement_type text DEFAULT NULL::text, p_medicine_id bigint DEFAULT NULL::bigint, p_search text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$

DECLARE
    v_auth JSONB;
    v_data JSONB;

BEGIN

    -- ==========================================
    -- 1. KIỂM TRA TOKEN
    -- ==========================================

    v_auth := public.fn_validate_token(p_token);

    IF (v_auth ->> 'success')::BOOLEAN IS NOT TRUE THEN
        RETURN v_auth;
    END IF;


    -- ==========================================
    -- 2. LẤY LỊCH SỬ BIẾN ĐỘNG KHO
    -- ==========================================

    SELECT COALESCE(

        jsonb_agg(

            jsonb_build_object(

                -- ==========================================
                -- ID
                -- ==========================================

                'id', sm.id,


                -- ==========================================
                -- KHO
                -- ==========================================

                'warehouse',

                jsonb_build_object(
                    'id', w.id,
                    'warehouse_code', w.warehouse_code,
                    'name', w.name,
                    'warehouse_type', w.warehouse_type
                ),


                -- ==========================================
                -- THUỐC
                -- ==========================================

                'medicine',

                jsonb_build_object(
                    'id', m.id,
                    'medicine_code', m.medicine_code,
                    'name', m.name,
                    'active_ingredient', m.active_ingredient,
                    'strength', m.strength,
                    'unit', m.unit
                ),


                -- ==========================================
                -- LÔ THUỐC
                -- ==========================================

                'batch',

                jsonb_build_object(
                    'id', b.id,
                    'lot_number', b.lot_number,
                    'expiry_date', b.expiry_date
                ),


                -- ==========================================
                -- LOẠI BIẾN ĐỘNG
                -- ==========================================

                'movement_type',
                sm.movement_type,


                -- ==========================================
                -- HƯỚNG BIẾN ĐỘNG
                -- ==========================================

                'direction',

                CASE

                    WHEN sm.movement_type IN (
                        'IMPORT',
                        'TRANSFER_IN'
                    )
                    THEN 'IN'


                    WHEN sm.movement_type IN (
                        'TRANSFER_OUT',
                        'RETURN_SUPPLIER'
                    )
                    THEN 'OUT'


                    ELSE 'OTHER'

                END,


                -- ==========================================
                -- SỐ LƯỢNG
                -- ==========================================

                'quantity',
                sm.quantity,


                'signed_quantity',

                CASE

                    WHEN sm.movement_type IN (
                        'TRANSFER_OUT',
                        'RETURN_SUPPLIER'
                    )
                    THEN -sm.quantity

                    ELSE sm.quantity

                END,


                -- ==========================================
                -- CHỨNG TỪ
                -- ==========================================

                'reference_type',
                sm.reference_type,


                'reference_id',
                sm.reference_id,


                'reference_code',

                CASE

                    WHEN sm.reference_type = 'PURCHASE_RECEIPT'
                        THEN pr.receipt_code


                    WHEN sm.reference_type = 'WAREHOUSE_TRANSFER'
                        THEN wt.transfer_code


                    WHEN sm.reference_type = 'SUPPLIER_RETURN'
                        THEN sr.return_code


                    ELSE NULL

                END,


                -- ==========================================
                -- GHI CHÚ
                -- ==========================================

                'note',
                sm.note,


                -- ==========================================
                -- NGƯỜI THỰC HIỆN
                -- ==========================================

                'created_by_id',
                sm.created_by,


                'created_by',

                CASE

                    WHEN u.id IS NOT NULL

                    THEN jsonb_build_object(
                        'id', u.id,
                        'full_name', u.full_name,
                        'email', u.email
                    )


                    ELSE NULL

                END,


                -- ==========================================
                -- THỜI GIAN
                -- ==========================================

                'created_at',
                sm.created_at

            )

            ORDER BY
                sm.created_at DESC,
                sm.id DESC

        ),

        '[]'::JSONB

    )

    INTO v_data


    -- ==========================================
    -- TABLE
    -- ==========================================

    FROM stock_movements sm


    -- Kho

    JOIN warehouses w
        ON w.id = sm.warehouse_id


    -- Lô

    JOIN batches b
        ON b.id = sm.batch_id


    -- Thuốc

    JOIN medicines m
        ON m.id = b.medicine_id


    -- Người thực hiện

    LEFT JOIN users u
        ON u.id = sm.created_by


    -- Phiếu nhập

    LEFT JOIN purchase_receipts pr

        ON sm.reference_type = 'PURCHASE_RECEIPT'

       AND pr.id = sm.reference_id


    -- Phiếu chuyển kho

    LEFT JOIN warehouse_transfers wt

        ON sm.reference_type = 'WAREHOUSE_TRANSFER'

       AND wt.id = sm.reference_id


    -- Phiếu trả NCC

    LEFT JOIN supplier_returns sr

        ON sm.reference_type = 'SUPPLIER_RETURN'

       AND sr.id = sm.reference_id


    -- ==========================================
    -- FILTER
    -- ==========================================

    WHERE


        -- ==========================================
        -- LỌC THEO KHO
        -- ==========================================

        (
            p_warehouse_id IS NULL

            OR sm.warehouse_id = p_warehouse_id
        )


        -- ==========================================
        -- LỌC THEO LOẠI BIẾN ĐỘNG
        -- ==========================================

        AND (

            p_movement_type IS NULL

            OR TRIM(p_movement_type) = ''

            OR UPPER(sm.movement_type)
                = UPPER(TRIM(p_movement_type))

        )


        -- ==========================================
        -- LỌC THEO THUỐC
        -- ==========================================

        AND (

            p_medicine_id IS NULL

            OR m.id = p_medicine_id

        )


        -- ==========================================
        -- TÌM KIẾM
        -- ==========================================

        AND (

            p_search IS NULL

            OR TRIM(p_search) = ''


            -- Tên thuốc

            OR LOWER(m.name)
                LIKE '%' || LOWER(TRIM(p_search)) || '%'


            -- Mã thuốc

            OR LOWER(m.medicine_code)
                LIKE '%' || LOWER(TRIM(p_search)) || '%'


            -- Số lô

            OR LOWER(b.lot_number)
                LIKE '%' || LOWER(TRIM(p_search)) || '%'


            -- Loại biến động

            OR LOWER(sm.movement_type)
                LIKE '%' || LOWER(TRIM(p_search)) || '%'


            -- Ghi chú

            OR LOWER(
                COALESCE(
                    sm.note,
                    ''
                )
            )
            LIKE '%' || LOWER(TRIM(p_search)) || '%'


            -- Phiếu nhập

            OR LOWER(
                COALESCE(
                    pr.receipt_code,
                    ''
                )
            )
            LIKE '%' || LOWER(TRIM(p_search)) || '%'


            -- Phiếu chuyển kho

            OR LOWER(
                COALESCE(
                    wt.transfer_code,
                    ''
                )
            )
            LIKE '%' || LOWER(TRIM(p_search)) || '%'


            -- Phiếu trả NCC

            OR LOWER(
                COALESCE(
                    sr.return_code,
                    ''
                )
            )
            LIKE '%' || LOWER(TRIM(p_search)) || '%'


            -- Người thực hiện

            OR LOWER(
                COALESCE(
                    u.full_name,
                    ''
                )
            )
            LIKE '%' || LOWER(TRIM(p_search)) || '%'


            -- Email người thực hiện

            OR LOWER(
                COALESCE(
                    u.email,
                    ''
                )
            )
            LIKE '%' || LOWER(TRIM(p_search)) || '%'

        );


    -- ==========================================
    -- RESPONSE
    -- ==========================================

    RETURN jsonb_build_object(

        'success',
        TRUE,

        'count',
        jsonb_array_length(
            v_data
        ),

        'data',
        v_data

    );


END;

$$;


--
-- Name: fn_list_supplier_returns(text, text, bigint, bigint, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_list_supplier_returns(p_token text, p_status text DEFAULT NULL::text, p_supplier_id bigint DEFAULT NULL::bigint, p_warehouse_id bigint DEFAULT NULL::bigint, p_search text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_auth JSONB;
    v_data JSONB;
BEGIN

    v_auth := public.fn_validate_token(p_token);

    IF (v_auth ->> 'success')::BOOLEAN IS NOT TRUE THEN
        RETURN v_auth;
    END IF;


    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', sr.id,
                'return_code', sr.return_code,

                'supplier',
                jsonb_build_object(
                    'id', s.id,
                    'supplier_code', s.supplier_code,
                    'name', s.name
                ),

                'warehouse',
                jsonb_build_object(
                    'id', w.id,
                    'warehouse_code', w.warehouse_code,
                    'name', w.name
                ),

                'return_date', sr.return_date,
                'reason', sr.reason,
                'note', sr.note,
                'status', sr.status,

                'item_count',
                (
                    SELECT COUNT(*)
                    FROM supplier_return_items sri
                    WHERE sri.return_id = sr.id
                ),

                'created_by',
                CASE
                    WHEN creator.id IS NOT NULL
                    THEN jsonb_build_object(
                        'id', creator.id,
                        'full_name', creator.full_name
                    )
                    ELSE NULL
                END,

                'approved_by',
                CASE
                    WHEN approver.id IS NOT NULL
                    THEN jsonb_build_object(
                        'id', approver.id,
                        'full_name', approver.full_name
                    )
                    ELSE NULL
                END,

                'rejected_by',
                CASE
                    WHEN rejecter.id IS NOT NULL
                    THEN jsonb_build_object(
                        'id', rejecter.id,
                        'full_name', rejecter.full_name
                    )
                    ELSE NULL
                END,

                'approved_at', sr.approved_at,
                'rejected_at', sr.rejected_at,
                'rejection_reason', sr.rejection_reason,
                'created_at', sr.created_at
            )
            ORDER BY sr.id DESC
        ),
        '[]'::JSONB
    )
    INTO v_data

    FROM supplier_returns sr

    JOIN suppliers s
        ON s.id = sr.supplier_id

    JOIN warehouses w
        ON w.id = sr.warehouse_id

    LEFT JOIN users creator
        ON creator.id = sr.created_by

    LEFT JOIN users approver
        ON approver.id = sr.approved_by

    LEFT JOIN users rejecter
        ON rejecter.id = sr.rejected_by

    WHERE
        (
            p_status IS NULL
            OR TRIM(p_status) = ''
            OR UPPER(sr.status) = UPPER(TRIM(p_status))
        )

        AND (
            p_supplier_id IS NULL
            OR sr.supplier_id = p_supplier_id
        )

        AND (
            p_warehouse_id IS NULL
            OR sr.warehouse_id = p_warehouse_id
        )

        AND (
            p_search IS NULL
            OR TRIM(p_search) = ''

            OR LOWER(sr.return_code)
                LIKE '%' || LOWER(TRIM(p_search)) || '%'

            OR LOWER(s.name)
                LIKE '%' || LOWER(TRIM(p_search)) || '%'

            OR LOWER(sr.reason)
                LIKE '%' || LOWER(TRIM(p_search)) || '%'
        );


    RETURN jsonb_build_object(
        'success', TRUE,
        'count', jsonb_array_length(v_data),
        'data', v_data
    );

END;
$$;


--
-- Name: fn_list_suppliers(text, text, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_list_suppliers(p_token text, p_search text, p_is_active boolean) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$

DECLARE
    v_auth JSONB;
    v_data JSONB;

BEGIN

    -- ==========================================
    -- 1. TOKEN
    -- ==========================================

    v_auth :=
        public.fn_validate_token(
            p_token
        );


    IF (
        v_auth ->> 'success'
    )::BOOLEAN IS NOT TRUE THEN

        RETURN v_auth;

    END IF;


    -- ==========================================
    -- 2. LIST
    -- ==========================================

    SELECT
        COALESCE(

            jsonb_agg(

                jsonb_build_object(

                    'id',
                    s.id,

                    'supplier_code',
                    s.supplier_code,

                    'name',
                    s.name,

                    'address',
                    s.address,

                    'phone',
                    s.phone,

                    'email',
                    s.email,

                    'tax_code',
                    s.tax_code,

                    'contact_person',
                    s.contact_person,

                    'note',
                    s.note,

                    'is_active',
                    s.is_active,

                    'created_at',
                    s.created_at,

                    'updated_at',
                    s.updated_at,

                    'created_by_id',
                    s.created_by,

                    'created_by',
                    CASE
                        WHEN creator.id IS NULL
                            THEN NULL

                        ELSE
                            jsonb_build_object(
                                'id',
                                creator.id,

                                'full_name',
                                creator.full_name,

                                'email',
                                creator.email
                            )
                    END,

                    'updated_by_id',
                    s.updated_by,

                    'updated_by',
                    CASE
                        WHEN updater.id IS NULL
                            THEN NULL

                        ELSE
                            jsonb_build_object(
                                'id',
                                updater.id,

                                'full_name',
                                updater.full_name,

                                'email',
                                updater.email
                            )
                    END

                )

                ORDER BY
                    s.id DESC

            ),

            '[]'::JSONB

        )

    INTO v_data

    FROM suppliers s

    LEFT JOIN users creator
        ON creator.id =
           s.created_by

    LEFT JOIN users updater
        ON updater.id =
           s.updated_by

    WHERE
        (
            p_search IS NULL

            OR TRIM(p_search) = ''

            OR LOWER(s.name)
                LIKE
                '%' ||
                LOWER(TRIM(p_search)) ||
                '%'

            OR LOWER(
                COALESCE(
                    s.supplier_code,
                    ''
                )
            )
                LIKE
                '%' ||
                LOWER(TRIM(p_search)) ||
                '%'

            OR LOWER(
                COALESCE(
                    s.phone,
                    ''
                )
            )
                LIKE
                '%' ||
                LOWER(TRIM(p_search)) ||
                '%'

            OR LOWER(
                COALESCE(
                    s.email,
                    ''
                )
            )
                LIKE
                '%' ||
                LOWER(TRIM(p_search)) ||
                '%'

            OR LOWER(
                COALESCE(
                    s.tax_code,
                    ''
                )
            )
                LIKE
                '%' ||
                LOWER(TRIM(p_search)) ||
                '%'

            OR LOWER(
                COALESCE(
                    s.contact_person,
                    ''
                )
            )
                LIKE
                '%' ||
                LOWER(TRIM(p_search)) ||
                '%'

            OR LOWER(
                COALESCE(
                    creator.full_name,
                    ''
                )
            )
                LIKE
                '%' ||
                LOWER(TRIM(p_search)) ||
                '%'

            OR LOWER(
                COALESCE(
                    updater.full_name,
                    ''
                )
            )
                LIKE
                '%' ||
                LOWER(TRIM(p_search)) ||
                '%'
        )

        AND
        (
            p_is_active IS NULL

            OR s.is_active =
               p_is_active
        );


    RETURN jsonb_build_object(
        'success', TRUE,
        'count',
        jsonb_array_length(
            v_data
        ),
        'data',
        v_data
    );

END;

$$;


--
-- Name: fn_list_warehouse_transfers(text, bigint, bigint, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_list_warehouse_transfers(p_token text, p_source_warehouse_id bigint DEFAULT NULL::bigint, p_destination_warehouse_id bigint DEFAULT NULL::bigint, p_search text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_auth JSONB;
    v_data JSONB;
BEGIN

    v_auth := public.fn_validate_token(p_token);

    IF (v_auth ->> 'success')::BOOLEAN IS NOT TRUE THEN
        RETURN v_auth;
    END IF;


    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', wt.id,
                'transfer_code', wt.transfer_code,

                'source_warehouse',
                jsonb_build_object(
                    'id', sw.id,
                    'warehouse_code', sw.warehouse_code,
                    'name', sw.name
                ),

                'destination_warehouse',
                jsonb_build_object(
                    'id', dw.id,
                    'warehouse_code', dw.warehouse_code,
                    'name', dw.name
                ),

                'transfer_date', wt.transfer_date,
                'status', wt.status,
                'note', wt.note,

                'item_count',
                (
                    SELECT COUNT(*)
                    FROM warehouse_transfer_items wti
                    WHERE wti.transfer_id = wt.id
                ),

                'created_by',
                CASE
                    WHEN u.id IS NOT NULL
                    THEN jsonb_build_object(
                        'id', u.id,
                        'full_name', u.full_name
                    )
                    ELSE NULL
                END,

                'created_at', wt.created_at
            )
            ORDER BY wt.id DESC
        ),
        '[]'::JSONB
    )
    INTO v_data

    FROM warehouse_transfers wt

    JOIN warehouses sw
        ON sw.id = wt.source_warehouse_id

    JOIN warehouses dw
        ON dw.id = wt.destination_warehouse_id

    LEFT JOIN users u
        ON u.id = wt.created_by

    WHERE
        (
            p_source_warehouse_id IS NULL
            OR wt.source_warehouse_id = p_source_warehouse_id
        )

        AND (
            p_destination_warehouse_id IS NULL
            OR wt.destination_warehouse_id = p_destination_warehouse_id
        )

        AND (
            p_search IS NULL
            OR TRIM(p_search) = ''

            OR LOWER(wt.transfer_code)
                LIKE '%' || LOWER(TRIM(p_search)) || '%'

            OR LOWER(COALESCE(wt.note, ''))
                LIKE '%' || LOWER(TRIM(p_search)) || '%'
        );


    RETURN jsonb_build_object(
        'success', TRUE,
        'count', jsonb_array_length(v_data),
        'data', v_data
    );

END;
$$;


--
-- Name: fn_login_user(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_login_user(p_email text, p_password text) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$

DECLARE
    v_user users%ROWTYPE;

    v_token TEXT;

    v_expires_at TIMESTAMPTZ;

    v_email TEXT;

BEGIN

    -- ==========================================
    -- 1. VALIDATE INPUT
    -- ==========================================

    IF p_email IS NULL
       OR TRIM(p_email) = '' THEN

        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'Email is required'
        );

    END IF;


    IF p_password IS NULL
       OR p_password = '' THEN

        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'Password is required'
        );

    END IF;


    v_email :=
        LOWER(
            TRIM(p_email)
        );


    -- ==========================================
    -- 2. USER
    -- ==========================================

    SELECT *
    INTO v_user
    FROM users
    WHERE email = v_email;


    IF NOT FOUND THEN

        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'Invalid email or password'
        );

    END IF;


    -- ==========================================
    -- 3. ACTIVE
    -- ==========================================

    IF v_user.is_active IS NOT TRUE THEN

        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'Account is inactive'
        );

    END IF;


    -- ==========================================
    -- 4. PASSWORD
    -- ==========================================

    IF crypt(
        p_password,
        v_user.password_hash
    ) IS DISTINCT FROM
       v_user.password_hash THEN

        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'Invalid email or password'
        );

    END IF;


    -- ==========================================
    -- 5. LOGIN TIME
    -- ==========================================

    UPDATE users
    SET last_login_at = NOW()
    WHERE id = v_user.id;


    -- ==========================================
    -- 6. ACCESS TOKEN
    -- TTL = 2 GIỜ
    -- ==========================================

    v_token :=
        encode(
            gen_random_bytes(32),
            'hex'
        );


    v_expires_at :=
        NOW()
        + INTERVAL '2 hours';


    INSERT INTO auth_tokens (
        user_id,
        token_hash,
        token_type,
        expires_at,
        is_revoked
    )
    VALUES (
        v_user.id,

        encode(
            digest(
                v_token,
                'sha256'
            ),
            'hex'
        ),

        'access',

        v_expires_at,

        FALSE
    );


    RETURN jsonb_build_object(
        'success', TRUE,
        'message', 'Login successful',

        'user',
        jsonb_build_object(
            'id', v_user.id,
            'full_name', v_user.full_name,
            'email', v_user.email
        ),

        'token', v_token,

        'token_type', 'Bearer',

        'expires_at', v_expires_at
    );

END;

$$;


--
-- Name: fn_logout_user(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_logout_user(p_token text) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_token_hash TEXT;
    v_user_id BIGINT;
    v_token_type TEXT;
BEGIN
    v_token_hash := encode(digest(p_token, 'sha256'), 'hex');

    SELECT user_id, token_type
    INTO v_user_id, v_token_type
    FROM auth_tokens
    WHERE token_hash = v_token_hash;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Invalid token');
    END IF;

    IF v_token_type = 'test' THEN
        RETURN jsonb_build_object('success', true, 'message', 'Test token remains active');
    END IF;

    UPDATE auth_tokens
    SET is_revoked = TRUE
    WHERE token_hash = v_token_hash;

    UPDATE users
    SET last_logout_at = NOW()
    WHERE id = v_user_id;

    RETURN jsonb_build_object('success', true, 'message', 'Logout successful');
END;
$$;


--
-- Name: fn_register_user(text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_register_user(p_full_name text, p_email text, p_password text, p_phone text DEFAULT NULL::text, p_address text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql
    AS $_$

DECLARE
    v_user_id BIGINT;
    v_email TEXT;

BEGIN

    -- ==========================================
    -- 1. FULL NAME
    -- ==========================================

    IF p_full_name IS NULL
       OR TRIM(p_full_name) = '' THEN

        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'Full name is required'
        );

    END IF;


    -- ==========================================
    -- 2. EMAIL
    -- ==========================================

    IF p_email IS NULL
       OR TRIM(p_email) = '' THEN

        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'Email is required'
        );

    END IF;


    v_email :=
        LOWER(
            TRIM(p_email)
        );


    -- Email cơ bản:
    -- name@example.com
    IF v_email !~
       '^[A-Za-z0-9._%+]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
    THEN

        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'Invalid email format'
        );

    END IF;


    -- ==========================================
    -- 3. PASSWORD
    -- ==========================================

    IF NOT public.fn_validate_password(
        p_password
    ) THEN

        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'Password must be 8-72 bytes, contain a letter, number and special character, and contain no whitespace'
        );

    END IF;


    -- ==========================================
    -- 4. EMAIL DUPLICATE
    -- ==========================================

    IF EXISTS (

        SELECT 1

        FROM users

        WHERE LOWER(email) =
              v_email

    ) THEN

        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'Email already exists'
        );

    END IF;


    -- ==========================================
    -- 5. INSERT
    -- ==========================================

    INSERT INTO users (
        full_name,
        email,
        password_hash,
        phone,
        address
    )
    VALUES (
        TRIM(p_full_name),
        v_email,
        crypt(
            p_password,
            gen_salt('bf')
        ),
        NULLIF(TRIM(p_phone), ''),
        NULLIF(TRIM(p_address), '')
    )
    RETURNING id
    INTO v_user_id;


    RETURN jsonb_build_object(
        'success', TRUE,
        'message',
        'User created successfully',
        'user_id',
        v_user_id
    );


EXCEPTION

    WHEN unique_violation THEN

        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'Email already exists'
        );

END;

$_$;


--
-- Name: fn_reject_purchase_receipt(text, bigint, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_reject_purchase_receipt(p_token text, p_receipt_id bigint, p_reason text) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$

DECLARE
    v_auth JSONB;

    v_user_id BIGINT;

BEGIN

    -- ==========================================
    -- 1. TOKEN
    -- ==========================================

    v_auth :=
        public.fn_validate_token(
            p_token
        );


    IF (
        v_auth ->> 'success'
    )::BOOLEAN IS NOT TRUE THEN

        RETURN v_auth;

    END IF;


    v_user_id :=
        (
            v_auth ->> 'user_id'
        )::BIGINT;


    -- ==========================================
    -- 2. REASON
    -- ==========================================

    IF p_reason IS NULL
       OR TRIM(p_reason) = '' THEN

        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'Vui lòng nhập lý do từ chối'
        );

    END IF;


    -- ==========================================
    -- 3. LOCK PENDING RECEIPT
    -- ==========================================

    PERFORM 1

    FROM purchase_receipts

    WHERE id =
        p_receipt_id

      AND status =
        'PENDING'

    FOR UPDATE;


    IF NOT FOUND THEN

        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'Phiếu không tồn tại hoặc không ở trạng thái chờ duyệt'
        );

    END IF;


    -- ==========================================
    -- 4. REJECT
    -- ==========================================

    UPDATE purchase_receipts

    SET
        status =
            'REJECTED',

        rejected_by =
            v_user_id,

        rejected_at =
            NOW(),

        rejection_reason =
            TRIM(p_reason)

    WHERE id =
        p_receipt_id

      AND status =
        'PENDING';


    IF NOT FOUND THEN

        RAISE EXCEPTION
            'Trạng thái phiếu đã thay đổi trong quá trình từ chối';

    END IF;


    -- ==========================================
    -- 5. RESPONSE
    -- ==========================================

    RETURN jsonb_build_object(
        'success', TRUE,
        'message',
        'Phiếu nhập đã bị từ chối',
        'receipt_id',
        p_receipt_id,
        'status',
        'REJECTED',
        'rejection_reason',
        TRIM(p_reason)
    );


END;

$$;


--
-- Name: fn_reject_supplier_return(text, bigint, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_reject_supplier_return(p_token text, p_return_id bigint, p_reason text) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$

DECLARE
    v_auth JSONB;

    v_user_id BIGINT;

BEGIN

    -- =====================================================
    -- 1. TOKEN
    -- =====================================================

    v_auth :=
        public.fn_validate_token(
            p_token
        );


    IF (
        v_auth ->> 'success'
    )::BOOLEAN IS NOT TRUE THEN

        RETURN v_auth;

    END IF;


    v_user_id :=
        (
            v_auth ->> 'user_id'
        )::BIGINT;


    -- =====================================================
    -- 2. REASON
    -- =====================================================

    IF p_reason IS NULL
       OR TRIM(p_reason) = '' THEN

        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'Vui lòng nhập lý do từ chối'
        );

    END IF;


    -- =====================================================
    -- 3. LOCK PENDING RETURN
    -- =====================================================

    PERFORM 1

    FROM supplier_returns

    WHERE id =
        p_return_id

      AND status =
        'PENDING'

    FOR UPDATE;


    IF NOT FOUND THEN

        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'Phiếu trả không tồn tại hoặc không ở trạng thái chờ duyệt'
        );

    END IF;


    -- =====================================================
    -- 4. REJECT
    -- =====================================================

    UPDATE supplier_returns

    SET
        status =
            'REJECTED',

        rejected_by =
            v_user_id,

        rejected_at =
            NOW(),

        rejection_reason =
            TRIM(p_reason)

    WHERE id =
        p_return_id

      AND status =
        'PENDING';


    IF NOT FOUND THEN

        RAISE EXCEPTION
            'Trạng thái phiếu trả đã thay đổi trong quá trình từ chối';

    END IF;


    -- =====================================================
    -- 5. RESPONSE
    -- =====================================================

    RETURN jsonb_build_object(
        'success', TRUE,
        'message',
        'Phiếu trả đã bị từ chối',
        'return_id',
        p_return_id,
        'status',
        'REJECTED',
        'rejection_reason',
        TRIM(p_reason)
    );


END;

$$;


--
-- Name: fn_set_medicine_status(text, bigint, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_set_medicine_status(p_token text, p_medicine_id bigint, p_is_active boolean) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$

DECLARE
    v_auth JSONB;
    v_user_id BIGINT;

BEGIN

    -- 1. TOKEN
    v_auth :=
        public.fn_validate_token(
            p_token
        );

    IF (v_auth ->> 'success')::BOOLEAN IS NOT TRUE THEN
        RETURN v_auth;
    END IF;

    v_user_id :=
        (v_auth ->> 'user_id')::BIGINT;


    -- 2. STATUS
    IF p_is_active IS NULL THEN

        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'Trạng thái thuốc không hợp lệ'
        );

    END IF;


    -- 3. UPDATE
    UPDATE medicines

    SET
        is_active =
            p_is_active,

        updated_by =
            v_user_id,

        updated_at =
            NOW()

    WHERE id =
        p_medicine_id;


    IF NOT FOUND THEN

        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'Không tìm thấy thuốc'
        );

    END IF;


    RETURN jsonb_build_object(
        'success', TRUE,

        'message',
        CASE
            WHEN p_is_active THEN
                'Đã kích hoạt thuốc'
            ELSE
                'Đã ngừng sử dụng thuốc'
        END,

        'medicine_id',
        p_medicine_id,

        'is_active',
        p_is_active
    );

END;

$$;


--
-- Name: fn_set_supplier_status(text, bigint, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_set_supplier_status(p_token text, p_supplier_id bigint, p_is_active boolean) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$

DECLARE
    v_auth JSONB;
    v_user_id BIGINT;

BEGIN

    -- ==========================================
    -- 1. TOKEN
    -- ==========================================

    v_auth :=
        public.fn_validate_token(
            p_token
        );


    IF (
        v_auth ->> 'success'
    )::BOOLEAN IS NOT TRUE THEN

        RETURN v_auth;

    END IF;


    v_user_id :=
        (
            v_auth ->> 'user_id'
        )::BIGINT;


    -- ==========================================
    -- 2. STATUS REQUIRED
    -- ==========================================

    IF p_is_active IS NULL THEN

        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'Trạng thái nhà cung cấp không hợp lệ'
        );

    END IF;


    -- ==========================================
    -- 3. UPDATE
    -- ==========================================

    UPDATE suppliers

    SET
        is_active =
            p_is_active,

        updated_by =
            v_user_id,

        updated_at =
            NOW()

    WHERE id =
        p_supplier_id;


    IF NOT FOUND THEN

        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'Không tìm thấy nhà cung cấp'
        );

    END IF;


    RETURN jsonb_build_object(
        'success', TRUE,

        'message',
        CASE

            WHEN p_is_active THEN
                'Đã kích hoạt nhà cung cấp'

            ELSE
                'Đã ngừng hoạt động nhà cung cấp'

        END,

        'supplier_id',
        p_supplier_id,

        'is_active',
        p_is_active
    );

END;

$$;


--
-- Name: fn_submit_purchase_receipt(text, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_submit_purchase_receipt(p_token text, p_receipt_id bigint) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$

DECLARE
    v_auth JSONB;

BEGIN

    -- =====================================================
    -- 1. TOKEN
    -- =====================================================

    v_auth :=
        public.fn_validate_token(
            p_token
        );

    IF (v_auth ->> 'success')::BOOLEAN IS NOT TRUE THEN
        RETURN v_auth;
    END IF;


    -- =====================================================
    -- 2. LOCK PHIẾU DRAFT
    -- =====================================================

    PERFORM 1

    FROM purchase_receipts

    WHERE id = p_receipt_id
      AND status = 'DRAFT'

    FOR UPDATE;


    IF NOT FOUND THEN

        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'Phiếu không tồn tại hoặc không còn ở trạng thái nháp'
        );

    END IF;


    -- =====================================================
    -- 3. PHẢI CÓ ITEM
    -- =====================================================

    IF NOT EXISTS (

        SELECT 1

        FROM purchase_receipt_items

        WHERE receipt_id =
            p_receipt_id

    ) THEN

        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'Phiếu nhập chưa có thuốc'
        );

    END IF;


    -- =====================================================
    -- 4. DRAFT → PENDING
    -- =====================================================

    UPDATE purchase_receipts

    SET status =
        'PENDING'

    WHERE id =
        p_receipt_id

      AND status =
        'DRAFT';


    IF NOT FOUND THEN

        RAISE EXCEPTION
            'Trạng thái phiếu nhập đã thay đổi trong quá trình gửi duyệt';

    END IF;


    -- =====================================================
    -- 5. RESPONSE
    -- =====================================================

    RETURN jsonb_build_object(
        'success', TRUE,
        'message',
        'Phiếu nhập đã được gửi duyệt',
        'receipt_id',
        p_receipt_id,
        'status',
        'PENDING'
    );

END;

$$;


--
-- Name: fn_submit_supplier_return(text, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_submit_supplier_return(p_token text, p_return_id bigint) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$

DECLARE
    v_auth JSONB;

BEGIN

    -- =====================================================
    -- 1. TOKEN
    -- =====================================================

    v_auth :=
        public.fn_validate_token(
            p_token
        );

    IF (v_auth ->> 'success')::BOOLEAN IS NOT TRUE THEN
        RETURN v_auth;
    END IF;


    -- =====================================================
    -- 2. LOCK PHIẾU DRAFT
    -- =====================================================

    PERFORM 1

    FROM supplier_returns

    WHERE id = p_return_id
      AND status = 'DRAFT'

    FOR UPDATE;


    IF NOT FOUND THEN

        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'Phiếu trả không tồn tại hoặc không còn ở trạng thái nháp'
        );

    END IF;


    -- =====================================================
    -- 3. PHẢI CÓ ITEM
    -- =====================================================

    IF NOT EXISTS (

        SELECT 1

        FROM supplier_return_items

        WHERE return_id =
            p_return_id

    ) THEN

        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'Phiếu trả chưa có thuốc'
        );

    END IF;


    -- =====================================================
    -- 4. DRAFT → PENDING
    -- =====================================================

    UPDATE supplier_returns

    SET status =
        'PENDING'

    WHERE id =
        p_return_id

      AND status =
        'DRAFT';


    IF NOT FOUND THEN

        RAISE EXCEPTION
            'Trạng thái phiếu trả đã thay đổi trong quá trình gửi duyệt';

    END IF;


    -- =====================================================
    -- 5. RESPONSE
    -- =====================================================

    RETURN jsonb_build_object(
        'success', TRUE,
        'message',
        'Phiếu trả đã được gửi duyệt',
        'return_id',
        p_return_id,
        'status',
        'PENDING'
    );

END;

$$;


--
-- Name: fn_transfer_stock(text, bigint, bigint, bigint, numeric, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_transfer_stock(p_token text, p_source_warehouse_id bigint, p_destination_warehouse_id bigint, p_batch_id bigint, p_quantity numeric, p_note text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_auth JSONB;

    v_user_id BIGINT;

    v_transfer_id BIGINT;

    v_source_quantity NUMERIC;

    v_medicine_name TEXT;

    v_lot_number TEXT;

BEGIN

    -- =====================================================
    -- 1. KIỂM TRA TOKEN
    -- =====================================================

    v_auth := public.fn_validate_token(p_token);

    IF (v_auth ->> 'success')::BOOLEAN IS NOT TRUE THEN
        RETURN v_auth;
    END IF;

    v_user_id :=
        (v_auth ->> 'user_id')::BIGINT;


    -- =====================================================
    -- 2. KIỂM TRA KHO NGUỒN
    -- =====================================================

    IF NOT EXISTS (
        SELECT 1
        FROM warehouses
        WHERE id = p_source_warehouse_id
          AND is_active = TRUE
    ) THEN

        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'Kho nguồn không tồn tại hoặc đã ngừng hoạt động'
        );

    END IF;


    -- =====================================================
    -- 3. KIỂM TRA KHO ĐÍCH
    -- =====================================================

    IF NOT EXISTS (
        SELECT 1
        FROM warehouses
        WHERE id = p_destination_warehouse_id
          AND is_active = TRUE
    ) THEN

        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'Kho đích không tồn tại hoặc đã ngừng hoạt động'
        );

    END IF;


    -- =====================================================
    -- 4. KHÔNG ĐƯỢC CHUYỂN CÙNG MỘT KHO
    -- =====================================================

    IF p_source_warehouse_id =
       p_destination_warehouse_id THEN

        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'Kho nguồn và kho đích không được giống nhau'
        );

    END IF;


    -- =====================================================
    -- 5. SỐ LƯỢNG PHẢI > 0
    -- =====================================================

    IF p_quantity IS NULL
       OR p_quantity <= 0 THEN

        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'Số lượng chuyển phải lớn hơn 0'
        );

    END IF;


    -- =====================================================
    -- 6. KIỂM TRA LÔ
    -- =====================================================

    SELECT
        m.name,
        b.lot_number

    INTO
        v_medicine_name,
        v_lot_number

    FROM batches b

    JOIN medicines m
        ON m.id = b.medicine_id

    WHERE b.id = p_batch_id;


    IF NOT FOUND THEN

        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'Không tìm thấy lô thuốc'
        );

    END IF;


    -- =====================================================
    -- 7. LẤY TỒN KHO NGUỒN
    -- FOR UPDATE để khóa dòng trong transaction
    -- =====================================================

    SELECT quantity
    INTO v_source_quantity

    FROM inventory

    WHERE warehouse_id =
              p_source_warehouse_id

      AND batch_id =
              p_batch_id

    FOR UPDATE;


    IF NOT FOUND THEN

        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'Lô thuốc này không tồn tại trong kho nguồn'
        );

    END IF;


    -- =====================================================
    -- 8. KIỂM TRA ĐỦ TỒN
    -- =====================================================

    IF v_source_quantity < p_quantity THEN

        RETURN jsonb_build_object(
            'success', FALSE,

            'message',
            'Số lượng tồn kho không đủ',

            'current_quantity',
            v_source_quantity,

            'requested_quantity',
            p_quantity
        );

    END IF;


    -- =====================================================
    -- 9. TẠO PHIẾU CHUYỂN
    -- =====================================================

    INSERT INTO warehouse_transfers (
        source_warehouse_id,
        destination_warehouse_id,
        status,
        note,
        created_by
    )
    VALUES (
        p_source_warehouse_id,
        p_destination_warehouse_id,
        'COMPLETED',
        NULLIF(TRIM(p_note), ''),
        v_user_id
    )
    RETURNING id
    INTO v_transfer_id;


    -- =====================================================
    -- 10. THÊM CHI TIẾT
    -- =====================================================

    INSERT INTO warehouse_transfer_items (
        transfer_id,
        batch_id,
        quantity
    )
    VALUES (
        v_transfer_id,
        p_batch_id,
        p_quantity
    );


    -- =====================================================
    -- 11. TRỪ KHO NGUỒN
    -- =====================================================

    UPDATE inventory
    SET
        quantity =
            quantity - p_quantity,

        updated_at = NOW()

    WHERE warehouse_id =
              p_source_warehouse_id

      AND batch_id =
              p_batch_id;


    -- =====================================================
    -- 12. CỘNG KHO ĐÍCH
    -- =====================================================

    INSERT INTO inventory (
        warehouse_id,
        batch_id,
        quantity
    )
    VALUES (
        p_destination_warehouse_id,
        p_batch_id,
        p_quantity
    )

    ON CONFLICT (
        warehouse_id,
        batch_id
    )

    DO UPDATE
    SET
        quantity =
            inventory.quantity
            + EXCLUDED.quantity,

        updated_at = NOW();


    -- =====================================================
    -- 13. GHI LỊCH SỬ XUẤT KHỎI KHO NGUỒN
    -- =====================================================

    INSERT INTO stock_movements (
        warehouse_id,
        batch_id,
        movement_type,
        quantity,
        reference_type,
        reference_id,
        created_by,
        note
    )
    VALUES (
        p_source_warehouse_id,
        p_batch_id,
        'TRANSFER_OUT',
        p_quantity,
        'WAREHOUSE_TRANSFER',
        v_transfer_id,
        v_user_id,
        'Chuyển thuốc sang kho khác'
    );


    -- =====================================================
    -- 14. GHI LỊCH SỬ NHẬP KHO ĐÍCH
    -- =====================================================

    INSERT INTO stock_movements (
        warehouse_id,
        batch_id,
        movement_type,
        quantity,
        reference_type,
        reference_id,
        created_by,
        note
    )
    VALUES (
        p_destination_warehouse_id,
        p_batch_id,
        'TRANSFER_IN',
        p_quantity,
        'WAREHOUSE_TRANSFER',
        v_transfer_id,
        v_user_id,
        'Nhận thuốc từ kho khác'
    );


    -- =====================================================
    -- 15. KẾT QUẢ
    -- =====================================================

    RETURN jsonb_build_object(
        'success', TRUE,

        'message',
        'Chuyển kho thành công',

        'transfer_id',
        v_transfer_id,

        'medicine_name',
        v_medicine_name,

        'lot_number',
        v_lot_number,

        'quantity',
        p_quantity,

        'source_quantity_before',
        v_source_quantity,

        'source_quantity_after',
        v_source_quantity - p_quantity
    );

END;
$$;


--
-- Name: fn_update_medicine(text, bigint, text, text, text, text, text, text, text, text, text, text, text, bigint, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_update_medicine(p_token text, p_medicine_id bigint, p_name text, p_active_ingredient text, p_strength text, p_dosage_form text, p_unit text, p_route_of_administration text, p_usage_instructions text, p_packaging text, p_manufacturer text, p_country_of_origin text, p_registration_number text, p_supplier_id bigint, p_note text) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$

DECLARE
    v_auth JSONB;
    v_user_id BIGINT;
    v_registration_number TEXT;

BEGIN

    -- 1. TOKEN
    v_auth :=
        public.fn_validate_token(
            p_token
        );

    IF (v_auth ->> 'success')::BOOLEAN IS NOT TRUE THEN
        RETURN v_auth;
    END IF;

    v_user_id :=
        (v_auth ->> 'user_id')::BIGINT;


    -- 2. THUỐC TỒN TẠI
    IF NOT EXISTS (
        SELECT 1
        FROM medicines
        WHERE id = p_medicine_id
    ) THEN

        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'Không tìm thấy thuốc'
        );

    END IF;


    -- 3. TÊN THUỐC
    IF p_name IS NULL
       OR TRIM(p_name) = '' THEN

        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'Tên thuốc không được để trống'
        );

    END IF;


    -- 4. HOẠT CHẤT
    IF p_active_ingredient IS NULL
       OR TRIM(p_active_ingredient) = '' THEN

        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'Hoạt chất không được để trống'
        );

    END IF;


    -- 5. NCC TỒN TẠI + ACTIVE
    IF NOT EXISTS (
        SELECT 1
        FROM suppliers
        WHERE id = p_supplier_id
          AND is_active = TRUE
    ) THEN

        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'Nhà cung cấp không tồn tại hoặc đã ngừng hoạt động'
        );

    END IF;


    -- 6. SỐ ĐĂNG KÝ
    v_registration_number :=
        NULLIF(
            TRIM(p_registration_number),
            ''
        );


    IF v_registration_number IS NOT NULL
       AND EXISTS (
            SELECT 1
            FROM medicines
            WHERE registration_number =
                  v_registration_number
              AND id <> p_medicine_id
       ) THEN

        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'Số đăng ký thuốc đã tồn tại'
        );

    END IF;


    -- 7. UPDATE
    UPDATE medicines

    SET
        name =
            TRIM(p_name),

        active_ingredient =
            TRIM(p_active_ingredient),

        strength =
            NULLIF(TRIM(p_strength), ''),

        dosage_form =
            NULLIF(TRIM(p_dosage_form), ''),

        unit =
            NULLIF(TRIM(p_unit), ''),

        route_of_administration =
            NULLIF(
                TRIM(p_route_of_administration),
                ''
            ),

        usage_instructions =
            NULLIF(
                TRIM(p_usage_instructions),
                ''
            ),

        packaging =
            NULLIF(TRIM(p_packaging), ''),

        manufacturer =
            NULLIF(TRIM(p_manufacturer), ''),

        country_of_origin =
            NULLIF(TRIM(p_country_of_origin), ''),

        registration_number =
            v_registration_number,

        supplier_id =
            p_supplier_id,

        note =
            NULLIF(TRIM(p_note), ''),

        updated_by =
            v_user_id,

        updated_at =
            NOW()

    WHERE id =
        p_medicine_id;


    IF NOT FOUND THEN

        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'Không tìm thấy thuốc'
        );

    END IF;


    RETURN jsonb_build_object(
        'success', TRUE,
        'message',
        'Cập nhật thuốc thành công',
        'medicine_id',
        p_medicine_id
    );


EXCEPTION

    WHEN unique_violation THEN

        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'Mã thuốc hoặc số đăng ký thuốc đã tồn tại'
        );

END;

$$;


--
-- Name: fn_update_profile(text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_update_profile(p_token text, p_full_name text DEFAULT NULL::text, p_email text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_address text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql
    AS $_$

DECLARE
    v_token_result JSONB;
    v_user_id BIGINT;
    v_email TEXT;

BEGIN

    -- ==========================================
    -- 1. TOKEN
    -- ==========================================

    v_token_result :=
        public.fn_validate_token(
            p_token
        );


    IF (
        v_token_result ->> 'success'
    )::BOOLEAN IS NOT TRUE THEN

        RETURN v_token_result;

    END IF;


    v_user_id :=
        (
            v_token_result
            ->> 'user_id'
        )::BIGINT;


    -- ==========================================
    -- 2. FULL NAME
    -- ==========================================

    IF p_full_name IS NOT NULL
       AND TRIM(p_full_name) = '' THEN

        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'Full name cannot be empty'
        );

    END IF;


    -- ==========================================
    -- 3. EMAIL
    -- ==========================================

    IF p_email IS NOT NULL THEN

        v_email :=
            LOWER(
                TRIM(p_email)
            );


        IF v_email = '' THEN

            RETURN jsonb_build_object(
                'success', FALSE,
                'message',
                'Email cannot be empty'
            );

        END IF;


        IF v_email !~
           '^[A-Za-z0-9._%+]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
        THEN

            RETURN jsonb_build_object(
                'success', FALSE,
                'message',
                'Invalid email format'
            );

        END IF;


        IF EXISTS (

            SELECT 1

            FROM users

            WHERE LOWER(email) =
                  v_email

              AND id <>
                  v_user_id

        ) THEN

            RETURN jsonb_build_object(
                'success', FALSE,
                'message',
                'Email already exists'
            );

        END IF;

    END IF;


    -- ==========================================
    -- 4. UPDATE
    -- ==========================================

    UPDATE users

    SET
        full_name =
            COALESCE(
                TRIM(p_full_name),
                full_name
            ),

        email =
            COALESCE(
                v_email,
                email
            ),

        phone =
            CASE
                WHEN p_phone IS NULL
                    THEN phone
                ELSE NULLIF(
                    TRIM(p_phone),
                    ''
                )
            END,

        address =
            CASE
                WHEN p_address IS NULL
                    THEN address
                ELSE NULLIF(
                    TRIM(p_address),
                    ''
                )
            END,

        updated_at =
            NOW()

    WHERE id =
        v_user_id;


    IF NOT FOUND THEN

        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'User not found'
        );

    END IF;


    RETURN jsonb_build_object(
        'success', TRUE,
        'message',
        'Profile updated successfully',
        'user_id',
        v_user_id
    );


EXCEPTION

    WHEN unique_violation THEN

        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'Email already exists'
        );

END;

$_$;


--
-- Name: fn_update_supplier(text, bigint, text, text, text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_update_supplier(p_token text, p_supplier_id bigint, p_name text, p_address text, p_phone text, p_email text, p_tax_code text, p_contact_person text, p_note text) RETURNS jsonb
    LANGUAGE plpgsql
    AS $_$

DECLARE
    v_auth JSONB;
    v_user_id BIGINT;

    v_email TEXT;
    v_tax_code TEXT;

BEGIN

    -- ==========================================
    -- 1. TOKEN
    -- ==========================================

    v_auth :=
        public.fn_validate_token(
            p_token
        );


    IF (
        v_auth ->> 'success'
    )::BOOLEAN IS NOT TRUE THEN

        RETURN v_auth;

    END IF;


    v_user_id :=
        (
            v_auth ->> 'user_id'
        )::BIGINT;


    -- ==========================================
    -- 2. SUPPLIER EXISTS
    -- ==========================================

    IF NOT EXISTS (

        SELECT 1

        FROM suppliers

        WHERE id =
            p_supplier_id

    ) THEN

        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'Không tìm thấy nhà cung cấp'
        );

    END IF;


    -- ==========================================
    -- 3. NAME
    -- ==========================================

    IF p_name IS NULL
       OR TRIM(p_name) = '' THEN

        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'Tên nhà cung cấp không được để trống'
        );

    END IF;


    -- ==========================================
    -- 4. EMAIL
    -- ==========================================

    v_email :=
        NULLIF(
            LOWER(
                TRIM(p_email)
            ),
            ''
        );


    IF v_email IS NOT NULL
       AND v_email !~
           '^[A-Za-z0-9._%+]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
    THEN

        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'Email nhà cung cấp không hợp lệ'
        );

    END IF;


    -- ==========================================
    -- 5. TAX CODE
    -- ==========================================

    v_tax_code :=
        NULLIF(
            TRIM(p_tax_code),
            ''
        );


    IF v_tax_code IS NOT NULL
       AND EXISTS (

            SELECT 1

            FROM suppliers

            WHERE tax_code =
                v_tax_code

              AND id <>
                p_supplier_id

       ) THEN

        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'Mã số thuế đã được sử dụng'
        );

    END IF;


    -- ==========================================
    -- 6. UPDATE
    -- ==========================================

    UPDATE suppliers

    SET
        name =
            TRIM(p_name),

        address =
            NULLIF(
                TRIM(p_address),
                ''
            ),

        phone =
            NULLIF(
                TRIM(p_phone),
                ''
            ),

        email =
            v_email,

        tax_code =
            v_tax_code,

        contact_person =
            NULLIF(
                TRIM(p_contact_person),
                ''
            ),

        note =
            NULLIF(
                TRIM(p_note),
                ''
            ),

        updated_by =
            v_user_id,

        updated_at =
            NOW()

    WHERE id =
        p_supplier_id;


    IF NOT FOUND THEN

        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'Không tìm thấy nhà cung cấp'
        );

    END IF;


    RETURN jsonb_build_object(
        'success', TRUE,
        'message',
        'Cập nhật nhà cung cấp thành công',
        'supplier_id',
        p_supplier_id
    );


EXCEPTION

    WHEN unique_violation THEN

        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'Mã nhà cung cấp hoặc mã số thuế đã tồn tại'
        );

END;

$_$;


--
-- Name: fn_validate_password(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_validate_password(p_password text) RETURNS boolean
    LANGUAGE plpgsql IMMUTABLE
    AS $$

BEGIN

    RETURN
        p_password IS NOT NULL

        AND CHAR_LENGTH(
            p_password
        ) >= 8

        AND OCTET_LENGTH(
            p_password
        ) <= 72

        AND p_password
            ~ '[A-Za-z]'

        AND p_password
            ~ '[0-9]'

        AND p_password
            ~ '[^A-Za-z0-9[:space:]]'

        AND p_password
            !~ '[[:space:]]';

END;

$$;


--
-- Name: fn_validate_token(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_validate_token(p_token text) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$

DECLARE
    v_token auth_tokens%ROWTYPE;
    v_user_active BOOLEAN;

BEGIN

    -- ==========================================
    -- 1. TOKEN BẮT BUỘC
    -- ==========================================

    IF p_token IS NULL
       OR TRIM(p_token) = '' THEN

        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'Invalid token'
        );

    END IF;


    -- ==========================================
    -- 2. TÌM TOKEN
    -- ==========================================

    SELECT *
    INTO v_token
    FROM auth_tokens
    WHERE token_hash =
        encode(
            digest(p_token, 'sha256'),
            'hex'
        );


    IF NOT FOUND THEN

        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'Invalid token'
        );

    END IF;


    -- ==========================================
    -- 3. TOKEN ĐÃ REVOKE
    -- ==========================================

    IF v_token.is_revoked = TRUE THEN

        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'Token has been revoked'
        );

    END IF;


    -- ==========================================
    -- 4. TOKEN HẾT HẠN
    -- ==========================================

    IF v_token.expires_at IS NOT NULL
       AND v_token.expires_at <= NOW() THEN

        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'Token expired'
        );

    END IF;


    -- ==========================================
    -- 5. USER PHẢI CÒN ACTIVE
    -- ==========================================

    SELECT is_active
    INTO v_user_active
    FROM users
    WHERE id = v_token.user_id;


    IF NOT FOUND THEN

        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'User not found'
        );

    END IF;


    IF v_user_active IS NOT TRUE THEN

        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'Account is inactive'
        );

    END IF;


    -- ==========================================
    -- 6. UPDATE LAST USED
    -- ==========================================

    UPDATE auth_tokens
    SET last_used_at = NOW()
    WHERE id = v_token.id;


    RETURN jsonb_build_object(
        'success', TRUE,
        'message', 'Token valid',
        'user_id', v_token.user_id,
        'token_type', v_token.token_type
    );

END;

$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: auth_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_tokens (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    token_hash text NOT NULL,
    token_type character varying(20) DEFAULT 'access'::character varying NOT NULL,
    expires_at timestamp with time zone,
    is_revoked boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_used_at timestamp with time zone
);


--
-- Name: auth_tokens_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.auth_tokens_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: auth_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.auth_tokens_id_seq OWNED BY public.auth_tokens.id;


--
-- Name: batches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.batches (
    id bigint NOT NULL,
    medicine_id bigint NOT NULL,
    lot_number character varying(100) NOT NULL,
    expiry_date date NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: batches_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.batches_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: batches_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.batches_id_seq OWNED BY public.batches.id;


--
-- Name: inventory; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory (
    id bigint NOT NULL,
    warehouse_id bigint NOT NULL,
    batch_id bigint NOT NULL,
    quantity numeric(14,3) DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_inventory_quantity CHECK ((quantity >= (0)::numeric))
);


--
-- Name: inventory_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.inventory_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: inventory_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.inventory_id_seq OWNED BY public.inventory.id;


--
-- Name: medicines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.medicines (
    id bigint NOT NULL,
    medicine_code character varying(20) GENERATED ALWAYS AS (('T'::text || lpad((id)::text, 6, '0'::text))) STORED,
    name character varying(200) NOT NULL,
    active_ingredient character varying(200) NOT NULL,
    strength character varying(100),
    dosage_form character varying(100),
    unit character varying(50),
    route_of_administration character varying(100),
    usage_instructions text,
    packaging character varying(200),
    manufacturer character varying(200),
    country_of_origin character varying(100),
    registration_number character varying(100),
    supplier_id bigint NOT NULL,
    note text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by bigint,
    updated_by bigint
);


--
-- Name: medicines_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.medicines_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: medicines_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.medicines_id_seq OWNED BY public.medicines.id;


--
-- Name: purchase_receipt_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchase_receipt_items (
    id bigint NOT NULL,
    receipt_id bigint NOT NULL,
    medicine_id bigint NOT NULL,
    lot_number character varying(100) NOT NULL,
    expiry_date date NOT NULL,
    quantity numeric(14,3) NOT NULL,
    unit_price numeric(14,2) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_receipt_item_price CHECK ((unit_price >= (0)::numeric)),
    CONSTRAINT chk_receipt_item_quantity CHECK ((quantity > (0)::numeric))
);


--
-- Name: purchase_receipt_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.purchase_receipt_items_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: purchase_receipt_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.purchase_receipt_items_id_seq OWNED BY public.purchase_receipt_items.id;


--
-- Name: purchase_receipts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchase_receipts (
    id bigint NOT NULL,
    receipt_code character varying(30) GENERATED ALWAYS AS (('PN'::text || lpad((id)::text, 6, '0'::text))) STORED,
    supplier_id bigint NOT NULL,
    invoice_number character varying(100) NOT NULL,
    invoice_serial character varying(100),
    invoice_date date,
    receipt_date date DEFAULT CURRENT_DATE NOT NULL,
    note text,
    status character varying(20) DEFAULT 'DRAFT'::character varying NOT NULL,
    created_by bigint,
    approved_by bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    approved_at timestamp with time zone,
    rejected_by bigint,
    rejected_at timestamp with time zone,
    rejection_reason text,
    CONSTRAINT chk_receipt_status CHECK (((status)::text = ANY ((ARRAY['DRAFT'::character varying, 'PENDING'::character varying, 'APPROVED'::character varying, 'REJECTED'::character varying])::text[])))
);


--
-- Name: purchase_receipts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.purchase_receipts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: purchase_receipts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.purchase_receipts_id_seq OWNED BY public.purchase_receipts.id;


--
-- Name: stock_movements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_movements (
    id bigint NOT NULL,
    warehouse_id bigint NOT NULL,
    batch_id bigint NOT NULL,
    movement_type character varying(30) NOT NULL,
    quantity numeric(14,3) NOT NULL,
    reference_type character varying(50),
    reference_id bigint,
    note text,
    created_by bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: stock_movements_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.stock_movements_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: stock_movements_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.stock_movements_id_seq OWNED BY public.stock_movements.id;


--
-- Name: supplier_return_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.supplier_return_items (
    id bigint NOT NULL,
    return_id bigint NOT NULL,
    batch_id bigint NOT NULL,
    quantity numeric(14,3) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_supplier_return_quantity CHECK ((quantity > (0)::numeric))
);


--
-- Name: supplier_return_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.supplier_return_items_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: supplier_return_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.supplier_return_items_id_seq OWNED BY public.supplier_return_items.id;


--
-- Name: supplier_returns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.supplier_returns (
    id bigint NOT NULL,
    return_code character varying(30) GENERATED ALWAYS AS (('TNCC'::text || lpad((id)::text, 6, '0'::text))) STORED,
    supplier_id bigint NOT NULL,
    warehouse_id bigint NOT NULL,
    return_date date DEFAULT CURRENT_DATE NOT NULL,
    reason text NOT NULL,
    note text,
    status character varying(20) DEFAULT 'DRAFT'::character varying NOT NULL,
    created_by bigint,
    approved_by bigint,
    approved_at timestamp with time zone,
    rejected_by bigint,
    rejected_at timestamp with time zone,
    rejection_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_supplier_return_status CHECK (((status)::text = ANY ((ARRAY['DRAFT'::character varying, 'PENDING'::character varying, 'APPROVED'::character varying, 'REJECTED'::character varying])::text[])))
);


--
-- Name: supplier_returns_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.supplier_returns_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: supplier_returns_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.supplier_returns_id_seq OWNED BY public.supplier_returns.id;


--
-- Name: suppliers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.suppliers (
    id bigint NOT NULL,
    supplier_code character varying(20) GENERATED ALWAYS AS (('NCC'::text || lpad((id)::text, 6, '0'::text))) STORED,
    name character varying(200) NOT NULL,
    address text,
    phone character varying(20),
    email character varying(150),
    tax_code character varying(50),
    contact_person character varying(100),
    note text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by bigint,
    updated_by bigint
);


--
-- Name: suppliers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.suppliers_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: suppliers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.suppliers_id_seq OWNED BY public.suppliers.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id bigint NOT NULL,
    full_name character varying(100) NOT NULL,
    email character varying(150) NOT NULL,
    password_hash text NOT NULL,
    phone character varying(20),
    address text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    last_login_at timestamp with time zone,
    last_logout_at timestamp with time zone
);


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.users_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: warehouse_transfer_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.warehouse_transfer_items (
    id bigint NOT NULL,
    transfer_id bigint NOT NULL,
    batch_id bigint NOT NULL,
    quantity numeric(14,3) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_transfer_item_quantity CHECK ((quantity > (0)::numeric))
);


--
-- Name: warehouse_transfer_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.warehouse_transfer_items_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: warehouse_transfer_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.warehouse_transfer_items_id_seq OWNED BY public.warehouse_transfer_items.id;


--
-- Name: warehouse_transfers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.warehouse_transfers (
    id bigint NOT NULL,
    transfer_code character varying(30) GENERATED ALWAYS AS (('CK'::text || lpad((id)::text, 6, '0'::text))) STORED,
    source_warehouse_id bigint NOT NULL,
    destination_warehouse_id bigint NOT NULL,
    transfer_date timestamp with time zone DEFAULT now() NOT NULL,
    status character varying(20) DEFAULT 'COMPLETED'::character varying NOT NULL,
    note text,
    created_by bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_transfer_different_warehouse CHECK ((source_warehouse_id <> destination_warehouse_id)),
    CONSTRAINT chk_transfer_status CHECK (((status)::text = ANY ((ARRAY['COMPLETED'::character varying, 'CANCELLED'::character varying])::text[])))
);


--
-- Name: warehouse_transfers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.warehouse_transfers_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: warehouse_transfers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.warehouse_transfers_id_seq OWNED BY public.warehouse_transfers.id;


--
-- Name: warehouses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.warehouses (
    id bigint NOT NULL,
    warehouse_code character varying(20) NOT NULL,
    name character varying(100) NOT NULL,
    warehouse_type character varying(20) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_warehouse_type CHECK (((warehouse_type)::text = ANY ((ARRAY['MAIN'::character varying, 'SALE'::character varying])::text[])))
);


--
-- Name: warehouses_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.warehouses_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: warehouses_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.warehouses_id_seq OWNED BY public.warehouses.id;


--
-- Name: auth_tokens id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_tokens ALTER COLUMN id SET DEFAULT nextval('public.auth_tokens_id_seq'::regclass);


--
-- Name: batches id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.batches ALTER COLUMN id SET DEFAULT nextval('public.batches_id_seq'::regclass);


--
-- Name: inventory id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory ALTER COLUMN id SET DEFAULT nextval('public.inventory_id_seq'::regclass);


--
-- Name: medicines id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medicines ALTER COLUMN id SET DEFAULT nextval('public.medicines_id_seq'::regclass);


--
-- Name: purchase_receipt_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_receipt_items ALTER COLUMN id SET DEFAULT nextval('public.purchase_receipt_items_id_seq'::regclass);


--
-- Name: purchase_receipts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_receipts ALTER COLUMN id SET DEFAULT nextval('public.purchase_receipts_id_seq'::regclass);


--
-- Name: stock_movements id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements ALTER COLUMN id SET DEFAULT nextval('public.stock_movements_id_seq'::regclass);


--
-- Name: supplier_return_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_return_items ALTER COLUMN id SET DEFAULT nextval('public.supplier_return_items_id_seq'::regclass);


--
-- Name: supplier_returns id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_returns ALTER COLUMN id SET DEFAULT nextval('public.supplier_returns_id_seq'::regclass);


--
-- Name: suppliers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers ALTER COLUMN id SET DEFAULT nextval('public.suppliers_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: warehouse_transfer_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_transfer_items ALTER COLUMN id SET DEFAULT nextval('public.warehouse_transfer_items_id_seq'::regclass);


--
-- Name: warehouse_transfers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_transfers ALTER COLUMN id SET DEFAULT nextval('public.warehouse_transfers_id_seq'::regclass);


--
-- Name: warehouses id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouses ALTER COLUMN id SET DEFAULT nextval('public.warehouses_id_seq'::regclass);


--
-- Name: auth_tokens auth_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_tokens
    ADD CONSTRAINT auth_tokens_pkey PRIMARY KEY (id);


--
-- Name: auth_tokens auth_tokens_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_tokens
    ADD CONSTRAINT auth_tokens_token_hash_key UNIQUE (token_hash);


--
-- Name: batches batches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.batches
    ADD CONSTRAINT batches_pkey PRIMARY KEY (id);


--
-- Name: inventory inventory_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory
    ADD CONSTRAINT inventory_pkey PRIMARY KEY (id);


--
-- Name: medicines medicines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medicines
    ADD CONSTRAINT medicines_pkey PRIMARY KEY (id);


--
-- Name: purchase_receipt_items purchase_receipt_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_receipt_items
    ADD CONSTRAINT purchase_receipt_items_pkey PRIMARY KEY (id);


--
-- Name: purchase_receipts purchase_receipts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_receipts
    ADD CONSTRAINT purchase_receipts_pkey PRIMARY KEY (id);


--
-- Name: stock_movements stock_movements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_pkey PRIMARY KEY (id);


--
-- Name: supplier_return_items supplier_return_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_return_items
    ADD CONSTRAINT supplier_return_items_pkey PRIMARY KEY (id);


--
-- Name: supplier_returns supplier_returns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_returns
    ADD CONSTRAINT supplier_returns_pkey PRIMARY KEY (id);


--
-- Name: suppliers suppliers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_pkey PRIMARY KEY (id);


--
-- Name: inventory uq_inventory; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory
    ADD CONSTRAINT uq_inventory UNIQUE (warehouse_id, batch_id);


--
-- Name: batches uq_medicine_batch; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.batches
    ADD CONSTRAINT uq_medicine_batch UNIQUE (medicine_id, lot_number, expiry_date);


--
-- Name: medicines uq_medicines_code; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medicines
    ADD CONSTRAINT uq_medicines_code UNIQUE (medicine_code);


--
-- Name: medicines uq_medicines_registration_number; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medicines
    ADD CONSTRAINT uq_medicines_registration_number UNIQUE (registration_number);


--
-- Name: purchase_receipts uq_purchase_receipt_code; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_receipts
    ADD CONSTRAINT uq_purchase_receipt_code UNIQUE (receipt_code);


--
-- Name: supplier_return_items uq_supplier_return_batch; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_return_items
    ADD CONSTRAINT uq_supplier_return_batch UNIQUE (return_id, batch_id);


--
-- Name: supplier_returns uq_supplier_return_code; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_returns
    ADD CONSTRAINT uq_supplier_return_code UNIQUE (return_code);


--
-- Name: suppliers uq_suppliers_code; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT uq_suppliers_code UNIQUE (supplier_code);


--
-- Name: suppliers uq_suppliers_tax_code; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT uq_suppliers_tax_code UNIQUE (tax_code);


--
-- Name: warehouse_transfers uq_warehouse_transfer_code; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_transfers
    ADD CONSTRAINT uq_warehouse_transfer_code UNIQUE (transfer_code);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: warehouse_transfer_items warehouse_transfer_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_transfer_items
    ADD CONSTRAINT warehouse_transfer_items_pkey PRIMARY KEY (id);


--
-- Name: warehouse_transfers warehouse_transfers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_transfers
    ADD CONSTRAINT warehouse_transfers_pkey PRIMARY KEY (id);


--
-- Name: warehouses warehouses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouses
    ADD CONSTRAINT warehouses_pkey PRIMARY KEY (id);


--
-- Name: warehouses warehouses_warehouse_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouses
    ADD CONSTRAINT warehouses_warehouse_code_key UNIQUE (warehouse_code);


--
-- Name: idx_stock_movements_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_movements_created_by ON public.stock_movements USING btree (created_by);


--
-- Name: auth_tokens fk_auth_tokens_user; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_tokens
    ADD CONSTRAINT fk_auth_tokens_user FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: batches fk_batch_medicine; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.batches
    ADD CONSTRAINT fk_batch_medicine FOREIGN KEY (medicine_id) REFERENCES public.medicines(id) ON DELETE RESTRICT;


--
-- Name: inventory fk_inventory_batch; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory
    ADD CONSTRAINT fk_inventory_batch FOREIGN KEY (batch_id) REFERENCES public.batches(id) ON DELETE RESTRICT;


--
-- Name: inventory fk_inventory_warehouse; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory
    ADD CONSTRAINT fk_inventory_warehouse FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id) ON DELETE RESTRICT;


--
-- Name: medicines fk_medicines_created_by; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medicines
    ADD CONSTRAINT fk_medicines_created_by FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: medicines fk_medicines_supplier; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medicines
    ADD CONSTRAINT fk_medicines_supplier FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE RESTRICT;


--
-- Name: medicines fk_medicines_updated_by; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medicines
    ADD CONSTRAINT fk_medicines_updated_by FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: stock_movements fk_movement_batch; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT fk_movement_batch FOREIGN KEY (batch_id) REFERENCES public.batches(id);


--
-- Name: stock_movements fk_movement_user; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT fk_movement_user FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: stock_movements fk_movement_warehouse; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT fk_movement_warehouse FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id);


--
-- Name: purchase_receipts fk_receipt_approved_user; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_receipts
    ADD CONSTRAINT fk_receipt_approved_user FOREIGN KEY (approved_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: purchase_receipts fk_receipt_created_user; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_receipts
    ADD CONSTRAINT fk_receipt_created_user FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: purchase_receipt_items fk_receipt_item_medicine; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_receipt_items
    ADD CONSTRAINT fk_receipt_item_medicine FOREIGN KEY (medicine_id) REFERENCES public.medicines(id) ON DELETE RESTRICT;


--
-- Name: purchase_receipt_items fk_receipt_item_receipt; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_receipt_items
    ADD CONSTRAINT fk_receipt_item_receipt FOREIGN KEY (receipt_id) REFERENCES public.purchase_receipts(id) ON DELETE CASCADE;


--
-- Name: purchase_receipts fk_receipt_rejected_user; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_receipts
    ADD CONSTRAINT fk_receipt_rejected_user FOREIGN KEY (rejected_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: purchase_receipts fk_receipt_supplier; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_receipts
    ADD CONSTRAINT fk_receipt_supplier FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE RESTRICT;


--
-- Name: stock_movements fk_stock_movements_created_by; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT fk_stock_movements_created_by FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: supplier_returns fk_supplier_return_approved_by; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_returns
    ADD CONSTRAINT fk_supplier_return_approved_by FOREIGN KEY (approved_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: supplier_returns fk_supplier_return_created_by; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_returns
    ADD CONSTRAINT fk_supplier_return_created_by FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: supplier_return_items fk_supplier_return_item_batch; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_return_items
    ADD CONSTRAINT fk_supplier_return_item_batch FOREIGN KEY (batch_id) REFERENCES public.batches(id) ON DELETE RESTRICT;


--
-- Name: supplier_return_items fk_supplier_return_item_return; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_return_items
    ADD CONSTRAINT fk_supplier_return_item_return FOREIGN KEY (return_id) REFERENCES public.supplier_returns(id) ON DELETE CASCADE;


--
-- Name: supplier_returns fk_supplier_return_rejected_by; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_returns
    ADD CONSTRAINT fk_supplier_return_rejected_by FOREIGN KEY (rejected_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: supplier_returns fk_supplier_return_supplier; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_returns
    ADD CONSTRAINT fk_supplier_return_supplier FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE RESTRICT;


--
-- Name: supplier_returns fk_supplier_return_warehouse; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_returns
    ADD CONSTRAINT fk_supplier_return_warehouse FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id) ON DELETE RESTRICT;


--
-- Name: suppliers fk_suppliers_created_by; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT fk_suppliers_created_by FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: suppliers fk_suppliers_updated_by; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT fk_suppliers_updated_by FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: warehouse_transfers fk_transfer_created_by; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_transfers
    ADD CONSTRAINT fk_transfer_created_by FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: warehouse_transfers fk_transfer_destination_warehouse; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_transfers
    ADD CONSTRAINT fk_transfer_destination_warehouse FOREIGN KEY (destination_warehouse_id) REFERENCES public.warehouses(id) ON DELETE RESTRICT;


--
-- Name: warehouse_transfer_items fk_transfer_item_batch; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_transfer_items
    ADD CONSTRAINT fk_transfer_item_batch FOREIGN KEY (batch_id) REFERENCES public.batches(id) ON DELETE RESTRICT;


--
-- Name: warehouse_transfer_items fk_transfer_item_transfer; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_transfer_items
    ADD CONSTRAINT fk_transfer_item_transfer FOREIGN KEY (transfer_id) REFERENCES public.warehouse_transfers(id) ON DELETE CASCADE;


--
-- Name: warehouse_transfers fk_transfer_source_warehouse; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_transfers
    ADD CONSTRAINT fk_transfer_source_warehouse FOREIGN KEY (source_warehouse_id) REFERENCES public.warehouses(id) ON DELETE RESTRICT;


--
-- PostgreSQL database dump complete
--

\unrestrict 80vUDfHb4Gf6aefXpOMtw6DfZqWLU5U6HgcW7nC8Qk17enIVbyZpQjOPdiFNbPs

-- =========================================================
-- DEFAULT WAREHOUSES
-- Dữ liệu nền bắt buộc để hệ thống hoạt động
-- =========================================================

INSERT INTO public.warehouses (
    warehouse_code,
    name,
    warehouse_type,
    is_active
)
SELECT
    'KHO_CHINH',
    'Kho chính',
    'MAIN',
    TRUE
WHERE NOT EXISTS (
    SELECT 1
    FROM public.warehouses
    WHERE warehouse_code = 'KHO_CHINH'
);

INSERT INTO public.warehouses (
    warehouse_code,
    name,
    warehouse_type,
    is_active
)
SELECT
    'KHO_BAN',
    'Kho bán',
    'SALE',
    TRUE
WHERE NOT EXISTS (
    SELECT 1
    FROM public.warehouses
    WHERE warehouse_code = 'KHO_BAN'
);
