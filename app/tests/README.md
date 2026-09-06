# License integration validation

`npm run test:license` runs nine API contract tests without network access.

`npm run dev:license-test` starts the actual editor at `http://127.0.0.1:5175`
with a test-only local licensing service. Only this explicit Vite config redirects
the API; the production config and bundle use Polar. No real credentials are used.

Test key: `TRIMI-TEST-1234-5678-90AB-CDEF-1234-5678`.

For recording, run `npm run dev:license-demo` and open `http://127.0.0.1:5176`.
Use `TRIMI-4C7E-91B2-A8D6-3F05` (the previous `TRIMI-8F3A-72C9-BE41-6D05`
also remains accepted): these recording keys skip simulated failures,
supports activation, reload validation, unlink, and reactivation, and only works
with this local fixture. The separate origin leaves the normal editor's license alone.

The fixture accepts this key, rejects other keys, fails the first validation and
the first unlink, and succeeds on retry. Restart the fixture to reset server state.

Verified in the user's visible Chrome session:

- Account shows only View License; opening without a key shows the integrated form.
- Invalid activation displays its API error; valid activation shows the success card.
- The complete 39-character test key fits and copies with the green confirmation.
- Reload revalidates saved state. Offline mode retains the activation; Retry restores it.
- Cancel unlink preserves activation. Failed unlink keeps the license and permits retry.
- Successful unlink completes the cut and preserves the key in the success card.
  If the editor contained video, it switches to the placeholder; an empty editor stays
  empty. Adding a video then requests activation.
- Reactivation restores access to the native file chooser.

The browser extension rejected `fileChooser.setFiles` because file-URL access was
disabled. Selecting an actual file through browser automation remains unverified;
the native chooser opened after activation. Normal manual file selection is unaffected.

No real Polar activation or unlink was performed during validation. Typecheck,
production build, lint, and API tests pass. The existing export-engine chunk-size
warning remains. The standalone design playground is still available separately.
