import { useEffect, useState } from "react";
import { IconLogout, IconMoon, IconSun, IconUserCircle } from "@tabler/icons-react";
import trimiLogo from "./assets/trimi-logo.png";
import trimiLogoDark from "./assets/trimi-logo-dark.png";
import { useVideoEditor } from "./hooks/useVideoEditor";
import { useTheme } from "./hooks/useTheme";
import { useLicense } from "./hooks/useLicense";
import { DropZone } from "./components/DropZone";
import { VideoStage } from "./components/VideoStage";
import { Timeline } from "./components/Timeline";
import { Sidebar } from "./components/Sidebar";
import { ActivationGate } from "./components/ActivationGate";

function App() {
  const editor = useVideoEditor();
  const { clearClipSelection } = editor;
  const { theme, toggle } = useTheme();
  const license = useLicense();
  const hasVideo = Boolean(editor.videoUrl);
  const [newVideoOpen, setNewVideoOpen] = useState(false);
  const [newVideoMotion, setNewVideoMotion] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

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
            if (!event.currentTarget.contains(event.relatedTarget)) setNewVideoOpen(false);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setNewVideoOpen(false);
              (event.currentTarget.querySelector("button") as HTMLButtonElement | null)?.focus();
            }
          }}
          style={{ width: 240, height: 40, display: "flex", alignItems: "center", position: "relative" }}
        >
          {hasVideo ? (
            <button
              type="button"
              aria-label="Trimi menu"
              aria-expanded={newVideoOpen}
              aria-controls="new-video-menu"
              onClick={(event) => {
                setNewVideoMotion(event.detail > 0);
                setNewVideoOpen((open) => !open);
              }}
              style={{ height: 40, padding: 0, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center" }}
            >
              {logo}
            </button>
          ) : logo}

          {hasVideo && (
            <div
              id="new-video-menu"
              className="new-video-menu"
              data-open={newVideoOpen}
              data-motion={newVideoMotion}
              aria-hidden={!newVideoOpen}
              style={{ position: "absolute", top: 42, left: 0, zIndex: 3 }}
            >
              <button
                type="button"
                tabIndex={newVideoOpen ? 0 : -1}
                onClick={() => {
                  setNewVideoOpen(false);
                  editor.clearFile();
                }}
                style={{
                  height: 40, padding: "0 14px", borderRadius: 999, border: "none",
                  background: "var(--danger-solid)", color: "#ffffff",
                  boxShadow: "var(--danger-action-shadow)",
                  cursor: "pointer", whiteSpace: "nowrap", fontSize: 12.5, fontWeight: 650,
                }}
              >
                Edit another video
              </button>
            </div>
          )}
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

      {license.state.status !== "unlocked" ? (
        <ActivationGate
          mode={license.state.status}
          onActivate={license.activate}
          activating={license.activating}
          error={license.activateError}
          onRetry={license.retry}
        />
      ) : hasVideo ? (
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
          <Sidebar editor={editor} />
          <Timeline editor={editor} />
        </div>
      ) : (
        <DropZone onFile={editor.loadFile} />
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
