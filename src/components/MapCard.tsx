import { lazy, Suspense } from "react";
import { ClientOnly } from "@tanstack/react-router";
import type { MapViewProps } from "./MapView";

const MapView = lazy(() => import("./MapView"));

function Skeleton({ className }: { className?: string | undefined }) {
  return (
    <div
      className={`grid animate-pulse place-items-center rounded-2xl bg-muted text-xs text-muted-foreground ${className ?? "h-56"}`}
    >
      Loading map…
    </div>
  );
}

export function MapCard(props: MapViewProps) {
  return (
    <ClientOnly fallback={<Skeleton className={props.className} />}>
      <Suspense fallback={<Skeleton className={props.className} />}>
        <MapView {...props} />
      </Suspense>
    </ClientOnly>
  );
}
