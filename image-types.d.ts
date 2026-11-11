// Types for `import img from "...jpg"` (DustHero's hero photo). Next adds
// this reference to next-env.d.ts, but that file is generated and
// git-ignored, so a fresh checkout's `tsc` (CI, the deploy worktree) runs
// before it exists. Tracking the reference here keeps typecheck independent
// of whether `next dev`/`next build` has run yet.
/// <reference types="next/image-types/global" />
