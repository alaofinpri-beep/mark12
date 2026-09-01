import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { AppLogo } from "@/components/AppLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { listDepartments } from "@/lib/attendance.functions";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Smart Attendance" },
      {
        name: "description",
        content:
          "Sign in with your email and password, or create an account with your name and department.",
      },
      { property: "og:title", content: "Sign in — Smart Attendance" },
      {
        property: "og:description",
        content: "Sign in with email and password, or register with your department.",
      },
    ],
  }),
  component: AuthScreen,
});

const signUpSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name").max(80),
  email: z.string().trim().email("Enter a valid email").max(255),
  password: z.string().min(6, "Password must be at least 6 characters").max(72),
  sectionId: z.string().uuid("Choose your department"),
});

const signInSchema = z.object({
  email: z.string().trim().email("Enter a valid email").max(255),
  password: z.string().min(1, "Enter your password").max(72),
});

function AuthScreen() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const departmentsFn = useServerFn(listDepartments);
  const [mode, setMode] = useState<"in" | "up">("in");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ fullName: "", email: "", password: "", sectionId: "" });

  const { data: departments } = useQuery({
    queryKey: ["departments-public"],
    queryFn: () => departmentsFn(),
  });

  useEffect(() => {
    if (session) navigate({ to: "/home", replace: true });
  }, [session, navigate]);

  const set = (k: "fullName" | "email" | "password") => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "up") {
        const parsed = signUpSchema.safeParse(form);
        if (!parsed.success) {
          toast.error(parsed.error.issues[0]?.message ?? "Check your details");
          return;
        }
        const { error } = await supabase.auth.signUp({
          email: parsed.data.email,
          password: parsed.data.password,
          options: {
            emailRedirectTo: window.location.origin,
            data: {
              full_name: parsed.data.fullName,
              section_id: parsed.data.sectionId,
            },
          },
        });
        if (error) throw error;
        toast.success("Account created — check your email if confirmation is required.");
      } else {
        const parsed = signInSchema.safeParse(form);
        if (!parsed.success) {
          toast.error(parsed.error.issues[0]?.message ?? "Check your details");
          return;
        }
        const { error } = await supabase.auth.signInWithPassword({
          email: parsed.data.email,
          password: parsed.data.password,
        });
        if (error) throw error;
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-6 pt-14 safe-bottom">
      <div className="animate-rise flex flex-col items-center">
        <AppLogo size={68} className="shadow-float" />
        <h1 className="mt-5 text-2xl font-semibold tracking-tight">
          {mode === "in" ? "Welcome back" : "Create account"}
        </h1>
        <p className="mt-1 text-center text-sm text-muted-foreground">
          {mode === "in"
            ? "Sign in with your email and password"
            : "Join with your name, email and department"}
        </p>
      </div>

      <form
        onSubmit={onSubmit}
        className="animate-rise mt-8 space-y-3 rounded-3xl bg-card p-5 shadow-card"
        style={{ animationDelay: "80ms" }}
      >
        {mode === "up" ? (
          <Field label="Full name">
            <Input
              value={form.fullName}
              onChange={set("fullName")}
              placeholder="Promise Alaofin"
              maxLength={80}
              className="h-12 rounded-xl"
            />
          </Field>
        ) : null}

        <Field label="Email">
          <Input
            type="email"
            inputMode="email"
            autoComplete="email"
            value={form.email}
            onChange={set("email")}
            placeholder="you@example.com"
            maxLength={255}
            className="h-12 rounded-xl"
          />
        </Field>
        <Field label="Password">
          <Input
            type="password"
            autoComplete={mode === "in" ? "current-password" : "new-password"}
            value={form.password}
            onChange={set("password")}
            placeholder="••••••••"
            maxLength={72}
            className="h-12 rounded-xl"
          />
        </Field>

        {mode === "up" ? (
          <Field label="Department / Section">
            <div className="grid gap-2">
              {(departments ?? []).map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, sectionId: d.id }))}
                  className={`tap-scale rounded-xl px-4 py-3 text-left text-sm font-medium transition-colors ${
                    form.sectionId === d.id
                      ? "bg-gradient-primary text-primary-foreground shadow-float"
                      : "bg-secondary text-muted-foreground"
                  }`}
                >
                  {d.name}
                </button>
              ))}
              {!departments?.length ? (
                <p className="text-xs text-muted-foreground">Loading departments…</p>
              ) : null}
            </div>
          </Field>
        ) : null}

        <Button
          type="submit"
          disabled={busy}
          className="tap-scale mt-2 h-12 w-full rounded-xl bg-gradient-primary text-base font-semibold text-primary-foreground shadow-float hover:opacity-95"
        >
          {busy ? "Please wait…" : mode === "in" ? "Sign in" : "Create account"}
        </Button>
      </form>

      <button
        type="button"
        className="mx-auto mt-6 text-sm text-muted-foreground"
        onClick={() => setMode((m) => (m === "in" ? "up" : "in"))}
      >
        {mode === "in" ? (
          <>
            New here? <span className="font-semibold text-primary">Create an account</span>
          </>
        ) : (
          <>
            Already registered? <span className="font-semibold text-primary">Sign in</span>
          </>
        )}
      </button>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
