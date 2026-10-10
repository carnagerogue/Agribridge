import { useEffect, type RefObject } from "react";

/** Scroll effects stay outside React's render loop and stop when motion is paused. */
export function useLandingMotion(
  root: RefObject<HTMLDivElement | null>,
  paused: boolean,
) {
  useEffect(() => {
    const page = root.current;
    if (!page) return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    let cleanup = () => {};
    const configure = () => {
      cleanup();
      page.classList.toggle("lp-motion-paused", paused || preference.matches);
      if (paused || preference.matches) return;
      let frame = 0;
      const hero = page.querySelector<HTMLElement>(".lp-hero");
      const cooperative = page.querySelector<HTMLElement>(".lp-cooperative");
      const update = () => {
        frame = 0;
        const height = hero?.offsetHeight || 800;
        const scroll = Math.max(0, -(hero?.getBoundingClientRect().top || 0));
        page.style.setProperty(
          "--hero-shift",
          `${Math.min(scroll, height) * 0.24}px`,
        );
        page.style.setProperty(
          "--copy-shift",
          `${Math.min(scroll, height) * 0.075}px`,
        );
        const bounds = cooperative?.getBoundingClientRect();
        if (bounds && bounds.top < innerHeight && bounds.bottom > 0) {
          page.style.setProperty(
            "--field-shift",
            `${Math.max(-90, Math.min(90, (innerHeight / 2 - bounds.top - bounds.height / 2) * 0.12))}px`,
          );
        }
        const distance = document.documentElement.scrollHeight - innerHeight;
        page.style.setProperty(
          "--page-progress",
          `${distance > 0 ? Math.min(1, scrollY / distance) : 0}`,
        );
      };
      const schedule = () => {
        if (!frame) frame = requestAnimationFrame(update);
      };
      const targets = page.querySelectorAll<HTMLElement>(
        ".lp-section-heading, .lp-stage-selector, .lp-journey-scene, .lp-learning-grid > div, .lp-cooperative-intro, .lp-cooperative-list li, .lp-faq > div, .lp-closing-main",
      );
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add("lp-visible");
              observer.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.08, rootMargin: "0px 0px -32px 0px" },
      );
      targets.forEach((target, index) => {
        target.classList.add("lp-reveal");
        target.style.setProperty("--reveal-delay", `${(index % 3) * 65}ms`);
        observer.observe(target);
      });
      page.classList.add("lp-motion-ready");
      window.addEventListener("scroll", schedule, { passive: true });
      window.addEventListener("resize", schedule);
      update();
      cleanup = () => {
        cancelAnimationFrame(frame);
        window.removeEventListener("scroll", schedule);
        window.removeEventListener("resize", schedule);
        observer.disconnect();
        page.classList.remove("lp-motion-ready");
        [
          "--hero-shift",
          "--copy-shift",
          "--field-shift",
          "--page-progress",
        ].forEach((property) => page.style.removeProperty(property));
        targets.forEach((target) =>
          target.classList.remove("lp-reveal", "lp-visible"),
        );
      };
    };
    configure();
    preference.addEventListener("change", configure);
    return () => {
      cleanup();
      preference.removeEventListener("change", configure);
    };
  }, [root, paused]);
}
