CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    phone VARCHAR(20),
    address TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at TIMESTAMPTZ,
    last_logout_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS auth_tokens (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    token_type VARCHAR(20) NOT NULL DEFAULT 'access',
    expires_at TIMESTAMPTZ,
    is_revoked BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ,
    CONSTRAINT fk_auth_tokens_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE OR REPLACE FUNCTION public.fn_validate_password(p_password TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
    RETURN p_password IS NOT NULL
        AND CHAR_LENGTH(p_password) >= 8
        AND p_password ~ '[A-Za-z]'
        AND p_password ~ '[0-9]'
        AND p_password ~ '[^A-Za-z0-9[:space:]]'
        AND p_password !~ '[[:space:]]';
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_register_user(
    p_full_name TEXT,
    p_email TEXT,
    p_password TEXT,
    p_phone TEXT DEFAULT NULL,
    p_address TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_user_id BIGINT;
    v_email TEXT;
BEGIN
    v_email := LOWER(TRIM(p_email));

    IF p_full_name IS NULL OR TRIM(p_full_name) = '' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Full name is required');
    END IF;

    IF v_email IS NULL OR v_email = '' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Email is required');
    END IF;

    IF NOT public.fn_validate_password(p_password) THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Password must be at least 8 characters and contain a letter, number and special character'
        );
    END IF;

    IF EXISTS (SELECT 1 FROM users WHERE email = v_email) THEN
        RETURN jsonb_build_object('success', false, 'message', 'Email already exists');
    END IF;

    INSERT INTO users(full_name, email, password_hash, phone, address)
    VALUES (
        TRIM(p_full_name),
        v_email,
        crypt(p_password, gen_salt('bf')),
        p_phone,
        p_address
    )
    RETURNING id INTO v_user_id;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'User created successfully',
        'user_id', v_user_id
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_login_user(
    p_email TEXT,
    p_password TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_user users%ROWTYPE;
    v_token TEXT;
    v_expires_at TIMESTAMPTZ;
BEGIN
    SELECT * INTO v_user
    FROM users
    WHERE email = LOWER(TRIM(p_email));

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Invalid email or password');
    END IF;

    IF v_user.is_active = FALSE THEN
        RETURN jsonb_build_object('success', false, 'message', 'Account is inactive');
    END IF;

    IF crypt(p_password, v_user.password_hash) <> v_user.password_hash THEN
        RETURN jsonb_build_object('success', false, 'message', 'Invalid email or password');
    END IF;

    UPDATE users SET last_login_at = NOW() WHERE id = v_user.id;

    v_token := encode(gen_random_bytes(32), 'hex');
    v_expires_at := NOW() + INTERVAL '2 hours';

    INSERT INTO auth_tokens(user_id, token_hash, token_type, expires_at)
    VALUES (
        v_user.id,
        encode(digest(v_token, 'sha256'), 'hex'),
        'access',
        v_expires_at
    );

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Login successful',
        'user', jsonb_build_object(
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

CREATE OR REPLACE FUNCTION public.fn_validate_token(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_token auth_tokens%ROWTYPE;
BEGIN
    SELECT * INTO v_token
    FROM auth_tokens
    WHERE token_hash = encode(digest(p_token, 'sha256'), 'hex');

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Invalid token');
    END IF;

    IF v_token.is_revoked = TRUE THEN
        RETURN jsonb_build_object('success', false, 'message', 'Token has been revoked');
    END IF;

    IF v_token.expires_at IS NOT NULL AND v_token.expires_at <= NOW() THEN
        RETURN jsonb_build_object('success', false, 'message', 'Token expired');
    END IF;

    UPDATE auth_tokens SET last_used_at = NOW() WHERE id = v_token.id;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Token valid',
        'user_id', v_token.user_id,
        'token_type', v_token.token_type
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_create_test_token(p_user_id BIGINT)
RETURNS JSONB
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

CREATE OR REPLACE FUNCTION public.fn_get_current_user(p_token TEXT)
RETURNS JSONB
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

CREATE OR REPLACE FUNCTION public.fn_update_profile(
    p_token TEXT,
    p_full_name TEXT DEFAULT NULL,
    p_email TEXT DEFAULT NULL,
    p_phone TEXT DEFAULT NULL,
    p_address TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_token_result JSONB;
    v_user_id BIGINT;
    v_email TEXT;
BEGIN
    v_token_result := public.fn_validate_token(p_token);

    IF (v_token_result ->> 'success')::BOOLEAN IS NOT TRUE THEN
        RETURN v_token_result;
    END IF;

    v_user_id := (v_token_result ->> 'user_id')::BIGINT;

    IF p_email IS NOT NULL THEN
        v_email := LOWER(TRIM(p_email));

        IF v_email = '' THEN
            RETURN jsonb_build_object('success', false, 'message', 'Email cannot be empty');
        END IF;

        IF EXISTS (
            SELECT 1 FROM users WHERE email = v_email AND id <> v_user_id
        ) THEN
            RETURN jsonb_build_object('success', false, 'message', 'Email already exists');
        END IF;
    END IF;

    UPDATE users
    SET
        full_name = CASE
            WHEN p_full_name IS NOT NULL AND TRIM(p_full_name) <> ''
            THEN TRIM(p_full_name)
            ELSE full_name
        END,
        email = COALESCE(v_email, email),
        phone = COALESCE(p_phone, phone),
        address = COALESCE(p_address, address),
        updated_at = NOW()
    WHERE id = v_user_id;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Profile updated successfully',
        'user_id', v_user_id
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_change_password(
    p_token TEXT,
    p_old_password TEXT,
    p_new_password TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_token_result JSONB;
    v_user_id BIGINT;
    v_password_hash TEXT;
BEGIN
    v_token_result := public.fn_validate_token(p_token);

    IF (v_token_result ->> 'success')::BOOLEAN IS NOT TRUE THEN
        RETURN v_token_result;
    END IF;

    v_user_id := (v_token_result ->> 'user_id')::BIGINT;

    SELECT password_hash INTO v_password_hash
    FROM users
    WHERE id = v_user_id AND is_active = TRUE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'User not found');
    END IF;

    IF crypt(p_old_password, v_password_hash) <> v_password_hash THEN
        RETURN jsonb_build_object('success', false, 'message', 'Old password is incorrect');
    END IF;

    IF NOT public.fn_validate_password(p_new_password) THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'New password must be at least 8 characters and contain a letter, number and special character'
        );
    END IF;

    IF crypt(p_new_password, v_password_hash) = v_password_hash THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'New password must be different from old password'
        );
    END IF;

    UPDATE users
    SET password_hash = crypt(p_new_password, gen_salt('bf')),
        updated_at = NOW()
    WHERE id = v_user_id;

    RETURN jsonb_build_object('success', true, 'message', 'Password changed successfully');
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_logout_user(p_token TEXT)
RETURNS JSONB
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

-- =========================================================
-- 1. DANH MỤC NHÀ CUNG CẤP
-- =========================================================

CREATE TABLE IF NOT EXISTS suppliers (
    id BIGSERIAL PRIMARY KEY,

    supplier_code VARCHAR(20)
        GENERATED ALWAYS AS (
            'NCC' || LPAD(id::TEXT, 6, '0')
        ) STORED,

    name VARCHAR(200) NOT NULL,

    address TEXT,

    phone VARCHAR(20),

    email VARCHAR(150),

    tax_code VARCHAR(50),

    contact_person VARCHAR(100),

    note TEXT,

    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_suppliers_code UNIQUE (supplier_code),

    CONSTRAINT uq_suppliers_tax_code UNIQUE (tax_code)
);

-- =========================================================
-- 2. DANH MỤC THUỐC
-- =========================================================

CREATE TABLE IF NOT EXISTS medicines (
    id BIGSERIAL PRIMARY KEY,

    medicine_code VARCHAR(20)
        GENERATED ALWAYS AS (
            'T' || LPAD(id::TEXT, 6, '0')
        ) STORED,

    name VARCHAR(200) NOT NULL,

    active_ingredient VARCHAR(200) NOT NULL,

    strength VARCHAR(100),

    dosage_form VARCHAR(100),

    unit VARCHAR(50),

    route_of_administration VARCHAR(100),

    usage_instructions TEXT,

    packaging VARCHAR(200),

    manufacturer VARCHAR(200),

    country_of_origin VARCHAR(100),

    registration_number VARCHAR(100),

    supplier_id BIGINT NOT NULL,

    note TEXT,

    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_medicines_code
        UNIQUE (medicine_code),

    CONSTRAINT uq_medicines_registration_number
        UNIQUE (registration_number),

    CONSTRAINT fk_medicines_supplier
        FOREIGN KEY (supplier_id)
        REFERENCES suppliers(id)
        ON DELETE RESTRICT
);

CREATE OR REPLACE FUNCTION public.fn_create_supplier(
    p_name TEXT,
    p_address TEXT DEFAULT NULL,
    p_phone TEXT DEFAULT NULL,
    p_email TEXT DEFAULT NULL,
    p_tax_code TEXT DEFAULT NULL,
    p_contact_person TEXT DEFAULT NULL,
    p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_supplier_id BIGINT;
BEGIN

    IF p_name IS NULL OR TRIM(p_name) = '' THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'Tên nhà cung cấp không được để trống'
        );
    END IF;

    INSERT INTO suppliers (
        name,
        address,
        phone,
        email,
        tax_code,
        contact_person,
        note
    )
    VALUES (
        TRIM(p_name),
        NULLIF(TRIM(p_address), ''),
        NULLIF(TRIM(p_phone), ''),
        NULLIF(LOWER(TRIM(p_email)), ''),
        NULLIF(TRIM(p_tax_code), ''),
        NULLIF(TRIM(p_contact_person), ''),
        NULLIF(TRIM(p_note), '')
    )
    RETURNING id INTO v_supplier_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', 'Thêm nhà cung cấp thành công',
        'supplier_id', v_supplier_id
    );

EXCEPTION

    WHEN unique_violation THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'Mã số thuế hoặc thông tin nhà cung cấp đã tồn tại'
        );

END;
$$;

CREATE OR REPLACE FUNCTION public.fn_list_suppliers(
    p_search TEXT DEFAULT NULL,
    p_is_active BOOLEAN DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_data JSONB;
BEGIN

    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', s.id,
                'supplier_code', s.supplier_code,
                'name', s.name,
                'address', s.address,
                'phone', s.phone,
                'email', s.email,
                'tax_code', s.tax_code,
                'contact_person', s.contact_person,
                'note', s.note,
                'is_active', s.is_active,
                'created_at', s.created_at,
                'updated_at', s.updated_at
            )
            ORDER BY s.id DESC
        ),
        '[]'::JSONB
    )
    INTO v_data
    FROM suppliers s
    WHERE
        (
            p_search IS NULL
            OR TRIM(p_search) = ''
            OR LOWER(s.name) LIKE '%' || LOWER(TRIM(p_search)) || '%'
            OR LOWER(s.supplier_code) LIKE '%' || LOWER(TRIM(p_search)) || '%'
            OR LOWER(COALESCE(s.phone, ''))
                LIKE '%' || LOWER(TRIM(p_search)) || '%'
            OR LOWER(COALESCE(s.tax_code, ''))
                LIKE '%' || LOWER(TRIM(p_search)) || '%'
        )
        AND (
            p_is_active IS NULL
            OR s.is_active = p_is_active
        );

    RETURN jsonb_build_object(
        'success', TRUE,
        'count', jsonb_array_length(v_data),
        'data', v_data
    );

