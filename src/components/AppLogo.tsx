import defaultLogo from "@/assets/app-logo.png";
import { useAppSettings } from "@/hooks/useAppSettings";

export function AppLogo({ size = 48, className }: { size?: number; className?: string }) {
  const { data } = useAppSettings();
  const src = data?.logo_url || defaultLogo;
  return (
    <img
      src={src}
      alt={`${data?.app_name ?? "Smart Attendance"} logo`}
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className={`rounded-[26%] object-cover ${className ?? ""}`}
    />
  );
}
