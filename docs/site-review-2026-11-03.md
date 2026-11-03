# Website review — 2026-11-03

## Scope and content

Both Czech and English pages now describe the current Cognera workshop:

- Smithy coordinates the work and its decisions.
- Bellows researches opportunities and sources.
- Anvil prepares requirements in the context of actual code.
- Forge coordinates implementation, review, tests, and CI fixes.
- Temper verifies application behavior and retains evidence.
- Rivet handles deployment planning, runtime verification, and infrastructure visibility.
- Cognera Harness, Cognera Supervisor, and CogneraSpec supply shared foundations.

These roles were checked against current repository documentation, representative
implementation, and tests. The review did not start or modify suite runtimes.
Public copy focuses on responsibilities and benefits without exposing private
operational details or algorithms. It does not claim fully autonomous production
operation, guaranteed savings, or universal correctness.

Practical service descriptions and an FAQ explain how to start a collaboration.
The personal tool timeline follows the author's stated adoption order:
Cline → Roo Code → Augment Code → Claude Code → Codex → OpenCode.
The last three are identified as the current toolkit. The timeline does not
assign product release dates; 2023 marks the beginning of the author's AI work.

The interactive well now presents five stages: Bellows → Anvil → Forge → Temper
→ Rivet. Six stone courses provide five real gaps, with projected connectors
that remain attached to their gaps when labels need additional spacing. Smithy
has a separate coordination link above the model; Harness, Supervisor, and
CogneraSpec have foundation links below it. The final illustrated application
also includes all six applications. Both locales contain the same structure.

## Discoverability

- Static, meaningful HTML remains available without JavaScript.
- Localized titles, descriptions, and social metadata.
- Self-canonical URLs and reciprocal Czech/English language alternates.
- Shared Person identity with localized ProfilePage and Service JSON-LD.
- Updated sitemap and stable, equivalent anchors in both languages.
- Optional `llms.txt` overview consistent with the visible pages.
- No new third-party runtime dependency, analytics, or tracking.

The text overview is an additional discovery surface, not a ranking guarantee.

## Verification

- **166 unit tests passed.** Coverage includes native anchor offsets, automatic
  3D startup after the first paint, duplicate events, failures, Data Saver,
  unchanged keyboard focus, navigation, and bfcache recovery. Asset tests cover
  content hashing, complete module graphs, stale references, and malformed maps.
  Existing well geometry and interaction assertions remain.
- Six-course geometry and five-gap projection tests verify stone clearance
  throughout opening and reversal, connector endpoints, and invalid coordinates.
  Expanded and completed states were checked at 1440 and 320px: all five labels
  remain readable, controls and links stay separate, and the complete bucket
  cycle still works. Expanded views also have zero automated axe violations.
- **Zero axe-core 4.14.0 violations** in both locales at 1440, 768, 390, and 320px,
  plus the bilingual error page. Gradient backgrounds produce manual-review
  results; conservative color calculations covered the affected text palette,
  including the grain overlay. Representative worst-case ratios exceed 4.9:1.
- No horizontal overflow at the audited widths; desktop and mobile screenshots
  reviewed, including the ecosystem and personal timeline.
- Keyboard checks passed for skip link, navigation, language switch, FAQ,
  automatic model startup, bucket controls, and pouring.
- Reduced motion and error handling verified in the browser.
- The initial SVG and launch button were removed at the author's request. The
  3D model now starts automatically without moving focus; a blocked import
  displays a localized text error and leaves navigation usable.
- Repeated loading and the mobile bucket cycle expose all five stages. Observed
  module requests use content-hashed URLs; no old unversioned module is loaded.
  The local preview sends `Cache-Control: no-store`.
- Local links, assets, ARIA references, unique IDs, heading structure, matching
  locale anchors, JSON-LD syntax, and sitemap XML checked.
- `git diff --check` passed.

### Lighthouse 13.6.0

Local HTTP preview, Chrome 153, default simulated mobile settings. These are
laboratory results, not production field measurements. Remeasured after switching
to automatic 3D startup and removing the static illustration.

| Page / profile | Performance | Accessibility | Best practices | SEO | Agentic browsing |
| --- | ---: | ---: | ---: | ---: | ---: |
| Czech / mobile | 94 | 100 | 100 | 100 | 100 |

LCP was 1.5s, cumulative layout shift 0, and total blocking time 260ms.
Automatic 3D initialization adds startup work compared with the earlier opt-in
version; the requested automatic experience takes priority over that earlier
performance score. The decorative SVG noise remains disabled on small screens.

Automated scores are not a WCAG certification. VoiceOver and production
Search Console/field metrics were not tested. Hosting cache and security headers
were not changed. Source changes remain local until explicitly published.
