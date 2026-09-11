import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

/**
 * Every function here runs with an RLS-scoped Supabase client (the signed-in
 * user), never a service-role client. Privileged work is delegated to
 * SECURITY DEFINER database functions, so the app only ever needs the public
 * Supabase keys — which is what makes it deployable anywhere (Vercel included).
 */
export type Db = SupabaseClient<Database>;

export type Section = {
  id: string;
  name: string;
  passkey: string;
  created_at: string;
  is_disabled: boolean;
};
export type PublicSection = { id: string; name: string };

export type Access = { general: boolean; sectionIds: string[] };

export const GENERAL_LABEL = "General (all departments)";

function rpcError(error: { message: string } | null, fallback: string): never | void {
  if (error) throw new Error(error.message || fallback);
}

/* ---------------------------------------------------------------- access */

export async function getAccess(db: Db): Promise<Access> {
  const { data, error } = await db.rpc("my_access");
  rpcError(error, "Could not check your admin access.");
  const parsed = (data ?? {}) as { general?: boolean; sectionIds?: string[] };
  return {
    general: !!parsed.general,
    sectionIds: (parsed.sectionIds ?? []).filter((v): v is string => !!v),
  };
}

export async function assertGeneral(db: Db) {
  const access = await getAccess(db);
  if (!access.general) throw new Error("General Admin access required.");
  return access;
}

/** `null` sectionId means the General Admin scope. */
export async function assertSectionAccess(db: Db, sectionId: string | null) {
  const access = await getAccess(db);
  if (access.general) return access;
  if (sectionId && access.sectionIds.includes(sectionId)) return access;
  throw new Error("You do not have access to this department.");
}

/** Verifies a passkey and records the matching grant for this user. */
export async function unlockWithPasskey(
  db: Db,
  rawPasskey: string,
  targetSectionId?: string | null,
) {
  const { data, error } = await db.rpc("unlock_passkey", {
    _passkey: rawPasskey,
    _section: targetSectionId ?? undefined,
  });
  if (error) return { ok: false as const, reason: "Could not verify that passkey." };
  const res = (data ?? {}) as {
    ok?: boolean;
    reason?: string;
    role?: "general" | "section";
    section?: { id: string; name: string } | null;
  };
  if (!res.ok) return { ok: false as const, reason: res.reason ?? "Incorrect passkey." };
  return {
    ok: true as const,
    role: res.role ?? "section",
    section: res.section ?? null,
  };
}

export async function getGeneralPasskey(db: Db): Promise<string> {
  const { data, error } = await db.rpc("admin_general_passkey");
  rpcError(error, "General Admin access required.");
  return (data as string | null)?.trim() ?? "FEM2026";
}

/* -------------------------------------------------------------- sections */

export async function listSections(db: Db): Promise<Section[]> {
  const { data, error } = await db.rpc("admin_list_sections");
  rpcError(error, "Could not load the departments.");
  return (data ?? []) as Section[];
}

export async function listPublicSections(db: Db): Promise<PublicSection[]> {
  const { data, error } = await db.rpc("list_departments");
  rpcError(error, "Could not load the departments.");
  return (data ?? []) as PublicSection[];
}

export async function createSection(db: Db, name: string, passkey: string) {
  const { data, error } = await db.rpc("admin_create_section", {
    _name: name,
    _passkey: passkey,
  });
  rpcError(error, "Could not create the department.");
  return (data ?? {}) as { id: string; name: string };
}

export async function setSectionDisabled(db: Db, id: string, disabled: boolean) {
  const { error } = await db.rpc("admin_set_section_disabled", {
    _id: id,
    _disabled: disabled,
  });
  rpcError(error, "Could not update that section admin.");
}

export async function updateSection(
  db: Db,
  id: string,
  patch: { name?: string; passkey?: string },
) {
  if (!patch.name && !patch.passkey) return;
  const { error } = await db.rpc("admin_update_section", {
    _id: id,
    _name: patch.name ?? "",
    _passkey: patch.passkey ?? "",
  });
  rpcError(error, "Could not update the department.");
}

export async function deleteSection(db: Db, id: string) {
  const { error } = await db.rpc("admin_delete_section", { _id: id });
  rpcError(error, "Could not delete the department.");
}

export async function setGeneralPasskey(db: Db, passkey: string) {
  const { error } = await db.rpc("admin_set_general_passkey", { _passkey: passkey });
  rpcError(error, "Could not update the General Admin passkey.");
}

/* ----------------------------------------------------------------- codes */

export type ActiveCode = { code: string; expiresAt: string };

/** Live code for a session; the database rotates it every 4 minutes. */
export async function ensureActiveCode(db: Db, sessionId: string): Promise<ActiveCode> {
  const { data, error } = await db.rpc("ensure_active_code", { _session: sessionId });
  rpcError(error, "Could not generate an attendance code.");
  const res = (data ?? {}) as { code?: string; expiresAt?: string };
  if (!res.code || !res.expiresAt) throw new Error("Could not generate an attendance code.");
  return { code: res.code, expiresAt: res.expiresAt };
}

/* -------------------------------------------------------------- sessions */

/** `null` sectionId targets the cross-department General session. */
export async function getActiveSessionForSection(db: Db, sectionId: string | null) {
  let query = db
    .from("attendance_sessions")
    .select("*")
    .eq("is_active", true)
    .order("started_at", { ascending: false })
    .limit(1);
  query = sectionId ? query.eq("section_id", sectionId) : query.is("section_id", null);
  const { data } = await query.maybeSingle();
  return data;
}

