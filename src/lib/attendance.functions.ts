import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  assertGeneral,
  assertSectionAccess,
  buildReport,
  createSection,
  deleteSection,
  deleteSessionCompletely,
  ensureActiveCode,
  getAccess,
  getActiveSessionForSection,
  listPublicSections,
  listSections,
  listSessionHistory,
  listStudentSessions,
  setGeneralPasskey,
  setSectionDisabled,
  unlockWithPasskey,
  updateSection,
  verifyAndMark,
} from "./attendance.server";

const nullableSectionId = z.string().uuid().nullable();

async function studentSectionId(userId: string): Promise<string | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("section_id")
    .eq("id", userId)
    .maybeSingle();
  return data?.section_id ?? null;
}

/* ------------------------------------------------------------ departments */

/** Public: used by the sign-up form before a session exists. */
export const listDepartments = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("sections")
    .select("id, name")
    .order("created_at", { ascending: true });
  return data ?? [];
});

export const getSections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => listPublicSections());

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email, matric_no, section_id")
      .eq("id", context.userId)
      .maybeSingle();
    let sectionName: string | null = null;
    if (data?.section_id) {
      const { data: sec } = await supabaseAdmin
        .from("sections")
        .select("name")
        .eq("id", data.section_id)
        .maybeSingle();
      sectionName = sec?.name ?? null;
    }
    return { profile: data ?? null, sectionName };
  });

export const setMyDepartment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { sectionId: string }) =>
    z.object({ sectionId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("profiles")
      .update({ section_id: data.sectionId })
      .eq("id", context.userId);
    return { ok: true as const };
  });

/* ----------------------------------------------------------------- admin */

export const unlockAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { passkey: string; sectionId?: string | null }) =>
    z
      .object({
        passkey: z.string().min(1).max(64),
        sectionId: nullableSectionId.optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) =>
    unlockWithPasskey(context.userId, data.passkey, data.sectionId ?? null),
  );

export const getMyAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const access = await getAccess(context.userId);
    const sections = await listPublicSections();
    return {
      general: access.general,
      sections: access.general
        ? sections
        : sections.filter((s) => access.sectionIds.includes(s.id)),
    };
  });

export const listAllSections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertGeneral(context.userId);
    return listSections();
  });

export const addSection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { name: string; passkey: string }) =>
    z
      .object({
        name: z.string().trim().min(2).max(120),
        passkey: z.string().trim().min(4).max(64),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertGeneral(context.userId);
    return createSection(data.name, data.passkey);
  });

export const editSection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; name?: string; passkey?: string }) =>
    z
      .object({
        id: z.string().uuid(),
        name: z.string().trim().min(2).max(120).optional(),
        passkey: z.string().trim().min(4).max(64).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertGeneral(context.userId);
    const patch: { name?: string; passkey?: string } = {};
    if (data.name) patch.name = data.name;
    if (data.passkey) patch.passkey = data.passkey;
    await updateSection(data.id, patch);
    return { ok: true as const };
  });

export const toggleSectionDisabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; disabled: boolean }) =>
    z.object({ id: z.string().uuid(), disabled: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertGeneral(context.userId);
    await setSectionDisabled(data.id, data.disabled);
    return { ok: true as const };
  });

export const removeSection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertGeneral(context.userId);
    await deleteSection(data.id);
    return { ok: true as const };
  });

export const changeGeneralPasskey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { passkey: string }) =>
    z.object({ passkey: z.string().trim().min(4).max(64) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertGeneral(context.userId);
    await setGeneralPasskey(data.passkey);
    return { ok: true as const };
  });

/* --------------------------------------------------------------- sessions */

