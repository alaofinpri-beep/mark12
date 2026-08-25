import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AppSettings = {
  app_name: string;
  logo_url: string | null;
  report_email: string;
};

export function useAppSettings() {
  return useQuery({
    queryKey: ["app-settings"],
    queryFn: async (): Promise<AppSettings> => {
      const { data } = await supabase
        .from("app_settings")
        .select("app_name, logo_url, report_email")
        .eq("id", 1)
        .maybeSingle();
      return (
        data ?? {
          app_name: "Smart Attendance",
          logo_url: null,
          report_email: "alaofinpromise123@gmail.com",
        }
      );
    },
    staleTime: 60_000,
  });
}
