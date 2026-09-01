import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Copy,
  KeyRound,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { AdminLogoUploader } from "@/components/AdminLogoUploader";
import { MapCard } from "@/components/MapCard";
import { ReportViewer } from "@/components/ReportViewer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import {
  addSection,
  changeGeneralPasskey,
  closeSession,
  deleteReport,
  editSection,
  getLiveSession,
  getMyAccess,
  getReport,
  getSections,
  getSessionHistory,
  removeSection,
  startSession,
  unlockAdmin,
  updateSessionSettings,
} from "@/lib/attendance.functions";
import type { Report } from "@/lib/attendance.server";
import { useAuth } from "@/hooks/useAuth";
import { useGeolocation } from "@/hooks/useGeolocation";

const RADIUS_OPTIONS = [200, 450, 750, 1000];
const GENERAL_NAME = "General (all departments)";

type Target = { id: string | null; name: string };

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin Dashboard — Smart Attendance" },
      {
        name: "description",
        content:
          "Passkey-protected dashboard: run department attendance sessions, watch live check-ins and export A4 reports.",
      },
      { property: "og:title", content: "Admin Dashboard — Smart Attendance" },
      {
        property: "og:description",
        content: "Run department sessions, watch live check-ins and export A4 attendance reports.",
      },
    ],
  }),
  component: AdminScreen,
});

function AdminScreen() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const accessFn = useServerFn(getMyAccess);
  const sectionsFn = useServerFn(getSections);
  const unlock = useServerFn(unlockAdmin);

  const [target, setTarget] = useState<Target | null>(null);
  const [manage, setManage] = useState(false);
  const [pending, setPending] = useState<Target | null>(null);
  const [passkey, setPasskey] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", replace: true });
  }, [loading, user, navigate]);

  const { data: access, refetch: refetchAccess } = useQuery({
    queryKey: ["my-access"],
    enabled: !!user,
    queryFn: () => accessFn(),
  });
  const { data: sections } = useQuery({
    queryKey: ["all-sections"],
    enabled: !!user,
    queryFn: () => sectionsFn(),
  });

  const unlocked = useMemo(() => {
    const ids = new Set((access?.sections ?? []).map((s) => s.id));
    return { general: !!access?.general, ids };
  }, [access]);

  function open(t: Target) {
    if (t.id === null ? unlocked.general : unlocked.ids.has(t.id) || unlocked.general) {
      setTarget(t);
    } else {
      setPending(t);
      setPasskey("");
    }
  }

  async function submitPasskey() {
    if (!pending) return;
    setBusy(true);
    try {
      const res = await unlock({ data: { passkey, sectionId: pending.id } });
      if (!res.ok) {
        toast.error(res.reason);
        return;
      }
      await refetchAccess();
      setTarget(pending);
      setPending(null);
      toast.success("Dashboard unlocked");
    } catch {
      toast.error("Could not verify that passkey.");
    } finally {
      setBusy(false);
    }
  }

  if (manage) return <ManageSections onBack={() => setManage(false)} />;
  if (target)
    return (
      <SectionDashboard
        target={target}
        onBack={() => setTarget(null)}
        general={unlocked.general}
      />
    );

  return (
    <Shell title="Admin Dashboard" onBack={() => navigate({ to: "/home" })}>
      {pending ? (
        <section className="animate-rise mt-5 rounded-3xl bg-card p-5 shadow-card">
          <span className="grid size-12 place-items-center rounded-2xl bg-accent text-primary">
            <KeyRound className="size-5" />
          </span>
          <p className="mt-3 font-semibold">{pending.name}</p>
          <p className="text-xs text-muted-foreground">Enter the passkey to unlock.</p>
          <Input
            value={passkey}
            onChange={(e) => setPasskey(e.target.value)}
            placeholder="Passkey"
            type="password"
            className="mt-3 h-12 rounded-xl text-center tracking-[0.25em]"
            onKeyDown={(e) => e.key === "Enter" && submitPasskey()}
          />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              className="h-11 rounded-xl"
              onClick={() => setPending(null)}
            >
              Cancel
            </Button>
            <Button
              disabled={busy}
              onClick={submitPasskey}
              className="tap-scale h-11 rounded-xl bg-gradient-primary font-semibold text-primary-foreground shadow-float"
            >
              {busy ? "Checking…" : "Unlock"}
            </Button>
          </div>
        </section>
      ) : null}

      <section className="mt-5 space-y-2">
        <p className="px-1 text-xs font-medium text-muted-foreground">Section admins</p>
        {(sections ?? []).map((s) => (
          <Card
            key={s.id}
            title={s.name}
            subtitle={
              unlocked.general || unlocked.ids.has(s.id) ? "Unlocked" : "Passkey required"
            }
            unlockedState={unlocked.general || unlocked.ids.has(s.id)}
            onClick={() => open({ id: s.id, name: s.name })}
          />
        ))}
        {!sections?.length ? (
          <p className="rounded-2xl bg-card p-4 text-sm text-muted-foreground shadow-card">
            No departments yet.
          </p>
        ) : null}
      </section>

      <section className="mt-5 space-y-2">
        <p className="px-1 text-xs font-medium text-muted-foreground">General admin</p>
        <Card
          title="General Admin"
          subtitle={
            unlocked.general ? "Unlocked · attendance visible to all students" : "Passkey required"
          }
          unlockedState={unlocked.general}
          onClick={() => open({ id: null, name: GENERAL_NAME })}
        />
        {unlocked.general ? (
          <>
            <Card
              title="Manage departments & passkeys"
              subtitle="Create, rename, re-key or delete section admins"
              unlockedState
              onClick={() => setManage(true)}
            />
            <div className="rounded-3xl bg-card p-4 shadow-card">
              <AdminLogoUploader />
            </div>
          </>
        ) : null}
      </section>
    </Shell>
  );
}

