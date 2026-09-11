-- =========================================================
-- Make the whole app work with the publishable key only.
-- Privileged logic moves into SECURITY DEFINER functions;
-- normal reads/writes are covered by RLS + grants.
-- =========================================================

-- ---------- helpers ----------
CREATE OR REPLACE FUNCTION public.is_general_admin(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.admin_grants WHERE user_id = _uid AND is_general)
$$;

CREATE OR REPLACE FUNCTION public.can_manage_section(_uid uuid, _section uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_grants g
    WHERE g.user_id = _uid
      AND (g.is_general OR (_section IS NOT NULL AND g.section_id = _section))
  )
$$;

CREATE OR REPLACE FUNCTION public.can_manage_session(_uid uuid, _session uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.attendance_sessions s
    WHERE s.id = _session AND public.can_manage_section(_uid, s.section_id)
  )
$$;

REVOKE ALL ON FUNCTION public.is_general_admin(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_section(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_session(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_general_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_section(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_session(uuid, uuid) TO authenticated, service_role;

-- ---------- departments (sections) ----------
-- The table stays fully locked; access is only through these functions,
-- so passkeys are never exposed to a non-general admin.

CREATE OR REPLACE FUNCTION public.list_departments()
RETURNS TABLE (id uuid, name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.id, s.name FROM public.sections s ORDER BY s.created_at ASC
$$;
REVOKE ALL ON FUNCTION public.list_departments() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_departments() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.my_access()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'general', public.is_general_admin(auth.uid()),
    'sectionIds', COALESCE(
      (SELECT jsonb_agg(g.section_id) FROM public.admin_grants g
        WHERE g.user_id = auth.uid() AND g.section_id IS NOT NULL), '[]'::jsonb)
  )
$$;
REVOKE ALL ON FUNCTION public.my_access() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_access() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_list_sections()
RETURNS TABLE (id uuid, name text, passkey text, created_at timestamptz, is_disabled boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_general_admin(auth.uid()) THEN
    RAISE EXCEPTION 'General Admin access required.';
  END IF;
  RETURN QUERY
    SELECT s.id, s.name, s.passkey, s.created_at, s.is_disabled
    FROM public.sections s ORDER BY s.created_at ASC;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_list_sections() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_sections() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_create_section(_name text, _passkey text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _row public.sections;
BEGIN
  IF NOT public.is_general_admin(auth.uid()) THEN
    RAISE EXCEPTION 'General Admin access required.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.sections WHERE lower(btrim(name)) = lower(btrim(_name))) THEN
    RAISE EXCEPTION 'A department with that name already exists.';
  END IF;
  INSERT INTO public.sections (name, passkey)
  VALUES (btrim(_name), btrim(_passkey)) RETURNING * INTO _row;
  RETURN jsonb_build_object('id', _row.id, 'name', _row.name);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_section(_id uuid, _name text, _passkey text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_general_admin(auth.uid()) THEN
    RAISE EXCEPTION 'General Admin access required.';
  END IF;
  UPDATE public.sections
     SET name = COALESCE(NULLIF(btrim(_name), ''), name),
         passkey = COALESCE(NULLIF(btrim(_passkey), ''), passkey)
   WHERE id = _id;
  IF NULLIF(btrim(COALESCE(_passkey, '')), '') IS NOT NULL THEN
    DELETE FROM public.admin_grants WHERE section_id = _id;
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_section_disabled(_id uuid, _disabled boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_general_admin(auth.uid()) THEN
    RAISE EXCEPTION 'General Admin access required.';
  END IF;
  UPDATE public.sections SET is_disabled = _disabled WHERE id = _id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_section(_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_general_admin(auth.uid()) THEN
    RAISE EXCEPTION 'General Admin access required.';
  END IF;
  DELETE FROM public.admin_grants WHERE section_id = _id;
  DELETE FROM public.sections WHERE id = _id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_general_passkey(_passkey text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_general_admin(auth.uid()) THEN
    RAISE EXCEPTION 'General Admin access required.';
  END IF;
  UPDATE public.app_settings SET general_passkey = btrim(_passkey) WHERE id = 1;
  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_general_passkey()
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _k text;
BEGIN
  IF NOT public.is_general_admin(auth.uid()) THEN
    RAISE EXCEPTION 'General Admin access required.';
  END IF;
  SELECT general_passkey INTO _k FROM public.app_settings WHERE id = 1;
  RETURN COALESCE(_k, 'FEM2026');
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_section(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_update_section(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_section_disabled(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_delete_section(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_general_passkey(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_general_passkey() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_create_section(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_update_section(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_section_disabled(uuid, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_delete_section(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_general_passkey(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_general_passkey() TO authenticated, service_role;

-- ---------- passkey unlock ----------
CREATE OR REPLACE FUNCTION public.unlock_passkey(_passkey text, _section uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _key text := upper(btrim(COALESCE(_passkey, '')));
  _general text;
  _match public.sections;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Sign in first.'; END IF;
  IF _key = '' THEN RETURN jsonb_build_object('ok', false, 'reason', 'Enter a passkey.'); END IF;

  SELECT upper(btrim(COALESCE(general_passkey, 'FEM2026'))) INTO _general
  FROM public.app_settings WHERE id = 1;
  _general := COALESCE(_general, 'FEM2026');

  IF _key = _general THEN
    IF NOT EXISTS (SELECT 1 FROM public.admin_grants WHERE user_id = _uid AND is_general) THEN
      INSERT INTO public.admin_grants (user_id, is_general, section_id) VALUES (_uid, true, NULL);
    END IF;
    RETURN jsonb_build_object('ok', true, 'role', 'general', 'section', NULL);
  END IF;

  SELECT * INTO _match FROM public.sections
   WHERE upper(btrim(passkey)) = _key LIMIT 1;

  IF _match.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Incorrect passkey.');
  END IF;
  IF _match.is_disabled THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'This section admin has been disabled.');
  END IF;
  IF _section IS NOT NULL AND _section <> _match.id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'That passkey belongs to a different department.');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.admin_grants WHERE user_id = _uid AND section_id = _match.id) THEN
    INSERT INTO public.admin_grants (user_id, section_id, is_general)
    VALUES (_uid, _match.id, false);
  END IF;

  RETURN jsonb_build_object('ok', true, 'role', 'section',
    'section', jsonb_build_object('id', _match.id, 'name', _match.name));
END;
$$;
REVOKE ALL ON FUNCTION public.unlock_passkey(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unlock_passkey(text, uuid) TO authenticated, service_role;

-- ---------- attendance codes ----------
CREATE OR REPLACE FUNCTION public.ensure_active_code(_session uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _s public.attendance_sessions;
  _code text := '';
  _alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  _row public.attendance_codes;
  i int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Sign in first.'; END IF;
  SELECT * INTO _s FROM public.attendance_sessions WHERE id = _session;
  IF _s.id IS NULL THEN RAISE EXCEPTION 'Session not found.'; END IF;

  -- Only an admin of that section, or a student the session applies to.
  IF NOT (
    public.can_manage_section(_uid, _s.section_id)
    OR _s.section_id IS NULL
    OR _s.section_id = (SELECT section_id FROM public.profiles WHERE id = _uid)
  ) THEN
    RAISE EXCEPTION 'This session belongs to another department.';
  END IF;

  SELECT * INTO _row FROM public.attendance_codes
   WHERE session_id = _session AND expires_at > now()
   ORDER BY expires_at DESC LIMIT 1;

  IF _row.id IS NOT NULL THEN
    RETURN jsonb_build_object('code', _row.code, 'expiresAt', _row.expires_at);
  END IF;

  FOR i IN 1..6 LOOP
    _code := _code || substr(_alphabet, 1 + floor(random() * length(_alphabet))::int, 1);
  END LOOP;

  INSERT INTO public.attendance_codes (session_id, code, expires_at)
  VALUES (_session, _code, now() + interval '4 minutes')
  RETURNING * INTO _row;

  RETURN jsonb_build_object('code', _row.code, 'expiresAt', _row.expires_at);
END;
$$;
REVOKE ALL ON FUNCTION public.ensure_active_code(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_active_code(uuid) TO authenticated, service_role;

-- ---------- marking attendance ----------
CREATE OR REPLACE FUNCTION public.mark_attendance(
  _session uuid, _full_name text, _code text,
  _lat double precision, _lng double precision, _accuracy double precision DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _s public.attendance_sessions;
  _student_section uuid;
  _name text := btrim(regexp_replace(COALESCE(_full_name, ''), '\s+', ' ', 'g'));
  _dist double precision;
  _r double precision := 6371000;
  _dlat double precision;
  _dlng double precision;
  _a double precision;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Sign in first.'; END IF;
  IF length(_name) < 3 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Enter your full name.');
  END IF;

  SELECT * INTO _s FROM public.attendance_sessions WHERE id = _session;
  IF _s.id IS NULL OR NOT _s.is_active THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'That attendance session is no longer open.');
  END IF;

  SELECT section_id INTO _student_section FROM public.profiles WHERE id = _uid;
  IF _s.section_id IS NOT NULL AND _s.section_id IS DISTINCT FROM _student_section THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'This session belongs to another department.');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.attendance_codes
     WHERE session_id = _s.id
       AND upper(btrim(code)) = upper(btrim(COALESCE(_code, '')))
       AND expires_at > now()
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason',
      'That code is invalid or has expired. Copy the latest code and try again.');
  END IF;

  _dlat := radians(_lat - _s.lat);
  _dlng := radians(_lng - _s.lng);
  _a := sin(_dlat / 2) ^ 2 + cos(radians(_s.lat)) * cos(radians(_lat)) * sin(_dlng / 2) ^ 2;
  _dist := 2 * _r * asin(least(1, sqrt(_a)));

  IF _dist > _s.radius_m THEN
    RETURN jsonb_build_object('ok', false, 'distance', _dist, 'reason',
      'You are ' || round((_dist - _s.radius_m)::numeric)::text ||
      ' meters outside the attendance area. Move closer to verify.');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.attendance_records
     WHERE session_id = _s.id AND lower(btrim(full_name)) = lower(_name)
  ) THEN
    RETURN jsonb_build_object('ok', true, 'distance', _dist, 'already', true);
  END IF;

  INSERT INTO public.attendance_records
    (session_id, student_id, full_name, lat, lng, distance_m, accuracy_m, marked_at)
  VALUES (_s.id, _uid, _name, _lat, _lng, _dist, _accuracy, now());

  RETURN jsonb_build_object('ok', true, 'distance', _dist, 'already', false);
END;
$$;
REVOKE ALL ON FUNCTION public.mark_attendance(uuid, text, text, double precision, double precision, double precision) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_attendance(uuid, text, text, double precision, double precision, double precision) TO authenticated, service_role;

-- ---------- report deletion ----------
CREATE OR REPLACE FUNCTION public.admin_delete_session(_session uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.can_manage_session(auth.uid(), _session) THEN
    RAISE EXCEPTION 'You do not have access to this report.';
  END IF;
  DELETE FROM public.attendance_records WHERE session_id = _session;
  DELETE FROM public.attendance_codes WHERE session_id = _session;
  DELETE FROM public.attendance_sessions WHERE id = _session;
  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_delete_session(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_session(uuid) TO authenticated, service_role;

-- ---------- grants + policies on tables the client touches ----------

-- admin_grants: a user may read their own grants.
GRANT SELECT ON public.admin_grants TO authenticated;
GRANT ALL ON public.admin_grants TO service_role;
DROP POLICY IF EXISTS grants_select_own ON public.admin_grants;
CREATE POLICY grants_select_own ON public.admin_grants
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- app_settings: branding is public, the general passkey is not.
REVOKE SELECT ON public.app_settings FROM anon, authenticated;
GRANT SELECT (id, logo_url, app_name, report_email, updated_at) ON public.app_settings TO anon, authenticated;
GRANT UPDATE (logo_url, app_name, report_email, updated_at) ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;
DROP POLICY IF EXISTS settings_admin_write ON public.app_settings;
DROP POLICY IF EXISTS settings_admin_insert ON public.app_settings;
CREATE POLICY settings_admin_write ON public.app_settings
  FOR UPDATE TO authenticated
  USING (public.is_general_admin(auth.uid()))
  WITH CHECK (public.is_general_admin(auth.uid()));

-- sessions: admins of the section create/close/update; everyone signed in reads.
GRANT SELECT, INSERT, UPDATE ON public.attendance_sessions TO authenticated;
GRANT ALL ON public.attendance_sessions TO service_role;
DROP POLICY IF EXISTS sessions_admin_insert ON public.attendance_sessions;
DROP POLICY IF EXISTS sessions_admin_update ON public.attendance_sessions;
CREATE POLICY sessions_admin_insert ON public.attendance_sessions
  FOR INSERT TO authenticated
  WITH CHECK (admin_id = auth.uid() AND public.can_manage_section(auth.uid(), section_id));
CREATE POLICY sessions_admin_update ON public.attendance_sessions
  FOR UPDATE TO authenticated
  USING (public.can_manage_section(auth.uid(), section_id))
  WITH CHECK (public.can_manage_section(auth.uid(), section_id));

-- codes / records stay read-only for clients (writes go through the functions above).
GRANT SELECT ON public.attendance_codes TO authenticated;
GRANT ALL ON public.attendance_codes TO service_role;
GRANT SELECT ON public.attendance_records TO authenticated;
GRANT ALL ON public.attendance_records TO service_role;

GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;