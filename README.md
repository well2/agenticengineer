# agenticengineer.cz

Personal website of Jiří Studnička, agentic engineer. A static, bilingual site for GitHub Pages, with no build step or backend.

## Design

The well is a reference to the surname Studnička and GitHub handle `well2`. The original dark, layered design is retained: warm blacks, amber accents, bone-colored Fraunces headings, and IBM Plex text. An architectural 3D well uses matching stone and bronze materials with turquoise water. A shallow gabled canopy shelters the opening; open rafters and translucent panels preserve the view of the working mechanism. Brushed bronze and opposing soft fill lights keep the supports and crank visible throughout an orbit.

The page descends from the introduction through career context, working tools (Anvil → Forge → Temper), companies, and contact. Czech and English versions share structure and styles. Revised copy describes capabilities without invented performance metrics or testimonials.

## Local preview

```sh
python3 -m http.server 4173 --bind 127.0.0.1
```

Open `http://127.0.0.1:4173/` or `/en/`. Reload after editing.

## Checks

```sh
node --test tests/*.test.mjs
```

See `tests/README.md` for scope. Browser verification should cover desktop and mobile widths, language switching, keyboard navigation, model controls, reduced motion, and the static fallback without WebGL or JavaScript.

## Structure

```text
index.html             Czech homepage
en/index.html         English homepage
404.html               Bilingual error page
css/                   Tokens, layout, components, motion, and 3D integration
js/main.js             Navigation, depth indicator, and footer year
js/well-3d.js           Optional, on-demand WebGL interaction
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
assets/                Local fonts, favicon, preview image, and SVG fallback
vendor/three/          Pinned Three.js ESM distribution and license
tests/                 Node built-in unit tests
tools/social-preview.html  Authoring surface for the 1200 × 630 social image
```

## Rendering and privacy

HTML and SVG are visible without JavaScript. The optional model loads only near the viewport, checks WebGL support first, and keeps the SVG when unavailable. Data Saver skips the 3D enhancement. Fonts and the pinned Three.js distribution are served locally. No analytics or third-party runtime requests.

The bucket starts raised and empty. Drag the height control vertically to lower it; the stone courses unfold progressively with its depth. At the waterline it fills over 700 ms. Raising it retains the water and brings the masonry back together. Clicking the full bucket starts a 3600ms transformation: the bucket pours and returns upright by 2016ms, then the emerging application finishes assembling. The bucket stays empty until lowered again. The action button provides an animated lower/raise alternative, and dragging interrupts that movement immediately.

The height control has a stable 44px target with vertical arrows. Keyboard controls are arrow keys, Page Up/Down, Home (water), and End (raised). Pouring supports mouse, touch, and the native button keyboard action. Short clicks pour; dragging past the click threshold does not. A localized status describes empty, filling, collected, ready-to-pour, creating, and completed states.

Anvil, Forge, and Temper slide out in sequence as the bucket descends. Each larger callout follows a projected gap between the stone courses and retraces its movement when raised. Labels remain at least 60px apart on normal canvas sizes, with partially revealed links excluded from keyboard navigation. Reduced motion reveals each step without sliding.

Pouring sends a curved stream back into the well, with traveling highlights, splash droplets, and expanding surface ripples. Forty luminous fragments spiral upward from the water and converge into a floating application. Its frame traces into view, then the navigation, main panel, code, and result assemble separately. A single light sweep and check mark finish the sequence. The SVG window and particle destinations share a projected world anchor and width, including when the camera rotates or the viewport changes. The application is an illustration, with no interactive controls or deployment action. It stays until the next descent. Water geometry and particle buffers are reused, and the completed scene returns to idle.

The drum and its helical winding follow bucket height, including partial turns. The hanging rope remains attached as its exit moves along the shaft. During pouring the bucket pivots around that attachment; stream geometry is reused. Bucket travel stays monotonic while the surrounding masonry unfolds. The shelter follows the upper winch assembly and clears the entire crank orbit. Fixed framing includes the expanded roof, and the emerging application floats above it. Translucent panels do not cast opaque shadows onto the mechanism.

Drag outside the controls with the left mouse button to orbit the well; the angle persists after release. Focus the model itself to use arrow keys, or Home to reset the view. Touch outside the controls retains native scrolling and pinch zoom. The canvas and camera framing stay fixed. Rendering stops at rest, including after filling and transformation. Reduced motion removes orbit damping, makes bucket movement and filling immediate, suppresses particles, and presents the completed application without assembly motion.

Three.js is mature despite its pre-1.0 version numbering; see `vendor/three/README.md` for the library decision, exact version, source, and license. The crank uses its existing Raycaster and world/local projection APIs, checked through Context7. Workflow callouts use the documented Object3D/Vector3 projection pattern; the stream updates reusable BufferAttributes. InstancedMesh reuses matrices and colors for digital fragments, while the same progress drives native CSS and SVG assembly. These site-specific mappings need no additional animation library. Winding uses a preallocated TubeGeometry with an indexed draw range and an exact partial final ring; it reuses GPU geometry while reversing. A single constrained rotational joint needs no additional physics engine; its bucket travel and gesture mapping are site-specific. The two-turn lift is a visual mapping, including in the exploded view, rather than an exact rope-length simulation. No framework is needed for the remaining small DOM interactions.

## Deployment

GitHub Pages serves the root of `main`. `CNAME` configures the custom domain, and `.nojekyll` disables Jekyll. Commit and push only after the design has been reviewed and approved.
