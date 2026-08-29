import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronRight,
  MapPin,
  Navigation,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

import { MapCard } from "@/components/MapCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSections, getSectionSession, markAttendance } from "@/lib/attendance.functions";
import { formatDistance, haversineMeters } from "@/lib/geo";
import { useAuth } from "@/hooks/useAuth";
import { useGeolocation } from "@/hooks/useGeolocation";

export const Route = createFileRoute("/attendance")({
  head: () => ({
    meta: [
      { title: "Mark Attendance — Smart Attendance" },
      {
        name: "description",
        content:
          "Pick your section, turn on location and verify your presence inside the lecturer's GPS radius with the live 4-minute code.",
      },
      { property: "og:title", content: "Mark Attendance — Smart Attendance" },
      {
        property: "og:description",
        content: "Pick your section, turn on location and verify your presence by GPS.",
      },
    ],
  }),
  component: AttendanceScreen,
});

function AttendanceScreen() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const sectionsFn = useServerFn(getSections);
  const sessionFn = useServerFn(getSectionSession);
  const mark = useServerFn(markAttendance);

  const [section, setSection] = useState<{ id: string; name: string } | null>(null);
  const [locationOn, setLocationOn] = useState(false);
  const [fullName, setFullName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [marked, setMarked] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", replace: true });
  }, [loading, user, navigate]);

  const { data: sections } = useQuery({
    queryKey: ["public-sections"],
    enabled: !!user,
    queryFn: () => sectionsFn(),
  });

  const { data } = useQuery({
    queryKey: ["section-session", section?.id],
    enabled: !!section,
    refetchInterval: 10000,
    queryFn: () => sessionFn({ data: { sectionId: section!.id } }),
  });

  const session = data?.session ?? null;
  const { coords, error: geoError, status, weak, mocked, retry } = useGeolocation(locationOn);

  const distance = useMemo(() => {
    if (!session || !coords) return null;
    return haversineMeters(session.lat, session.lng, coords.lat, coords.lng);
  }, [session, coords]);

  const inside = distance !== null && session ? distance <= session.radius_m : false;
  const nameValid = fullName.trim().replace(/\s+/g, " ").length >= 3;

  async function submit() {
    if (!section) return;
    if (!nameValid) {
      toast.error("Enter your full name first.");
      return;
    }
    if (!coords) {
      toast.error("Turn on location and wait for a GPS fix.");
      return;
    }
    if (!inside) {
      toast.error("Move closer to the attendance area to verify.");
      return;
    }
    setBusy(true);
    try {
      const res = await mark({
        data: {
          sectionId: section.id,
          fullName: fullName.trim().replace(/\s+/g, " "),
          code: code.trim().toUpperCase(),
          lat: coords.lat,
          lng: coords.lng,
          accuracy: coords.accuracy,
        },
      });
      if (res.ok) {
        setMarked(true);
        toast.success(
          "already" in res && res.already ? "Already marked present" : "Attendance marked",
        );
      } else {
        toast.error(res.reason);
      }
    } catch {
      toast.error("Could not verify attendance. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-5 pt-12 safe-bottom">
      <header className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full"
          onClick={() => (section ? setSection(null) : navigate({ to: "/home" }))}
          aria-label="Back"
        >
          <ArrowLeft className="size-5" />
        </Button>
        <h1 className="truncate text-lg font-semibold tracking-tight">
          {section ? section.name : "Choose your section"}
        </h1>
      </header>

      {!section ? (
        <section className="animate-rise mt-5 space-y-2 rounded-3xl bg-card p-5 shadow-card">
          {(sections ?? []).map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSection(s)}
              className="tap-scale grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-2xl bg-secondary px-4 py-3 text-left"
            >
              <span className="truncate text-sm font-medium">{s.name}</span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </button>
          ))}
          {!sections?.length ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No sections available yet.
            </p>
          ) : null}
        </section>
      ) : !locationOn ? (
        <section className="animate-rise mt-6 rounded-3xl bg-card p-6 text-center shadow-card">
          <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-gradient-primary text-primary-foreground shadow-float">
            <MapPin className="size-6" />
          </span>
          <p className="mt-4 font-semibold">Turn on location</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Your real GPS position is compared with your lecturer's location.
          </p>
          <Button
            onClick={() => setLocationOn(true)}
            className="tap-scale mt-4 h-12 w-full rounded-xl bg-gradient-primary text-base font-semibold text-primary-foreground shadow-float"
          >
            Turn on location
          </Button>
        </section>
      ) : !session ? (
        <div className="animate-rise mt-6 rounded-3xl bg-card p-8 text-center shadow-card">
          <MapPin className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 font-semibold">No open session</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Your section admin has not started attendance yet.
          </p>
        </div>
      ) : marked ? (
        <section className="animate-rise mt-6 rounded-3xl bg-card p-8 text-center shadow-card">
          <span className="mx-auto grid size-16 place-items-center rounded-full bg-gradient-primary text-primary-foreground shadow-float">
            <Check className="size-8" />
          </span>
          <p className="mt-4 text-lg font-semibold">Attendance marked</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {fullName.trim()} · {session.course_name}
          </p>
          <Button
            variant="outline"
            className="tap-scale mt-5 h-11 w-full rounded-xl"
            onClick={() => {
              setMarked(false);
              setFullName("");
              setCode("");
            }}
          >
            Mark someone else on this phone
          </Button>
        </section>
      ) : (
        <>
          <section className="animate-rise mt-5 rounded-3xl bg-card p-5 shadow-card">
            <p className="truncate text-lg font-semibold">{session.course_name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {session.course_code || "—"} · radius {session.radius_m}m
            </p>

            <div className="mt-4">
              <MapCard
                center={{ lat: session.lat, lng: session.lng }}
                radius={session.radius_m}
                student={coords ? { lat: coords.lat, lng: coords.lng } : null}
                inside={inside}
                className="h-56"
              />
            </div>

            <div
              className={`mt-3 rounded-2xl px-4 py-3 text-sm font-medium ${
                inside ? "bg-accent text-primary" : "bg-secondary text-muted-foreground"
              }`}
            >
              {distance === null ? (
                <span className="flex items-center gap-2">
                  <Navigation className="size-4 animate-pulse" /> Getting your location…
                </span>
              ) : inside ? (
                <>✅ Location Verified · you are {formatDistance(distance)} from the lecturer</>
              ) : (
                <>❌ Move closer to the attendance area · {formatDistance(distance)} away</>
              )}
            </div>

            {status === "ready" ? (
              <p className="mt-2 text-[11px] text-muted-foreground">
                GPS accuracy ±{Math.round(coords?.accuracy ?? 0)}m
                {weak ? " — step outside or near a window for a sharper fix" : ""}
              </p>
            ) : null}
            {mocked ? (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-destructive">
                <AlertTriangle className="size-3.5" /> Mock location detected. Turn off fake GPS
                apps.
              </p>
            ) : null}
            {geoError ? (
              <div className="mt-2 flex items-center justify-between gap-2">
                <p className="text-xs text-destructive">{geoError}</p>
                <Button
                  variant="outline"
                  className="h-8 shrink-0 rounded-lg text-xs"
                  onClick={retry}
                >
                  <RefreshCw className="size-3.5" /> Retry
                </Button>
              </div>
            ) : null}
          </section>

          <section className="animate-rise mt-4 space-y-3 rounded-3xl bg-card p-5 shadow-card">
            <div>
              <Label className="text-xs text-muted-foreground">Full name</Label>
              <Input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Surname First name"
                maxLength={80}
                className="mt-1 h-12 rounded-xl"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Attendance code</Label>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="ABC123"
                maxLength={12}
                className="mt-1 h-12 rounded-xl text-center font-mono text-lg tracking-[0.3em]"
              />
            </div>
            <Button
              disabled={busy || !nameValid || code.trim().length < 4 || !inside}
              onClick={submit}
              className="tap-scale h-12 w-full rounded-xl bg-gradient-primary text-base font-semibold text-primary-foreground shadow-float"
            >
              {busy ? "Verifying…" : "Verify & mark attendance"}
            </Button>
          </section>
        </>
      )}
    </main>
  );
}
