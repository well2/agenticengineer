/* agenticengineer.cz — page depth, navigation, and header state. */
(() => {
  "use strict";

  const head = document.getElementById("siteHead");
  const readout = document.getElementById("depthReadout");
  const bucket = document.getElementById("railBucket");
  const year = document.getElementById("year");
  const railQuery = window.matchMedia("(min-width: 1100px)");
  const isCzech = document.documentElement.lang === "cs";
  const links = [...document.querySelectorAll(".nav a[href^='#']")];
  const destinations = links
    .map((link) => ({ link, section: document.getElementById(link.hash.slice(1)) }))
    .filter(({ section }) => section && section.id !== "top");
  let framePending = false;

  function updatePage() {
    framePending = false;

    const scrollY = Math.max(0, window.scrollY);
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    const progress = maxScroll > 0 ? Math.min(scrollY / maxScroll, 1) : 0;
    const headerLine = (head?.getBoundingClientRect().height || 0) + 40;
    const scrollPadding = Number.parseFloat(window.getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
    // Native anchor scrolling stops at the CSS offset, including wrapped headers.
    const activationLine = Math.max(headerLine, scrollPadding) + 1;
    let currentLink = null;
    let latestTop = -Infinity;
    let lastLink = null;
    let lastTop = -Infinity;

    // Choose by section position, so navigation order does not affect tracking.
    for (const { link, section } of destinations) {
      const { top } = section.getBoundingClientRect();
      if (top > lastTop) {
        lastTop = top;
        lastLink = link;
      }
      if (top <= activationLine && top > latestTop) {
        latestTop = top;
        currentLink = link;
      }
    }

    // A short final section may never reach the line below the fixed header.
    if (maxScroll > 0 && scrollY >= maxScroll - 1) currentLink = lastLink;

    head?.classList.toggle("scrolled", scrollY > 30);
    for (const link of links) {
      const active = link === currentLink;
      link.classList.toggle("active", active);
      if (active) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    }

    if (railQuery.matches) {
      const depth = (progress * 42).toFixed(1);
      if (readout) readout.textContent = `−${isCzech ? depth.replace(".", ",") : depth} m`;
      if (bucket) bucket.style.transform = `translate(-50%, ${progress * window.innerHeight * 0.84}px)`;
    }
  }

  function scheduleUpdate() {
    if (framePending) return;
    framePending = true;
    window.requestAnimationFrame(updatePage);
  }

  window.addEventListener("scroll", scheduleUpdate, { passive: true });
  window.addEventListener("resize", scheduleUpdate, { passive: true });
  window.addEventListener("load", scheduleUpdate);
  window.addEventListener("pageshow", scheduleUpdate);
  if (document.fonts) document.fonts.ready.then(scheduleUpdate);
  if (year) year.textContent = String(new Date().getFullYear());
  updatePage();
})();
