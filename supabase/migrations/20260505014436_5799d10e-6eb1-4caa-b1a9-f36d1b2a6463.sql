-- Seed super admin: keijinomiya@gmail.com / keb112691
DO $$
DECLARE
  admin_email text := 'keijinomiya@gmail.com';
  admin_password text := 'keb112691';
  admin_id uuid;
BEGIN
  SELECT id INTO admin_id FROM auth.users WHERE email = admin_email;

  IF admin_id IS NULL THEN
    admin_id := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', admin_id, 'authenticated', 'authenticated',
      admin_email, crypt(admin_password, gen_salt('bf')),
      now(),
      jsonb_build_object('provider','email','providers',ARRAY['email']),
      jsonb_build_object('display_name','Keb'),
      now(), now(), '', '', '', ''
    );

    INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    VALUES (gen_random_uuid(), admin_id,
      jsonb_build_object('sub', admin_id::text, 'email', admin_email, 'email_verified', true),
      'email', admin_id::text, now(), now(), now());
  ELSE
    UPDATE auth.users
       SET encrypted_password = crypt(admin_password, gen_salt('bf')),
           email_confirmed_at = COALESCE(email_confirmed_at, now()),
           updated_at = now(),
           raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('display_name','Keb')
     WHERE id = admin_id;
  END IF;

  INSERT INTO public.profiles (id, display_name)
  VALUES (admin_id, 'Keb')
  ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name;
END $$;