import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";

/** New offline shells activate only after an explicit reload, not mid-form. */
export function AppUpdate() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const requested = useRef(false);
  useEffect(() => {
    if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
    let active = true;
    const cleanups: (() => void)[] = [];
    const inspect = (registration: ServiceWorkerRegistration) => {
      if (!active) return;
      if (registration.waiting && navigator.serviceWorker.controller)
        setWaiting(registration.waiting);
      const updating = () => {
        const worker = registration.installing;
        if (!worker) return;
        const changed = () => {
          if (
            active &&
            worker.state === "installed" &&
            navigator.serviceWorker.controller
          )
            setWaiting(worker);
        };
        worker.addEventListener("statechange", changed);
        cleanups.push(() => worker.removeEventListener("statechange", changed));
      };
      registration.addEventListener("updatefound", updating);
      cleanups.push(() =>
        registration.removeEventListener("updatefound", updating),
      );
      updating();
    };
    const changed = () => {
      if (requested.current) window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", changed);
    void navigator.serviceWorker.ready.then(inspect).catch(() => {});
    return () => {
      active = false;
      cleanups.forEach((cleanup) => cleanup());
      navigator.serviceWorker.removeEventListener("controllerchange", changed);
    };
  }, []);
  if (!waiting) return null;
  return (
    <div className="update-banner" role="status">
      <span className="update-banner-copy">
        A new version is ready. Save any open form before reloading.
      </span>
      <button
        type="button"
        className="button button-secondary update-banner-action"
        onClick={() => {
          requested.current = true;
          waiting.postMessage({ type: "SKIP_WAITING" });
        }}
      >
        <RefreshCw size={15} />
        Update & reload
      </button>
    </div>
  );
}
