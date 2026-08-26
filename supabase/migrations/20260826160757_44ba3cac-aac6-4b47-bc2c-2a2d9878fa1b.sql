CREATE TABLE public.sections (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  passkey text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
GRANT ALL ON public.sections TO service_role;
ALTER TABLE public.sections ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.admin_grants (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  section_id uuid REFERENCES public.sections(id) ON DELETE CASCADE,
  is_general boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
GRANT ALL ON public.admin_grants TO service_role;
ALTER TABLE public.admin_grants ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX admin_grants_general_uniq ON public.admin_grants(user_id) WHERE is_general;
CREATE UNIQUE INDEX admin_grants_section_uniq ON public.admin_grants(user_id, section_id) WHERE section_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$
LANGUAGE plpgsql SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER update_sections_updated_at BEFORE UPDATE ON public.sections
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.attendance_sessions ADD COLUMN section_id uuid REFERENCES public.sections(id) ON DELETE CASCADE;
ALTER TABLE public.attendance_sessions ALTER COLUMN radius_m SET DEFAULT 200;
CREATE INDEX attendance_sessions_section_idx ON public.attendance_sessions(section_id, is_active);

ALTER TABLE public.app_settings ADD COLUMN general_passkey text NOT NULL DEFAULT 'FEM2026';

INSERT INTO public.sections (name, passkey) VALUES
  ('100 Level SLT', 'SLT100'),
  ('200 Level SLT Biological Technology', 'BIOT200'),
  ('200 Level SLT Biochemistry', 'BCH200'),
  ('200 Level SLT Microbiology/Biotechnology', 'MCB200'),
  ('200 Level SLT Chemistry', 'CHM200');