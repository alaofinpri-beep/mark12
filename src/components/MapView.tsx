import { useEffect, useState } from "react";
import L from "leaflet";
import { Circle, MapContainer, Marker, TileLayer, useMap } from "react-leaflet";
import { Crosshair, Minus, Plus } from "lucide-react";

export type MapViewProps = {
  center: { lat: number; lng: number } | null;
  radius: number;
  student?: { lat: number; lng: number } | null;
  inside?: boolean;
  className?: string;
};

const adminIcon = L.divIcon({
  className: "",
  html: `<div style="width:22px;height:22px;border-radius:9999px;background:#38bdf8;border:3px solid #fff;box-shadow:0 4px 12px rgba(14,116,190,.45)"></div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

function studentIcon(inside: boolean) {
  const color = inside ? "#16a34a" : "#f97316";
  return L.divIcon({
    className: "",
    html: `<div style="width:18px;height:18px;border-radius:9999px;background:${color};border:3px solid #fff;box-shadow:0 4px 12px rgba(0,0,0,.25)"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

function Controls({
  center,
  student,
  radius,
}: {
  center: { lat: number; lng: number };
  student?: { lat: number; lng: number } | null;
  radius: number;
}) {
  const map = useMap();
  const [fitted, setFitted] = useState(false);

  function fit() {
    const bounds = L.latLng(center.lat, center.lng).toBounds(Math.max(radius * 2.6, 200));
    if (student) bounds.extend(L.latLng(student.lat, student.lng));
    map.fitBounds(bounds, { padding: [26, 26], maxZoom: 18 });
  }

  useEffect(() => {
    if (fitted) return;
    fit();
    setFitted(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitted]);

  useEffect(() => {
    setFitted(false);
  }, [radius, center.lat, center.lng]);

  const btn =
    "grid size-9 place-items-center rounded-xl bg-card/95 text-foreground shadow-card backdrop-blur transition active:scale-95";

  return (
    <div className="pointer-events-auto absolute right-2.5 top-2.5 z-[500] flex flex-col gap-1.5">
      <button type="button" aria-label="Zoom in" className={btn} onClick={() => map.zoomIn()}>
        <Plus className="size-4" />
      </button>
      <button type="button" aria-label="Zoom out" className={btn} onClick={() => map.zoomOut()}>
        <Minus className="size-4" />
      </button>
      <button
        type="button"
        aria-label="Recenter location"
        className={btn}
        onClick={() => {
          const target = student ?? center;
          map.setView([target.lat, target.lng], Math.max(map.getZoom(), 17), {
            animate: true,
          });
        }}
      >
        <Crosshair className="size-4 text-primary" />
      </button>
    </div>
  );
}

export default function MapView({
  center,
  radius,
  student,
  inside = false,
  className,
}: MapViewProps) {
  if (!center) {
    return (
      <div
        className={`grid place-items-center rounded-2xl bg-muted text-xs text-muted-foreground ${className ?? "h-56"}`}
      >
        Waiting for location…
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden rounded-2xl ${className ?? "h-56"}`}>
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={17}
        scrollWheelZoom={false}
        zoomControl={false}
        style={{ height: "100%", width: "100%" }}
        attributionControl={false}
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <Circle
          center={[center.lat, center.lng]}
          radius={radius}
          pathOptions={{ color: "#0ea5e9", fillColor: "#7dd3fc", fillOpacity: 0.22, weight: 2 }}
        />
        <Marker position={[center.lat, center.lng]} icon={adminIcon} />
        {student ? (
          <Marker position={[student.lat, student.lng]} icon={studentIcon(inside)} />
        ) : null}
        <Controls center={center} student={student ?? null} radius={radius} />
      </MapContainer>
    </div>
  );
}