END;
$$;

CREATE OR REPLACE FUNCTION public.fn_get_supplier(
    p_supplier_id BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_supplier suppliers%ROWTYPE;
BEGIN

    SELECT *
    INTO v_supplier
    FROM suppliers
    WHERE id = p_supplier_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'Không tìm thấy nhà cung cấp'
        );
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,

        'supplier',
        jsonb_build_object(
            'id', v_supplier.id,
            'supplier_code', v_supplier.supplier_code,
            'name', v_supplier.name,
            'address', v_supplier.address,
            'phone', v_supplier.phone,
            'email', v_supplier.email,
            'tax_code', v_supplier.tax_code,
            'contact_person', v_supplier.contact_person,
            'note', v_supplier.note,
            'is_active', v_supplier.is_active,
            'created_at', v_supplier.created_at,
            'updated_at', v_supplier.updated_at
        )
    );

END;
$$;

CREATE OR REPLACE FUNCTION public.fn_update_supplier(
    p_supplier_id BIGINT,
    p_name TEXT,
    p_address TEXT,
    p_phone TEXT,
    p_email TEXT,
    p_tax_code TEXT,
    p_contact_person TEXT,
    p_note TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
BEGIN

    IF NOT EXISTS (
        SELECT 1
        FROM suppliers
        WHERE id = p_supplier_id
    ) THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'Không tìm thấy nhà cung cấp'
        );
    END IF;

    IF p_name IS NULL OR TRIM(p_name) = '' THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'Tên nhà cung cấp không được để trống'
        );
    END IF;

    UPDATE suppliers
    SET
        name = TRIM(p_name),
        address = NULLIF(TRIM(p_address), ''),
        phone = NULLIF(TRIM(p_phone), ''),
        email = NULLIF(LOWER(TRIM(p_email)), ''),
        tax_code = NULLIF(TRIM(p_tax_code), ''),
        contact_person = NULLIF(TRIM(p_contact_person), ''),
        note = NULLIF(TRIM(p_note), ''),
        updated_at = NOW()
    WHERE id = p_supplier_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', 'Cập nhật nhà cung cấp thành công'
    );

