# agenticengineer.cz

Personal website of Jiří Studnička, agentic engineer. A static, bilingual site for GitHub Pages, with no build step or backend.

## Design

The well is a reference to the surname Studnička and GitHub handle `well2`. The original dark, layered design is retained: warm blacks, amber accents, bone-colored Fraunces headings, and IBM Plex text. An architectural 3D well uses matching stone and bronze materials with turquoise water. A shallow gabled canopy shelters the opening; open rafters and translucent panels preserve the view of the working mechanism. Brushed bronze and opposing soft fill lights keep the supports and crank visible throughout an orbit.

The page introduces Jiří's work, practical services, career context, the Cognera ecosystem, companies, collaboration questions, and contact. Czech and English versions share structure and styles. Copy describes capabilities without invented performance metrics or testimonials.

The ecosystem is one application, Forge. Its core takes an issue to a verified pull request. Four optional modules run in the same process: Bellows (research), Anvil (requirements), Temper (verification), and Rivet (deployment and operation). Cognera Harness, the Supervisor, and CogneraSpec are shared by the core and the modules. Smithy no longer appears on the site, and `#smithy` no longer exists. The copy was checked against the Forge repository's README and module guides on 2026-11-26. The well keeps the delivery order of the five callouts, but they are not equals. Forge is marked as the core (solid amber, "core" tag). The four modules have a dashed edge and a plus sign, and dock towards the core as they appear. A chip above the model reads "Forge + 4 modules". The illustration assembled after pouring shows Forge selected with four module switches that turn on in sequence during verification. Links to the three shared foundations sit below the model. A separate personal timeline shows Cline → Roo Code → Augment Code → Claude Code → Codex → OpenCode; it records the author’s adoption sequence, not vendor release dates.

## Local preview

```sh
node tools/sync-assets.mjs
python3 tools/preview.py
```

Open `http://127.0.0.1:4173/` or `/en/`. After changing JavaScript or CSS, rerun
`node tools/sync-assets.mjs` and reload. The preview server sends `Cache-Control: no-store`.

## Checks

```sh
node tools/sync-assets.mjs --check
node --test tests/*.test.mjs
```

See `tests/README.md` for scope. Browser verification should cover desktop and mobile widths, language switching, keyboard navigation, model controls, reduced motion, and readable error states without WebGL or JavaScript.

See [the 2026-11-26 review](docs/site-review-2026-11-26.md) for the latest content, discoverability, accessibility, and performance verification and its limits. The [2026-11-03 review](docs/site-review-2026-11-03.md) covers the earlier six-application version.

## Structure

```text
index.html             Czech homepage
en/index.html         English homepage
404.html               Bilingual error page
favicon.ico            Multi-size icon (16, 32, 48 px)
robots.txt             Explicit crawl policy per bot group
sitemap.xml            Both locales with lastmod
css/                   Tokens, layout, components, motion, and 3D integration
css/ecosystem.css       Services, Forge core and modules, FAQ details, questions, and accessibility refinements
css/motion.css          Motion rules, scroll-driven reveals, and view transitions
css/tool-history.css    Personal tool progression and current toolkit
llms.txt               Optional public text overview for AI assistants
js/main.js             Navigation, depth indicator, section depth marks, and footer year
js/well-start.js        Automatic 3D startup after the first paint, static fallback, and Three.js preload
js/well-3d.js           WebGL initialization and on-demand rendering
js/well-scene.js        3D sculpture geometry and materials
js/well-canopy.js       Open bronze shelter with translucent continuous roof panels
js/well-layout.mjs      Tested layer positions and staged animation timing
js/well-controls.js     Mouse and keyboard OrbitControls integration
js/well-hoist.js        Vertical dragging and accessible bucket height control
js/well-winding.js      Progressive helical rope winding with reusable geometry
js/well-stages.js       Projected, progressively revealed workflow callouts
js/well-water-state.mjs  Filling, retained water, and finite pouring state
js/well-pour-effects.js  Curved stream, moving highlights, splashes, and ripples
js/well-transformation-effects.js  Instanced fragments that rise and assemble software
js/well-delivery.js     Projected SVG application assembled from individual pieces
js/well-bucket-control.js  Bucket click/tap ownership and accessible pour action
assets/                Local fonts, apple-touch-icon.png, favicon, and social preview image
vendor/three/          Pinned Three.js ESM distribution and license
tests/                 Node built-in unit tests
tools/social-preview.html  Authoring surface for the 1200 × 630 social image
tools/sync-assets.mjs  Content hashes and import maps for coherent asset versions
tools/preview.py       Local HTTP preview without asset caching
```

## Rendering and privacy

