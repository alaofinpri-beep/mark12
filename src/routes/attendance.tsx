import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, Copy, KeyRound, MapPin, Navigation } from "lucide-react";
import { toast } from "sonner";

import { MapCard } from "@/components/MapCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getLiveSession, markAttendance } from "@/lib/attendance.functions";
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
          "Generate the live class code and verify your presence inside the lecturer's attendance radius.",
      },
      { property: "og:title", content: "Mark Attendance — Smart Attendance" },
      {
        property: "og:description",
        content: "Generate the live class code and verify your presence by GPS.",
      },
    ],
  }),
  component: AttendanceScreen,
});

function AttendanceScreen() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const live = useServerFn(getLiveSession);
  const mark = useServerFn(markAttendance);

  const [revealed, setRevealed] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [marked, setMarked] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", replace: true });
  }, [loading, user, navigate]);

  const { data } = useQuery({
    queryKey: ["live-session"],
    enabled: !!user,
    refetchInterval: 10000,
    queryFn: () => live(),
  });

  const session = data?.session ?? null;
  const { coords, error: geoError } = useGeolocation(!!session);

  const distance = useMemo(() => {
    if (!session || !coords) return null;
    return haversineMeters(session.lat, session.lng, coords.lat, coords.lng);
  }, [session, coords]);

  const inside = distance !== null && session ? distance <= session.radius_m : false;

  async function submit() {
    if (!coords) {
      toast.error("Waiting for your location. Allow location access and try again.");
      return;
    }
    setBusy(true);
    try {
      const res = await mark({
        data: { code: code.trim().toUpperCase(), lat: coords.lat, lng: coords.lng },
      });
      if (res.ok) {
        setMarked(true);
        toast.success("Attendance marked");
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
          onClick={() => navigate({ to: "/home" })}
          aria-label="Back"
        >
          <ArrowLeft className="size-5" />
        </Button>
        <h1 className="text-lg font-semibold tracking-tight">Mark Attendance</h1>
      </header>

      {!session ? (
        <div className="animate-rise mt-6 rounded-3xl bg-card p-8 text-center shadow-card">
          <MapPin className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 font-semibold">No open session</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Your lecturer hasn&apos;t started attendance yet. This page updates automatically.
          </p>
        </div>
      ) : marked ? (
        <div className="animate-rise mt-6 rounded-3xl bg-card p-8 text-center shadow-card">
          <span className="mx-auto grid size-16 place-items-center rounded-full bg-gradient-primary text-primary-foreground shadow-float">
            <Check className="size-8" />
          </span>
          <p className="mt-4 text-lg font-semibold">You are marked present</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {session.course_name}
            {distance !== null ? ` · ${formatDistance(distance)} from the lecturer` : ""}
          </p>
          <Button
            className="tap-scale mt-6 h-12 w-full rounded-xl bg-gradient-primary text-primary-foreground"
            onClick={() => navigate({ to: "/home" })}
          >
            Done
          </Button>
        </div>
      ) : (
        <>
          <section className="animate-rise mt-5 rounded-3xl bg-card p-5 shadow-card">
            <p className="text-xs text-muted-foreground">Active course</p>
            <p className="truncate text-lg font-semibold">{session.course_name}</p>
            {session.course_code ? (
              <p className="text-xs text-muted-foreground">{session.course_code}</p>
            ) : null}

            <div className="mt-4 rounded-2xl bg-accent p-4 text-center">
              {revealed && data?.code ? (
                <>
                  <p className="text-xs text-muted-foreground">Current code</p>
                  <p className="mt-1 font-mono text-3xl font-bold tracking-[0.35em] text-primary">
                    {data.code.code}
                  </p>
                  <button
                    type="button"
                    className="mx-auto mt-2 flex items-center gap-1.5 text-xs font-medium text-primary"
                    onClick={() => {
                      navigator.clipboard?.writeText(data.code!.code);
                      toast.success("Code copied");
                    }}
                  >
                    <Copy className="size-3.5" /> Copy code
                  </button>
                </>
              ) : (
                <Button
                  variant="ghost"
                  className="tap-scale h-11 w-full rounded-xl font-semibold text-primary"
                  onClick={() => setRevealed(true)}
                >
                  <KeyRound className="size-4" /> Generate Code
                </Button>
              )}
            </div>
          </section>

          <section
            className="animate-rise mt-4 rounded-3xl bg-card p-4 shadow-card"
            style={{ animationDelay: "80ms" }}
          >
            <MapCard
              center={{ lat: session.lat, lng: session.lng }}
              radius={session.radius_m}
              student={coords ? { lat: coords.lat, lng: coords.lng } : null}
              inside={inside}
              className="h-52"
            />
            <div className="mt-3 flex items-center gap-2 text-sm">
              <Navigation
                className={`size-4 shrink-0 ${inside ? "text-primary" : "text-destructive"}`}
              />
              <p className={inside ? "text-foreground" : "text-destructive"}>
                {geoError
                  ? geoError
                  : distance === null
                    ? "Locating you…"
                    : inside
                      ? `Inside the area · ${formatDistance(distance)} away`
                      : `Move closer — ${formatDistance(distance - session.radius_m)} to go`}
              </p>
            </div>
          </section>

          <section
            className="animate-rise mt-4 rounded-3xl bg-card p-5 shadow-card"
            style={{ animationDelay: "160ms" }}
          >
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 12))}
              placeholder="ENTER CODE"
              maxLength={12}
              className="h-14 rounded-xl text-center font-mono text-xl tracking-[0.3em]"
            />
            <Button
              disabled={busy || code.trim().length < 4}
              onClick={submit}
              className="tap-scale mt-3 h-12 w-full rounded-xl bg-gradient-primary text-base font-semibold text-primary-foreground shadow-float hover:opacity-95"
            >
              {busy ? "Verifying…" : "Verify & Mark Present"}
            </Button>
          </section>
        </>
      )}
    </main>
  );
}
