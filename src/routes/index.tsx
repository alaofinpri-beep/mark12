import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { AppLogo } from "@/components/AppLogo";
import { useAppSettings } from "@/hooks/useAppSettings";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Smart Attendance — GPS Verified Class Attendance" },
      {
        name: "description",
        content:
          "Mark class attendance with a rotating 4-minute code and live GPS verification inside the lecturer's attendance radius.",
      },
      { property: "og:title", content: "Smart Attendance — GPS Verified Class Attendance" },
      {
        property: "og:description",
        content:
          "Rotating attendance codes, live map verification and instant present/absent reports.",
      },
    ],
  }),
  component: Splash,
});

function Splash() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const { data: settings } = useAppSettings();
  const [done, setDone] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDone(true), 2200);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!done || loading) return;
    navigate({ to: session ? "/home" : "/auth", replace: true });
  }, [done, loading, session, navigate]);

  return (
    <main className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden px-8">
      <div className="pointer-events-none absolute inset-x-0 top-1/2 h-64 -translate-y-1/2 bg-gradient-primary opacity-15 blur-3xl" />

      <div className="relative flex flex-col items-center">
        <span className="absolute h-32 w-32 rounded-full bg-primary/25 animate-pulse-ring" />
        <div className="animate-logo-pop rounded-[28%] shadow-float">
          <AppLogo size={104} />
        </div>
      </div>

      <h1
        className="mt-8 animate-rise text-center text-2xl font-semibold tracking-tight"
        style={{ animationDelay: "320ms" }}
      >
        {settings?.app_name ?? "Smart Attendance"}
      </h1>
      <p
        className="mt-2 animate-rise text-center text-sm text-muted-foreground"
        style={{ animationDelay: "460ms" }}
      >
        Code + GPS verified presence
      </p>

      <div className="mt-10 h-1 w-40 overflow-hidden rounded-full bg-secondary">
        <div className="h-full w-1/3 rounded-full bg-gradient-primary animate-sheen" />
      </div>
    </main>
  );
}
