import { z } from "zod";

// ISO 3166-1 alpha-2 country code, or the "OTHER" sentinel for a buyer/user
// whose country isn't in the shorter selector lists (checkout, admin user
// form) built from lib/data/countries.ts.
export const countryCodeSchema = z
  .string()
  .refine((v) => v === "OTHER" || /^[A-Z]{2}$/.test(v), "Invalid country code");

// ---------- Checkout ----------
export const checkoutSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: z.number().int().min(1).max(50), // cap prevents absurd/abusive orders
        // Which half of a format: "both" product this line item is — required
        // only for those; the route validates it against the product's own
        // format server-side, never trusting it alone to pick a price.
        variant: z.enum(["physical", "digital"]).optional(),
      })
    )
    .min(1)
    .max(50), // cap cart size — prevents pathological Stripe line-item payloads
  guestEmail: z.string().email().optional(),
  // Required for every order regardless of format/guest status — see
  // orders.country in the schema and PRIVACY.md for why.
  country: countryCodeSchema,
});

// ---------- Responses (study answers) ----------
export const responseSchema = z.object({
  contentBlockId: z.string().uuid(),
  answerText: z.string().max(20_000), // generous but bounded — prevents unbounded payloads
});

// ---------- Stream ----------
export const streamSignUrlSchema = z.object({
  contentBlockId: z.string().uuid(),
});

// ---------- Progress ----------
export const progressSchema = z.object({
  lessonId: z.string().uuid(),
  status: z.enum(["not_started", "in_progress", "completed"]),
});

export const progressResetSchema = z.object({
  studyId: z.string().uuid(),
});

// ---------- Admin: products ----------
export const productSchema = z
  .object({
    id: z.string().uuid().optional(),
    title: z.string().min(1).max(200),
    slug: z
      .string()
      .min(1)
      .max(200)
      .regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and hyphens only"),
    description: z.string().max(5_000).optional().nullable(),
    // Physical price for "both"; the only price for "physical"/"digital".
    priceCents: z.number().int().min(0).max(100_000_00), // sanity ceiling: $100,000
    // Digital price, used only for format "both" — a plain "digital" product
    // keeps using priceCents above, unchanged.
    digitalPriceCents: z.number().int().min(0).max(100_000_00).optional().nullable(),
    format: z.enum(["physical", "digital", "both"]),
    type: z.enum(["book", "study_access", "bundle"]),
    imageUrl: z.string().url().optional().nullable(), // front cover, for book products
    imageAlt: z.string().max(300).optional().nullable(), // optional — see the note on alt text below
    backImageUrl: z.string().url().optional().nullable(),
    backImageAlt: z.string().max(300).optional().nullable(), // optional — see the note on alt text below
    coverPdfUrl: z.string().url().optional().nullable(),
    // This becomes an <a href> rendered to every visitor, so it's checked
    // against the *parsed hostname* (https-only, host ending in a real
    // amazon.<tld>) rather than a regex over the raw URL string. A regex
    // against the whole string is bypassable — e.g. requiring the string to
    // start with "https://...amazon.<tld>/" still accepts
    // "https://amazon.com.evil.com/x", whose actual host is evil.com, since
    // the match isn't anchored to the end of the hostname. Parsing the URL
    // and anchoring the regex to the full hostname closes that.
    amazonUrl: z
      .string()
      .url()
      .max(2000)
      .optional()
      .nullable()
      .refine(
        (v) => {
          if (!v) return true;
          let url: URL;
          try {
            url = new URL(v);
          } catch {
            return false;
          }
          return (
            url.protocol === "https:" &&
            /^([a-z0-9-]+\.)*amazon\.[a-z]{2,}(\.[a-z]{2,})?$/i.test(url.hostname)
          );
        },
        { message: "Must be an https://amazon.<tld> product link" }
      ),
    sellOnStripe: z.boolean().default(true),
    active: z.boolean(),
    // The "no more than 8 featured products" rule is a cross-row count, not
    // something this per-row schema can check -- enforced in
    // app/api/admin/products/route.ts instead, against the current DB state.
    featured: z.boolean().default(false),
  })
  // amazonUrl/sellOnStripe always describe the *physical* purchase route —
  // for format "both", that's one of its two independent purchases (the
  // other, digital, is unconditionally Stripe-only, enforced by schema shape
  // alone: there's no amazonUrl/sellOnStripe field for it).
  .refine((p) => p.format !== "digital" || p.amazonUrl == null, {
    message: "Amazon purchase links are only supported for physical products",
    path: ["amazonUrl"],
  })
  .refine((p) => p.format !== "digital" || p.sellOnStripe, {
    message: "Digital products must sell through Stripe (required to grant entitlements)",
    path: ["sellOnStripe"],
  })
  .refine((p) => p.format === "digital" || p.sellOnStripe || !!p.amazonUrl, {
    message: "At least one purchase route (Stripe or Amazon) is required",
    path: ["sellOnStripe"],
  })
  // digitalPriceCents is the whole point of format "both" (its separate,
  // independently-purchasable digital price) and meaningless otherwise —
  // "digital"-only products keep using priceCents, so a stray
  // digitalPriceCents there would just be dead, confusing data.
  .refine((p) => (p.format === "both" ? p.digitalPriceCents != null : p.digitalPriceCents == null), {
    message: "Digital price is required for a \"both\" format product, and not used otherwise",
    path: ["digitalPriceCents"],
  });