export type StudentSession = {
  id: string;
  course_name: string;
  course_code: string | null;
  lat: number;
  lng: number;
  radius_m: number;
  started_at: string;
  sectionId: string | null;
  sectionName: string;
  code: string;
  expiresAt: string;
};

/** Sessions a student may mark: their own department plus any General session. */
export async function listStudentSessions(
  db: Db,
  studentSectionId: string | null,
): Promise<StudentSession[]> {
  const out: StudentSession[] = [];

  const general = await getActiveSessionForSection(db, null);
  if (general) out.push(await decorate(db, general, null, GENERAL_LABEL));

  if (studentSectionId) {
    const own = await getActiveSessionForSection(db, studentSectionId);
    if (own) {
      const sections = await listPublicSections(db);
      const name = sections.find((s) => s.id === studentSectionId)?.name ?? "My department";
      out.push(await decorate(db, own, studentSectionId, name));
    }
  }
  return out;
}

async function decorate(
  db: Db,
  s: {
    id: string;
    course_name: string;
    course_code: string | null;
    lat: number;
    lng: number;
    radius_m: number;
    started_at: string;
  },
  sectionId: string | null,
  sectionName: string,
): Promise<StudentSession> {
  const code = await ensureActiveCode(db, s.id);
  return {
    id: s.id,
    course_name: s.course_name,
    course_code: s.course_code,
    lat: s.lat,
    lng: s.lng,
    radius_m: s.radius_m,
    started_at: s.started_at,
    sectionId,
    sectionName,
    code: code.code,
    expiresAt: code.expiresAt,
  };
}

export async function verifyAndMark(
  db: Db,
  sessionId: string,
  fullName: string,
  code: string,
  lat: number,
  lng: number,
  accuracy?: number,
) {
  const { data, error } = await db.rpc("mark_attendance", {
    _session: sessionId,
    _full_name: fullName,
    _code: code,
    _lat: lat,
    _lng: lng,
    _accuracy: typeof accuracy === "number" ? accuracy : undefined,
  });
  if (error) return { ok: false as const, reason: "Could not save attendance. Try again." };
  const res = (data ?? {}) as {
    ok?: boolean;
    reason?: string;
    distance?: number;
    already?: boolean;
  };
  if (!res.ok) {
    return {
      ok: false as const,
      reason: res.reason ?? "Could not save attendance. Try again.",
      distance: res.distance,
    };
  }
  return { ok: true as const, distance: res.distance ?? 0, already: !!res.already };
}

/* --------------------------------------------------------------- reports */

export type ReportRow = {
  name: string;
  status: "Present";
  markedAt: string;
};

export type Report = {
  session: {
    id: string;
    course_name: string;
    course_code: string | null;
    started_at: string;
    closed_at: string | null;
    radius_m: number;
  };
  sectionName: string;
  rows: ReportRow[];
  presentCount: number;
};

export type SessionSummary = {
  id: string;
  course_name: string;
  course_code: string | null;
  started_at: string;
  closed_at: string | null;
  is_active: boolean;
  section_id: string | null;
  sectionName: string;
  presentCount: number;
};

export async function buildReport(db: Db, sessionId: string): Promise<Report> {
  const { data: session } = await db
    .from("attendance_sessions")
    .select("id, course_name, course_code, started_at, closed_at, radius_m, section_id")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session) throw new Error("Session not found.");

  let sectionName = GENERAL_LABEL;
  if (session.section_id) {
    const sections = await listPublicSections(db);
    sectionName = sections.find((s) => s.id === session.section_id)?.name ?? GENERAL_LABEL;
  }

  const { data: records } = await db
    .from("attendance_records")
    .select("full_name, marked_at")
    .eq("session_id", sessionId)
    .order("marked_at", { ascending: true });

  const rows: ReportRow[] = (records ?? [])
    .map((r) => ({ name: r.full_name, status: "Present" as const, markedAt: r.marked_at }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const { section_id: _omit, ...sessionInfo } = session;
  return { session: sessionInfo, sectionName, rows, presentCount: rows.length };
}

export async function listSessionHistory(db: Db, access: Access): Promise<SessionSummary[]> {
  let query = db
    .from("attendance_sessions")
    .select("id, course_name, course_code, started_at, closed_at, is_active, section_id")
    .order("started_at", { ascending: false })
    .limit(200);
  if (!access.general) {
    if (!access.sectionIds.length) return [];
    query = query.in("section_id", access.sectionIds);
  }
  const { data: sessions } = await query;
  if (!sessions?.length) return [];

  const sectionRows = await listPublicSections(db);
  const names = new Map(sectionRows.map((s) => [s.id, s.name]));

  const { data: counts } = await db
    .from("attendance_records")
    .select("session_id")
    .in(
      "session_id",
      sessions.map((s) => s.id),
    );
  const tally = new Map<string, number>();
  for (const row of counts ?? []) {
    tally.set(row.session_id, (tally.get(row.session_id) ?? 0) + 1);
  }

  return sessions.map((s) => ({
    ...s,
    sectionName: (s.section_id && names.get(s.section_id)) || GENERAL_LABEL,
    presentCount: tally.get(s.id) ?? 0,
  }));
}

export async function deleteSessionCompletely(db: Db, sessionId: string) {
  const { error } = await db.rpc("admin_delete_session", { _session: sessionId });
  rpcError(error, "Could not delete that report.");
}