EXCEPTION

    WHEN unique_violation THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'Mã số thuế đã được sử dụng'
        );

END;
$$;

CREATE OR REPLACE FUNCTION public.fn_set_supplier_status(
    p_supplier_id BIGINT,
    p_is_active BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
BEGIN

    UPDATE suppliers
    SET
        is_active = p_is_active,
        updated_at = NOW()
    WHERE id = p_supplier_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'Không tìm thấy nhà cung cấp'
        );
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message',
        CASE
            WHEN p_is_active
                THEN 'Đã kích hoạt nhà cung cấp'
            ELSE
                'Đã ngừng hoạt động nhà cung cấp'
        END
    );

END;
$$;

CREATE OR REPLACE FUNCTION public.fn_create_medicine(
    p_name TEXT,
    p_active_ingredient TEXT,
    p_strength TEXT,
    p_dosage_form TEXT,
    p_unit TEXT,
    p_route_of_administration TEXT,
    p_usage_instructions TEXT,
    p_packaging TEXT,
    p_manufacturer TEXT,
    p_country_of_origin TEXT,
    p_registration_number TEXT,
    p_supplier_id BIGINT,
    p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_medicine_id BIGINT;
BEGIN

    IF p_name IS NULL OR TRIM(p_name) = '' THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'Tên thuốc không được để trống'
        );
    END IF;

    IF p_active_ingredient IS NULL
       OR TRIM(p_active_ingredient) = '' THEN

        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'Hoạt chất không được để trống'
        );

    END IF;

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
        note
    )
    VALUES (
        TRIM(p_name),
        TRIM(p_active_ingredient),
        NULLIF(TRIM(p_strength), ''),
        NULLIF(TRIM(p_dosage_form), ''),
        NULLIF(TRIM(p_unit), ''),
        NULLIF(TRIM(p_route_of_administration), ''),
        NULLIF(TRIM(p_usage_instructions), ''),
        NULLIF(TRIM(p_packaging), ''),
        NULLIF(TRIM(p_manufacturer), ''),
        NULLIF(TRIM(p_country_of_origin), ''),
        NULLIF(TRIM(p_registration_number), ''),
        p_supplier_id,
        NULLIF(TRIM(p_note), '')
    )
    RETURNING id INTO v_medicine_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', 'Thêm thuốc thành công',
        'medicine_id', v_medicine_id
    );

EXCEPTION

    WHEN unique_violation THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'Số đăng ký thuốc đã tồn tại'
        );

END;
$$;

CREATE OR REPLACE FUNCTION public.fn_list_medicines(
    p_search TEXT DEFAULT NULL,
    p_supplier_id BIGINT DEFAULT NULL,
    p_is_active BOOLEAN DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_data JSONB;
BEGIN

    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', m.id,
                'medicine_code', m.medicine_code,
                'name', m.name,
                'active_ingredient', m.active_ingredient,
                'strength', m.strength,
                'dosage_form', m.dosage_form,
                'unit', m.unit,
                'route_of_administration',
                    m.route_of_administration,
                'usage_instructions',
                    m.usage_instructions,
                'packaging', m.packaging,
                'manufacturer', m.manufacturer,
                'country_of_origin',
                    m.country_of_origin,
                'registration_number',
                    m.registration_number,

                'supplier',
                jsonb_build_object(
                    'id', s.id,
                    'supplier_code', s.supplier_code,
                    'name', s.name
                ),

                'is_active', m.is_active,
                'created_at', m.created_at,
                'updated_at', m.updated_at
            )
            ORDER BY m.id DESC
        ),
        '[]'::JSONB
    )
    INTO v_data

    FROM medicines m

    JOIN suppliers s
        ON s.id = m.supplier_id

    WHERE
        (
            p_search IS NULL
            OR TRIM(p_search) = ''
            OR LOWER(m.name)
                LIKE '%' || LOWER(TRIM(p_search)) || '%'
            OR LOWER(m.medicine_code)
                LIKE '%' || LOWER(TRIM(p_search)) || '%'
            OR LOWER(m.active_ingredient)
                LIKE '%' || LOWER(TRIM(p_search)) || '%'
            OR LOWER(COALESCE(
                m.registration_number, ''
            ))
                LIKE '%' || LOWER(TRIM(p_search)) || '%'
        )

        AND (
            p_supplier_id IS NULL
            OR m.supplier_id = p_supplier_id
        )

        AND (
            p_is_active IS NULL
            OR m.is_active = p_is_active
        );

    RETURN jsonb_build_object(
        'success', TRUE,
        'count', jsonb_array_length(v_data),
        'data', v_data
    );

END;
$$;

