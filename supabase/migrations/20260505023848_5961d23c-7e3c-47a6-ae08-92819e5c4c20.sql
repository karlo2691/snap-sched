-- Roles enum + table
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'user');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;

DROP POLICY IF EXISTS "admins manage roles" ON public.user_roles;
CREATE POLICY "admins manage roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "users see own roles" ON public.user_roles;
CREATE POLICY "users see own roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Sheet uploads metadata
CREATE TABLE IF NOT EXISTS public.sheet_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uploaded_by uuid NOT NULL,
  file_name text NOT NULL,
  storage_path text NOT NULL UNIQUE,
  size_bytes bigint,
  kind text NOT NULL DEFAULT 'general',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sheet_uploads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins read uploads" ON public.sheet_uploads;
CREATE POLICY "admins read uploads" ON public.sheet_uploads
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "admins insert uploads" ON public.sheet_uploads;
CREATE POLICY "admins insert uploads" ON public.sheet_uploads
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND uploaded_by = auth.uid());

DROP POLICY IF EXISTS "admins delete uploads" ON public.sheet_uploads;
CREATE POLICY "admins delete uploads" ON public.sheet_uploads
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Storage bucket (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('sheet-uploads', 'sheet-uploads', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "admins read sheet files" ON storage.objects;
CREATE POLICY "admins read sheet files" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'sheet-uploads' AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "admins upload sheet files" ON storage.objects;
CREATE POLICY "admins upload sheet files" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'sheet-uploads' AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "admins delete sheet files" ON storage.objects;
CREATE POLICY "admins delete sheet files" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'sheet-uploads' AND public.has_role(auth.uid(), 'admin'));

-- Seed existing super admin
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role FROM auth.users WHERE email = 'keijinomiya@gmail.com'
ON CONFLICT DO NOTHING;