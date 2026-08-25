import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { CODE_TTL_MS, haversineMeters } from "./geo";

export const ADMIN_PASSKEY = "FEM2026";

export function generateCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

export async function assertAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Admin access required. Unlock with the admin passkey.");
}

export async function grantAdmin(userId: string) {
  await supabaseAdmin.from("user_roles").upsert(
    { user_id: userId, role: "admin" },
    { onConflict: "user_id,role" },
  );
}

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

export async function getActiveSessionRow() {
  const { data } = await supabaseAdmin
    .from("attendance_sessions")
    .select("*")
    .eq("is_active", true)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

export async function verifyAndMark(
  userId: string,
  fullName: string,
  code: string,
  lat: number,
  lng: number,
  accuracy?: number,
) {
  const session = await getActiveSessionRow();
  if (!session) {
    return { ok: false as const, reason: "No attendance session is currently open." };
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
  const payload = {
    session_id: session.id,
    student_id: userId,
    full_name: name,
    lat,
    lng,
    distance_m: distance,
    accuracy_m: typeof accuracy === "number" ? accuracy : null,
    marked_at: new Date().toISOString(),
  };

  const { data: existing } = await supabaseAdmin
    .from("attendance_records")
    .select("id")
    .eq("session_id", session.id)
    .ilike("full_name", name)
    .maybeSingle();

  if (existing) {
    return { ok: true as const, distance, session, already: true as const };
  }

  const { error } = await supabaseAdmin.from("attendance_records").insert(payload);
  if (error) return { ok: false as const, reason: "Could not save attendance. Try again." };

  return { ok: true as const, distance, session, already: false as const };
}

export type ReportRow = {
  name: string;
  status: "Present";
  markedAt: string;
  distance: number | null;
  accuracy: number | null;
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
  rows: ReportRow[];
  presentCount: number;
};

export async function buildReport(sessionId: string): Promise<Report> {
  const { data: session } = await supabaseAdmin
    .from("attendance_sessions")
    .select("id, course_name, course_code, started_at, closed_at, radius_m")
    .eq("id", sessionId)
    .single();
  if (!session) throw new Error("Session not found.");

  const { data: records } = await supabaseAdmin
    .from("attendance_records")
    .select("full_name, marked_at, distance_m, accuracy_m")
    .eq("session_id", sessionId)
    .order("marked_at", { ascending: true });

  const rows: ReportRow[] = (records ?? [])
    .map((r) => ({
      name: r.full_name,
      status: "Present" as const,
      markedAt: r.marked_at,
      distance: r.distance_m,
      accuracy: r.accuracy_m,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { session, rows, presentCount: rows.length };
}
