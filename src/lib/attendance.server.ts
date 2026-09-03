import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { CODE_TTL_MS, haversineMeters } from "./geo";

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

export function generateCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

/* ---------------------------------------------------------------- access */

export async function getAccess(userId: string): Promise<Access> {
  const { data } = await supabaseAdmin
    .from("admin_grants")
    .select("section_id, is_general")
    .eq("user_id", userId);
  const rows = data ?? [];
  return {
    general: rows.some((r) => r.is_general),
    sectionIds: rows.map((r) => r.section_id).filter((v): v is string => !!v),
  };
}

export async function assertGeneral(userId: string) {
  const access = await getAccess(userId);
  if (!access.general) throw new Error("General Admin access required.");
  return access;
}

/** `null` sectionId means the General Admin scope. */
export async function assertSectionAccess(userId: string, sectionId: string | null) {
  const access = await getAccess(userId);
  if (access.general) return access;
  if (sectionId && access.sectionIds.includes(sectionId)) return access;
  throw new Error("You do not have access to this department.");
}

export async function getGeneralPasskey(): Promise<string> {
  const { data } = await supabaseAdmin
    .from("app_settings")
    .select("general_passkey")
    .eq("id", 1)
    .maybeSingle();
  return (data?.general_passkey ?? "FEM2026").trim();
}

/** Verifies a passkey and records the matching grant for this user. */
export async function unlockWithPasskey(
  userId: string,
  rawPasskey: string,
  targetSectionId?: string | null,
) {
  const passkey = rawPasskey.trim();
  if (!passkey) return { ok: false as const, reason: "Enter a passkey." };

  const general = await getGeneralPasskey();
  if (passkey.toUpperCase() === general.toUpperCase()) {
    const { data: has } = await supabaseAdmin
      .from("admin_grants")
      .select("id")
      .eq("user_id", userId)
      .eq("is_general", true)
      .maybeSingle();
    if (!has) {
      await supabaseAdmin
        .from("admin_grants")
        .insert({ user_id: userId, is_general: true, section_id: null });
    }
    return { ok: true as const, role: "general" as const, section: null };
  }

  const { data: sections } = await supabaseAdmin
    .from("sections")
    .select("id, name, passkey, is_disabled");
  const match = (sections ?? []).find(
    (s) => s.passkey.trim().toUpperCase() === passkey.toUpperCase(),
  );
  if (!match) return { ok: false as const, reason: "Incorrect passkey." };
  if (match.is_disabled) {
    return { ok: false as const, reason: "This section admin has been disabled." };
  }
  if (targetSectionId && targetSectionId !== match.id) {
    return { ok: false as const, reason: "That passkey belongs to a different department." };
  }

  const { data: existing } = await supabaseAdmin
    .from("admin_grants")
    .select("id")
    .eq("user_id", userId)
    .eq("section_id", match.id)
    .maybeSingle();
  if (!existing) {
    await supabaseAdmin
      .from("admin_grants")
      .insert({ user_id: userId, section_id: match.id, is_general: false });
  }
  return {
    ok: true as const,
    role: "section" as const,
    section: { id: match.id, name: match.name },
  };
}

/* -------------------------------------------------------------- sections */

export async function listSections(): Promise<Section[]> {
  const { data } = await supabaseAdmin
    .from("sections")
    .select("id, name, passkey, created_at, is_disabled")
    .order("created_at", { ascending: true });
  return data ?? [];
}

export async function listPublicSections(): Promise<PublicSection[]> {
  const { data } = await supabaseAdmin
    .from("sections")
    .select("id, name")
    .order("created_at", { ascending: true });
  return data ?? [];
}

export async function createSection(name: string, passkey: string) {
  const { data, error } = await supabaseAdmin
    .from("sections")
    .insert({ name: name.trim(), passkey: passkey.trim() })
    .select("id, name")
    .single();
  if (error || !data) {
    throw new Error(
      error?.code === "23505"
        ? "A department with that name already exists."
        : "Could not create the department.",
    );
  }
  return data;
}

export async function setSectionDisabled(id: string, disabled: boolean) {
  const { error } = await supabaseAdmin
    .from("sections")
    .update({ is_disabled: disabled })
    .eq("id", id);
  if (error) throw new Error("Could not update that section admin.");
}

export async function updateSection(id: string, patch: { name?: string; passkey?: string }) {
  const body: { name?: string; passkey?: string } = {};
  if (patch.name) body.name = patch.name.trim();
  if (patch.passkey) body.passkey = patch.passkey.trim();
  if (!Object.keys(body).length) return;
  const { error } = await supabaseAdmin.from("sections").update(body).eq("id", id);
  if (error) throw new Error("Could not update the department.");
  if (patch.passkey) {
    // Existing unlocks must re-authenticate with the new passkey.
    await supabaseAdmin.from("admin_grants").delete().eq("section_id", id);
  }
}

export async function deleteSection(id: string) {
  const { error } = await supabaseAdmin.from("sections").delete().eq("id", id);
  if (error) throw new Error("Could not delete the department.");
}

export async function setGeneralPasskey(passkey: string) {
  const { error } = await supabaseAdmin
    .from("app_settings")
    .update({ general_passkey: passkey.trim() })
    .eq("id", 1);
  if (error) throw new Error("Could not update the General Admin passkey.");
}