CREATE OR REPLACE FUNCTION public.fn_get_medicine(
    p_medicine_id BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_result JSONB;
BEGIN

    SELECT jsonb_build_object(
        'id', m.id,
        'medicine_code', m.medicine_code,
        'name', m.name,
        'active_ingredient', m.active_ingredient,
        'strength', m.strength,
        'dosage_form', m.dosage_form,
        'unit', m.unit,
        'route_of_administration',
            m.route_of_administration,
        'usage_instructions',
            m.usage_instructions,
        'packaging', m.packaging,
        'manufacturer', m.manufacturer,
        'country_of_origin',
            m.country_of_origin,
        'registration_number',
            m.registration_number,

        'supplier',
        jsonb_build_object(
            'id', s.id,
            'supplier_code', s.supplier_code,
            'name', s.name
        ),

        'note', m.note,
        'is_active', m.is_active,
        'created_at', m.created_at,
        'updated_at', m.updated_at
    )
    INTO v_result

    FROM medicines m

    JOIN suppliers s
        ON s.id = m.supplier_id

    WHERE m.id = p_medicine_id;

    IF v_result IS NULL THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'Không tìm thấy thuốc'
        );
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'medicine', v_result
    );

END;
$$;

CREATE OR REPLACE FUNCTION public.fn_update_medicine(
    p_medicine_id BIGINT,
    p_name TEXT,
    p_active_ingredient TEXT,
    p_strength TEXT,
    p_dosage_form TEXT,
    p_unit TEXT,
    p_route_of_administration TEXT,
    p_usage_instructions TEXT,
    p_packaging TEXT,
    p_manufacturer TEXT,
    p_country_of_origin TEXT,
    p_registration_number TEXT,
    p_supplier_id BIGINT,
    p_note TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
BEGIN

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

    IF p_name IS NULL OR TRIM(p_name) = '' THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'Tên thuốc không được để trống'
        );
    END IF;

    IF p_active_ingredient IS NULL
       OR TRIM(p_active_ingredient) = '' THEN

        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'Hoạt chất không được để trống'
        );

    END IF;

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

    UPDATE medicines
    SET
        name = TRIM(p_name),
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
            NULLIF(
                TRIM(p_registration_number),
                ''
            ),

        supplier_id = p_supplier_id,

        note =
            NULLIF(TRIM(p_note), ''),

        updated_at = NOW()

    WHERE id = p_medicine_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', 'Cập nhật thuốc thành công'
    );

EXCEPTION

    WHEN unique_violation THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'Số đăng ký thuốc đã tồn tại'
        );

END;
$$;

CREATE OR REPLACE FUNCTION public.fn_set_medicine_status(
    p_medicine_id BIGINT,
    p_is_active BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
BEGIN

    UPDATE medicines
    SET
        is_active = p_is_active,
        updated_at = NOW()
    WHERE id = p_medicine_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'Không tìm thấy thuốc'
        );
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message',
        CASE
            WHEN p_is_active
                THEN 'Đã kích hoạt thuốc'
            ELSE
                'Đã ngừng sử dụng thuốc'
        END
    );

END;
$$;

CREATE TABLE IF NOT EXISTS warehouses (
    id BIGSERIAL PRIMARY KEY,

    warehouse_code VARCHAR(20) NOT NULL UNIQUE,

    name VARCHAR(100) NOT NULL,

    warehouse_type VARCHAR(20) NOT NULL,

    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_warehouse_type
        CHECK (warehouse_type IN ('MAIN', 'SALE'))
);

INSERT INTO warehouses (
    warehouse_code,
    name,
    warehouse_type
)
VALUES
    ('KHO_CHINH', 'Kho chính', 'MAIN'),
    ('KHO_BAN', 'Kho bán', 'SALE')
ON CONFLICT (warehouse_code) DO NOTHING;

