# License card playground

Original independent design experiment at `/license-lab.html`. The approved design is
now integrated into Trimi through `components/LicenseDialog.tsx`. This playground
remains memory-only and never uses the real licensing API or stored credentials.

Baseline before the experiment: `8b647c2d6fd8884f602425c3717dd93a28a690aa` (clean working tree).

From `app/`:

- Start: `npm run dev -- --host 127.0.0.1` and visit `/license-lab.html`.
- Typecheck and production regression build: `npm run build`.
- Build the experiment separately: `npx vite build --config vite.license-lab.config.ts`.

Flow: Account → View License → copy or unlink → click/drag the cut line (Enter/Space
also work) → success → Close → preview mode → Account → View License → enter the
sample key → Save license → activated. Click the sample key below the card to fill it.
Cancel unlink and Escape preserve the license. Reset demo or reload restores the starting state.

The revised card uses the original logo, a centered red unlink action, and a vertical
cut guide. Click the guide or drag upwards: scissors travel from bottom to top while
the left and right pieces separate over 1.35 seconds. Reduced motion skips the cut.
Both success panels copy when the license itself is clicked or activated by keyboard;
the key turns green and a “Copied!” label appears above its top-right corner for two seconds.
The main card also copies directly from the license, with “Copied!” centered below it.
All copy confirmations use a gentle inward scale press, without vertical movement.
The thank-you message crossfades into Cancel unlink at the top right. The cut guide
uses a stronger red dash with no stationary scissors or gray seam; the red scissors
cursor and the existing animated cut remain. Revised upward drag, cancellation,
activation, pointer/keyboard copy feedback, and desktop layouts were verified in Chrome.

Only `TRIMI-8F3A-72C9-BE41-6D05` is accepted. State lives in memory and no actual
license is read, stored, activated, or unlinked. Uploaded preview videos stay local,
are released on unlink/reset, and cannot be added in preview mode. The page uses a
placeholder workspace, not the full editor. Native dialog and popover provide modal
focus containment, background inertness, light dismissal, and keyboard behavior.
The integrated input intentionally has no border or focus ring, as requested.

Verified in the user's visible Chrome session: avatar menu, full key display, copy
feedback, cancel unlink, click-to-cut, drag-to-cut, unlink success, preview upload
lock, invalid-key feedback, sample-key activation, Escape, and return of focus to
the avatar. Narrow viewport DOM measurements showed no dialog overflow; Chrome's
viewport override did not return screenshots, so mobile visual inspection remains
limited. Desktop screenshots were inspected. Typecheck, lint, production build,
and the independent experiment build passed. Production has its existing large
export chunk warning. Browser console messages observed came from extensions.

To discard just this standalone playground (the integrated Trimi flow stays), remove `app/license-lab.html`,
`app/vite.license-lab.config.ts`, and `app/src/license-lab/`. No reset of the rest of
the repository is needed. Remove `app/dist/license-lab/` too if it was built.