export const startSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      sectionId: string | null;
      courseName: string;
      courseCode: string;
      lat: number;
      lng: number;
      radius: number;
      accuracy?: number;
    }) =>
      z
        .object({
          sectionId: nullableSectionId,
          courseName: z.string().trim().min(2).max(120),
          courseCode: z.string().trim().max(40),
          lat: z.number().min(-90).max(90),
          lng: z.number().min(-180).max(180),
          radius: z.number().int().min(5).max(5000),
          accuracy: z.number().min(0).max(100000).optional(),
        })
        .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSectionAccess(context.userId, data.sectionId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const closeQuery = supabaseAdmin
      .from("attendance_sessions")
      .update({ is_active: false, closed_at: new Date().toISOString() })
      .eq("is_active", true);
    await (data.sectionId
      ? closeQuery.eq("section_id", data.sectionId)
      : closeQuery.is("section_id", null));

    const { data: session, error } = await supabaseAdmin
      .from("attendance_sessions")
      .insert({
        admin_id: context.userId,
        section_id: data.sectionId,
        course_name: data.courseName,
        course_code: data.courseCode || null,
        lat: data.lat,
        lng: data.lng,
        radius_m: data.radius,
      })
      .select("*")
      .single();
    if (error || !session) throw new Error("Could not start the attendance session.");

    const code = await ensureActiveCode(session.id);
    return { session, code };
  });

export const getLiveSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { sectionId: string | null }) =>
    z.object({ sectionId: nullableSectionId }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSectionAccess(context.userId, data.sectionId);
    const session = await getActiveSessionForSection(data.sectionId);
    if (!session) return { session: null, code: null };
    const code = await ensureActiveCode(session.id);
    return { session, code };
  });

/** Student-facing: their department's session plus any General session, with the live code. */
export const getMySessions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sectionId = await studentSectionId(context.userId);
    const sessions = await listStudentSessions(sectionId);
    return { sectionId, sessions };
  });

export const updateSessionSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      sessionId: string;
      sectionId: string | null;
      radius: number;
      lat?: number;
      lng?: number;
    }) =>
      z
        .object({
          sessionId: z.string().uuid(),
          sectionId: nullableSectionId,
          radius: z.number().int().min(5).max(5000),
          lat: z.number().min(-90).max(90).optional(),
          lng: z.number().min(-180).max(180).optional(),
        })
        .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSectionAccess(context.userId, data.sectionId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { lat, lng } = data;
    await supabaseAdmin
      .from("attendance_sessions")
      .update(
        typeof lat === "number" && typeof lng === "number"
          ? { radius_m: data.radius, lat, lng }
          : { radius_m: data.radius },
      )
      .eq("id", data.sessionId);
    return { ok: true as const };
  });

export const markAttendance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      sessionId: string;
      fullName: string;
      code: string;
      lat: number;
      lng: number;
      accuracy?: number;
    }) =>
      z
        .object({
          sessionId: z.string().uuid(),
          fullName: z.string().trim().min(3).max(80),
          code: z.string().trim().min(4).max(12),
          lat: z.number().min(-90).max(90),
          lng: z.number().min(-180).max(180),
          accuracy: z.number().min(0).max(100000).optional(),
        })
        .parse(d),
  )
  .handler(async ({ data, context }) => {
    const sectionId = await studentSectionId(context.userId);
    return verifyAndMark(
      context.userId,
      sectionId,
      data.sessionId,
      data.fullName,
      data.code,
      data.lat,
      data.lng,
      data.accuracy,
    );
  });

export const closeSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { sessionId: string; sectionId: string | null }) =>
    z.object({ sessionId: z.string().uuid(), sectionId: nullableSectionId }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSectionAccess(context.userId, data.sectionId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("attendance_sessions")
      .update({ is_active: false, closed_at: new Date().toISOString() })
      .eq("id", data.sessionId);
    return buildReport(data.sessionId);
  });

/* --------------------------------------------------------------- reports */

export const getSessionHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const access = await getAccess(context.userId);
    return listSessionHistory(access);
  });

async function assertReportAccess(userId: string, sessionId: string) {
  const access = await getAccess(userId);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: row } = await supabaseAdmin
    .from("attendance_sessions")
    .select("section_id")
    .eq("id", sessionId)
    .maybeSingle();
  if (!row) throw new Error("Session not found.");
  if (access.general) return;
  if (row.section_id && access.sectionIds.includes(row.section_id)) return;
  throw new Error("You do not have access to this report.");
}

export const getReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { sessionId: string }) =>
    z.object({ sessionId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertReportAccess(context.userId, data.sessionId);
    return buildReport(data.sessionId);
  });

export const deleteReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { sessionId: string }) =>
    z.object({ sessionId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertReportAccess(context.userId, data.sessionId);
    await deleteSessionCompletely(data.sessionId);
    return { ok: true as const };
  });