CREATE TABLE IF NOT EXISTS purchase_receipts (
    id BIGSERIAL PRIMARY KEY,

    receipt_code VARCHAR(30)
        GENERATED ALWAYS AS (
            'PN' || LPAD(id::TEXT, 6, '0')
        ) STORED,

    supplier_id BIGINT NOT NULL,

    invoice_number VARCHAR(100) NOT NULL,

    invoice_serial VARCHAR(100),

    invoice_date DATE,

    receipt_date DATE NOT NULL DEFAULT CURRENT_DATE,

    note TEXT,

    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',

    created_by BIGINT,

    approved_by BIGINT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    approved_at TIMESTAMPTZ,

    CONSTRAINT uq_purchase_receipt_code
        UNIQUE (receipt_code),

    CONSTRAINT fk_receipt_supplier
        FOREIGN KEY (supplier_id)
        REFERENCES suppliers(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_receipt_created_user
        FOREIGN KEY (created_by)
        REFERENCES users(id)
        ON DELETE SET NULL,

    CONSTRAINT fk_receipt_approved_user
        FOREIGN KEY (approved_by)
        REFERENCES users(id)
        ON DELETE SET NULL,

    CONSTRAINT chk_receipt_status
        CHECK (
            status IN (
                'DRAFT',
                'PENDING',
                'APPROVED',
                'REJECTED'
            )
        )
);

CREATE TABLE IF NOT EXISTS purchase_receipt_items (
    id BIGSERIAL PRIMARY KEY,

    receipt_id BIGINT NOT NULL,

    medicine_id BIGINT NOT NULL,

    lot_number VARCHAR(100) NOT NULL,

    expiry_date DATE NOT NULL,

    quantity NUMERIC(14,3) NOT NULL,

    unit_price NUMERIC(14,2) NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_receipt_item_receipt
        FOREIGN KEY (receipt_id)
        REFERENCES purchase_receipts(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_receipt_item_medicine
        FOREIGN KEY (medicine_id)
        REFERENCES medicines(id)
        ON DELETE RESTRICT,

    CONSTRAINT chk_receipt_item_quantity
        CHECK (quantity > 0),

    CONSTRAINT chk_receipt_item_price
        CHECK (unit_price >= 0)
);

CREATE TABLE IF NOT EXISTS batches (
    id BIGSERIAL PRIMARY KEY,

    medicine_id BIGINT NOT NULL,

    lot_number VARCHAR(100) NOT NULL,

    expiry_date DATE NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_batch_medicine
        FOREIGN KEY (medicine_id)
        REFERENCES medicines(id)
        ON DELETE RESTRICT,

    CONSTRAINT uq_medicine_batch
        UNIQUE (
            medicine_id,
            lot_number,
            expiry_date
        )
);

CREATE TABLE IF NOT EXISTS inventory (
    id BIGSERIAL PRIMARY KEY,

    warehouse_id BIGINT NOT NULL,

    batch_id BIGINT NOT NULL,

    quantity NUMERIC(14,3)
        NOT NULL DEFAULT 0,

    updated_at TIMESTAMPTZ
        NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_inventory_warehouse
        FOREIGN KEY (warehouse_id)
        REFERENCES warehouses(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_inventory_batch
        FOREIGN KEY (batch_id)
        REFERENCES batches(id)
        ON DELETE RESTRICT,

    CONSTRAINT uq_inventory
        UNIQUE (
            warehouse_id,
            batch_id
        ),

    CONSTRAINT chk_inventory_quantity
        CHECK (quantity >= 0)
);

CREATE TABLE IF NOT EXISTS stock_movements (
    id BIGSERIAL PRIMARY KEY,

    warehouse_id BIGINT NOT NULL,

    batch_id BIGINT NOT NULL,

    movement_type VARCHAR(30) NOT NULL,

    quantity NUMERIC(14,3) NOT NULL,

    reference_type VARCHAR(50),

    reference_id BIGINT,

    note TEXT,

    created_by BIGINT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_movement_warehouse
        FOREIGN KEY (warehouse_id)
        REFERENCES warehouses(id),

    CONSTRAINT fk_movement_batch
        FOREIGN KEY (batch_id)
        REFERENCES batches(id),

    CONSTRAINT fk_movement_user
        FOREIGN KEY (created_by)
        REFERENCES users(id)
        ON DELETE SET NULL
);

CREATE OR REPLACE FUNCTION public.fn_create_purchase_receipt(
    p_token TEXT,
    p_supplier_id BIGINT,
    p_invoice_number TEXT,
    p_invoice_serial TEXT,
    p_invoice_date DATE,
    p_note TEXT DEFAULT NULL
)
RETURNS JSONB
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

CREATE OR REPLACE FUNCTION public.fn_add_purchase_receipt_item(
    p_token TEXT,
    p_receipt_id BIGINT,
    p_medicine_id BIGINT,
    p_lot_number TEXT,
    p_expiry_date DATE,
    p_quantity NUMERIC,
    p_unit_price NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_auth JSONB;
BEGIN

    v_auth := public.fn_validate_token(p_token);

    IF (v_auth ->> 'success')::BOOLEAN IS NOT TRUE THEN
        RETURN v_auth;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM purchase_receipts
        WHERE id = p_receipt_id
          AND status = 'DRAFT'
    ) THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'Phiếu không tồn tại hoặc không còn ở trạng thái nháp'
        );
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM medicines
        WHERE id = p_medicine_id
          AND is_active = TRUE
    ) THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'Thuốc không tồn tại hoặc đã ngừng sử dụng'
        );
    END IF;

    IF p_lot_number IS NULL
       OR TRIM(p_lot_number) = '' THEN

        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'Số lô không được để trống'
        );
    END IF;

    IF p_expiry_date IS NULL THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'Hạn sử dụng không được để trống'
        );
    END IF;

    IF p_quantity <= 0 THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'Số lượng phải lớn hơn 0'
        );
    END IF;

    IF p_unit_price < 0 THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'Đơn giá không hợp lệ'
        );
    END IF;

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

END;
$$;

CREATE OR REPLACE FUNCTION public.fn_submit_purchase_receipt(
    p_token TEXT,
    p_receipt_id BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_auth JSONB;
BEGIN

    v_auth := public.fn_validate_token(p_token);

    IF (v_auth ->> 'success')::BOOLEAN IS NOT TRUE THEN
        RETURN v_auth;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM purchase_receipt_items
        WHERE receipt_id = p_receipt_id
    ) THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'Phiếu nhập chưa có thuốc'
        );
    END IF;

    UPDATE purchase_receipts
    SET status = 'PENDING'
    WHERE id = p_receipt_id
      AND status = 'DRAFT';

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'Phiếu không tồn tại hoặc không còn ở trạng thái nháp'
        );
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message',
        'Phiếu nhập đã được gửi duyệt'
    );

END;
$$;

CREATE OR REPLACE FUNCTION public.fn_approve_purchase_receipt(
    p_token TEXT,
    p_receipt_id BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_auth JSONB;

    v_user_id BIGINT;

    v_main_warehouse_id BIGINT;

    v_item RECORD;

    v_batch_id BIGINT;
BEGIN

    v_auth := public.fn_validate_token(p_token);

    IF (v_auth ->> 'success')::BOOLEAN IS NOT TRUE THEN
        RETURN v_auth;
    END IF;

    v_user_id :=
        (v_auth ->> 'user_id')::BIGINT;


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


    IF NOT EXISTS (
        SELECT 1
        FROM purchase_receipts
        WHERE id = p_receipt_id
          AND status = 'PENDING'
    ) THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'Phiếu không tồn tại hoặc không ở trạng thái chờ duyệt'
        );
    END IF;


    FOR v_item IN

        SELECT *
        FROM purchase_receipt_items
        WHERE receipt_id = p_receipt_id

    LOOP

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

            updated_at = NOW();


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


    UPDATE purchase_receipts
    SET
        status = 'APPROVED',
        approved_by = v_user_id,
        approved_at = NOW()
    WHERE id = p_receipt_id;


    RETURN jsonb_build_object(
        'success', TRUE,
        'message',
        'Duyệt phiếu thành công, thuốc đã được nhập vào Kho chính'
    );

END;
$$;

CREATE OR REPLACE FUNCTION public.fn_list_purchase_receipts(
    p_token TEXT,
    p_status TEXT DEFAULT NULL,
    p_supplier_id BIGINT DEFAULT NULL,
    p_search TEXT DEFAULT NULL
)
RETURNS JSONB
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