The page content remains available without JavaScript. The 3D model starts automatically after the first paint, checks WebGL support, and renders only when needed. There is no introductory SVG or start button. The figure has a `.well-stage` box that holds the canvas, callouts, illustration, and load status. The hint, button, shared-foundation links, and caption follow it in normal flex rows, so longer translations or different text spacing cannot overlap the model. `figcaption` is the last child. Reserved space prevents a layout shift while the model loads. Loading and failure states use localized text; automatic startup never moves keyboard focus. Data Saver skips the enhancement and displays a short explanation. When the model does not run (failed start, Data Saver, or no scripting through `@media (scripting: none)`), the stage collapses to a compact static mark (`.is-static`) instead of a large blank area. After first paint, `js/well-start.js` adds `modulepreload` links for both vendored Three.js files, resolved through the import map with `import.meta.resolve`, and only when WebGL 2 exists. They download in parallel with the model code. Preloading is an optimization and its failure is ignored. Fonts and the pinned Three.js distribution are served locally. No analytics or third-party runtime requests.

The decorative SVG noise texture is disabled on small screens; profiling found that its rasterization delayed the first mobile paint. The layout, typography, gradients, and optional well remain available.

The bucket starts raised and empty. Drag the height control vertically to lower it; the stone courses unfold progressively with its depth. At the waterline it fills over 700 ms. Raising it retains the water and brings the masonry back together. Clicking the full bucket starts a 3600ms transformation: the bucket pours and returns upright by 2016ms, then the emerging application finishes assembling. The bucket stays empty until lowered again. The action button provides an animated lower/raise alternative, and dragging interrupts that movement immediately. The button moves the bucket and does not open anything, so it carries no `aria-expanded` or `aria-controls`. The model code also skips writes when text or ARIA attributes are unchanged, so an animation does not rewrite them on every frame.

The height control has a stable 44px target with vertical arrows. Keyboard controls are arrow keys, Page Up/Down, Home (water), and End (raised). Pouring supports mouse, touch, and the native button keyboard action. Short clicks pour; dragging past the click threshold does not. A localized status describes empty, filling, collected, ready-to-pour, creating, and completed states.

The five callouts (Bellows, Anvil, Forge, Temper, Rivet) slide out in sequence as the bucket descends, with Forge styled as the core and the others as modules. Six stone courses provide five gaps without increasing the model’s overall closed or expanded height. Each larger callout follows a projected gap between the stone courses and retraces its movement when raised. Labels remain at least 60px apart on normal canvas sizes, with partially revealed links excluded from keyboard navigation. Reduced motion reveals each step without sliding.

Pouring sends a curved stream back into the well, with traveling highlights, splash droplets, and expanding surface ripples. Forty luminous fragments spiral upward from the water and converge into a floating application. Its frame traces into view, then the navigation, main panel, code, and result assemble separately. A single light sweep and check mark finish the sequence. The SVG window and particle destinations share a projected world anchor and width, including when the camera rotates or the viewport changes. The application is an illustration, with no interactive controls or deployment action. It stays until the next descent. Water geometry and particle buffers are reused, and the completed scene returns to idle.

The drum and its helical winding follow bucket height, including partial turns. The hanging rope remains attached as its exit moves along the shaft. During pouring the bucket pivots around that attachment; stream geometry is reused. Bucket travel stays monotonic while the surrounding masonry unfolds. The shelter follows the upper winch assembly and clears the entire crank orbit. Fixed framing includes the expanded roof, and the emerging application floats above it. Translucent panels do not cast opaque shadows onto the mechanism.

Drag outside the controls with the left mouse button to orbit the well; the angle persists after release. Focus the model itself to use arrow keys, or Home to reset the view. Touch outside the controls retains native scrolling and pinch zoom. The canvas and camera framing stay fixed. Rendering stops at rest, including after filling and transformation. Reduced motion removes orbit damping, makes bucket movement and filling immediate, suppresses particles, and presents the completed application without assembly motion.

Three.js is mature despite its pre-1.0 version numbering; see `vendor/three/README.md` for the library decision, exact version, source, and license. The crank uses its existing Raycaster and world/local projection APIs, checked through Context7. Workflow callouts use the documented Object3D/Vector3 projection pattern; the stream updates reusable BufferAttributes. InstancedMesh reuses matrices and colors for digital fragments, while the same progress drives native CSS and SVG assembly. These site-specific mappings need no additional animation library. Winding uses a preallocated TubeGeometry with an indexed draw range and an exact partial final ring; it reuses GPU geometry while reversing. A single constrained rotational joint needs no additional physics engine; its bucket travel and gesture mapping are site-specific. The two-turn lift is a visual mapping, including in the exploded view, rather than an exact rope-length simulation. No framework is needed for the remaining small DOM interactions.

## Page behaviour

