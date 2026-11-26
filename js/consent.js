/* agenticengineer.cz — opt-in analytics: Microsoft Clarity loads only after explicit consent. */
(() => {
  "use strict";

  const PROJECT_ID = "zjns7qgdt8";
  const STORAGE_KEY = "ae-analytics-consent";
  const banner = document.getElementById("consent");
  const openers = [...document.querySelectorAll("[data-consent-open]")];

  function readChoice() {
    try { return window.localStorage.getItem(STORAGE_KEY); } catch { return null; }
  }

  function saveChoice(choice) {
    try { window.localStorage.setItem(STORAGE_KEY, choice); } catch { /* The choice then lasts for this page view only. */ }
  }

  function loadClarity() {
    if (window.clarity) return;
    // Same queueing stub as the official snippet: calls made before the tag arrives are replayed by it.
    window.clarity = function clarity() { (window.clarity.q = window.clarity.q || []).push(arguments); };
    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.clarity.ms/tag/${PROJECT_ID}`;
    document.head.append(script);
  }

  function apply(choice) {
    if (choice === "granted") {
      loadClarity();
      window.clarity("consentv2", { ad_Storage: "denied", analytics_Storage: "granted" });
    } else if (window.clarity) {
      window.clarity("consentv2", { ad_Storage: "denied", analytics_Storage: "denied" });
      // Documented way to erase cookies Clarity already set in this browser.
      window.clarity("consent", false);
    }
  }

  function choose(choice) {
    const hadFocus = banner.contains(document.activeElement);
    saveChoice(choice);
    apply(choice);
    banner.hidden = true;
    if (hadFocus) openers[0]?.focus();
  }

  const stored = readChoice();
  if (stored === "granted") apply(stored);
  if (!banner) return;

  for (const button of banner.querySelectorAll("[data-consent]")) {
    button.addEventListener("click", () => choose(button.dataset.consent === "granted" ? "granted" : "denied"));
  }
  for (const opener of openers) {
    opener.hidden = false;
    opener.addEventListener("click", () => {
      banner.hidden = false;
      banner.querySelector("[data-consent]")?.focus();
    });
  }
  if (stored !== "granted" && stored !== "denied") banner.hidden = false;
})();