CREATE OR REPLACE FUNCTION public.fn_get_purchase_receipt(
    p_token TEXT,
    p_receipt_id BIGINT
)
RETURNS JSONB
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

CREATE OR REPLACE FUNCTION public.fn_list_inventory(
    p_token TEXT,
    p_warehouse_id BIGINT DEFAULT NULL,
    p_search TEXT DEFAULT NULL
)
RETURNS JSONB
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

ALTER TABLE purchase_receipts
ADD COLUMN IF NOT EXISTS rejected_by BIGINT;

ALTER TABLE purchase_receipts
ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ;

ALTER TABLE purchase_receipts
ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_receipt_rejected_user'
    ) THEN
        ALTER TABLE purchase_receipts
        ADD CONSTRAINT fk_receipt_rejected_user
        FOREIGN KEY (rejected_by)
        REFERENCES users(id)
        ON DELETE SET NULL;
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.fn_reject_purchase_receipt(
    p_token TEXT,
    p_receipt_id BIGINT,
    p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_auth JSONB;
    v_user_id BIGINT;
BEGIN

    -- 1. Kiểm tra token
    v_auth := public.fn_validate_token(p_token);

    IF (v_auth ->> 'success')::BOOLEAN IS NOT TRUE THEN
        RETURN v_auth;
    END IF;

    v_user_id :=
        (v_auth ->> 'user_id')::BIGINT;


    -- 2. Lý do từ chối bắt buộc
    IF p_reason IS NULL
       OR TRIM(p_reason) = '' THEN

        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'Vui lòng nhập lý do từ chối'
        );
    END IF;


    -- 3. Chỉ được từ chối phiếu đang PENDING
    IF NOT EXISTS (
        SELECT 1
        FROM purchase_receipts
        WHERE id = p_receipt_id
          AND status = 'PENDING'
    ) THEN

        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'Phiếu không tồn tại hoặc không ở trạng thái chờ duyệt'
        );
    END IF;


    -- 4. Chuyển trạng thái sang REJECTED
    UPDATE purchase_receipts
    SET
        status = 'REJECTED',
        rejected_by = v_user_id,
        rejected_at = NOW(),
        rejection_reason = TRIM(p_reason)

    WHERE id = p_receipt_id
      AND status = 'PENDING';


    RETURN jsonb_build_object(
        'success', TRUE,
        'message', 'Phiếu nhập đã bị từ chối',
        'receipt_id', p_receipt_id,
        'status', 'REJECTED',
        'rejection_reason', TRIM(p_reason)
    );

END;
$$;

