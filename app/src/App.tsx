import { useCallback, useEffect, useRef, useState } from "react";
import { IconCheck, IconKey, IconLoader2, IconMoon, IconSun, IconUserCircle, IconWorld } from "@tabler/icons-react";
import trimiLogo from "./assets/trimi-logo.png";
import trimiLogoDark from "./assets/trimi-logo-dark.png";
import { useVideoEditor } from "./hooks/useVideoEditor";
import { useTheme } from "./hooks/useTheme";
import { useLicense } from "./hooks/useLicense";
import { VideoStage } from "./components/VideoStage";
import { Timeline } from "./components/Timeline";
import { Sidebar } from "./components/Sidebar";
import { LicenseDialog } from "./components/LicenseDialog";

const SAMPLE_VIDEO_URL = "/sample-wolf.mp4?v=15178051-1080p-silent";
const SAMPLE_VIDEO_NAME = "wolfsample.mp4";
const SAMPLE_VIDEO_SOURCE_URL = "https://www.pexels.com/video/wolf-looking-around-15178051/";

function App() {
  const editor = useVideoEditor();
  const { addFile, clearClipSelection, clearFile, loadFile } = editor;
  const { theme, toggle } = useTheme();
  const license = useLicense();
  const { retry: retryLicenseCheck, unlink: unlinkCurrentLicense } = license;
  const hasVideo = Boolean(editor.videoUrl);
  const isSampleSelected = editor.file?.name === SAMPLE_VIDEO_NAME;
  const [logoMenuOpen, setLogoMenuOpen] = useState(false);
  const [logoMenuMotion, setLogoMenuMotion] = useState(false);
  const [licensePromptOpen, setLicensePromptOpen] = useState(false);
  const [licenseEntryRequested, setLicenseEntryRequested] = useState(false);
  const [licenseUnlinked, setLicenseUnlinked] = useState(false);
  const [sampleLoadState, setSampleLoadState] = useState<"idle" | "loading" | "error">("idle");
  const accountButtonRef = useRef<HTMLButtonElement | null>(null);
  const accountPopoverRef = useRef<HTMLDivElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const pendingDroppedFileRef = useRef<File | null>(null);
  const sampleBlobPromiseRef = useRef<Promise<Blob> | null>(null);
  const sampleLoadRequestRef = useRef(0);

  useEffect(() => {
    if (!licenseUnlinked || licensePromptOpen) return;
    const timeout = window.setTimeout(() => setLicenseUnlinked(false), 3000);
    return () => window.clearTimeout(timeout);
  }, [licenseUnlinked, licensePromptOpen]);

  const getSampleBlob = useCallback(() => {
    sampleBlobPromiseRef.current ??= fetch(SAMPLE_VIDEO_URL)
      .then((response) => {
        if (!response.ok) throw new Error(`Sample video request failed with ${response.status}`);
        return response.blob();
      })
      .catch((error: unknown) => {
        sampleBlobPromiseRef.current = null;
        throw error;
      });
    return sampleBlobPromiseRef.current;
  }, []);

  const prefetchSampleVideo = useCallback(() => {
    void getSampleBlob().catch(() => undefined);
  }, [getSampleBlob]);

  const trySampleVideo = useCallback(async () => {
    const requestId = ++sampleLoadRequestRef.current;
    setSampleLoadState("loading");
    try {
      const blob = await getSampleBlob();
      if (sampleLoadRequestRef.current !== requestId) return;
      loadFile(new File([blob], SAMPLE_VIDEO_NAME, { type: "video/mp4" }));
      setSampleLoadState("idle");
    } catch (error: unknown) {
      if (sampleLoadRequestRef.current !== requestId) return;
      console.error("Couldn't load the sample video.", error);
      setSampleLoadState("error");
    }
  }, [getSampleBlob, loadFile]);

  useEffect(() => {
    if (!hasVideo) return;
    const clearSelectionOutsideClips = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (target?.closest("[data-clip-selection-surface], .trimi-license-dialog")) return;
      clearClipSelection();
    };
    document.addEventListener("pointerdown", clearSelectionOutsideClips);
    return () => document.removeEventListener("pointerdown", clearSelectionOutsideClips);
  }, [clearClipSelection, hasVideo]);

  const importVideoFile = useCallback((file: File) => {
    sampleLoadRequestRef.current += 1;
    setSampleLoadState("idle");
    if (editor.clips.length) addFile(file);
    else loadFile(file);
  }, [addFile, editor.clips.length, loadFile]);

  const requestVideoUpload = () => {
    pendingDroppedFileRef.current = null;
    if (license.state.status === "checking") return;
    if (license.state.status === "unlocked") {
      videoInputRef.current?.click();
      return;
    }
    setLicenseEntryRequested(false);
    setLicensePromptOpen(true);
  };

  const importDroppedVideo = useCallback((file: File) => {
    if (license.state.status === "unlocked") {
      importVideoFile(file);
      return;
    }

    pendingDroppedFileRef.current = file;
    setLicenseEntryRequested(false);
    if (license.state.status !== "checking") setLicensePromptOpen(true);
  }, [importVideoFile, license.state.status]);

  useEffect(() => {
    const pendingFile = pendingDroppedFileRef.current;
    if (!pendingFile) return;

    if (license.state.status === "unlocked") {
      pendingDroppedFileRef.current = null;
      importVideoFile(pendingFile);
      return;
    }

    if (license.state.status !== "checking") setLicensePromptOpen(true);
  }, [importVideoFile, license.state.status]);

  const closeLicensePrompt = useCallback(() => {
    const restoreAccountFocus = licenseEntryRequested;
    pendingDroppedFileRef.current = null;
    setLicensePromptOpen(false);
    setLicenseEntryRequested(false);
    if (restoreAccountFocus) requestAnimationFrame(() => accountButtonRef.current?.focus());
  }, [licenseEntryRequested]);

  const unlinkLicense = useCallback(async () => {
    const unlinked = await unlinkCurrentLicense();
    if (!unlinked) return false;
    pendingDroppedFileRef.current = null;
    sampleLoadRequestRef.current += 1;
    clearFile();
    setLicenseUnlinked(true);
    if (hasVideo) void trySampleVideo();
    else setSampleLoadState("idle");
    return true;
  }, [unlinkCurrentLicense, clearFile, trySampleVideo, hasVideo]);

  const openLicenseEntry = useCallback(() => {
    pendingDroppedFileRef.current = null;
    accountPopoverRef.current?.hidePopover();
    setLicenseUnlinked(false);
    setLicenseEntryRequested(true);
    setLicensePromptOpen(true);
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
        <div
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setLogoMenuOpen(false);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape" && logoMenuOpen) {
              event.preventDefault();
              setLogoMenuOpen(false);
              (event.currentTarget.querySelector("button") as HTMLButtonElement | null)?.focus();
            }
          }}
          style={{ width: 240, height: 40, display: "flex", alignItems: "center", position: "relative" }}
        >
          <button
            type="button"
            className="trimi-logo-button"
            aria-label="Trimi navigation"
            aria-expanded={logoMenuOpen}
            aria-controls="trimi-navigation"
            onClick={(event) => {
              setLogoMenuMotion(event.detail > 0);
              setLogoMenuOpen((open) => !open);
            }}
          >
            {logo}
          </button>

          <div
            id="trimi-navigation"
            className="trimi-navigation"
            data-open={logoMenuOpen}
            data-motion={logoMenuMotion}
            aria-hidden={!logoMenuOpen}
          >
            <a
              className="trimi-home-link"
              href="https://trimi.app"
              tabIndex={logoMenuOpen ? 0 : -1}
            >
              <IconWorld size={16} stroke={2} aria-hidden="true" />
              Back to trimi.app
            </a>
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1 }}>
          {!editor.file && (
            <div className="try-sample-group">
              <button
                type="button"
                className="try-sample-button"
                disabled={sampleLoadState === "loading"}
                aria-busy={sampleLoadState === "loading"}
                aria-describedby={sampleLoadState === "error" ? "try-sample-error" : undefined}
                onPointerEnter={prefetchSampleVideo}
                onFocus={prefetchSampleVideo}
                onClick={trySampleVideo}
              >
                {sampleLoadState === "loading" && <IconLoader2 size={14} stroke={2} className="trimi-spin" aria-hidden="true" />}
                {sampleLoadState === "loading" ? "Loading video…" : "Try placeholder video"}
              </button>
              {sampleLoadState === "error" && <span id="try-sample-error" className="try-sample-error" role="alert">Couldn't load video</span>}
            </div>
          )}
          {editor.file && (
            <>
              <div style={{ maxWidth: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <span title={editor.file.name} style={{ maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13, fontWeight: 500, color: "var(--text-1)" }}>{editor.file.name}</span>
                <span className="tabular-nums" style={{ flexShrink: 0, fontSize: 12, color: "var(--text-3)" }}>
                  {editor.clips.length > 1 ? `${editor.clips.length} clips · ` : ""}{formatDuration(editor.totalDuration)}
                </span>
                {isSampleSelected && (
                  <div className="sample-video-credit">
                    <span>Video by</span>
                    <a className="sample-video-link" href={SAMPLE_VIDEO_SOURCE_URL} target="_blank" rel="noreferrer">
                      Nicky Pe
                    </a>
                  </div>
                )}
              </div>
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
            <button type="button" className="license-header-status license-header-action" onClick={() => {
              setLicenseEntryRequested(false);
              setLicensePromptOpen(true);
            }}>
              License offline
            </button>
          )}
          {license.state.status === "locked" && licenseUnlinked && (
            <div className="license-header-status license-unlinked-status" role="status" aria-live="polite">
              <IconCheck size={14} stroke={2.2} aria-hidden="true" />
              License unlinked
            </div>
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
          <button
            ref={accountButtonRef}
            type="button"
            title="Account"
            aria-label="Account"
            popoverTarget="account-popover"
            className="account-avatar-button"
            data-license-open={licensePromptOpen}
          >
            <IconUserCircle size={24} stroke={1.75} aria-hidden="true" />
          </button>
          <div ref={accountPopoverRef} id="account-popover" popover="auto" className="trimi-account-popover">
            <button type="button" className="account-license-button" onClick={openLicenseEntry}>
              <IconKey size={16} stroke={2} aria-hidden="true" />
              {license.state.status === "unlocked" ? "View License" : "Add License"}
            </button>
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
          if (nextFile) importDroppedVideo(nextFile);
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
        <VideoStage editor={editor} onImportVideo={importDroppedVideo} />
        <Sidebar
          editor={editor}
          onAddVideo={requestVideoUpload}
          addVideoDisabled={license.state.status === "checking"}
        />
        <Timeline editor={editor} />
      </div>

      {licensePromptOpen && (
        <LicenseDialog
          state={license.state}
          onActivate={license.activate}
          activating={license.activating}
          activateError={license.activateError}
          onUnlink={unlinkLicense}
          unlinking={license.unlinking}
          unlinkError={license.unlinkError}
          onRetry={retryLicenseCheck}
          returnFocusRef={accountButtonRef}
          onClose={closeLicensePrompt}
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
