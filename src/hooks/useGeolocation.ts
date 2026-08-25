import { useEffect, useRef, useState } from "react";

export type Coords = { lat: number; lng: number; accuracy: number };

export function useGeolocation(enabled: boolean) {
  const [coords, setCoords] = useState<Coords | null>(null);
  const [error, setError] = useState<string | null>(null);
  const watchId = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError("Location is not supported on this device.");
      return;
    }
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        setError(null);
        setCoords({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
      },
      (err) => {
        setError(
          err.code === err.PERMISSION_DENIED
            ? "Location permission denied. Enable it to continue."
            : "Unable to get your location. Move to an open area and retry.",
        );
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 },
    );
    return () => {
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    };
  }, [enabled]);

  return { coords, error };
}
