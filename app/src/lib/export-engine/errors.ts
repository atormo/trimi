/** Shared by mp4.ts and gif.ts so a single `instanceof` check works regardless of which path ran. */
export class ExportCanceledError extends Error {
  constructor() {
    super("Export canceled");
    this.name = "ExportCanceledError";
  }
}