Each section mark shows a depth in metres through `data-depth`. `js/main.js` computes it so it matches the gauge on the left rail at the moment that section reaches the header. The numbers written in the HTML are the fallback without JavaScript. They are measured again only after layout changes (resize, load, pageshow, font readiness), not on scroll, and a page that cannot scroll keeps the authored numbers.

Rows and cards with `.reveal` rise in through CSS scroll-driven animation (`animation-timeline: view()`). The rules sit behind `@supports` and `prefers-reduced-motion`, need no JavaScript, and leave content visible where the feature is unsupported. The old `anim` classes and `--d` inline styles were removed.

The FAQ has five questions in native `<details>` elements with a plus/cross marker. Opening and closing is animated as a progressive enhancement. All answers print.

The language switch uses a cross-document view transition, and a speculation-rules prefetch loads the other locale. The pages declare `color-scheme: dark` in a meta tag and in CSS. The phone header fits on one row from 360 px in Czech and 345 px in English. The navigation item is "Forge" in both languages. The section id stays `#kovarna`, and all other anchors are unchanged.

`content-visibility: auto` was considered for below-the-fold sections and not applied. The sections are light, and deferred layout would make the computed section depths drift.

## Discoverability and content maintenance

The important content is static HTML in both languages. Each page has a self-canonical URL, reciprocal language alternates, localized metadata, and JSON-LD linking the same Person identity to a localized ProfilePage and the visible services. The sitemap records substantive content updates; `lastmod` is 2026-11-26. The optional `llms.txt` is a short index of public facts, not a special ranking signal or a substitute for the pages. It lists pages, services, Forge, contact, companies, and optional items, and notes that older "six applications" descriptions are out of date. The footer links to it; the pages no longer carry a `rel="alternate"` link.

Head and icons: `favicon.ico` and `assets/apple-touch-icon.png` are linked from both pages and `404.html`. Each page has a `robots` meta (`max-image-preview:large, max-snippet:-1`), complete Twitter card tags, `og:image:type`, and `og:site_name` "Agentic Engineer". The Czech title names AI agents and automation, and the `<h1>` carries Jiří's name for screen readers. Font preloads (Fraunces normal and italic, IBM Plex Sans latin and latin-ext) come after the stylesheets.

JSON-LD: a WebSite with the name "Agentic Engineer" and alternate names; a Person with `alternateName`, `email`, `knowsLanguage`, and `@id`s on both organizations; a ProfilePage with `dateCreated` and `dateModified` and no `WebPageElement` part; Services with `availableLanguage`. FAQPage and SoftwareApplication markup are left out on purpose. FAQPage gives no rich result today, and SoftwareApplication would report missing offer and rating fields.

`robots.txt` states the policy per group: search engines, AI search and user retrieval, and AI training. All are allowed. To opt out of AI training, change the last group.

The November 2026 content review checked the Forge repository's README and module guides (latest check 2026-11-26) and, earlier, application code and tests. Public copy describes roles, benefits, and boundaries; it excludes internal algorithms, prompts, operational endpoints, and deployment details. Implemented capabilities are not a claim that every configuration is deployed or that every run succeeds. Keep both translations, metadata, structured data, and the text overview consistent when these roles change.

Native HTML links and `details` provide the ecosystem navigation and FAQ without a new runtime dependency. Vanilla LazyLoad was evaluated through Context7; this single custom WebGL component uses native dynamic import and animation-frame scheduling, so a viewport/media loading library would not simplify its lifecycle. For accessibility QA, axe-core was checked through Context7 and used only as a local audit tool; it is not shipped to visitors. Automated checks complement keyboard, layout, reduced-motion, and no-script checks and do not establish full WCAG conformance.

The modern-web-guidance guides consulted for the 2026-11-26 changes were accordion, scroll-entry-exit-effects, cross-document-transitions, improve-next-page-load-performance, and dark-mode.

Reference guidance: [Google AI features](https://developers.google.com/search/docs/appearance/ai-features), [localized versions](https://developers.google.com/search/docs/specialty/international/localized-versions), and [WCAG 2.2](https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/).

## Asset versions

`node tools/sync-assets.mjs` hashes the local JavaScript, stylesheets, and vendored
Three.js modules. It writes matching import maps and asset references into both
locales and the authoring page. Native import maps cover the complete static and
dynamic module graph, so cached imports cannot combine an old scene with new HTML.
Entry scripts and stylesheets receive their own content hashes. The check command
fails if an asset changed without refreshing these references.

Vite asset hashing was evaluated through Context7. A bundler and new deployment
pipeline would be disproportionate for this static site. The small maintenance
script uses Node built-ins and the browser
[import-map standard](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/script/type/importmap); it does not transform application code.

## Deployment

GitHub Pages serves the root of `main`. `CNAME` configures the custom domain, and `.nojekyll` disables Jekyll. Commit and push only after the design has been reviewed and approved.
