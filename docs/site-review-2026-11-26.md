# Website review — 2026-11-26

## Scope and content

Both pages now describe one application, Forge, instead of six separate ones.

- Forge's core takes an issue to a verified pull request.
- Four optional modules run in the same process: Bellows (research), Anvil
  (requirements), Temper (verification), and Rivet (deployment and operation).
- Cognera Harness, the Supervisor, and CogneraSpec are shared by the core and
  the modules.
- Smithy is removed from the site. The `#smithy` anchor no longer exists.

The Czech and English pages, `llms.txt`, the metadata, and the JSON-LD say the
same thing. The copy was checked against the Forge repository's README and
module guides on 2026-11-26.

The well keeps the delivery order of its five callouts. Forge is marked as the
core (solid amber, "core" tag). The modules have a dashed edge and a plus sign
and dock towards the core as they appear. A chip above the model reads
"Forge + 4 modules". The illustration after pouring shows Forge selected with
four module switches that turn on in sequence during verification.

The figure was restructured. A `.well-stage` box holds the canvas, callouts,
illustration, and load status. The hint, button, foundation links, and caption
follow in flex rows, so longer translations cannot overlap. Without the model
(failed start, Data Saver, or `@media (scripting: none)`) the stage collapses
to a compact static mark.

Page changes: section marks show a computed depth that matches the left gauge,
scroll-driven reveals run in CSS only, the FAQ has five native `details`
items, the language switch uses a view transition and a prefetch of the other
locale, and `color-scheme: dark` is declared. The phone header fits on one row
from 360 px (Czech) and 345 px (English).

## Discoverability

- New `favicon.ico` (16/32/48) and `assets/apple-touch-icon.png`, linked from
  both pages and `404.html`.
- `robots` meta, complete Twitter card tags, `og:image:type`, and
  `og:site_name`. The Czech title names AI agents and automation.
- JSON-LD adds a WebSite name with alternates, Person `alternateName`, `email`,
  `knowsLanguage`, organization `@id`s, ProfilePage dates, and Service
  `availableLanguage`. FAQPage and SoftwareApplication markup are left out on
  purpose.
- `robots.txt` states the policy per group. Search engines, AI search and user
  retrieval, and AI training are all allowed.
- `llms.txt` was restructured and says older "six applications" descriptions
  are out of date. Sitemap `lastmod` is 2026-11-26.
- Font preloads for Fraunces and IBM Plex Sans come after the stylesheets.
- `content-visibility: auto` was considered and not applied, because deferred
  layout would make the computed section depths drift.

## Verification

- **171 unit tests passed** (166 before). New: three tests for section depth
  marks, static-fallback assertions in the launcher tests, and two tests for
  the Three.js preload.
- `node tools/sync-assets.mjs --check` passed.
- No horizontal overflow in either locale at 320, 359, 360, 390, 600, 768, 901,
  1024, 1280, and 1440 px.
- Both locales have identical element structure in an automated tag-by-tag
  comparison, apart from one `lang`-annotated word in the English story lede.
- Reduced motion: no scroll animation, all 21 reveal elements visible, callouts
  appear without sliding. Data Saver: static mark and message shown, no model
  download.
- Checked in a browser: expanded callouts at 1440 px and 390 px; the pour
  sequence and the finished illustration with all four switches on at 1440 px.
- Live site before this change, checked with curl: correct 301s for `http`,
  `www`, and `/en`, a real 404 for missing paths, correct content types.

### Lighthouse

Chrome DevTools Lighthouse against the local preview. This tool does not report
the Performance category.

| Page / profile | Performance | Accessibility | Best practices | SEO | Agentic browsing |
| --- | ---: | ---: | ---: | ---: | ---: |
| Czech / mobile | not reported | 100 | 100 | 100 | 100 |
| English / mobile | not reported | 100 | 100 | 100 | 100 |
| English / desktop | not reported | 100 | 100 | 100 | 100 |

Each run passed 58 audits and failed none.

### Throttled lab load

Czech page, Slow 4G, 4x CPU, 412 px wide: first contentful paint about 2.1 s,
largest contentful paint about 2.7 s, cumulative layout shift 0, and the model
interactive after about 10.8 s. Before the preloads were reordered and trimmed,
first contentful paint in the same setup was about 2.9 s.

## Limits

- Screen-reader testing (VoiceOver, NVDA) was not done.
- Real devices were not tested.
- No production field metrics and no Search Console data.
- Automated scores are not a WCAG certification.
- Nothing is committed or published.
