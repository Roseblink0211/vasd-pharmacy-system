SELECT public.fn_register_user(
    'VASD API Tester',
    'tester@vasd.local',
    'Tester@1234',
    NULL,
    NULL
);

SELECT id, full_name, email
FROM users
WHERE email = 'tester@vasd.local';

-- Replace <TESTER_ID> with the id returned above.
SELECT public.fn_create_test_token(<TESTER_ID>);
