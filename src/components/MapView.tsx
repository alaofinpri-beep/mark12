import { useEffect } from "react";
import L from "leaflet";
import { Circle, MapContainer, Marker, TileLayer, useMap } from "react-leaflet";

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

function Fit({
  center,
  student,
  radius,
}: {
  center: { lat: number; lng: number };
  student?: { lat: number; lng: number } | null;
  radius: number;
}) {
  const map = useMap();
  useEffect(() => {
    const bounds = L.latLng(center.lat, center.lng).toBounds(Math.max(radius * 3, 120));
    if (student) bounds.extend(L.latLng(student.lat, student.lng));
    map.fitBounds(bounds, { padding: [24, 24], maxZoom: 18 });
  }, [map, center.lat, center.lng, student?.lat, student?.lng, radius]);
  return null;
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
    <div className={`overflow-hidden rounded-2xl ${className ?? "h-56"}`}>
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={17}
        scrollWheelZoom={false}
        style={{ height: "100%", width: "100%" }}
        attributionControl={false}
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <Circle
          center={[center.lat, center.lng]}
          radius={radius}
          pathOptions={{ color: "#0ea5e9", fillColor: "#7dd3fc", fillOpacity: 0.25, weight: 2 }}
        />
        <Marker position={[center.lat, center.lng]} icon={adminIcon} />
        {student ? (
          <Marker position={[student.lat, student.lng]} icon={studentIcon(inside)} />
        ) : null}
        <Fit center={center} student={student ?? null} radius={radius} />
      </MapContainer>
    </div>
  );
}
