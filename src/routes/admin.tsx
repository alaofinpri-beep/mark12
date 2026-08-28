import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ChevronRight,
  FileText,
  KeyRound,
  Lock,
  MapPin,
  Plus,
  Radio,
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
  editSection,
  getLiveSession,
  getReport,
  getSessionHistory,
  listAllSections,
  removeSection,
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
          "General Admin manages section admins and passkeys; section admins run their own GPS attendance sessions.",
      },
      { property: "og:title", content: "Admin Dashboard — Smart Attendance" },
      {
        property: "og:description",
        content: "Manage sections and passkeys, run GPS sessions and export A4 reports.",
      },
    ],
  }),
  component: AdminScreen,
});

const RADIUS_OPTIONS = [200, 450, 750, 1000] as const;

type Unlocked =
  | { role: "general" }
  | { role: "section"; section: { id: string; name: string } };

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return (
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
  );
}

function AdminScreen() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const unlock = useServerFn(unlockAdmin);

  const [access, setAccess] = useState<Unlocked | null>(null);
  const [openSection, setOpenSection] = useState<{ id: string; name: string } | null>(null);
  const [passkey, setPasskey] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", replace: true });
  }, [loading, user, navigate]);

  async function doUnlock() {
    setBusy(true);
    try {
      const res = await unlock({ data: { passkey } });
      if (!res.ok) {
        toast.error(res.reason);
        return;
      }
      if (res.role === "general") {
        setAccess({ role: "general" });
        toast.success("General Admin unlocked");
      } else if (res.section) {
        setAccess({ role: "section", section: res.section });
        setOpenSection(res.section);
        toast.success(`${res.section.name} unlocked`);
      }
    } catch {
      toast.error("Could not verify the passkey.");
    } finally {
      setBusy(false);
    }
  }

  if (!access) {
    return (
      <main className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-5 pt-12 safe-bottom">
        <Header title="Admin Access" onBack={() => navigate({ to: "/home" })} />
        <div className="animate-rise mt-8 rounded-3xl bg-card p-6 text-center shadow-card">
          <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-gradient-primary text-primary-foreground shadow-float">
            <Lock className="size-6" />
          </span>
          <p className="mt-4 font-semibold">Enter your passkey</p>
          <p className="mt-1 text-sm text-muted-foreground">
            General Admin or a section passkey.
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

  if (openSection) {
    return (
      <SectionDashboard
        section={openSection}
        onBack={() =>
          access.role === "general" ? setOpenSection(null) : navigate({ to: "/home" })
        }
      />
    );
  }

  return <GeneralDashboard onOpenSection={setOpenSection} onBack={() => navigate({ to: "/home" })} />;
}

/* ------------------------------------------------------- general dashboard */

function GeneralDashboard({
  onOpenSection,
  onBack,
}: {
  onOpenSection: (s: { id: string; name: string }) => void;
  onBack: () => void;
}) {
  const list = useServerFn(listAllSections);
  const create = useServerFn(addSection);
  const edit = useServerFn(editSection);
  const del = useServerFn(removeSection);
  const changeGeneral = useServerFn(changeGeneralPasskey);

  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [generalKey, setGeneralKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editKey, setEditKey] = useState("");

  const { data: sections, refetch } = useQuery({
    queryKey: ["all-sections"],
    queryFn: () => list(),
  });

  async function guard(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try {
      await fn();
      await refetch();
      toast.success(ok);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-5 pt-12 safe-bottom">
      <Header title="General Admin" onBack={onBack} />

      <section className="animate-rise mt-5 rounded-3xl bg-gradient-primary p-5 text-primary-foreground shadow-float">
        <p className="flex items-center gap-2 text-xs opacity-90">
          <ShieldCheck className="size-4" /> Full access
        </p>
        <p className="mt-1 text-xl font-semibold">
          {sections?.length ?? 0} section{sections?.length === 1 ? "" : "s"}
        </p>
        <p className="mt-0.5 text-xs opacity-85">
          Create section admins, change passkeys and view every record.
        </p>
      </section>

      <section className="animate-rise mt-4 rounded-3xl bg-card p-5 shadow-card">
        <p className="flex items-center gap-2 font-semibold">
          <Plus className="size-4 text-primary" /> Create a section admin
        </p>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="300 Level SLT Physics"
          maxLength={120}
          className="mt-3 h-12 rounded-xl"
        />
        <Input
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="Section passkey"
          maxLength={64}
          className="mt-2 h-12 rounded-xl"
        />
        <Button
          disabled={busy || name.trim().length < 2 || key.trim().length < 4}
          className="tap-scale mt-3 h-12 w-full rounded-xl bg-gradient-primary text-base font-semibold text-primary-foreground shadow-float"
          onClick={() =>
            guard(async () => {
              await create({ data: { name: name.trim(), passkey: key.trim() } });
              setName("");
              setKey("");
            }, "Section created")
          }
        >
          Create section
        </Button>
      </section>

      <section className="animate-rise mt-4 space-y-2 rounded-3xl bg-card p-5 shadow-card">
        <p className="font-semibold">Sections</p>
        {(sections ?? []).map((s) => (
          <div key={s.id} className="rounded-2xl bg-secondary p-3">
            <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2">
              <button
                type="button"
                className="min-w-0 text-left"
                onClick={() => onOpenSection({ id: s.id, name: s.name })}
              >
                <span className="block truncate text-sm font-semibold">{s.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  Passkey: <span className="font-mono">{s.passkey}</span>
                </span>
              </button>
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full"
                aria-label="Edit section"
                onClick={() => {
                  setEditing(editing === s.id ? null : s.id);
                  setEditName(s.name);
                  setEditKey("");
                }}
              >
                <KeyRound className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full text-destructive"
                aria-label="Delete section"
                disabled={busy}
                onClick={() => {
                  if (!confirm(`Delete "${s.name}" and all its sessions?`)) return;
                  void guard(() => del({ data: { id: s.id } }), "Section deleted");
                }}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>

            {editing === s.id ? (
              <div className="mt-3 space-y-2">
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Section name"
                  className="h-11 rounded-xl"
                />
                <Input
                  value={editKey}
                  onChange={(e) => setEditKey(e.target.value)}
                  placeholder="New passkey (leave blank to keep)"
                  className="h-11 rounded-xl"
                />
                <Button
                  variant="outline"
                  className="tap-scale h-11 w-full rounded-xl"
                  disabled={busy}
                  onClick={() =>
                    guard(async () => {
                      await edit({
                        data: {
                          id: s.id,
                          ...(editName.trim() && editName.trim() !== s.name
                            ? { name: editName.trim() }
                            : {}),
                          ...(editKey.trim() ? { passkey: editKey.trim() } : {}),
                        },
                      });
                      setEditing(null);
                    }, "Section updated")
                  }
                >
                  Save changes
                </Button>
              </div>
            ) : null}
          </div>
        ))}
        {!sections?.length ? (
          <p className="py-3 text-center text-sm text-muted-foreground">No sections yet.</p>
        ) : null}
      </section>

      <section className="animate-rise mt-4 rounded-3xl bg-card p-5 shadow-card">
        <p className="flex items-center gap-2 font-semibold">
          <KeyRound className="size-4 text-primary" /> General Admin passkey
        </p>
        <Input
          value={generalKey}
          onChange={(e) => setGeneralKey(e.target.value)}
          placeholder="New General Admin passkey"
          maxLength={64}
          className="mt-3 h-12 rounded-xl"
        />
        <Button
          variant="outline"
          className="tap-scale mt-2 h-11 w-full rounded-xl"
          disabled={busy || generalKey.trim().length < 4}
          onClick={() =>
            guard(async () => {
              await changeGeneral({ data: { passkey: generalKey.trim() } });
              setGeneralKey("");
            }, "General passkey updated")
          }
        >
          Update passkey
        </Button>
      </section>

      <HistoryPanel />
      <AdminLogoUploader />
    </main>
  );
}

/* ------------------------------------------------------- section dashboard */

function SectionDashboard({
  section,
  onBack,
}: {
  section: { id: string; name: string };
  onBack: () => void;
}) {
  const live = useServerFn(getLiveSession);
  const start = useServerFn(startSession);
  const update = useServerFn(updateSessionSettings);
  const close = useServerFn(closeSession);

  const [busy, setBusy] = useState(false);
  const [locationOn, setLocationOn] = useState(false);
  const [courseName, setCourseName] = useState("");
  const [courseCode, setCourseCode] = useState("");
  const [radius, setRadius] = useState<number>(200);
  const [report, setReport] = useState<Report | null>(null);

  const { coords, error: geoError, status, weak, retry } = useGeolocation(locationOn);

  const { data, refetch } = useQuery({
    queryKey: ["admin-live-session", section.id],
    refetchInterval: 8000,
    queryFn: () => live({ data: { sectionId: section.id } }),
  });
  const session = data?.session ?? null;

  const { data: present } = useQuery({
    queryKey: ["present", session?.id],
    enabled: !!session,
    refetchInterval: 6000,
    queryFn: async () => {
      const { data: rows } = await supabase
        .from("attendance_records")
        .select("id, full_name, marked_at, distance_m")
        .eq("session_id", session!.id)
        .order("marked_at", { ascending: false });
      return rows ?? [];
    },
  });

  async function doStart() {
    if (!coords) {
      toast.error("Turn on location and wait for a GPS fix first.");
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
          sectionId: section.id,
          courseName: courseName.trim(),
          courseCode: courseCode.trim(),
          lat: coords.lat,
          lng: coords.lng,
          radius,
          accuracy: coords.accuracy,
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
      const res = await close({ data: { sessionId: session.id, sectionId: section.id } });
      setReport(res);
      await refetch();
      toast.success("Session closed — report ready");
    } catch {
      toast.error("Could not close the session.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-5 pt-12 safe-bottom">
      <Header title={section.name} onBack={onBack} />

      <LocationBanner
        on={locationOn}
        status={status}
        error={geoError}
        weak={weak}
        accuracy={coords?.accuracy ?? null}
        onTurnOn={() => setLocationOn(true)}
        onRetry={retry}
      />

      {session ? (
        <section className="animate-rise mt-4 rounded-3xl bg-card p-5 shadow-card">
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
              student={coords ? { lat: coords.lat, lng: coords.lng } : null}
              inside
              className="h-52"
            />
          </div>

          <div className="mt-4">
            <Label className="text-xs text-muted-foreground">Attendance radius</Label>
            <RadiusPicker value={radius} onChange={setRadius} />
            <Button
              variant="outline"
              className="tap-scale mt-2 h-11 w-full rounded-xl"
              disabled={busy}
              onClick={async () => {
                await update({
                  data: {
                    sessionId: session.id,
                    sectionId: section.id,
                    radius,
                    ...(coords ? { lat: coords.lat, lng: coords.lng } : {}),
                  },
                });
                await refetch();
                toast.success("Session updated");
              }}
            >
              Update radius &amp; my location
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
        <section className="animate-rise mt-4 space-y-3 rounded-3xl bg-card p-5 shadow-card">
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
            <Label className="text-xs text-muted-foreground">Attendance radius</Label>
            <RadiusPicker value={radius} onChange={setRadius} />
          </div>
          <MapCard
            center={coords ? { lat: coords.lat, lng: coords.lng } : null}
            radius={radius}
            className="h-48"
          />
          <Button
            disabled={busy || !coords}
            onClick={doStart}
            className="tap-scale h-12 w-full rounded-xl bg-gradient-primary text-base font-semibold text-primary-foreground shadow-float"
          >
            {busy ? "Starting…" : "Start attendance"}
          </Button>
        </section>
      )}

      {session ? (
        <section className="animate-rise mt-4 rounded-3xl bg-card p-5 shadow-card">
          <p className="flex items-center gap-2 font-semibold">
            <Users className="size-4 text-primary" /> Present now
            <span className="ml-auto rounded-full bg-accent px-2.5 py-0.5 text-xs text-primary">
              {present?.length ?? 0}
            </span>
          </p>
          <ul className="mt-3 space-y-2">
            {(present ?? []).map((r) => (
              <li
                key={r.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-2xl bg-secondary px-3 py-2"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{r.full_name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {new Date(r.marked_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {r.distance_m !== null ? ` · ${formatDistance(r.distance_m)} away` : ""}
                  </span>
                </span>
                <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium text-primary">
                  Present
                </span>
              </li>
            ))}
            {!present?.length ? (
              <li className="py-3 text-center text-sm text-muted-foreground">
                No check-ins yet.
              </li>
            ) : null}
          </ul>
        </section>
      ) : null}

      {report ? <ReportViewer report={report} onClose={() => setReport(null)} /> : null}

      <HistoryPanel sectionId={section.id} />
    </main>
  );
}

/* ------------------------------------------------------------- shared bits */

function RadiusPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="mt-2 grid grid-cols-4 gap-2">
      {RADIUS_OPTIONS.map((r) => (
        <button
          key={r}
          type="button"
          onClick={() => onChange(r)}
          className={`tap-scale h-11 rounded-xl text-xs font-semibold transition-colors ${
            value === r
              ? "bg-gradient-primary text-primary-foreground shadow-float"
              : "bg-secondary text-muted-foreground"
          }`}
        >
          {r}m
        </button>
      ))}
    </div>
  );
}

export function LocationBanner({
  on,
  status,
  error,
  weak,
  accuracy,
  onTurnOn,
  onRetry,
}: {
  on: boolean;
  status: string;
  error: string | null;
  weak: boolean;
  accuracy: number | null;
  onTurnOn: () => void;
  onRetry: () => void;
}) {
  if (!on) {
    return (
      <section className="animate-rise mt-4 rounded-3xl bg-card p-5 text-center shadow-card">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-accent text-primary">
          <MapPin className="size-5" />
        </span>
        <p className="mt-3 font-semibold">Turn on location</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Location is required before attendance can be verified.
        </p>
        <Button
          onClick={onTurnOn}
          className="tap-scale mt-3 h-12 w-full rounded-xl bg-gradient-primary text-base font-semibold text-primary-foreground shadow-float"
        >
          Turn on location
        </Button>
      </section>
    );
  }

  return (
    <div className="mt-4 rounded-2xl bg-secondary px-4 py-3 text-xs">
      {status === "ready" ? (
        <p className="text-muted-foreground">
          GPS active · accuracy ±{Math.round(accuracy ?? 0)}m
          {weak ? " — move to an open area for a sharper fix" : ""}
        </p>
      ) : (
        <p className="text-muted-foreground">Getting your location…</p>
      )}
      {error ? (
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-destructive">{error}</span>
          <Button variant="outline" className="h-8 shrink-0 rounded-lg text-xs" onClick={onRetry}>
            Retry
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function HistoryPanel({ sectionId }: { sectionId?: string }) {
  const history = useServerFn(getSessionHistory);
  const fetchReport = useServerFn(getReport);
  const [report, setReport] = useState<Report | null>(null);

  const { data } = useQuery({
    queryKey: ["session-history", sectionId ?? "all"],
    queryFn: () => history(),
  });

  const rows = (data ?? []).filter((s) => !sectionId || s.section_id === sectionId);

  return (
    <>
      <section className="animate-rise mt-4 mb-2 rounded-3xl bg-card p-5 shadow-card">
        <p className="flex items-center gap-2 font-semibold">
          <FileText className="size-4 text-primary" /> Attendance records
        </p>
        <ul className="mt-3 max-h-80 space-y-2 overflow-y-auto">
          {rows.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                className="tap-scale grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-2xl bg-secondary px-3 py-2.5 text-left"
                onClick={async () => {
                  try {
                    setReport(await fetchReport({ data: { sessionId: s.id } }));
                  } catch {
                    toast.error("Could not open that report.");
                  }
                }}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{s.course_name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {s.sectionName} · {new Date(s.started_at).toLocaleDateString()} ·{" "}
                    {s.presentCount} present{s.is_active ? " · live" : ""}
                  </span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </button>
            </li>
          ))}
          {!rows.length ? (
            <li className="py-3 text-center text-sm text-muted-foreground">
              No records yet.
            </li>
          ) : null}
        </ul>
      </section>
      {report ? <ReportViewer report={report} onClose={() => setReport(null)} /> : null}
    </>
  );
}