CREATE TABLE IF NOT EXISTS warehouse_transfers (
    id BIGSERIAL PRIMARY KEY,

    transfer_code VARCHAR(30)
        GENERATED ALWAYS AS (
            'CK' || LPAD(id::TEXT, 6, '0')
        ) STORED,

    source_warehouse_id BIGINT NOT NULL,

    destination_warehouse_id BIGINT NOT NULL,

    transfer_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    status VARCHAR(20) NOT NULL DEFAULT 'COMPLETED',

    note TEXT,

    created_by BIGINT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_warehouse_transfer_code
        UNIQUE (transfer_code),

    CONSTRAINT fk_transfer_source_warehouse
        FOREIGN KEY (source_warehouse_id)
        REFERENCES warehouses(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_transfer_destination_warehouse
        FOREIGN KEY (destination_warehouse_id)
        REFERENCES warehouses(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_transfer_created_by
        FOREIGN KEY (created_by)
        REFERENCES users(id)
        ON DELETE SET NULL,

    CONSTRAINT chk_transfer_different_warehouse
        CHECK (
            source_warehouse_id
            <> destination_warehouse_id
        ),

    CONSTRAINT chk_transfer_status
        CHECK (
            status IN (
                'COMPLETED',
                'CANCELLED'
            )
        )
);

CREATE TABLE IF NOT EXISTS warehouse_transfer_items (
    id BIGSERIAL PRIMARY KEY,

    transfer_id BIGINT NOT NULL,

    batch_id BIGINT NOT NULL,

    quantity NUMERIC(14,3) NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_transfer_item_transfer
        FOREIGN KEY (transfer_id)
        REFERENCES warehouse_transfers(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_transfer_item_batch
        FOREIGN KEY (batch_id)
        REFERENCES batches(id)
        ON DELETE RESTRICT,

    CONSTRAINT chk_transfer_item_quantity
        CHECK (quantity > 0)
);

CREATE OR REPLACE FUNCTION public.fn_transfer_stock(
    p_token TEXT,
    p_source_warehouse_id BIGINT,
    p_destination_warehouse_id BIGINT,
    p_batch_id BIGINT,
    p_quantity NUMERIC,
    p_note TEXT DEFAULT NULL
)
RETURNS JSONB
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

CREATE TABLE IF NOT EXISTS supplier_returns (
    id BIGSERIAL PRIMARY KEY,

    return_code VARCHAR(30)
        GENERATED ALWAYS AS (
            'TNCC' || LPAD(id::TEXT, 6, '0')
        ) STORED,

    supplier_id BIGINT NOT NULL,

    warehouse_id BIGINT NOT NULL,

    return_date DATE NOT NULL DEFAULT CURRENT_DATE,

    reason TEXT NOT NULL,

    note TEXT,

    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',

    created_by BIGINT,

    approved_by BIGINT,
    approved_at TIMESTAMPTZ,

    rejected_by BIGINT,
    rejected_at TIMESTAMPTZ,
    rejection_reason TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_supplier_return_code
        UNIQUE (return_code),

    CONSTRAINT fk_supplier_return_supplier
        FOREIGN KEY (supplier_id)
        REFERENCES suppliers(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_supplier_return_warehouse
        FOREIGN KEY (warehouse_id)
        REFERENCES warehouses(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_supplier_return_created_by
        FOREIGN KEY (created_by)
        REFERENCES users(id)
        ON DELETE SET NULL,

    CONSTRAINT fk_supplier_return_approved_by
        FOREIGN KEY (approved_by)
        REFERENCES users(id)
        ON DELETE SET NULL,

    CONSTRAINT fk_supplier_return_rejected_by
        FOREIGN KEY (rejected_by)
        REFERENCES users(id)
        ON DELETE SET NULL,

    CONSTRAINT chk_supplier_return_status
        CHECK (
            status IN (
                'DRAFT',
                'PENDING',
                'APPROVED',
                'REJECTED'
            )
        )
);

CREATE TABLE IF NOT EXISTS supplier_return_items (
    id BIGSERIAL PRIMARY KEY,

    return_id BIGINT NOT NULL,

    batch_id BIGINT NOT NULL,

    quantity NUMERIC(14,3) NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_supplier_return_item_return
        FOREIGN KEY (return_id)
        REFERENCES supplier_returns(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_supplier_return_item_batch
        FOREIGN KEY (batch_id)
        REFERENCES batches(id)
        ON DELETE RESTRICT,

    CONSTRAINT uq_supplier_return_batch
        UNIQUE (return_id, batch_id),

    CONSTRAINT chk_supplier_return_quantity
        CHECK (quantity > 0)
);

CREATE OR REPLACE FUNCTION public.fn_create_supplier_return(
    p_token TEXT,
    p_supplier_id BIGINT,
    p_warehouse_id BIGINT,
    p_reason TEXT,
    p_note TEXT DEFAULT NULL
)
RETURNS JSONB
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

CREATE OR REPLACE FUNCTION public.fn_add_supplier_return_item(
    p_token TEXT,
    p_return_id BIGINT,
    p_batch_id BIGINT,
    p_quantity NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_auth JSONB;
    v_supplier_id BIGINT;
    v_warehouse_id BIGINT;
    v_medicine_supplier_id BIGINT;
    v_inventory_quantity NUMERIC;
BEGIN

    v_auth := public.fn_validate_token(p_token);

    IF (v_auth ->> 'success')::BOOLEAN IS NOT TRUE THEN
        RETURN v_auth;
    END IF;


    SELECT
        supplier_id,
        warehouse_id
    INTO
        v_supplier_id,
        v_warehouse_id
    FROM supplier_returns
    WHERE id = p_return_id
      AND status = 'DRAFT';


    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'Phiếu trả không tồn tại hoặc không còn ở trạng thái nháp'
        );
    END IF;


    IF p_quantity IS NULL
       OR p_quantity <= 0 THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'Số lượng trả phải lớn hơn 0'
        );
    END IF;


    SELECT m.supplier_id
    INTO v_medicine_supplier_id
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


    IF v_medicine_supplier_id <> v_supplier_id THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'Thuốc trong lô này không thuộc nhà cung cấp của phiếu trả'
        );
    END IF;


    SELECT quantity
    INTO v_inventory_quantity
    FROM inventory
    WHERE warehouse_id = v_warehouse_id
      AND batch_id = p_batch_id;


    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'Lô thuốc này không tồn tại trong kho đã chọn'
        );
    END IF;


    IF v_inventory_quantity < p_quantity THEN
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

CREATE OR REPLACE FUNCTION public.fn_submit_supplier_return(
    p_token TEXT,
    p_return_id BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_auth JSONB;
BEGIN

    v_auth := public.fn_validate_token(p_token);

    IF (v_auth ->> 'success')::BOOLEAN IS NOT TRUE THEN
        RETURN v_auth;
    END IF;


    IF NOT EXISTS (
        SELECT 1
        FROM supplier_return_items
        WHERE return_id = p_return_id
    ) THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'Phiếu trả chưa có thuốc'
        );
    END IF;


    UPDATE supplier_returns
    SET status = 'PENDING'
    WHERE id = p_return_id
      AND status = 'DRAFT';


    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'Phiếu trả không tồn tại hoặc không còn ở trạng thái nháp'
        );
    END IF;


    RETURN jsonb_build_object(
        'success', TRUE,
        'message',
        'Phiếu trả đã được gửi duyệt',
        'return_id', p_return_id,
        'status', 'PENDING'
    );

END;
$$;

CREATE OR REPLACE FUNCTION public.fn_approve_supplier_return(
    p_token TEXT,
    p_return_id BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_auth JSONB;
    v_user_id BIGINT;

    v_warehouse_id BIGINT;

    v_item RECORD;
    v_current_quantity NUMERIC;
BEGIN

    v_auth := public.fn_validate_token(p_token);

    IF (v_auth ->> 'success')::BOOLEAN IS NOT TRUE THEN
        RETURN v_auth;
    END IF;

    v_user_id :=
        (v_auth ->> 'user_id')::BIGINT;


    SELECT warehouse_id
    INTO v_warehouse_id
    FROM supplier_returns
    WHERE id = p_return_id
      AND status = 'PENDING';


    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'Phiếu trả không tồn tại hoặc không ở trạng thái chờ duyệt'
        );
    END IF;


    /*
       KIỂM TRA TẤT CẢ CÁC DÒNG TRƯỚC
       Chưa trừ tồn ở vòng lặp này.
    */

    FOR v_item IN
        SELECT
            sri.batch_id,
            sri.quantity
        FROM supplier_return_items sri
        WHERE sri.return_id = p_return_id
        ORDER BY sri.id
    LOOP

        SELECT quantity
        INTO v_current_quantity
        FROM inventory
        WHERE warehouse_id = v_warehouse_id
          AND batch_id = v_item.batch_id
        FOR UPDATE;


        IF NOT FOUND THEN
            RETURN jsonb_build_object(
                'success', FALSE,
                'message',
                'Có lô thuốc không còn tồn tại trong kho'
            );
        END IF;


        IF v_current_quantity < v_item.quantity THEN
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


    /*
       SAU KHI TẤT CẢ ĐỀU HỢP LỆ
       mới bắt đầu trừ tồn.
    */

    FOR v_item IN
        SELECT
            sri.batch_id,
            sri.quantity
        FROM supplier_return_items sri
        WHERE sri.return_id = p_return_id
        ORDER BY sri.id
    LOOP

        UPDATE inventory
        SET
            quantity =
                quantity - v_item.quantity,

            updated_at = NOW()

        WHERE warehouse_id = v_warehouse_id
          AND batch_id = v_item.batch_id;


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


    UPDATE supplier_returns
    SET
        status = 'APPROVED',
        approved_by = v_user_id,
        approved_at = NOW()

    WHERE id = p_return_id
      AND status = 'PENDING';


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

CREATE OR REPLACE FUNCTION public.fn_reject_supplier_return(
    p_token TEXT,
    p_return_id BIGINT,
    p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_auth JSONB;
    v_user_id BIGINT;
BEGIN

    v_auth := public.fn_validate_token(p_token);

    IF (v_auth ->> 'success')::BOOLEAN IS NOT TRUE THEN
        RETURN v_auth;
    END IF;

    v_user_id :=
        (v_auth ->> 'user_id')::BIGINT;


    IF p_reason IS NULL
       OR TRIM(p_reason) = '' THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'Vui lòng nhập lý do từ chối'
        );
    END IF;


    UPDATE supplier_returns
    SET
        status = 'REJECTED',
        rejected_by = v_user_id,
        rejected_at = NOW(),
        rejection_reason = TRIM(p_reason)

    WHERE id = p_return_id
      AND status = 'PENDING';


    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message',
            'Phiếu trả không tồn tại hoặc không ở trạng thái chờ duyệt'
        );
    END IF;


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

CREATE OR REPLACE FUNCTION public.fn_list_supplier_returns(
    p_token TEXT,
    p_status TEXT DEFAULT NULL,
    p_supplier_id BIGINT DEFAULT NULL,
    p_warehouse_id BIGINT DEFAULT NULL,
    p_search TEXT DEFAULT NULL
)
RETURNS JSONB
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

CREATE OR REPLACE FUNCTION public.fn_get_supplier_return(
    p_token TEXT,
    p_return_id BIGINT
)
RETURNS JSONB
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

CREATE OR REPLACE FUNCTION public.fn_list_warehouse_transfers(
    p_token TEXT,
    p_source_warehouse_id BIGINT DEFAULT NULL,
    p_destination_warehouse_id BIGINT DEFAULT NULL,
    p_search TEXT DEFAULT NULL
)
RETURNS JSONB
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

CREATE OR REPLACE FUNCTION public.fn_get_warehouse_transfer(
    p_token TEXT,
    p_transfer_id BIGINT
)
RETURNS JSONB
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

CREATE OR REPLACE FUNCTION public.fn_list_stock_movements(
    p_token TEXT,
    p_warehouse_id BIGINT DEFAULT NULL,
    p_movement_type TEXT DEFAULT NULL,
    p_medicine_id BIGINT DEFAULT NULL,
    p_search TEXT DEFAULT NULL
)
RETURNS JSONB
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
                'id', sm.id,

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
                    'unit', m.unit
                ),

                'batch',
                jsonb_build_object(
                    'id', b.id,
                    'lot_number', b.lot_number,
                    'expiry_date', b.expiry_date
                ),

                'movement_type', sm.movement_type,

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

                'quantity', sm.quantity,

                'signed_quantity',
                CASE
                    WHEN sm.movement_type IN (
                        'TRANSFER_OUT',
                        'RETURN_SUPPLIER'
                    )
                    THEN -sm.quantity
                    ELSE sm.quantity
                END,

                'reference_type', sm.reference_type,
                'reference_id', sm.reference_id,

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

                'note', sm.note,

                'created_by',
                CASE
                    WHEN u.id IS NOT NULL
                    THEN jsonb_build_object(
                        'id', u.id,
                        'full_name', u.full_name
                    )
                    ELSE NULL
                END,

                'created_at', sm.created_at
            )

            ORDER BY
                sm.created_at DESC,
                sm.id DESC
        ),
        '[]'::JSONB
    )
    INTO v_data

    FROM stock_movements sm

    JOIN warehouses w
        ON w.id = sm.warehouse_id

    JOIN batches b
        ON b.id = sm.batch_id

    JOIN medicines m
        ON m.id = b.medicine_id

    LEFT JOIN users u
        ON u.id = sm.created_by

    LEFT JOIN purchase_receipts pr
        ON sm.reference_type = 'PURCHASE_RECEIPT'
       AND pr.id = sm.reference_id

    LEFT JOIN warehouse_transfers wt
        ON sm.reference_type = 'WAREHOUSE_TRANSFER'
       AND wt.id = sm.reference_id

    LEFT JOIN supplier_returns sr
        ON sm.reference_type = 'SUPPLIER_RETURN'
       AND sr.id = sm.reference_id

    WHERE

        -- Lọc theo kho
        (
            p_warehouse_id IS NULL
            OR sm.warehouse_id = p_warehouse_id
        )

        -- Lọc theo loại biến động
        AND (
            p_movement_type IS NULL
            OR TRIM(p_movement_type) = ''
            OR UPPER(sm.movement_type)
                = UPPER(TRIM(p_movement_type))
        )

        -- Lọc theo thuốc
        AND (
            p_medicine_id IS NULL
            OR m.id = p_medicine_id
        )

        -- Tìm kiếm
        AND (
            p_search IS NULL
            OR TRIM(p_search) = ''

            OR LOWER(m.name)
                LIKE '%' || LOWER(TRIM(p_search)) || '%'

            OR LOWER(m.medicine_code)
                LIKE '%' || LOWER(TRIM(p_search)) || '%'

            OR LOWER(b.lot_number)
                LIKE '%' || LOWER(TRIM(p_search)) || '%'

            OR LOWER(sm.movement_type)
                LIKE '%' || LOWER(TRIM(p_search)) || '%'

            OR LOWER(COALESCE(sm.note, ''))
                LIKE '%' || LOWER(TRIM(p_search)) || '%'

            OR LOWER(COALESCE(pr.receipt_code, ''))
                LIKE '%' || LOWER(TRIM(p_search)) || '%'

            OR LOWER(COALESCE(wt.transfer_code, ''))
                LIKE '%' || LOWER(TRIM(p_search)) || '%'

            OR LOWER(COALESCE(sr.return_code, ''))
                LIKE '%' || LOWER(TRIM(p_search)) || '%'
        );


    RETURN jsonb_build_object(
        'success', TRUE,
        'count', jsonb_array_length(v_data),
        'data', v_data
    );

END;
$$;