// Alt text is no longer required by this schema (previously required for a
// non-book product image; book covers were already exempted earlier the
// same day) — per an explicit 2026-11-05 decision. It's still encouraged in
// the admin UI, just no longer blocks saving. See ACCESSIBILITY.md for the
// resulting trade-off (a missing alt renders as decorative alt="" on the
// storefront, same as it already did for book covers).

export const productDeleteSchema = z.object({
  id: z.string().uuid(),
});

// ---------- Admin: studies ----------
export const studySchema = z.object({
  id: z.string().uuid().optional(),
  productId: z.string().uuid(),
  title: z.string().min(1).max(200),
  slug: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and hyphens only"),
  description: z.string().max(5_000).optional().nullable(),
  coverImageUrl: z.string().url().optional().nullable(),
  coverImageAlt: z.string().max(300).optional().nullable(),
  kind: z.enum(["devotional", "study"]).default("devotional"),
  published: z.boolean(),
});

export const studyDeleteSchema = z.object({
  id: z.string().uuid(),
});

// ---------- Admin: lessons ----------
export const lessonCreateSchema = z.object({
  studyId: z.string().uuid(),
  title: z.string().min(1).max(200),
  published: z.boolean().optional(),
});

export const lessonUpdateSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(200),
  published: z.boolean(),
});

export const lessonReorderSchema = z.object({
  reorder: z.array(z.object({ id: z.string().uuid(), orderIndex: z.number().int().min(0) })),
});

// A document import creates a study's lessons as drafts for review (see
// app/api/admin/studies/import/route.ts) -- for a long document that splits
// into dozens or hundreds of lessons (e.g. a 365-day devotional), publishing
// each one individually isn't a reasonable workflow once review is done.
export const lessonBulkPublishSchema = z.object({
  studyId: z.string().uuid(),
  published: z.boolean(),
});

// ---------- Admin: a Study-kind lesson's structured content ----------
// Mirrors lib/study/studyContent.ts's StudyWeekContent/StudyStation types
// exactly -- see that file for what renders each field. A station's
// `questionBlockId` is optional here: the admin form sends an empty string
// for a brand-new station it doesn't have a real content_blocks id for yet,
// and the API route creates one and fills it in (see
// app/api/admin/lessons/route.ts's studyContent branch).
const studyStationSchema = z.object({
  ref: z.string().min(1).max(100),
  verse: z.string().min(1).max(2000),
  question: z.string().min(1).max(2000),
  questionBlockId: z.string().uuid().or(z.literal("")),
  greek: z.string().max(100),
  translit: z.string().max(100),
  gloss: z.string().max(500),
  xref: z.string().max(200),
  body: z.array(z.string().max(5000)).max(20),
  live: z.string().max(2000),
  verseNums: z.array(z.string().max(50)).max(50),
  anchor: z.object({ v: z.string().max(50), word: z.string().max(100) }).nullable(),
});

