import { useCallback, useEffect, useRef, useState } from "react";

export type Coords = { lat: number; lng: number; accuracy: number };

export type GeoStatus = "idle" | "prompt" | "locating" | "ready" | "denied" | "error";

/** Readings worse than this are treated as a weak signal (still usable, but flagged). */
export const WEAK_ACCURACY_M = 50;

export function useGeolocation(enabled: boolean) {
  const [coords, setCoords] = useState<Coords | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<GeoStatus>("idle");
  const [mocked, setMocked] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const watchId = useRef<number | null>(null);
  const lastFix = useRef<number>(0);

  const retry = useCallback(() => {
    setError(null);
    setStatus("locating");
    setAttempt((a) => a + 1);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus("error");
      setError("Location is not supported on this device or browser.");
      return;
    }
    if (typeof window !== "undefined" && !window.isSecureContext) {
      setStatus("error");
      setError("Location needs a secure (https) connection. Open the app over https.");
      return;
    }

    setStatus((s) => (s === "ready" ? s : "locating"));

    // Surface the permission state up-front so we can prompt clearly.
    navigator.permissions
      ?.query({ name: "geolocation" as PermissionName })
      .then((p) => {
        if (p.state === "denied") {
          setStatus("denied");
          setError(
            "Location permission is blocked. Enable it for this site in your browser settings, then retry.",
          );
        } else if (p.state === "prompt") {
          setStatus((s) => (s === "ready" ? s : "prompt"));
        }
      })
      .catch(() => undefined);

    const onPos = (pos: GeolocationPosition) => {
      lastFix.current = Date.now();
      const acc = pos.coords.accuracy;
      // Mock/spoofed providers usually report a perfect fix with no motion data.
      const looksMocked =
        (pos as GeolocationPosition & { coords: { mocked?: boolean } }).coords.mocked === true ||
        acc === 0;
      setMocked(looksMocked);
      setError(null);
      setStatus("ready");
      setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: acc });
    };

    const onErr = (err: GeolocationPositionError) => {
      if (err.code === err.PERMISSION_DENIED) {
        setStatus("denied");
        setError("Location permission denied. Allow location access to continue.");
        return;
      }
      // Keep the last good fix rather than blanking the map on a transient failure.
      if (coordsRef.current && Date.now() - lastFix.current < 60000) {
        setError("Weak GPS signal — using your last known position. Move to an open area.");
        return;
      }
      setStatus("error");
      setError(
        err.code === err.TIMEOUT
          ? "Getting your location is taking too long. Move near a window or outdoors and retry."
          : "Unable to get your location. Turn on GPS/location services and retry.",
      );
    };

    // Fast, low-accuracy first fix so the map appears immediately…
    navigator.geolocation.getCurrentPosition(onPos, () => undefined, {
      enableHighAccuracy: false,
      maximumAge: 30000,
      timeout: 8000,
    });
    // …then a continuous high-accuracy watch.
    watchId.current = navigator.geolocation.watchPosition(onPos, onErr, {
      enableHighAccuracy: true,
      maximumAge: 2000,
      timeout: 25000,
    });

    return () => {
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    };
  }, [enabled, attempt]);

  const coordsRef = useRef<Coords | null>(null);
  coordsRef.current = coords;

  const weak = !!coords && coords.accuracy > WEAK_ACCURACY_M;

  return { coords, error, status, weak, mocked, retry };
}
