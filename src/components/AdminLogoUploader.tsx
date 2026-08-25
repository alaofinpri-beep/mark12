import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import { toast } from "sonner";

import { AppLogo } from "@/components/AppLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAppSettings } from "@/hooks/useAppSettings";

async function toSquareDataUrl(file: File, size = 256): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  const scale = Math.min(size / bitmap.width, size / bitmap.height);
  const w = bitmap.width * scale;
  const h = bitmap.height * scale;
  ctx.drawImage(bitmap, (size - w) / 2, (size - h) / 2, w, h);
  return canvas.toDataURL("image/png");
}

export function AdminLogoUploader() {
  const { data: settings } = useAppSettings();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [appName, setAppName] = useState(settings?.app_name ?? "Smart Attendance");
  const [busy, setBusy] = useState(false);

  async function save(patch: Record<string, string>) {
    setBusy(true);
    const { error } = await supabase.from("app_settings").update(patch).eq("id", 1);
    setBusy(false);
    if (error) {
      toast.error("Could not save settings.");
      return;
    }
    await qc.invalidateQueries({ queryKey: ["app-settings"] });
    toast.success("Settings saved");
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      toast.error("Pick an image under 4MB.");
      return;
    }
    try {
      const dataUrl = await toSquareDataUrl(file);
      await save({ logo_url: dataUrl });
    } catch {
      toast.error("Could not process that image.");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <section className="animate-rise mt-4 mb-6 rounded-3xl bg-card p-5 shadow-card">
      <p className="font-semibold">App branding</p>
      <div className="mt-4 flex items-center gap-4">
        <AppLogo size={56} className="shrink-0 shadow-card" />
        <Button
          variant="outline"
          className="tap-scale h-11 rounded-xl"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          <ImagePlus className="size-4" /> Upload logo
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onFile}
        />
      </div>

      <div className="mt-4">
        <Label className="text-xs text-muted-foreground">App name</Label>
        <div className="mt-1 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
          <Input
            value={appName}
            onChange={(e) => setAppName(e.target.value)}
            maxLength={60}
            className="h-11 rounded-xl"
          />
          <Button
            variant="outline"
            className="tap-scale h-11 shrink-0 rounded-xl"
            disabled={busy || appName.trim().length < 2}
            onClick={() => save({ app_name: appName.trim() })}
          >
            Save
          </Button>
        </div>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Reports are addressed to {settings?.report_email ?? "the configured admin email"}.
      </p>
    </section>
  );
}