/* ------------------------------------------------------------ management */

function ManageSections({ onBack }: { onBack: () => void }) {
  const qc = useQueryClient();
  const listFn = useServerFn(getSections);
  const add = useServerFn(addSection);
  const edit = useServerFn(editSection);
  const remove = useServerFn(removeSection);
  const generalKey = useServerFn(changeGeneralPasskey);

  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [genKey, setGenKey] = useState("");

  const { data: sections, refetch } = useQuery({
    queryKey: ["all-sections"],
    queryFn: () => listFn(),
  });

  async function refresh() {
    await refetch();
    await qc.invalidateQueries({ queryKey: ["my-access"] });
  }

  return (
    <Shell title="Departments & passkeys" onBack={onBack}>
      <section className="animate-rise mt-5 space-y-3 rounded-3xl bg-card p-5 shadow-card">
        <p className="font-semibold">Create a section admin</p>
        <div>
          <Label className="text-xs text-muted-foreground">Department name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="300 Level — SLT Chemistry"
            className="mt-1 h-11 rounded-xl"
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Passkey</Label>
          <Input
            value={key}
            onChange={(e) => setKey(e.target.value.toUpperCase())}
            placeholder="CHM300"
            className="mt-1 h-11 rounded-xl"
          />
        </div>
        <Button
          className="tap-scale h-11 w-full rounded-xl bg-gradient-primary font-semibold text-primary-foreground shadow-float"
          onClick={async () => {
            try {
              await add({ data: { name: name.trim(), passkey: key.trim() } });
              setName("");
              setKey("");
              await refresh();
              toast.success("Department created");
            } catch {
              toast.error("Could not create that department.");
            }
          }}
        >
          <Plus className="size-4" /> Create department
        </Button>
      </section>

      <section className="animate-rise mt-4 space-y-2 rounded-3xl bg-card p-5 shadow-card">
        <p className="font-semibold">Existing departments</p>
        {(sections ?? []).map((s) => (
          <div key={s.id} className="rounded-2xl bg-secondary p-3">
            <p className="truncate text-sm font-medium">{s.name}</p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <Button
                variant="outline"
                className="h-9 rounded-lg text-xs"
                onClick={async () => {
                  const next = prompt("New department name", s.name);
                  if (!next) return;
                  await edit({ data: { id: s.id, name: next.trim() } });
                  await refresh();
                  toast.success("Renamed");
                }}
              >
                <Pencil className="size-3.5" /> Rename
              </Button>
              <Button
                variant="outline"
                className="h-9 rounded-lg text-xs"
                onClick={async () => {
                  const next = prompt("New passkey for " + s.name);
                  if (!next) return;
                  await edit({ data: { id: s.id, passkey: next.trim() } });
                  await refresh();
                  toast.success("Passkey updated");
                }}
              >
                <KeyRound className="size-3.5" /> Passkey
              </Button>
              <Button
                variant="outline"
                className="h-9 rounded-lg text-xs text-destructive"
                onClick={async () => {
                  if (!confirm(`Delete ${s.name}? Its admins lose access.`)) return;
                  try {
                    await remove({ data: { id: s.id } });
                    await refresh();
                    toast.success("Deleted");
                  } catch {
                    toast.error("Could not delete — it still has attendance data.");
                  }
                }}
              >
                <Trash2 className="size-3.5" /> Delete
              </Button>
            </div>
          </div>
        ))}
      </section>

      <section className="animate-rise mt-4 space-y-3 rounded-3xl bg-card p-5 shadow-card">
        <p className="font-semibold">General admin passkey</p>
        <Input
          value={genKey}
          onChange={(e) => setGenKey(e.target.value.toUpperCase())}
          placeholder="New general passkey"
          className="h-11 rounded-xl"
        />
        <Button
          variant="outline"
          className="h-11 w-full rounded-xl"
          onClick={async () => {
            try {
              await generalKey({ data: { passkey: genKey.trim() } });
              setGenKey("");
              toast.success("General passkey updated");
            } catch {
              toast.error("Could not update the passkey.");
            }
          }}
        >
          Update general passkey
        </Button>
      </section>
    </Shell>
  );
}

