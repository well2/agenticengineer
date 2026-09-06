# Interaction checks

Run the interaction tests with Node.js; no installation step is needed:

```sh
node --test tests/*.test.mjs
```

The suite executes the shipped browser script in a small isolated DOM fixture. It
checks navigation, accessible current-section state, header condensation, locale
formatting, scroll bounds, missing elements, responsive rail updates, and shared
animation-frame scheduling. Browser layout and appearance still require a visual
check on desktop and mobile.

The well suites cover the finite 1150ms staggered animation, interrupted reversal,
reduced motion, model initialization and resource cleanup, context loss and
recovery, optional layer annotations, and zero-sized layouts. Control tests use
the actual vendored Three.js camera and OrbitControls to verify mouse capture,
persistent rotation, a full keyboard orbit, Home reset, bounded vertical angles,
finite damping, and native touch/wheel scrolling. The lifecycle fixture replaces
the GPU renderer to exercise failures; these tests do not verify rendered pixels.

Hoist tests exercise vertical movement, reverse direction at the limits, external
height synchronization, raycast picking, keyboard slider semantics and pointer
cancellation. Input integration uses actual OrbitControls to check event ownership.
Water tests cover initially empty, timed filling, retained water, top-only pouring,
reduced motion, the bucket pivot, the visible stream and rope attachment. Lifecycle
checks run the complete lower/fill/raise/pour cycle and verify that animation stops.
Bucket click tests distinguish taps from drags and avoid duplicate native clicks.

Stage tests cover continuous staggered reveal, reversed movement, projection onto
the real course gaps, minimum spacing, reduced motion, and keyboard focus handoff.
Pour effects tests check the curved stream's endpoints and opening clearance,
moving droplets, settling ripples, valid normals, and reuse of geometry buffers.
Delivery checks cover staggered SVG assembly, the verification sweep, accessibility
after completion, shared projection and width, reset on descent, and cleanup if
transformation or projection fails. Timing checks separate the physical pour's
2016ms endpoint from the 3600ms transformation. Instanced-particle checks cover
spiral movement, convergence under camera rotation, buffer reuse and GPU disposal.

Winding checks cover progressive and fractional coil visibility, reversal,
the actual visible tube endpoint joining the hanging rope, clearances, and
reuse of the same geometry buffers. Appearance still needs a browser check.

Canopy checks cover continuous roof coverage, full crank clearance, attachment
during expansion, invalid dependencies, and integrated GPU resource disposal.
Actual visible scene vertices stay within the shared camera framing throughout
representative full orbits, elevation limits, expansion states and narrow views.

## Dependency decision

Scrollama was evaluated through Context7 on 2026-09-05. It provides narrative step
callbacks and scroll progress via IntersectionObserver. This page only has four
fixed anchor destinations and a header/depth display, so a shared native
`requestAnimationFrame` callback keeps the existing static-site architecture and
does not add a dependency or build step. The section-position calculation is
specific to the fixed header and short final contact section.
