/* agenticengineer.cz — scroll reveal, depth gauge, nav state, embers */
(() => {
  "use strict";

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isCzech = document.documentElement.lang === "cs";

  /* ── reveal on scroll ── */
  const revealObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("in");
          revealObserver.unobserve(entry.target);
        }
      }
    },
    { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
  );
  document.querySelectorAll(".reveal").forEach((el) => revealObserver.observe(el));

  /* ── condensed header after scrolling ── */
  const head = document.getElementById("siteHead");
  const onHeadScroll = () => head.classList.toggle("scrolled", window.scrollY > 30);
  window.addEventListener("scroll", onHeadScroll, { passive: true });
  onHeadScroll();

  /* ── depth gauge: 0 to −42 m mapped to page progress (desktop rail only) ── */
  const MAX_DEPTH = 42;
  const railQuery = window.matchMedia("(min-width: 1100px)");
  const readout = document.getElementById("depthReadout");
  const bucket = document.getElementById("railBucket");

  const updateDepth = () => {
    if (!railQuery.matches) return;
    const doc = document.documentElement;
    const max = doc.scrollHeight - window.innerHeight;
    const progress = max > 0 ? Math.min(window.scrollY / max, 1) : 0;
    let depth = (progress * MAX_DEPTH).toFixed(1);
    if (isCzech) depth = depth.replace(".", ",");
    readout.textContent = `−${depth} m`;
    bucket.style.transform = `translate(-50%, ${progress * window.innerHeight * 0.84}px)`;
  };
  window.addEventListener("scroll", updateDepth, { passive: true });
  window.addEventListener("resize", updateDepth, { passive: true });
  updateDepth();

  /* ── active nav link ── */
  const navLinks = new Map(
    [...document.querySelectorAll(".nav a[href^='#']")].map((a) => [a.hash.slice(1), a])
  );
  const sectionObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const link = navLinks.get(entry.target.id);
        if (link && entry.isIntersecting) {
          navLinks.forEach((a) => a.classList.remove("active"));
          link.classList.add("active");
        }
      }
    },
    { rootMargin: "-40% 0px -55% 0px" }
  );
  navLinks.forEach((_, id) => {
    const section = document.getElementById(id);
    if (section) sectionObserver.observe(section);
  });

  /* ── marquee pause toggle (WCAG 2.2.2) ── */
  const marqueeToggle = document.getElementById("marqueeToggle");
  if (marqueeToggle) {
    const marquee = marqueeToggle.closest(".marquee");
    marqueeToggle.addEventListener("click", () => {
      const paused = marquee.classList.toggle("paused");
      marqueeToggle.setAttribute("aria-pressed", String(paused));
      marqueeToggle.textContent = paused ? "play" : "pause";
    });
  }

  /* ── embers rising from the well ── */
  const embers = document.getElementById("embers");
  if (embers && !reducedMotion) {
    const COUNT = 14;
    for (let i = 0; i < COUNT; i++) {
      const e = document.createElement("i");
      e.style.setProperty("--s", `${2 + Math.random() * 3.5}px`);
      e.style.setProperty("--t", `${5 + Math.random() * 6}s`);
      e.style.setProperty("--dl", `${Math.random() * 8}s`);
      e.style.setProperty("--h", `${240 + Math.random() * 160}px`);
      e.style.setProperty("--x", `${-30 + Math.random() * 60}px`);
      e.style.left = `${20 + Math.random() * 60}%`;
      embers.appendChild(e);
    }
  }

  /* ── footer year ── */
  document.getElementById("year").textContent = new Date().getFullYear();
})();