/* ------------------------------------------------------- section console */

function SectionDashboard({
  target,
  onBack,
  general,
}: {
  target: Target;
  onBack: () => void;
  general: boolean;
}) {
  const live = useServerFn(getLiveSession);
  const start = useServerFn(startSession);
  const update = useServerFn(updateSessionSettings);
  const close = useServerFn(closeSession);
  const historyFn = useServerFn(getSessionHistory);
  const reportFn = useServerFn(getReport);
  const delReport = useServerFn(deleteReport);

  const [courseName, setCourseName] = useState("");
  const [courseCode, setCourseCode] = useState("");
  const [radius, setRadius] = useState(200);
  const [locationOn, setLocationOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [tab, setTab] = useState<"live" | "history">("live");

  const { coords, error: geoError, status, retry } = useGeolocation(locationOn);

  const { data, refetch } = useQuery({
    queryKey: ["live-session", target.id],
    refetchInterval: 15000,
    queryFn: () => live({ data: { sectionId: target.id } }),
  });

  const session = data?.session ?? null;
  const code = data?.code ?? null;

  useEffect(() => {
    if (session) setRadius(session.radius_m);
  }, [session?.id, session?.radius_m]);

  const { data: records } = useQuery({
    queryKey: ["records", session?.id],
    enabled: !!session,
    refetchInterval: 8000,
    queryFn: async () => {
      const { data: rows } = await supabase
        .from("attendance_records")
        .select("id, full_name, marked_at, distance_m")
        .eq("session_id", session!.id)
        .order("marked_at", { ascending: false });
      return rows ?? [];
    },
  });

  const { data: history, refetch: refetchHistory } = useQuery({
    queryKey: ["history"],
    queryFn: () => historyFn(),
  });

  const scoped = (history ?? []).filter((h) =>
    target.id === null ? h.section_id === null || general : h.section_id === target.id,
  );

  async function onStart() {
    if (courseName.trim().length < 2) {
      toast.error("Enter the course name.");
      return;
    }
    if (!coords) {
      toast.error("Turn on location so students can be compared to your position.");
      return;
    }
    setBusy(true);
    try {
      await start({
        data: {
          sectionId: target.id,
          courseName: courseName.trim(),
          courseCode: courseCode.trim(),
          lat: coords.lat,
          lng: coords.lng,
          radius,
          accuracy: coords.accuracy,
        },
      });
      await refetch();
      toast.success("Attendance started");
    } catch {
      toast.error("Could not start the session.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell title={target.name} onBack={onBack}>
      {!locationOn ? (
        <section className="animate-rise mt-5 rounded-3xl bg-card p-6 text-center shadow-card">
          <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-gradient-primary text-primary-foreground shadow-float">
            <MapPin className="size-6" />
          </span>
          <p className="mt-4 font-semibold">Turn on location</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Your real position becomes the centre of the attendance radius.
          </p>
          <Button
            onClick={() => setLocationOn(true)}
            className="tap-scale mt-4 h-12 w-full rounded-xl bg-gradient-primary text-base font-semibold text-primary-foreground shadow-float"
          >
            Turn on location
          </Button>
        </section>
      ) : null}

      {locationOn && geoError ? (
        <div className="animate-rise mt-4 flex items-center justify-between gap-2 rounded-2xl bg-card p-4 shadow-card">
          <p className="text-xs text-destructive">{geoError}</p>
          <Button variant="outline" className="h-8 shrink-0 rounded-lg text-xs" onClick={retry}>
            Retry
          </Button>
        </div>
      ) : null}

      {!session ? (
        <section className="animate-rise mt-4 space-y-3 rounded-3xl bg-card p-5 shadow-card">
          <p className="font-semibold">Start attendance</p>
          <div>
            <Label className="text-xs text-muted-foreground">Course name</Label>
            <Input
              value={courseName}
              onChange={(e) => setCourseName(e.target.value)}
              placeholder="Analytical Chemistry"
              className="mt-1 h-11 rounded-xl"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Course code</Label>
            <Input
              value={courseCode}
              onChange={(e) => setCourseCode(e.target.value.toUpperCase())}
              placeholder="CHM 201"
              className="mt-1 h-11 rounded-xl"
            />
          </div>
          <RadiusPicker value={radius} onChange={setRadius} />
          <MapCard
            center={coords ? { lat: coords.lat, lng: coords.lng } : null}
            radius={radius}
            className="h-52"
          />
          <Button
            disabled={busy || !coords}
            onClick={onStart}
            className="tap-scale h-12 w-full rounded-xl bg-gradient-primary text-base font-semibold text-primary-foreground shadow-float"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {status !== "ready" && locationOn ? "Waiting for GPS…" : "Start attendance"}
          </Button>
        </section>
      ) : (
        <>
          <section className="animate-rise mt-4 rounded-3xl bg-gradient-primary p-5 text-primary-foreground shadow-float">
            <p className="text-xs opacity-85">Live code · renews every 4 minutes</p>
            <div className="mt-1 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
              <p className="select-all font-mono text-3xl font-bold tracking-[0.25em]">
                {code?.code ?? "----"}
              </p>
              <button
                type="button"
                aria-label="Copy code"
                className="tap-scale grid size-11 place-items-center rounded-2xl bg-white/20"
                onClick={async () => {
                  if (!code) return;
                  try {
                    await navigator.clipboard.writeText(code.code);
                    toast.success("Code copied");
                  } catch {
                    toast.error("Copy failed");
                  }
                }}
              >
                <Copy className="size-5" />
              </button>
            </div>
            <p className="mt-1 truncate text-xs opacity-85">
              {session.course_name}
              {session.course_code ? ` · ${session.course_code}` : ""}
            </p>
          </section>

          <section className="animate-rise mt-4 rounded-3xl bg-card p-5 shadow-card">
            <RadiusPicker
              value={radius}
              onChange={async (r) => {
                setRadius(r);
                await update({
                  data: {
                    sessionId: session.id,
                    sectionId: target.id,
                    radius: r,
                    ...(coords ? { lat: coords.lat, lng: coords.lng } : {}),
                  },
                });
                await refetch();
              }}
            />
            <div className="mt-3">
              <MapCard
                center={{ lat: session.lat, lng: session.lng }}
                radius={session.radius_m}
                student={coords ? { lat: coords.lat, lng: coords.lng } : null}
                inside
                className="h-52"
              />
            </div>
            <Button
              variant="outline"
              className="mt-3 h-11 w-full rounded-xl text-xs"
              disabled={!coords}
              onClick={async () => {
                if (!coords) return;
                await update({
                  data: {
                    sessionId: session.id,
                    sectionId: target.id,
                    radius,
                    lat: coords.lat,
                    lng: coords.lng,
                  },
                });
                await refetch();
                toast.success("Attendance location updated");
              }}
            >
              <MapPin className="size-4" /> Use my current location
            </Button>
          </section>

          <section className="animate-rise mt-4 rounded-3xl bg-card p-5 shadow-card">
            <div className="flex items-center gap-2">
              <Users className="size-4 text-primary" />
              <p className="font-semibold">Present students</p>
              <span className="ml-auto rounded-full bg-accent px-2.5 py-0.5 text-xs font-semibold text-primary">
                {records?.length ?? 0}
              </span>
            </div>
            <div className="mt-3 space-y-2">
              {(records ?? []).map((r) => (
                <div
                  key={r.id}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-2xl bg-secondary px-4 py-2.5"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{r.full_name}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      {new Date(r.marked_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {typeof r.distance_m === "number"
                        ? ` · ${Math.round(r.distance_m)}m away`
                        : ""}
                    </span>
                  </span>
                  <span className="flex items-center gap-1 text-[11px] font-semibold text-primary">
                    <Check className="size-3.5" /> Present
                  </span>
                </div>
              ))}
              {!records?.length ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No one has marked yet.
                </p>
              ) : null}
            </div>
            <Button
              variant="outline"
              className="tap-scale mt-4 h-12 w-full rounded-xl font-semibold text-destructive"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const res = await close({
                    data: { sessionId: session.id, sectionId: target.id },
                  });
                  setReport(res);
                  await refetch();
                  await refetchHistory();
                  toast.success("Session closed");
                } catch {
                  toast.error("Could not close the session.");
                } finally {
                  setBusy(false);
                }
              }}
            >
              Close attendance
            </Button>
          </section>
        </>
      )}

      {report ? (
        <ReportViewer
          report={report}
          onClose={() => setReport(null)}
          onDelete={async () => {
            await delReport({ data: { sessionId: report.session.id } });
            setReport(null);
            await refetchHistory();
            toast.success("Report deleted");
          }}
        />
      ) : null}

      <section className="animate-rise mt-4 rounded-3xl bg-card p-5 shadow-card">
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant={tab === "live" ? "default" : "outline"}
            className="h-10 rounded-xl text-xs"
            onClick={() => setTab("live")}
          >
            Current
          </Button>
          <Button
            variant={tab === "history" ? "default" : "outline"}
            className="h-10 rounded-xl text-xs"
            onClick={() => setTab("history")}
          >
            Past reports
          </Button>
        </div>

        {tab === "history" ? (
          <div className="mt-3 space-y-2">
            {scoped.map((h) => (
              <div
                key={h.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-2xl bg-secondary px-4 py-3"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{h.course_name}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {new Date(h.started_at).toLocaleDateString()} · {h.presentCount} present ·{" "}
                    {h.sectionName}
                  </span>
                </span>
                <Button
                  variant="outline"
                  className="h-9 shrink-0 rounded-lg text-xs"
                  onClick={async () => {
                    try {
                      setReport(await reportFn({ data: { sessionId: h.id } }));
                    } catch {
                      toast.error("Could not open that report.");
                    }
                  }}
                >
                  Open
                </Button>
              </div>
            ))}
            {!scoped.length ? (
              <p className="py-4 text-center text-sm text-muted-foreground">No reports yet.</p>
            ) : null}
          </div>
        ) : (
          <p className="mt-3 text-xs text-muted-foreground">
            Codes renew automatically every 4 minutes while the session is open. Only students in
            this department can see them.
          </p>
        )}
      </section>
    </Shell>
  );
}

function RadiusPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">Attendance radius</Label>
      <div className="mt-1 grid grid-cols-4 gap-2">
        {RADIUS_OPTIONS.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => onChange(r)}
            className={`tap-scale h-11 rounded-xl text-sm font-semibold transition-colors ${
              value === r
                ? "bg-gradient-primary text-primary-foreground shadow-float"
                : "bg-secondary text-muted-foreground"
            }`}
          >
            {r}m
          </button>
        ))}
      </div>
    </div>
  );
}

function Card({
  title,
  subtitle,
  onClick,
  unlockedState,
}: {
  title: string;
  subtitle: string;
  onClick: () => void;
  unlockedState?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="tap-scale animate-rise grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-3xl bg-card p-4 text-left shadow-card"
    >
      <span
        className={`grid size-11 shrink-0 place-items-center rounded-2xl ${
          unlockedState ? "bg-accent text-primary" : "bg-secondary text-muted-foreground"
        }`}
      >
        {unlockedState ? <ShieldCheck className="size-5" /> : <KeyRound className="size-5" />}
      </span>
      <span className="min-w-0">
        <span className="block truncate font-semibold">{title}</span>
        <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
    </button>
  );
}

function Shell({
  title,
  onBack,
  children,
}: {
  title: string;
  onBack: () => void;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-5 pt-12 pb-10 safe-bottom">
      <header className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full"
          onClick={onBack}
          aria-label="Back"
        >
          <ArrowLeft className="size-5" />
        </Button>
        <h1 className="truncate text-lg font-semibold tracking-tight">{title}</h1>
      </header>
      {children}
    </main>
  );
}
