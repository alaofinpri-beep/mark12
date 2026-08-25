import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  ADMIN_PASSKEY,
  assertAdmin,
  buildReport,
  ensureActiveCode,
  getActiveSessionRow,
  grantAdmin,
  verifyAndMark,
} from "./attendance.server";

export const unlockAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { passkey: string }) => z.object({ passkey: z.string().min(1).max(64) }).parse(d))
  .handler(async ({ data, context }) => {
    if (data.passkey.trim().toUpperCase() !== ADMIN_PASSKEY) {
      return { ok: false as const, reason: "Incorrect admin passkey." };
    }
    await grantAdmin(context.userId);
    return { ok: true as const };
  });

export const startSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    courseName: string;
    courseCode: string;
    lat: number;
    lng: number;
    radius: number;
  }) =>
    z
      .object({
        courseName: z.string().trim().min(2).max(120),
        courseCode: z.string().trim().max(40),
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        radius: z.number().int().min(5).max(2000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    await supabaseAdmin
      .from("attendance_sessions")
      .update({ is_active: false, closed_at: new Date().toISOString() })
      .eq("is_active", true);

    const { data: session, error } = await supabaseAdmin
      .from("attendance_sessions")
      .insert({
        admin_id: context.userId,
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

export const getLiveSession = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const session = await getActiveSessionRow();
    if (!session) return { session: null, code: null };
    const code = await ensureActiveCode(session.id);
    return { session, code };
  });

export const updateSessionSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { sessionId: string; radius: number; lat?: number; lng?: number }) =>
    z
      .object({
        sessionId: z.string().uuid(),
        radius: z.number().int().min(5).max(2000),
        lat: z.number().min(-90).max(90).optional(),
        lng: z.number().min(-180).max(180).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
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
    (d: { fullName: string; code: string; lat: number; lng: number; accuracy?: number }) =>
      z
        .object({
          fullName: z.string().trim().min(3).max(80),
          code: z.string().trim().min(4).max(12),
          lat: z.number().min(-90).max(90),
          lng: z.number().min(-180).max(180),
          accuracy: z.number().min(0).max(100000).optional(),
        })
        .parse(d),
  )
  .handler(async ({ data, context }) =>
    verifyAndMark(
      context.userId,
      data.fullName,
      data.code,
      data.lat,
      data.lng,
      data.accuracy,
    ),
  );

export const closeSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { sessionId: string }) =>
    z.object({ sessionId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("attendance_sessions")
      .update({ is_active: false, closed_at: new Date().toISOString() })
      .eq("id", data.sessionId);
    return buildReport(data.sessionId);
  });

export const getReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { sessionId: string }) =>
    z.object({ sessionId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return buildReport(data.sessionId);
  });
