
-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile select" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Team members (owned by admin)
CREATE TABLE public.team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  team TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tm select own" ON public.team_members FOR SELECT USING (auth.uid() = owner_id);
CREATE POLICY "tm insert own" ON public.team_members FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "tm update own" ON public.team_members FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "tm delete own" ON public.team_members FOR DELETE USING (auth.uid() = owner_id);

-- Laptops
CREATE TABLE public.laptops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  asset_tag TEXT NOT NULL,
  model TEXT,
  team TEXT,
  assigned_member_id UUID REFERENCES public.team_members ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.laptops ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lp select own" ON public.laptops FOR SELECT USING (auth.uid() = owner_id);
CREATE POLICY "lp insert own" ON public.laptops FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "lp update own" ON public.laptops FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "lp delete own" ON public.laptops FOR DELETE USING (auth.uid() = owner_id);

-- Schedules
CREATE TABLE public.schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  laptop_id UUID NOT NULL REFERENCES public.laptops ON DELETE CASCADE,
  scheduled_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  notes TEXT,
  notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX schedules_owner_date_idx ON public.schedules(owner_id, scheduled_date);
ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sc select own" ON public.schedules FOR SELECT USING (auth.uid() = owner_id);
CREATE POLICY "sc insert own" ON public.schedules FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "sc update own" ON public.schedules FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "sc delete own" ON public.schedules FOR DELETE USING (auth.uid() = owner_id);
