import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { CODE_TTL_MS, haversineMeters } from "./geo";

export type Section = { id: string; name: string; passkey: string; created_at: string };
export type PublicSection = { id: string; name: string };

export type Access = { general: boolean; sectionIds: string[] };

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
}

export async function assertSectionAccess(userId: string, sectionId: string) {
  const access = await getAccess(userId);
  if (access.general || access.sectionIds.includes(sectionId)) return access;
  throw new Error("You do not have access to this section.");
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
export async function unlockWithPasskey(userId: string, rawPasskey: string) {
  const passkey = rawPasskey.trim();
  if (!passkey) return { ok: false as const, reason: "Enter a passkey." };

  const general = await getGeneralPasskey();
  if (passkey.toUpperCase() === general.toUpperCase()) {
    await supabaseAdmin
      .from("admin_grants")
      .upsert({ user_id: userId, is_general: true, section_id: null }, { onConflict: "user_id" })
      .select("id");
    return { ok: true as const, role: "general" as const, section: null };
  }

  const { data: sections } = await supabaseAdmin.from("sections").select("id, name, passkey");
  const match = (sections ?? []).find(
    (s) => s.passkey.trim().toUpperCase() === passkey.toUpperCase(),
  );
  if (!match) return { ok: false as const, reason: "Incorrect passkey." };

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
    .select("id, name, passkey, created_at")
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
      error?.code === "23505" ? "A section with that name already exists." : "Could not create the section.",
    );
  }
  return data;
}

export async function updateSection(
  id: string,
  patch: { name?: string; passkey?: string },
) {
  const body: { name?: string; passkey?: string } = {};
  if (patch.name) body.name = patch.name.trim();
  if (patch.passkey) body.passkey = patch.passkey.trim();
  if (!Object.keys(body).length) return;
  const { error } = await supabaseAdmin.from("sections").update(body).eq("id", id);
  if (error) throw new Error("Could not update the section.");
  if (patch.passkey) {
    // Existing unlocks must re-authenticate with the new passkey.
    await supabaseAdmin.from("admin_grants").delete().eq("section_id", id);
  }
}

export async function deleteSection(id: string) {
  const { error } = await supabaseAdmin.from("sections").delete().eq("id", id);
  if (error) throw new Error("Could not delete the section.");
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

export async function getActiveSessionForSection(sectionId: string) {
  const { data } = await supabaseAdmin
    .from("attendance_sessions")
    .select("*")
    .eq("section_id", sectionId)
    .eq("is_active", true)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

export async function verifyAndMark(
  userId: string,
  sectionId: string,
  fullName: string,
  code: string,
  lat: number,
  lng: number,
  accuracy?: number,
) {
  const session = await getActiveSessionForSection(sectionId);
  if (!session) {
    return { ok: false as const, reason: "No attendance session is open for this section." };
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
      reason: "That code is invalid or has expired. Get the latest code and try again.",
    };
  }

  const distance = haversineMeters(session.lat, session.lng, lat, lng);
  if (distance > session.radius_m) {
    return {
      ok: false as const,
      reason: `You are ${Math.round(distance - session.radius_m)} meters outside the attendance area. Move closer to verify.`,
      distance,
      session,
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
    return { ok: true as const, distance, session, already: true as const };
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

  return { ok: true as const, distance, session, already: false as const };
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

  let sectionName = "General";
  if (session.section_id) {
    const { data: sec } = await supabaseAdmin
      .from("sections")
      .select("name")
      .eq("id", session.section_id)
      .maybeSingle();
    sectionName = sec?.name ?? "General";
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
    sectionName: (s.section_id && names.get(s.section_id)) || "General",
    presentCount: tally.get(s.id) ?? 0,
  }));
}
