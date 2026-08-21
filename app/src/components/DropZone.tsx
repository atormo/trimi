import { useCallback, useRef, useState } from "react";
import { IconUpload } from "@tabler/icons-react";

interface Props {
  onFile: (file: File) => void;
}

export function DropZone({ onFile }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isOver, setIsOver] = useState(false);
  const [isUploadPressed, setIsUploadPressed] = useState(false);

  const handleFiles = useCallback((files: FileList | null) => {
    const f = files?.[0];
    if (f && f.type.startsWith("video/")) onFile(f);
  }, [onFile]);

  return (
    <>
      <button
        type="button"
        className="drop-zone"
        data-pointer-pressed={isUploadPressed}
        onDragOver={(e) => { e.preventDefault(); setIsOver(true); }}
        onDragLeave={() => setIsOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsOver(false);
          handleFiles(e.dataTransfer.files);
        }}
        onPointerDown={(event) => {
          if (event.isPrimary && event.button === 0) setIsUploadPressed(true);
        }}
        onPointerUp={() => setIsUploadPressed(false)}
        onPointerCancel={() => setIsUploadPressed(false)}
        onPointerLeave={() => setIsUploadPressed(false)}
        onClick={() => inputRef.current?.click()}
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          margin: "8px 16px 16px",
          padding: 0,
          borderRadius: "var(--radius-lg)",
          background: isOver ? "var(--bg-dropzone-active)" : "var(--bg-dropzone)",
          border: "none",
          color: "inherit",
          cursor: "pointer",
        }}
      >
        <div
          className="upload-icon-feedback"
          style={{
            width: 56, height: 56, borderRadius: "50%",
            background: "var(--bg-panel-solid)",
            display: "flex", alignItems: "center", justifyContent: "center",
            border: "none",
            boxShadow: "var(--control-shadow)",
          }}
        >
          <IconUpload size={22} stroke={1.8} color="var(--text-1)" aria-hidden="true" />
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 15, fontWeight: 500, color: "var(--text-1)" }}>
            Drop or click to add your video
          </div>
          <div style={{ fontSize: 13, color: "var(--text-3)", marginTop: 4 }}>
            mp4, mov, m4v
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
          {[
            { label: "Trim", color: "var(--tool-trim)" },
            { label: "Crop", color: "var(--tool-crop)" },
            { label: "Audio", color: "var(--tool-audio)" },
            { label: "Speed", color: "var(--tool-speed)" },
            { label: "Color", color: "var(--tool-color)" },
          ].map(({ label, color }) => (
            <span
              key={label}
              style={{
                fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 999,
                color: "rgba(9,9,11,0.8)", background: color,
              }}
            >
              {label}
            </span>
          ))}
        </div>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        style={{ display: "none" }}
        onChange={(e) => handleFiles(e.target.files)}
      />
    </>
  );
}
