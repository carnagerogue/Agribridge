import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";

import { landingStory as scenes } from "../lib/landing";

/** Scroll controls the dissolve; only decoded, available frames are displayed. */
export function CinematicLandscape({
  paused,
  story,
  onSceneChange,
}: {
  paused: boolean;
  story: RefObject<HTMLDivElement | null>;
  onSceneChange: (scene: number) => void;
}) {
  const [active, setActive] = useState(0);
  const [loaded, setLoaded] = useState<number[]>([]);
  const [mounted, setMounted] = useState<number[]>([0]);
  const [visible, setVisible] = useState(true);
  const container = useRef<HTMLDivElement>(null);
  const picker = useRef<HTMLDivElement>(null);
  const activeRef = useRef(0);
  const manualTarget = useRef(0);
  const previousPaused = useRef(paused);
  const playing = !paused && visible;

  // Changing the scroll-story height must not strand the visitor farther down
  // the page. Keep the selected chapter in view when pausing or resuming.
  useLayoutEffect(() => {
    if (previousPaused.current === paused) return;
    previousPaused.current = paused;
    const region = story.current;
    const hero = region?.querySelector<HTMLElement>(".lp-hero");
    if (!region || !hero) return;
    const range = Math.max(0, region.offsetHeight - hero.offsetHeight);
    window.scrollTo({
      top:
        window.scrollY +
        region.getBoundingClientRect().top +
        (paused ? 0 : (range * manualTarget.current) / (scenes.length - 1)),
      behavior: "instant",
    });
  }, [paused, story]);

  useEffect(() => {
    let inView = true;
    const onVisibility = () => setVisible(inView && !document.hidden);
    const observer = new IntersectionObserver((entries) => {
      inView = entries[0]?.isIntersecting ?? true;
      onVisibility();
    });
    if (container.current) observer.observe(container.current);
    document.addEventListener("visibilitychange", onVisibility);
    onVisibility();
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(() => {
    let frame = 0;
    const apply = () => {
      frame = 0;
      const region = story.current;
      if (!region || !container.current) return;
      const hero = region.querySelector<HTMLElement>(".lp-hero");
      const range = Math.max(
        1,
        region.offsetHeight - (hero?.offsetHeight || innerHeight),
      );
      const progress = Math.max(
        0,
        Math.min(1, -region.getBoundingClientRect().top / range),
      );
      const position = paused
        ? manualTarget.current
        : progress * (scenes.length - 1);
      const lower = Math.floor(position);
      const upper = Math.ceil(position);
      // Start the next download only once the visitor begins the scroll story.
      const required =
        position > 0 ? [lower, upper, Math.min(3, upper + 1)] : [0];
      setMounted((current) =>
        required.every((index) => current.includes(index))
          ? current
          : [...new Set([...current, ...required])],
      );
      const weights = scenes.map((_, index) =>
        loaded.includes(index)
          ? Math.max(0, 1 - Math.abs(position - index))
          : 0,
      );
      let sum = weights.reduce((total, weight) => total + weight, 0);
      if (!sum) {
        weights[loaded.includes(activeRef.current) ? activeRef.current : 0] = 1;
        sum = 1;
      }
      const dominant = weights.indexOf(Math.max(...weights));
      if (!paused) manualTarget.current = dominant;
      if (dominant !== activeRef.current) {
        activeRef.current = dominant;
        setActive(dominant);
        onSceneChange(dominant);
      }
      container.current
        .querySelectorAll<HTMLElement>("[data-scene]")
        .forEach((element) => {
          const index = Number(element.dataset.scene);
          element.style.setProperty(
            "--frame-opacity",
            String(weights[index] / sum),
          );
        });
      picker.current?.style.setProperty("--story-progress", String(progress));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(apply);
    };
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    apply();
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [loaded, paused, story, onSceneChange]);

  function requestScene(index: number) {
    manualTarget.current = index;
    setMounted((current) =>
      current.includes(index) ? current : [...current, index],
    );
    if (paused) {
      if (loaded.includes(index)) {
        activeRef.current = index;
        setActive(index);
        onSceneChange(index);
        container.current
          ?.querySelectorAll<HTMLElement>("[data-scene]")
          .forEach((element) =>
            element.style.setProperty(
              "--frame-opacity",
              Number(element.dataset.scene) === index ? "1" : "0",
            ),
          );
      }
    } else {
      const region = story.current;
      if (!region) return;
      const hero = region.querySelector<HTMLElement>(".lp-hero");
      const range = Math.max(
        1,
        region.offsetHeight - (hero?.offsetHeight || innerHeight),
      );
      window.scrollTo({
        top:
          window.scrollY +
          region.getBoundingClientRect().top +
          (range * index) / (scenes.length - 1),
        behavior: "smooth",
      });
    }
  }

  return (
    <>
      <div
        ref={container}
        className={`lp-hero-image lp-cinema ${playing ? "is-playing" : "is-still"}`}
        role="img"
        aria-label="AI-created scenes of the Ugandan farm-to-market journey: growing crops, harvesting, transporting produce and selling at market."
      >
        {scenes.map(
          (scene, index) =>
            mounted.includes(index) && (
              <picture
                key={scene.id}
                data-scene={index}
                className={`lp-film-frame lp-film-${scene.id}`}
                aria-hidden="true"
              >
                <source
                  media="(max-width: 760px)"
                  type="image/webp"
                  srcSet={`/images/agribridge-${scene.id}-640.webp`}
                />
                <source
                  type="image/webp"
                  srcSet={`/images/agribridge-${scene.id}-640.webp 640w, /images/agribridge-${scene.id}-1024.webp 1024w, /images/agribridge-${scene.id}-1536.webp 1536w`}
                  sizes="100vw"
                />
                <img
                  src={`/images/agribridge-${scene.id}-1024.webp`}
                  alt=""
                  width={1536}
                  height={1024}
                  fetchPriority={index === 0 ? "high" : "low"}
                  decoding="async"
                  onLoad={() =>
                    setLoaded((current) =>
                      current.includes(index) ? current : [...current, index],
                    )
                  }
                />
              </picture>
            ),
        )}
        <div className="lp-film-light" aria-hidden="true" />
      </div>
      <div
        ref={picker}
        className={`lp-scene-picker ${playing ? "is-playing" : "is-still"}`}
        role="group"
        aria-label="Choose a farm-to-market scene"
      >
        {scenes.map((scene, index) => (
          <button
            key={scene.id}
            type="button"
            aria-label={`Show ${scene.label.toLowerCase()} scene`}
            aria-pressed={active === index}
            onClick={() => requestScene(index)}
          >
            <span className="lp-scene-track">
              <span className={active === index ? "is-active" : ""} />
            </span>
          </button>
        ))}
        <span className="lp-scene-caption">
          {scenes[active].label}
          <span className="lp-scroll-instruction">Scroll to explore</span>
        </span>
      </div>
    </>
  );
}
