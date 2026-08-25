ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS full_name text;
ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS accuracy_m double precision;

UPDATE public.attendance_records r
SET full_name = COALESCE(p.full_name, 'Student')
FROM public.profiles p
WHERE p.id = r.student_id AND r.full_name IS NULL;

UPDATE public.attendance_records SET full_name = 'Student' WHERE full_name IS NULL;

ALTER TABLE public.attendance_records ALTER COLUMN full_name SET NOT NULL;

ALTER TABLE public.attendance_records DROP CONSTRAINT IF EXISTS attendance_records_session_id_student_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS attendance_records_session_name_key
  ON public.attendance_records (session_id, lower(btrim(full_name)));

ALTER TABLE public.attendance_sessions ALTER COLUMN radius_m SET DEFAULT 50;