/* ----------------------------------------------------------------- codes */

export type ActiveCode = { code: string; expiresAt: string };

/** Returns the live code for a session, rotating it automatically every 4 minutes. */
export async function ensureActiveCode(sessionId: string): Promise<ActiveCode> {
  const nowIso = new Date().toISOString();
  const { data: existing } = await supabaseAdmin
    .from("attendance_codes")
    .select("code, expires_at")
    .eq("session_id", sessionId)
    .gt("expires_at", nowIso)
    .order("expires_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) return { code: existing.code, expiresAt: existing.expires_at };

  const code = generateCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();
  const { data: inserted, error } = await supabaseAdmin
    .from("attendance_codes")
    .insert({ session_id: sessionId, code, expires_at: expiresAt })
    .select("code, expires_at")
    .single();
  if (error || !inserted) throw new Error("Could not generate an attendance code.");
  return { code: inserted.code, expiresAt: inserted.expires_at };
}

/* -------------------------------------------------------------- sessions */

/** `null` sectionId targets the cross-department General session. */
export async function getActiveSessionForSection(sectionId: string | null) {
  let query = supabaseAdmin
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
  studentSectionId: string | null,
): Promise<StudentSession[]> {
  const out: StudentSession[] = [];

  const general = await getActiveSessionForSection(null);
  if (general) out.push(await decorate(general, null, GENERAL_LABEL));

  if (studentSectionId) {
    const own = await getActiveSessionForSection(studentSectionId);
    if (own) {
      const { data: sec } = await supabaseAdmin
        .from("sections")
        .select("name")
        .eq("id", studentSectionId)
        .maybeSingle();
      out.push(await decorate(own, studentSectionId, sec?.name ?? "My department"));
    }
  }
  return out;
}

async function decorate(
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
  const code = await ensureActiveCode(s.id);
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
  userId: string,
  studentSectionId: string | null,
  sessionId: string,
  fullName: string,
  code: string,
  lat: number,
  lng: number,
  accuracy?: number,
) {
  const { data: session } = await supabaseAdmin
    .from("attendance_sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();

  if (!session || !session.is_active) {
    return { ok: false as const, reason: "That attendance session is no longer open." };
  }
  const eligible = session.section_id === null || session.section_id === studentSectionId;
  if (!eligible) {
    return { ok: false as const, reason: "This session belongs to another department." };
  }

  const nowIso = new Date().toISOString();
  const { data: match } = await supabaseAdmin
    .from("attendance_codes")
    .select("id")
    .eq("session_id", session.id)
    .eq("code", code.trim().toUpperCase())
    .gt("expires_at", nowIso)
    .maybeSingle();

  if (!match) {
    return {
      ok: false as const,
      reason: "That code is invalid or has expired. Copy the latest code and try again.",
    };
  }

  const distance = haversineMeters(session.lat, session.lng, lat, lng);
  if (distance > session.radius_m) {
    return {
      ok: false as const,
      reason: `You are ${Math.round(distance - session.radius_m)} meters outside the attendance area. Move closer to verify.`,
      distance,
    };
  }

  const name = fullName.trim().replace(/\s+/g, " ");
  const { data: existing } = await supabaseAdmin
    .from("attendance_records")
    .select("id")
    .eq("session_id", session.id)
    .ilike("full_name", name)
    .maybeSingle();

  if (existing) {
    return { ok: true as const, distance, already: true as const };
  }

  const { error } = await supabaseAdmin.from("attendance_records").insert({
    session_id: session.id,
    student_id: userId,
    full_name: name,
    lat,
    lng,
    distance_m: distance,
    accuracy_m: typeof accuracy === "number" ? accuracy : null,
    marked_at: new Date().toISOString(),
  });
  if (error) return { ok: false as const, reason: "Could not save attendance. Try again." };

  return { ok: true as const, distance, already: false as const };
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

export async function buildReport(sessionId: string): Promise<Report> {
  const { data: session } = await supabaseAdmin
    .from("attendance_sessions")
    .select("id, course_name, course_code, started_at, closed_at, radius_m, section_id")
    .eq("id", sessionId)
    .single();
  if (!session) throw new Error("Session not found.");

  let sectionName = GENERAL_LABEL;
  if (session.section_id) {
    const { data: sec } = await supabaseAdmin
      .from("sections")
      .select("name")
      .eq("id", session.section_id)
      .maybeSingle();
    sectionName = sec?.name ?? GENERAL_LABEL;
  }

  const { data: records } = await supabaseAdmin
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

export async function listSessionHistory(access: Access): Promise<SessionSummary[]> {
  let query = supabaseAdmin
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

  const { data: sectionRows } = await supabaseAdmin.from("sections").select("id, name");
  const names = new Map((sectionRows ?? []).map((s) => [s.id, s.name]));

  const { data: counts } = await supabaseAdmin
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

export async function deleteSessionCompletely(sessionId: string) {
  await supabaseAdmin.from("attendance_records").delete().eq("session_id", sessionId);
  await supabaseAdmin.from("attendance_codes").delete().eq("session_id", sessionId);
  const { error } = await supabaseAdmin
    .from("attendance_sessions")
    .delete()
    .eq("id", sessionId);
  if (error) throw new Error("Could not delete that report.");
}
