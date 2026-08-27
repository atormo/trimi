import { useCallback, useEffect, useRef, useState } from "react";
import { IconLoader2, IconLogout, IconMoon, IconSun, IconUserCircle } from "@tabler/icons-react";
import trimiLogo from "./assets/trimi-logo.png";
import trimiLogoDark from "./assets/trimi-logo-dark.png";
import { useVideoEditor } from "./hooks/useVideoEditor";
import { useTheme } from "./hooks/useTheme";
import { useLicense } from "./hooks/useLicense";
import { VideoStage } from "./components/VideoStage";
import { Timeline } from "./components/Timeline";
import { Sidebar } from "./components/Sidebar";
import { ActivationGate } from "./components/ActivationGate";

const SAMPLE_VIDEO_URL = "/sample-wolf.mp4?v=12s";
const SAMPLE_VIDEO_NAME = "Wolf sample.mp4";

function App() {
  const editor = useVideoEditor();
  const { clearClipSelection, loadFile } = editor;
  const { theme, toggle } = useTheme();
  const license = useLicense();
  const { retry: retryLicenseCheck } = license;
  const hasVideo = Boolean(editor.videoUrl);
  const [accountOpen, setAccountOpen] = useState(false);
  const [licensePromptOpen, setLicensePromptOpen] = useState(false);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const sampleReplacedRef = useRef(false);

  useEffect(() => {
    const controller = new AbortController();

    fetch(SAMPLE_VIDEO_URL, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Sample video request failed with ${response.status}`);
        return response.blob();
      })
      .then((blob) => {
        if (sampleReplacedRef.current) return;
        loadFile(new File([blob], SAMPLE_VIDEO_NAME, { type: "video/mp4" }));
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        console.error("Couldn't load the sample video.", error);
      });

    return () => controller.abort();
  }, [loadFile]);

  useEffect(() => {
    if (!hasVideo) return;
    const clearSelectionOutsideClips = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (target?.closest("[data-clip-selection-surface]")) return;
      clearClipSelection();
    };
    document.addEventListener("pointerdown", clearSelectionOutsideClips);
    return () => document.removeEventListener("pointerdown", clearSelectionOutsideClips);
  }, [clearClipSelection, hasVideo]);

  useEffect(() => {
    if (license.state.status !== "unlocked") setAccountOpen(false);
  }, [license.state.status]);

  const requestVideoUpload = () => {
    if (license.state.status === "checking") return;
    if (license.state.status === "unlocked") {
      videoInputRef.current?.click();
      return;
    }
    setLicensePromptOpen(true);
  };

  const closeLicensePrompt = useCallback(() => setLicensePromptOpen(false), []);

  const retryLicense = useCallback(() => {
    setLicensePromptOpen(false);
    retryLicenseCheck();
  }, [retryLicenseCheck]);

  const continueToVideoUpload = useCallback(() => {
    videoInputRef.current?.click();
    setLicensePromptOpen(false);
  }, []);

  const logo = (
    <img
      src={theme === "dark" ? trimiLogoDark : trimiLogo}
      alt="Trimi"
      style={{ height: 22, display: "block" }}
    />
  );

  return (
    <div data-theme={theme} style={{
      width: "100vw", height: "100dvh", display: "flex", flexDirection: "column",
      color: "var(--text-1)", background: "var(--bg-window)", overflow: "hidden",
    }}>
      <div style={{
        height: 60, minHeight: 60, display: "flex", alignItems: "center", padding: "0 16px",
      }}>
        <div style={{ width: 240, height: 40, display: "flex", alignItems: "center" }}>
          {logo}
        </div>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          {editor.file && (
            <>
              <span title={editor.file.name} style={{ maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13, fontWeight: 500, color: "var(--text-1)" }}>{editor.file.name}</span>
              <span className="tabular-nums" style={{ fontSize: 12, color: "var(--text-3)" }}>
                {editor.clips.length > 1 ? `${editor.clips.length} clips · ` : ""}{formatDuration(editor.totalDuration)}
              </span>
            </>
          )}
        </div>
        <div style={{ width: 240, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 2 }}>
          {license.state.status === "checking" && (
            <div className="license-header-status" role="status" aria-live="polite">
              <IconLoader2 size={14} stroke={2} className="trimi-spin" aria-hidden="true" />
              Checking license
            </div>
          )}
          {license.state.status === "offline" && (
            <button type="button" className="license-header-status license-header-action" onClick={() => setLicensePromptOpen(true)}>
              License offline
            </button>
          )}
          <button
            onClick={toggle}
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            style={{
              width: 40, height: 40, padding: 0, border: "none",
              background: "transparent", color: "var(--text-2)", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            {theme === "dark" ? <IconSun size={22} stroke={1.9} /> : <IconMoon size={22} stroke={1.9} />}
          </button>
          <div
            style={{ position: "relative" }}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) setAccountOpen(false);
            }}
          >
            <button
              type="button"
              title="Account"
              aria-label="Account"
              aria-expanded={accountOpen}
              disabled={license.state.status !== "unlocked"}
              onClick={() => setAccountOpen((open) => !open)}
              style={{
                width: 30, height: 30, padding: 0, border: "none", background: "transparent",
                color: "var(--text-2)", display: "flex", alignItems: "center", justifyContent: "center",
                cursor: license.state.status === "unlocked" ? "pointer" : "default",
              }}
            >
              <IconUserCircle size={24} stroke={1.75} />
            </button>
            {accountOpen && license.state.status === "unlocked" && (
              <div style={{
                position: "absolute", top: 38, right: 0, zIndex: 3, width: 220,
                borderRadius: "var(--radius-md)", background: "var(--bg-panel-solid)",
                boxShadow: "var(--island-shadow)", padding: 12,
                display: "flex", flexDirection: "column", gap: 10,
              }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-1)" }}>Licensed</div>
                  <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2, fontVariantNumeric: "tabular-nums" }}>
                    Key ending {license.state.key.slice(-4)}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={license.unlinking}
                  onClick={() => {
                    setAccountOpen(false);
                    license.unlink();
                  }}
                  className="unlink-device-button"
                  style={{
                    height: 40, borderRadius: "var(--radius-sm)", border: "none",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                    fontSize: 12, fontWeight: 500, cursor: license.unlinking ? "not-allowed" : "pointer",
                    opacity: license.unlinking ? 0.6 : 1,
                  }}
                >
                  <IconLogout size={13} stroke={2} />
                  {license.unlinking ? "Unlinking…" : "Unlink this device"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <input
        ref={videoInputRef}
        type="file"
        accept="video/*,.mov,.m4v"
        aria-label={hasVideo ? "Choose another video" : "Choose a video"}
        style={{ display: "none" }}
        onChange={(event) => {
          const nextFile = event.target.files?.[0];
          if (nextFile) {
            sampleReplacedRef.current = true;
            if (editor.clips.length) editor.addFile(nextFile);
            else editor.loadFile(nextFile);
          }
          event.currentTarget.value = "";
        }}
      />

      <div style={{
        flex: 1,
        minHeight: 0,
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) 296px",
        gridTemplateRows: "minmax(0, 1fr) 150px",
        gap: 12,
        padding: "8px 16px 16px",
      }}>
        <VideoStage editor={editor} />
        <Sidebar
          editor={editor}
          onAddVideo={requestVideoUpload}
          addVideoDisabled={license.state.status === "checking"}
        />
        <Timeline editor={editor} />
      </div>

      {licensePromptOpen && (
        <ActivationGate
          mode={license.state.status}
          onActivate={license.activate}
          activating={license.activating}
          error={license.activateError}
          onRetry={retryLicense}
          onClose={closeLicensePrompt}
          onContinue={continueToVideoUpload}
        />
      )}
    </div>
  );
}

function formatDuration(seconds: number) {
  if (!seconds) return "";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default App;
