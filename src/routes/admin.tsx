import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { ArrowLeft, Download, Lock, Radio, Users } from "lucide-react";
import { toast } from "sonner";

import { AdminLogoUploader } from "@/components/AdminLogoUploader";
import { MapCard } from "@/components/MapCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import {
  closeSession,
  getLiveSession,
  startSession,
  unlockAdmin,
  updateSessionSettings,
} from "@/lib/attendance.functions";
import type { Report } from "@/lib/attendance.server";
import { formatDistance } from "@/lib/geo";
import { useAuth } from "@/hooks/useAuth";
import { useGeolocation } from "@/hooks/useGeolocation";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin Dashboard — Smart Attendance" },
      {
        name: "description",
        content:
          "Start a GPS attendance session, set the radius, watch live check-ins and export the final report.",
      },
      { property: "og:title", content: "Admin Dashboard — Smart Attendance" },
      {
        property: "og:description",
        content: "Start sessions, set the radius, watch live check-ins and export reports.",
      },
    ],
  }),
  component: AdminScreen,
});

function AdminScreen() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const unlock = useServerFn(unlockAdmin);
  const live = useServerFn(getLiveSession);
  const start = useServerFn(startSession);
  const update = useServerFn(updateSessionSettings);
  const close = useServerFn(closeSession);

  const [unlocked, setUnlocked] = useState(false);
  const [passkey, setPasskey] = useState("");
  const [busy, setBusy] = useState(false);
  const [courseName, setCourseName] = useState("");
  const [courseCode, setCourseCode] = useState("");
  const [radius, setRadius] = useState(30);
  const [report, setReport] = useState<Report | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", replace: true });
  }, [loading, user, navigate]);

  const { coords, error: geoError } = useGeolocation(unlocked);

  const { data, refetch } = useQuery({
    queryKey: ["admin-live-session"],
    enabled: unlocked,
    refetchInterval: 8000,
    queryFn: () => live(),
  });
  const session = data?.session ?? null;

  const { data: present } = useQuery({
    queryKey: ["present", session?.id],
    enabled: !!session,
    refetchInterval: 6000,
    queryFn: async () => {
      const { data: rows } = await supabase
        .from("attendance_records")
        .select("student_id, marked_at, distance_m")
        .eq("session_id", session!.id)
        .order("marked_at", { ascending: false });
      const ids = (rows ?? []).map((r) => r.student_id);
      const { data: people } = ids.length
        ? await supabase.from("profiles").select("id, full_name, matric_no").in("id", ids)
        : { data: [] };
      const byId = new Map((people ?? []).map((p) => [p.id, p]));
      return (rows ?? []).map((r) => ({
        ...r,
        full_name: byId.get(r.student_id)?.full_name ?? null,
        matric_no: byId.get(r.student_id)?.matric_no ?? null,
      }));
    },
  });

  async function doUnlock() {
    setBusy(true);
    try {
      const res = await unlock({ data: { passkey } });
      if (res.ok) {
        setUnlocked(true);
        toast.success("Admin unlocked");
      } else toast.error(res.reason);
    } catch {
      toast.error("Could not verify the passkey.");
    } finally {
      setBusy(false);
    }
  }

  async function doStart() {
    if (!coords) {
      toast.error("Waiting for your location — allow location access first.");
      return;
    }
    if (courseName.trim().length < 2) {
      toast.error("Enter the course name.");
      return;
    }
    setBusy(true);
    try {
      await start({
        data: {
          courseName: courseName.trim(),
          courseCode: courseCode.trim(),
          lat: coords.lat,
          lng: coords.lng,
          radius,
        },
      });
      setReport(null);
      await refetch();
      toast.success("Attendance session started");
    } catch {
      toast.error("Could not start the session.");
    } finally {
      setBusy(false);
    }
  }

  async function doClose() {
    if (!session) return;
    setBusy(true);
    try {
      const res = await close({ data: { sessionId: session.id } });
      setReport(res);
      await refetch();
      toast.success("Session closed — report ready");
    } catch {
      toast.error("Could not close the session.");
    } finally {
      setBusy(false);
    }
  }

  function downloadReport() {
    if (!report) return;
    const header = "Name,Matric No,Email,Status,Marked At,Distance (m)";
    const body = report.rows
      .map((r) =>
        [
          r.name,
          r.matric,
          r.email,
          r.status,
          r.markedAt ? new Date(r.markedAt).toLocaleString() : "",
          r.distance !== null ? Math.round(r.distance) : "",
        ]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(","),
      )
      .join("\n");
    const blob = new Blob([`${header}\n${body}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `attendance-${report.session.course_code || report.session.course_name}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!unlocked) {
    return (
      <main className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-5 pt-12 safe-bottom">
        <header className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full"
            onClick={() => navigate({ to: "/home" })}
            aria-label="Back"
          >
            <ArrowLeft className="size-5" />
          </Button>
          <h1 className="text-lg font-semibold tracking-tight">Admin Access</h1>
        </header>

        <div className="animate-rise mt-8 rounded-3xl bg-card p-6 text-center shadow-card">
          <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-gradient-primary text-primary-foreground shadow-float">
            <Lock className="size-6" />
          </span>
          <p className="mt-4 font-semibold">Enter admin passkey</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Only authorized staff can run attendance sessions.
          </p>
          <Input
            type="password"
            value={passkey}
            onChange={(e) => setPasskey(e.target.value)}
            placeholder="Passkey"
            maxLength={64}
            className="mt-5 h-12 rounded-xl text-center tracking-[0.3em]"
          />
          <Button
            disabled={busy || !passkey}
            onClick={doUnlock}
            className="tap-scale mt-3 h-12 w-full rounded-xl bg-gradient-primary text-base font-semibold text-primary-foreground shadow-float"
          >
            {busy ? "Checking…" : "Unlock dashboard"}
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-5 pt-12 safe-bottom">
      <header className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full"
          onClick={() => navigate({ to: "/home" })}
          aria-label="Back"
        >
          <ArrowLeft className="size-5" />
        </Button>
        <h1 className="text-lg font-semibold tracking-tight">Admin Dashboard</h1>
      </header>

      {session ? (
        <section className="animate-rise mt-5 rounded-3xl bg-card p-5 shadow-card">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-xs font-medium text-primary">
                <Radio className="size-3.5" /> Live session
              </p>
              <p className="truncate text-lg font-semibold">{session.course_name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {session.course_code || "—"} · radius {session.radius_m}m
              </p>
            </div>
            <div className="shrink-0 rounded-2xl bg-accent px-3 py-2 text-center">
              <p className="text-[10px] text-muted-foreground">Code</p>
              <p className="font-mono text-lg font-bold tracking-widest text-primary">
                {data?.code?.code ?? "····"}
              </p>
            </div>
          </div>

          <div className="mt-4">
            <MapCard
              center={{ lat: session.lat, lng: session.lng }}
              radius={session.radius_m}
              className="h-48"
            />
          </div>

          <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
            <div className="min-w-0">
              <Label className="text-xs text-muted-foreground">Radius (m)</Label>
              <Input
                type="number"
                min={5}
                max={2000}
                value={radius}
                onChange={(e) => setRadius(Number(e.target.value))}
                className="mt-1 h-11 rounded-xl"
              />
            </div>
            <Button
              variant="outline"
              className="tap-scale h-11 shrink-0 rounded-xl"
              onClick={async () => {
                await update({
                  data: {
                    sessionId: session.id,
                    radius,
                    ...(coords ? { lat: coords.lat, lng: coords.lng } : {}),
                  },
                });
                await refetch();
                toast.success("Session updated");
              }}
            >
              Update
            </Button>
          </div>

          <Button
            disabled={busy}
            onClick={doClose}
            variant="destructive"
            className="tap-scale mt-4 h-12 w-full rounded-xl text-base font-semibold"
          >
            Close attendance
          </Button>
        </section>
      ) : (
        <section className="animate-rise mt-5 space-y-3 rounded-3xl bg-card p-5 shadow-card">
          <p className="font-semibold">Start a session</p>
          <div>
            <Label className="text-xs text-muted-foreground">Course name</Label>
            <Input
              value={courseName}
              onChange={(e) => setCourseName(e.target.value)}
              placeholder="Engineering Mathematics"
              maxLength={120}
              className="mt-1 h-12 rounded-xl"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Course code</Label>
            <Input
              value={courseCode}
              onChange={(e) => setCourseCode(e.target.value)}
              placeholder="FEM 201"
              maxLength={40}
              className="mt-1 h-12 rounded-xl"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Attendance radius (m)</Label>
            <Input
              type="number"
              min={5}
              max={2000}
              value={radius}
              onChange={(e) => setRadius(Number(e.target.value))}
              className="mt-1 h-12 rounded-xl"
            />
          </div>
          <MapCard
            center={coords ? { lat: coords.lat, lng: coords.lng } : null}
            radius={radius}
            className="h-44"
          />
          {geoError ? <p className="text-xs text-destructive">{geoError}</p> : null}
          <Button
            disabled={busy}
            onClick={doStart}
            className="tap-scale h-12 w-full rounded-xl bg-gradient-primary text-base font-semibold text-primary-foreground shadow-float"
          >
            {busy ? "Starting…" : "Start attendance"}
          </Button>
        </section>
      )}

      {session ? (
        <section
          className="animate-rise mt-4 rounded-3xl bg-card p-5 shadow-card"
          style={{ animationDelay: "80ms" }}
        >
          <p className="flex items-center gap-2 font-semibold">
            <Users className="size-4 text-primary" /> Present now
            <span className="ml-auto rounded-full bg-accent px-2.5 py-0.5 text-xs text-primary">
              {present?.length ?? 0}
            </span>
          </p>
          <ul className="mt-3 space-y-2">
            {(present ?? []).map((r) => {
              const p = r;
              return (
                <li
                  key={r.student_id}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-2xl bg-secondary px-3 py-2"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {p?.full_name ?? "Student"}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {p?.matric_no ?? "—"}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {r.distance_m !== null ? formatDistance(r.distance_m) : ""}
                  </span>
                </li>
              );
            })}
            {!present?.length ? (
              <li className="py-3 text-center text-sm text-muted-foreground">
                No check-ins yet.
              </li>
            ) : null}
          </ul>
        </section>
      ) : null}

      {report ? (
        <section className="animate-rise mt-4 rounded-3xl bg-card p-5 shadow-card">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
            <div className="min-w-0">
              <p className="truncate font-semibold">Final report</p>
              <p className="truncate text-xs text-muted-foreground">
                {report.presentCount} present · {report.absentCount} absent
              </p>
            </div>
            <Button
              variant="outline"
              className="tap-scale h-10 shrink-0 rounded-xl"
              onClick={downloadReport}
            >
              <Download className="size-4" /> CSV
            </Button>
          </div>
          <ul className="mt-3 max-h-72 space-y-1.5 overflow-y-auto">
            {report.rows.map((r) => (
              <li
                key={`${r.matric}-${r.name}`}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl bg-secondary px-3 py-2 text-sm"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{r.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{r.matric}</span>
                </span>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                    r.status === "Present"
                      ? "bg-accent text-primary"
                      : "bg-destructive/10 text-destructive"
                  }`}
                >
                  {r.status}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <AdminLogoUploader />
    </main>
  );
}