export const studyWeekContentSchema = z.object({
  subtitle: z.string().max(500),
  keyVerse: z.string().min(1).max(2000),
  keyRef: z.string().min(1).max(200),
  study: z.object({
    sections: z
      .array(
        z.object({
          heading: z.string().min(1).max(300),
          paras: z.array(z.string().max(5000)).max(50),
          pulls: z.array(z.string().max(2000)).max(20).optional(),
        })
      )
      .max(20),
    parts: z
      .array(
        z.object({
          label: z.string().min(1).max(100),
          heading: z.string().min(1).max(300),
          paras: z.array(z.string().max(5000)).max(50),
          pulls: z.array(z.string().max(2000)).max(20).optional(),
        })
      )
      .max(20),
  }),
  passageRef: z.string().min(1).max(200),
  passage: z
    .array(z.object({ c: z.number().int().min(1), n: z.number().int().min(1), text: z.string().max(2000) }))
    .max(500),
  stationsLabel: z.string().max(200),
  stationsIntro: z.string().max(2000),
  stations: z.array(studyStationSchema).max(20),
  lifeTitle: z.string().max(300),
  lifeIntro: z.string().max(2000),
  practices: z.array(z.object({ n: z.number().int().min(1), title: z.string().max(300), body: z.string().max(2000) })).max(20),
  prayerLead: z.string().max(1000),
  prayerBeats: z
    .array(z.object({ person: z.enum(["Father", "Son", "Spirit"]), verb: z.string().max(100), words: z.string().max(1000) }))
    .max(10),
  prayerClose: z.string().max(1000),
  bottomLine: z.array(z.string().max(2000)).max(20),
  benediction: z.array(z.string().max(2000)).max(20),
  closingVerse: z.string().max(2000),
  closingRef: z.string().max(200),
  carry: z.string().max(2000),
});

export const lessonStudyContentUpdateSchema = z.object({
  id: z.string().uuid(),
  studyContent: studyWeekContentSchema,
});

// ---------- Admin: content blocks ----------
export const contentBlockTypeSchema = z.enum(["text", "image", "video", "audio", "question", "callout"]);

export const contentBlockCreateSchema = z.object({
  lessonId: z.string().uuid(),
  type: contentBlockTypeSchema,
});

export const contentBlockUpdateSchema = z.object({
  id: z.string().uuid(),
  body: z.string().max(200_000).optional().nullable(), // rich text HTML, generous cap
  imageUrl: z.string().url().optional().nullable(),
  imageAlt: z.string().max(300).optional().nullable(), // required in the UI whenever imageUrl is set
  mediaId: z.string().max(200).optional().nullable(),
  captionsUrl: z.string().url().optional().nullable(), // WebVTT captions for video blocks
  transcript: z.string().max(50_000).optional().nullable(), // full transcript for video/audio blocks
  questionPrompt: z.string().max(2_000).optional().nullable(),
  calloutTitle: z.string().max(200).optional().nullable(),
  calloutColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Must be a hex color like #fef3c7")
    .optional()
    .nullable(),
});

export const contentBlockReorderSchema = z.object({
  reorder: z.array(z.object({ id: z.string().uuid(), orderIndex: z.number().int().min(0) })),
});

export const contentBlockDeleteSchema = z.object({
  id: z.string().uuid(),
});

// ---------- Admin: uploads ----------
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

// The character allowlist alone permits "." and "/", so "../../etc/passwd"
// passes it -- reject any ".." path segment explicitly so a crafted key
// can't escape the intended R2 prefix.
const r2KeySchema = z
  .string()
  .min(1)
  .max(300)
  .regex(/^[a-zA-Z0-9/_.-]+$/, "Key contains invalid characters")
  .refine((key) => !key.split("/").includes(".."), "Key must not contain '..' path segments");

export const uploadUrlSchema = z.object({
  key: r2KeySchema,
  contentType: z.enum(ALLOWED_IMAGE_TYPES as [string, ...string[]]),
});

// Leader resource downloads (guides, notes) — a separate, narrower allowlist
// from the image upload endpoint above, so widening this one for PDFs
// doesn't also widen what the general-purpose image endpoint will accept.
const ALLOWED_RESOURCE_FILE_TYPES = ["application/pdf"];

export const resourceFileUploadUrlSchema = z.object({
  key: r2KeySchema,
  contentType: z.enum(ALLOWED_RESOURCE_FILE_TYPES as [string, ...string[]]),
});

// ---------- Admin: user roles ----------
export const roleUpdateSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["admin", "leader", "user"]),
});

