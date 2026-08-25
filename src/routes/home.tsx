import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { CalendarCheck, ChevronRight, LogOut, ShieldCheck } from "lucide-react";

import { AppLogo } from "@/components/AppLogo";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAppSettings } from "@/hooks/useAppSettings";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/home")({
  head: () => ({
    meta: [
      { title: "Home — Smart Attendance" },
      {
        name: "description",
        content: "Mark your attendance or open the admin dashboard to run a session.",
      },
      { property: "og:title", content: "Home — Smart Attendance" },
      {
        property: "og:description",
        content: "Mark your attendance or open the admin dashboard to run a session.",
      },
    ],
  }),
  component: Home,
});

function Home() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const { data: settings } = useAppSettings();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", replace: true });
  }, [loading, user, navigate]);

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("full_name, matric_no")
        .eq("id", user!.id)
        .maybeSingle();
      return data;
    },
  });

  const { data: active } = useQuery({
    queryKey: ["active-session-lite"],
    enabled: !!user,
    refetchInterval: 15000,
    queryFn: async () => {
      const { data } = await supabase
        .from("attendance_sessions")
        .select("course_name, course_code")
        .eq("is_active", true)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const firstName = (profile?.full_name ?? "there").split(" ")[0];

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-5 pt-12 safe-bottom">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <AppLogo size={42} className="shrink-0 shadow-card" />
          <div className="min-w-0">
            <p className="truncate text-xs text-muted-foreground">
              {settings?.app_name ?? "Smart Attendance"}
            </p>
            <h1 className="truncate text-lg font-semibold tracking-tight">Hi, {firstName}</h1>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 rounded-full"
          onClick={async () => {
            await supabase.auth.signOut();
            navigate({ to: "/auth", replace: true });
          }}
          aria-label="Sign out"
        >
          <LogOut className="size-5" />
        </Button>
      </header>

      <section className="animate-rise mt-6 rounded-3xl bg-gradient-primary p-5 text-primary-foreground shadow-float">
        <p className="text-xs/5 opacity-85">
          {active ? "Session in progress" : "No active session"}
        </p>
        <p className="mt-1 truncate text-xl font-semibold">
          {active ? active.course_name : "Waiting for your lecturer"}
        </p>
        <p className="mt-0.5 text-xs opacity-85">
          {active?.course_code ? active.course_code : profile?.matric_no || "—"}
        </p>
      </section>

      <div className="mt-4 space-y-3">
        <ActionCard
          delay={80}
          icon={<CalendarCheck className="size-6" />}
          title="Mark Attendance"
          subtitle="Get the live code, then verify by GPS"
          onClick={() => navigate({ to: "/attendance" })}
        />
        <ActionCard
          delay={160}
          icon={<ShieldCheck className="size-6" />}
          title="Admin Dashboard"
          subtitle="Passkey protected — run and close sessions"
          onClick={() => navigate({ to: "/admin" })}
        />
      </div>

      <p className="mt-auto pt-8 text-center text-[11px] text-muted-foreground">
        Attendance is verified by rotating 4-minute codes and real device location.
      </p>
    </main>
  );
}

function ActionCard({
  icon,
  title,
  subtitle,
  onClick,
  delay,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onClick: () => void;
  delay: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ animationDelay: `${delay}ms` }}
      className="tap-scale animate-rise grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 rounded-3xl bg-card p-4 text-left shadow-card"
    >
      <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-accent text-primary">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block truncate font-semibold">{title}</span>
        <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
    </button>
  );
}
