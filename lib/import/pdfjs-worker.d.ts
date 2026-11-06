// pdfjs-dist doesn't ship a declaration file for this specific subpath (its
// worker build, meant to run as a standalone script rather than be imported
// as a library module) -- only its WorkerMessageHandler export is used here,
// see pdfTextExtractionGlobals.ts for why.
declare module "pdfjs-dist/legacy/build/pdf.worker.mjs" {
  export const WorkerMessageHandler: unknown;
}
