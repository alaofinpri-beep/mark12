import { useCallback, useEffect, useRef, useState } from "react";

export type Coords = { lat: number; lng: number; accuracy: number; at: number };

export type GeoStatus = "idle" | "prompt" | "locating" | "ready" | "denied" | "error";

/** Readings worse than this are treated as a weak signal (still usable, but flagged). */
export const WEAK_ACCURACY_M = 60;
/** Readings worse than this are rejected outright — they cause huge phantom distances. */
export const MAX_ACCURACY_M = 250;

export function useGeolocation(enabled: boolean) {
  const [coords, setCoords] = useState<Coords | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<GeoStatus>("idle");
  const [mocked, setMocked] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const watchId = useRef<number | null>(null);
  const lastFix = useRef<number>(0);
  const coordsRef = useRef<Coords | null>(null);
  coordsRef.current = coords;

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
      const acc = pos.coords.accuracy ?? 9999;
      const now = Date.now();

      // Coarse network/cell fixes can be kilometres off — that is what makes two
      // phones side by side look hundreds of meters apart. Reject them once a
      // better recent fix exists, and never accept anything wildly imprecise.
      const current = coordsRef.current;
      const currentFresh = !!current && now - current.at < 20000;
      if (currentFresh && acc > current!.accuracy * 1.6 && acc > 25) return;
      if (acc > MAX_ACCURACY_M && currentFresh) return;

      lastFix.current = now;
      const looksMocked =
        (pos as GeolocationPosition & { coords: { mocked?: boolean } }).coords.mocked === true ||
        acc === 0;
      setMocked(looksMocked);
      setError(null);
      setStatus("ready");
      setCoords({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: acc,
        at: now,
      });
    };

    const onErr = (err: GeolocationPositionError) => {
      if (err.code === err.PERMISSION_DENIED) {
        setStatus("denied");
        setError("Location permission denied. Allow location access to continue.");
        return;
      }
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

    // Fast first fix so the map appears immediately…
    navigator.geolocation.getCurrentPosition(onPos, () => undefined, {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 12000,
    });
    // …then a continuous high-accuracy watch that keeps refining the reading.
    watchId.current = navigator.geolocation.watchPosition(onPos, onErr, {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 30000,
    });

    return () => {
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    };
  }, [enabled, attempt]);

  const weak = !!coords && coords.accuracy > WEAK_ACCURACY_M;

  return { coords, error, status, weak, mocked, retry };
}
