# Three.js

- Version: **0.185.1**, the latest stable npm release checked on 2026-09-05.
- Source: https://registry.npmjs.org/three/-/three-0.185.1.tgz
- Upstream: https://github.com/mrdoob/three.js
- License: MIT; original `LICENSE` is included.
- Files: unmodified `build/three.module.min.js` and its relative dependency `build/three.core.min.js`.
- Addon: `examples/jsm/controls/OrbitControls.js` from the same release, minified with Terser. Its only source change is rewriting `from 'three'` to `from './three.module.min.js'` for local static hosting. Saved as `OrbitControls.min.js`; covered by the same MIT license.
- npm integrity: `sha512-5aojFCXKwnjBRZvUnt3WFfEcvUJgkN5LlijRFN95hMy8WVkG4I0QNcJE+OuWvuJ0bOdStrbfXn0pkd6/QyiAlg==`

Three.js was selected after checking the official library through Context7. Its long-established browser 3D renderer, active maintenance, extensive adoption and official documentation make it suitable despite its pre-1.0 versioning convention. Reimplementing scene geometry, physically based shading, camera transforms and WebGL resource management would add unnecessary custom infrastructure.

The site serves all modules locally and imports them only when the hero enters the viewport and WebGL2 is available. No CDN or other third-party request is needed. The sculpture renders on demand, caps pixel ratio at 1.5, respects reduced motion, and retains the static illustration if initialization fails. Data Saver users receive the static illustration. OrbitControls provides continuous mouse rotation, bounded elevation and damped settling; zoom and pan are disabled. Touch gestures retain native vertical scrolling. Arrow keys rotate the focused model and Home restores its original view.

The sculpture uses warm sandstone, bronze metal, flax rope and a small turquoise water accent to match the site's original dark brown palette. Warm directional and rim lighting separate the silhouette. Vertical bucket travel drives the staggered separation and temporary torsion of the stone courses; the action button animates this movement over at most 1150ms. The bucket starts empty, fills at the waterline and can be tipped to pour at the top. Camera framing stays fixed throughout; reduced motion applies the result immediately.

To update, check the latest stable release and official API documentation, download its npm tarball, verify its integrity, and replace the two build files and license. Regenerate the local OrbitControls addon from that same release with the import adjustment described above. Validate both languages, mouse and keyboard controls, the model toggle, reduced motion and WebGL fallback before shipping.