// ---------- Admin: user management ----------
export const adminUserCreateSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "leader", "user"]),
  fullName: z.string().trim().min(1).max(200).optional(),
  country: countryCodeSchema.optional(),
});

export const adminUserUpdateSchema = z.object({
  userId: z.string().uuid(),
  email: z.string().email().optional(),
  fullName: z.string().trim().min(1).max(200).optional().nullable(),
  country: countryCodeSchema.optional().nullable(),
});

// ---------- Admin: leader resources ----------
export const leaderResourceCreateSchema = z.object({
  title: z.string().min(1).max(200),
});

export const leaderResourceUpdateSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(200).optional(),
  body: z.string().max(200_000).optional().nullable(),
  fileUrl: z.string().url().optional().nullable(),
  fileName: z.string().max(300).optional().nullable(),
  published: z.boolean().optional(),
});

export const leaderResourceReorderSchema = z.object({
  reorder: z.array(z.object({ id: z.string().uuid(), orderIndex: z.number().int().min(0) })),
});

export const leaderResourceDeleteSchema = z.object({
  id: z.string().uuid(),
});

// ---------- Admin: study import ----------
export const studyImportFieldsSchema = z.object({
  title: z.string().min(1).max(200),
  slug: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and hyphens only"),
  productId: z.string().uuid(),
  kind: z.enum(["devotional", "study"]).default("devotional"),
});

// ---------- Admin: social media ----------
const platformSchema = z.enum(["x", "facebook", "instagram"]);

export const socialPostTargetInputSchema = z.object({
  platform: platformSchema,
  frequency: z.enum(["once", "daily", "weekly"]),
  dayOfWeek: z.number().int().min(0).max(6).optional(), // required for weekly, checked at the route level
  timeOfDay: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Must be HH:MM (24-hour, UTC)"),
  startDate: z.string().datetime(), // ISO string — the first date this should fire
  endDate: z.string().datetime().optional(),
});

export const socialPostCreateSchema = z.object({
  body: z.string().min(1).max(63_206), // Facebook's own ceiling is the practical upper bound across all three
  imageUrl: z.string().url().optional().nullable(),
  imageAlt: z.string().max(300).optional().nullable(),
  sourceType: z.enum(["manual", "ai_suggested"]).default("manual"),
  aiPrompt: z.string().max(2_000).optional().nullable(),
  targets: z.array(socialPostTargetInputSchema).min(1).max(3), // at most one target per platform, enforced at the route level
});

export const socialPostTargetUpdateSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["draft", "scheduled", "sending", "published", "failed", "paused"]).optional(),
});

export const socialSuggestSchema = z.object({
  customInstruction: z.string().max(2_000).optional(),
  platforms: z.array(platformSchema).min(1).max(3),
});

export const anthropicKeySchema = z.object({
  apiKey: z.string().min(20).max(300),
});

export const connectionDisconnectSchema = z.object({
  provider: z.enum(["anthropic", "x", "facebook", "instagram"]),
});

// The body is authored as HTML via a Tiptap rich text editor (see
// RichTextEditor.tsx), not plain text -- Tiptap's own "empty" output is
// `<p></p>` (or similar), not an empty string, so a plain z.string().min(1)
// alone wouldn't actually reject an empty post the way it does for plain
// text. Stripping tags before checking length closes that gap.
const hasVisibleText = (html: string) => html.replace(/<[^>]*>/g, "").trim().length > 0;

// ---------- Admin: blog ----------
export const blogPostCreateSchema = z.object({
  title: z.string().min(1).max(200),
  slug: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and hyphens only"),
  body: z.string().min(1).max(100_000).refine(hasVisibleText, "Body can't be empty"),
  published: z.boolean().default(false),
  sourceType: z.enum(["manual", "ai_suggested"]).default("manual"),
  aiPrompt: z.string().max(2_000).optional().nullable(),
});

export const blogPostUpdateSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(200).optional(),
  slug: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and hyphens only")
    .optional(),
  body: z
    .string()
    .min(1)
    .max(100_000)
    .refine(hasVisibleText, "Body can't be empty")
    .optional(),
  published: z.boolean().optional(),
});

export const blogPostDeleteSchema = z.object({
  id: z.string().uuid(),
});

export const blogSuggestSchema = z.object({
  customInstruction: z.string().max(2_000).optional(),
});
