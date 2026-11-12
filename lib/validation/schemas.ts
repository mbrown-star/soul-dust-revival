import { z } from "zod";
import { AMAZON_ORDER_NUMBER_HINT } from "@/lib/commerce/amazonOrderHint";
import { CONTENT_BLOCK_TYPES, fieldsOutsideType, isHttpsUrl } from "@/lib/content/blocks";
import {
  CAPTIONS_UPLOAD_MAX_BYTES,
  COVER_IMAGE_UPLOAD_MAX_BYTES,
  COVER_PDF_UPLOAD_MAX_BYTES,
  formatMegabytes,
  IMAGE_UPLOAD_MAX_BYTES,
  RESOURCE_PDF_UPLOAD_MAX_BYTES,
  STUDY_RESOURCE_UPLOAD_MAX_BYTES,
} from "@/lib/uploads/limits";

// Media URLs end up in <img>/<video>/<audio>/<track> src attributes on the
// reader, so only https is accepted -- z.string().url() alone would also
// accept javascript:, data:, and plain http: URLs.
const httpsUrlSchema = z
  .string()
  .max(2_000)
  .refine(isHttpsUrl, "Must be an https:// URL");

// ISO 3166-1 alpha-2 country code, or the "OTHER" sentinel for a buyer/user
// whose country isn't in the shorter selector lists (checkout, admin user
// form) built from lib/data/countries.ts.
export const countryCodeSchema = z
  .string()
  .refine((v) => v === "OTHER" || /^[A-Z]{2}$/.test(v), "Invalid country code");

// Shared by productSchema and bundleSchema below: digitalPriceCents is the
// whole point of format "both" (its separate, independently-purchasable
// digital price) and meaningless otherwise -- a "digital"-only row keeps
// using priceCents, so a stray digitalPriceCents there would just be dead,
// confusing data. One check so the two schemas can't silently diverge on it.
function hasValidDigitalPriceCentsForFormat(v: { format: string; digitalPriceCents?: number | null }): boolean {
  return v.format === "both" ? v.digitalPriceCents != null : v.digitalPriceCents == null;
}

// Shared by productSchema and bundleSchema below: an image file's own real
// pixel dimensions, captured at upload time (see readImageDimensions.ts /
// the cover-pdf routes) so the storefront can render it at its true aspect
// ratio instead of forcing it into one fixed-ratio crop box. A generous but
// real ceiling, well above anything a real cover/photo needs — guards
// against a corrupted or hostile client-reported value, not a real limit.
const imageDimensionSchema = z.number().int().positive().max(20_000).optional().nullable();

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
// Either a content block's own video/audio, or an uploaded video/audio placed
// inside a Study week (identified by its lesson and Stream id).
// Reserving a resumable video/audio upload in Cloudflare Stream. `size` sets
// the tus Upload-Length; 30 GB is Stream's own per-file limit.
export const STREAM_UPLOAD_MAX_BYTES = 30 * 1024 * 1024 * 1024;
export const streamUploadSchema = z.object({
  size: z.number().int().positive().max(STREAM_UPLOAD_MAX_BYTES),
  // Shown as the video's name in the Stream dashboard; trimmed of anything
  // that isn't printable so it can't break the tus metadata header.
  name: z
    .string()
    .max(500)
    .transform((n) => n.replace(/[^\x20-\x7E\u00A0-\uFFFF]/g, "").slice(0, 200) || "upload"),
});

// `draft`: the player is on an admin's "preview unpublished changes" page, so
// sign the working copy's media first (honored only for admins).
export const streamSignUrlSchema = z.union([
  z.object({ contentBlockId: z.string().uuid(), draft: z.boolean().optional() }),
  z.object({ lessonId: z.string().uuid(), mediaId: z.string().min(1).max(200), draft: z.boolean().optional() }),
]);

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
    // Independent of type/format -- see lib/db/schema.ts's own comment on
    // this column for why.
    kind: z.enum(["study", "devotional", "book"]).default("book"),
    // Only meaningful for a physical book -- the .refine() below rejects it
    // whenever there's no physical copy to describe.
    bookBinding: z.enum(["softback", "hardback"]).optional().nullable(),
    imageUrl: z.string().url().optional().nullable(), // front cover, for book products
    imageAlt: z.string().max(300).optional().nullable(), // optional — see the note on alt text below
    imageWidth: imageDimensionSchema,
    imageHeight: imageDimensionSchema,
    backImageUrl: z.string().url().optional().nullable(),
    backImageAlt: z.string().max(300).optional().nullable(), // optional — see the note on alt text below
    backImageWidth: imageDimensionSchema,
    backImageHeight: imageDimensionSchema,
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
    // Amazon is a route for the printed copy even before its link exists;
    // a link on its own also counts (see the transform below).
    sellOnAmazon: z.boolean().default(false),
    // Announced, not on sale: needs no price or purchase route yet.
    comingSoon: z.boolean().default(false),
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
  .refine((p) => p.format !== "digital" || (p.amazonUrl == null && !p.sellOnAmazon), {
    message: "Amazon purchase links are only supported for physical products",
    path: ["amazonUrl"],
  })
  .refine((p) => p.format !== "digital" || p.sellOnStripe, {
    message: "Digital products must sell through Stripe (required to grant entitlements)",
    path: ["sellOnStripe"],
  })
  // Amazon counts as a route even without its link yet (the page then shows
  // "Coming soon on Amazon"); a "Coming soon" title needs no route at all.
  .refine((p) => p.comingSoon || p.format === "digital" || p.sellOnStripe || p.sellOnAmazon || !!p.amazonUrl, {
    message: "At least one purchase route (Stripe or Amazon) is required",
    path: ["sellOnStripe"],
  })
  .refine(hasValidDigitalPriceCentsForFormat, {
    message: "Digital price is required for a \"both\" format product, and not used otherwise",
    path: ["digitalPriceCents"],
  })
  .refine((p) => p.format !== "digital" || p.bookBinding == null, {
    message: "Binding only applies to a physical book",
    path: ["bookBinding"],
  })
  // A link means Amazon is a route, whether or not the caller said so.
  .transform((p) => ({ ...p, sellOnAmazon: p.sellOnAmazon || !!p.amazonUrl }));

// Alt text is no longer required by this schema (previously required for a
// non-book product image; book covers were already exempted earlier the
// same day) — per an explicit 2026-11-05 decision. It's still encouraged in
// the admin UI, just no longer blocks saving. See ACCESSIBILITY.md for the
// resulting trade-off (a missing alt renders as decorative alt="" on the
// storefront, same as it already did for book covers).

export const productDeleteSchema = z.object({
  id: z.string().uuid(),
});

// ---------- Admin: bundles ----------
// A bundle is a `products` row (type: "bundle") plus its own membership list
// (bundle_items) — see lib/db/schema.ts's comment on bundleItems for the
// full design. Deliberately a separate, smaller schema from productSchema
// rather than reusing it with a pile of bundle-specific .refine()s: a bundle
// has no amazonUrl/sellOnStripe at all (always Stripe-only, for either of its
// purchase routes — see the format comment below), so reusing productSchema
// would mean constantly refining away fields that don't apply.
export const bundleSchema = z
  .object({
    id: z.string().uuid().optional(),
    title: z.string().min(1).max(200),
    slug: z
      .string()
      .min(1)
      .max(200)
      .regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and hyphens only"),
    description: z.string().max(5_000).optional().nullable(),
    priceCents: z.number().int().min(0).max(100_000_00),
    // Digital price, used only for format "both" — same convention as
    // productSchema's own digitalPriceCents (a "digital"-only bundle keeps
    // using priceCents above, unchanged).
    digitalPriceCents: z.number().int().min(0).max(100_000_00).optional().nullable(),
    imageUrl: z.string().url().optional().nullable(), // the master cover
    imageAlt: z.string().max(300).optional().nullable(),
    imageWidth: imageDimensionSchema,
    imageHeight: imageDimensionSchema,
    // "physical": ships, Stripe-only, triggers the founder fulfillment email.
    // "digital": grants an entitlement for every component on purchase, no
    // shipping. "both": two independent purchases, same as a regular
    // format-"both" product — the physical half still ships via Stripe only
    // (never Amazon — a bundle never has its own amazonUrl/sellOnStripe
    // fields at all) and triggers the founder email; the digital half grants
    // the entitlement cascade.
    format: z.enum(["physical", "digital", "both"]),
    // What the bundle's parts are, for its storefront eyebrow (pluralized
    // there, e.g. "Bundle - Studies & Digital") -- same values as
    // productSchema's own kind, admin-set rather than derived from components.
    kind: z.enum(["study", "devotional", "book"]).default("book"),
    active: z.boolean(),
    featured: z.boolean().default(false),
    // The bundle's own membership list, replaced wholesale on every save (see
    // app/api/admin/bundles/route.ts) — order in the array is the display
    // order. At least one component, and a bundle can't contain itself or
    // another bundle (checked server-side against the DB, not expressible
    // here without a query).
    componentProductIds: z.array(z.string().uuid()).min(1).max(50),
  })
  .refine(hasValidDigitalPriceCentsForFormat, {
    message: "Digital price is required for a \"both\" format bundle, and not used otherwise",
    path: ["digitalPriceCents"],
  });

export const bundleDeleteSchema = z.object({
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
  kind: z.enum(["devotional", "study", "book"]).default("devotional"),
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
  // The free sample (lib/entitlements/check.ts isOpenSampleLesson). Optional
  // so callers that only change the title or published state leave it alone.
  isSample: z.boolean().optional(),
});

// Every lesson in one study, in its new order -- same full-list rule as
// contentBlockReorderSchema.
export const lessonReorderSchema = z.object({
  reorder: z.array(z.object({ id: z.string().uuid(), orderIndex: z.number().int().min(0) })).min(1).max(1_000),
});

// A document import creates a study's lessons as drafts for review (see
// app/api/admin/studies/import/route.ts) -- for a long document that splits
// into dozens or hundreds of lessons (e.g. a 365-day devotional), publishing
// each one individually isn't a reasonable workflow once review is done.
export const lessonDeleteSchema = z.object({
  id: z.string().uuid(),
});

// Draft and publish for a published lesson (lib/lessons/publishedContent.ts).
export const lessonPublishActionSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(["publishChanges", "discardChanges"]),
});

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
// An image/video/audio/callout placed inside a week (lib/study/studyContent.ts
// WeekMedia). Same field rules as the matching content block type, enforced
// with the same FIELDS_BY_TYPE check.
const weekMediaSchema = z
  .object({
    id: z.string().uuid(),
    type: z.enum(["image", "video", "audio", "callout"]),
    imageUrl: httpsUrlSchema.optional().nullable(),
    imageAlt: z.string().max(300).optional().nullable(),
    mediaId: z.string().max(200).optional().nullable(),
    mediaUrl: httpsUrlSchema.optional().nullable(),
    captionsUrl: httpsUrlSchema.optional().nullable(),
    transcript: z.string().max(50_000).optional().nullable(),
    calloutTitle: z.string().max(200).optional().nullable(),
    calloutColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a hex color like #fef3c7").optional().nullable(),
    body: z.string().max(200_000).optional().nullable(),
  })
  .refine(({ id: _id, type, ...fields }) => fieldsOutsideType(type, fields).length === 0, "Field not used by this media type")
  .refine((m) => !(m.mediaId && m.mediaUrl), "Use an uploaded file or a link, not both");

const weekMediaListSchema = z.array(weekMediaSchema).max(10).optional();

const studyStationSchema = z.object({
  ref: z.string().min(1).max(100),
  lang: z.enum(["greek", "hebrew"]).optional(),
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
  pulls: z.array(z.string().max(2000)).max(10).optional(),
  media: weekMediaListSchema,
});

export const studyWeekContentSchema = z.object({
  subtitle: z.string().max(500),
  keyVerse: z.string().min(1).max(2000),
  keyRef: z.string().min(1).max(200),
  study: z.object({
    sections: z
      .array(
        z.object({
          // May be empty: some weeks open their essay without a heading.
          heading: z.string().max(300),
          paras: z.array(z.string().max(5000)).max(50),
          pulls: z.array(z.string().max(2000)).max(20).optional(),
          media: weekMediaListSchema,
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
          media: weekMediaListSchema,
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
  practices: z
    .array(z.object({ n: z.number().int().min(1), title: z.string().max(300), body: z.string().max(2000), media: weekMediaListSchema }))
    .max(20),
  prayerLead: z.string().max(1000),
  prayerBeats: z
    .array(z.object({ person: z.enum(["Father", "Son", "Spirit"]), verb: z.string().max(100), words: z.string().max(1000) }))
    .max(10),
  prayerClose: z.string().max(1000),
  prayerLines: z.array(z.string().max(1000)).max(40).optional(),
  lifePulls: z.array(z.string().max(2000)).max(10).optional(),
  bottomLine: z.array(z.string().max(2000)).max(20),
  benediction: z.array(z.string().max(2000)).max(20),
  closingVerse: z.string().max(2000),
  closingRef: z.string().max(200),
  carry: z.string().max(2000),
  tabMedia: z
    .object({
      study: z.array(weekMediaSchema).max(20).optional(),
      passage: z.array(weekMediaSchema).max(20).optional(),
      work: z.array(weekMediaSchema).max(20).optional(),
      live: z.array(weekMediaSchema).max(20).optional(),
      lift: z.array(weekMediaSchema).max(20).optional(),
    })
    .optional(),
}).refine((week) => {
  // Media ids must be unique across the week: the builder patches media by id,
  // and the reader keys them by id.
  const ids = [
    ...week.study.sections.flatMap((s) => s.media ?? []),
    ...week.study.parts.flatMap((p) => p.media ?? []),
    ...week.stations.flatMap((s) => s.media ?? []),
    ...week.practices.flatMap((p) => p.media ?? []),
    ...Object.values(week.tabMedia ?? {}).flatMap((list) => list ?? []),
  ].map((m) => m.id);
  return new Set(ids).size === ids.length;
}, "Two media items in this week share an id -- reload and try again.");

export const lessonStudyContentUpdateSchema = z.object({
  id: z.string().uuid(),
  studyContent: studyWeekContentSchema,
});

// ---------- Admin: content blocks ----------
export const contentBlockTypeSchema = z.enum(CONTENT_BLOCK_TYPES);

// The editable columns of a block, all optional. Which of these a given block
// may actually use depends on its type -- see FIELDS_BY_TYPE in
// lib/content/blocks.ts, enforced by the content-blocks route.
const contentBlockFieldsSchema = z.object({
  body: z.string().max(200_000).optional().nullable(), // rich text HTML, generous cap
  imageUrl: httpsUrlSchema.optional().nullable(),
  imageAlt: z.string().max(300).optional().nullable(), // required in the UI whenever imageUrl is set
  mediaId: z.string().max(200).optional().nullable(),
  mediaUrl: httpsUrlSchema.optional().nullable(),
  captionsUrl: httpsUrlSchema.optional().nullable(), // WebVTT captions for video blocks
  transcript: z.string().max(50_000).optional().nullable(), // full transcript for video/audio blocks
  questionPrompt: z.string().max(2_000).optional().nullable(),
  calloutTitle: z.string().max(200).optional().nullable(),
  calloutColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Must be a hex color like #fef3c7")
    .optional()
    .nullable(),
});

// `insertAt` places the new block at that position instead of appending it.
// `initial` pre-fills its fields, which is how the builder duplicates a block
// and restores one after an undone delete, in one request.
export const contentBlockCreateSchema = z.object({
  lessonId: z.string().uuid(),
  type: contentBlockTypeSchema,
  insertAt: z.number().int().min(0).max(10_000).optional(),
  initial: contentBlockFieldsSchema.optional(),
});

export const contentBlockUpdateSchema = contentBlockFieldsSchema.extend({
  id: z.string().uuid(),
});

// Every block in one lesson, in its new order. The route rejects a list that
// mixes lessons or leaves any of the lesson's blocks out.
// Undo of removing a block the published version still shows.
export const contentBlockRestoreSchema = z.object({
  restore: z.string().uuid(),
  insertAt: z.number().int().min(0).max(10_000),
});

export const contentBlockReorderSchema = z.object({
  reorder: z.array(z.object({ id: z.string().uuid(), orderIndex: z.number().int().min(0) })).min(1).max(1_000),
});

export const contentBlockDeleteSchema = z.object({
  id: z.string().uuid(),
});

// ---------- Admin: uploads ----------
// Every direct-to-R2 upload link is signed for one exact byte count
// (lib/r2/upload.ts), so `size` here is what R2 will accept, and the caps in
// lib/uploads/limits.ts are enforced by R2 itself, not just by this schema.
// The server always chooses the R2 key: a caller can't name the object, so it
// can't aim an upload at an existing file or outside its folder.
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;

/** The file extension each allowed image type is stored under. */
export const IMAGE_EXTENSIONS: Record<(typeof ALLOWED_IMAGE_TYPES)[number], string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

const uploadSizeSchema = (maxBytes: number) =>
  z.number().int().positive().max(maxBytes, `File must be ${formatMegabytes(maxBytes)} or smaller`);

// Which top-level R2 folder an image belongs in, by what it's for.
export const IMAGE_UPLOAD_FOLDERS = ["products", "bundles", "social", "content"] as const;

export const uploadUrlSchema = z
  .object({
    folder: z.enum(IMAGE_UPLOAD_FOLDERS),
    contentType: z.enum(ALLOWED_IMAGE_TYPES),
    size: uploadSizeSchema(IMAGE_UPLOAD_MAX_BYTES),
  })
  .strict();

// What a book-cover PDF upload is for: a product keeps the source PDF and
// both crops, a study only its front cover, with each file's exact size.
export const coverUploadUrlsSchema = z.discriminatedUnion("target", [
  z
    .object({
      target: z.literal("product"),
      sizes: z
        .object({
          source: uploadSizeSchema(COVER_PDF_UPLOAD_MAX_BYTES),
          back: uploadSizeSchema(COVER_IMAGE_UPLOAD_MAX_BYTES),
          front: uploadSizeSchema(COVER_IMAGE_UPLOAD_MAX_BYTES),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      target: z.literal("study"),
      sizes: z.object({ front: uploadSizeSchema(COVER_IMAGE_UPLOAD_MAX_BYTES) }).strict(),
    })
    .strict(),
]);

// Leader resource downloads (guides, notes) — a separate, narrower allowlist
// from the image upload endpoint above, so widening this one for PDFs
// doesn't also widen what the general-purpose image endpoint will accept.
export const resourceFileUploadUrlSchema = z
  .object({
    contentType: z.literal("application/pdf"),
    size: uploadSizeSchema(RESOURCE_PDF_UPLOAD_MAX_BYTES),
  })
  .strict();

// A study resource PDF. The server picks the key; the browser gets only the
// signed upload link and that key, never a public URL (resources are gated).
export const studyResourceUploadUrlSchema = z
  .object({
    contentType: z.literal("application/pdf"),
    size: uploadSizeSchema(STUDY_RESOURCE_UPLOAD_MAX_BYTES),
  })
  .strict();

/** The only keys a study resource can point at: ones the upload route issued. */
export const STUDY_RESOURCE_KEY = /^study-resources\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$/;

const resourceTitle = z.string().trim().min(1).max(200);
const resourceDescription = z.string().trim().max(1_000).nullable().optional();

export const studyResourceCreateSchema = z
  .object({
    studyId: z.string().uuid(),
    title: resourceTitle,
    description: resourceDescription,
    fileKey: z.string().regex(STUDY_RESOURCE_KEY, "Not an uploaded resource"),
    // Shown and used as the download's file name; path characters are removed.
    fileName: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .transform((name) => name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")),
  })
  .strict();

export const studyResourceUpdateSchema = z.union([
  z.object({ id: z.string().uuid(), title: resourceTitle, description: resourceDescription }).strict(),
  z.object({ studyId: z.string().uuid(), order: z.array(z.string().uuid()).min(1).max(200) }).strict(),
]);

export const studyResourceDeleteSchema = z.object({ id: z.string().uuid() }).strict();

// WebVTT captions for video blocks -- its own endpoint for the same reason
// as resource files above.
export const captionsUploadUrlSchema = z
  .object({
    contentType: z.literal("text/vtt"),
    size: uploadSizeSchema(CAPTIONS_UPLOAD_MAX_BYTES),
  })
  .strict();

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

// An optional note for other admins about why an email is blocked.
const blockReasonSchema = z.string().trim().max(500).optional();

export const adminUserDeleteSchema = z
  .object({
    userId: z.string().uuid(),
    // Also block the email from signing in or signing up again.
    block: z.boolean().default(false),
    reason: blockReasonSchema,
  })
  .strict();

export const blockedEmailCreateSchema = z
  .object({
    email: z.string().trim().email().max(320),
    reason: blockReasonSchema,
  })
  .strict();

export const blockedEmailDeleteSchema = z.object({ id: z.string().uuid() }).strict();

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
  kind: z.enum(["devotional", "study", "book"]).default("devotional"),
});

// Re-upload replaces an existing study's lessons from a new document -- only
// the target study id is admin-supplied; title/slug/productId/kind are
// unchanged (those stay under the study's own normal metadata edit), and the
// uploaded file itself isn't part of this JSON-shaped schema, same as above.
export const studyReimportFieldsSchema = z.object({
  studyId: z.string().uuid(),
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

// ---------- The Journey ----------
// Beginning a Journey picks the reader's weekly Journey day (0 = Sunday) and
// records his own time zone, so each stop opens on his calendar, not UTC.
export const journeyBeginSchema = z
  .object({
    journeyId: z.string().uuid(),
    weekday: z.number().int().min(0).max(6),
    timeZone: z.string().min(1).max(64),
  })
  .strict();

export const journeyWeekdaySchema = z
  .object({
    journeyId: z.string().uuid(),
    weekday: z.number().int().min(0).max(6),
  })
  .strict();

// Admin: present a bundle as a Journey (create), publish/unpublish it, or
// remove it before anyone has begun.
export const adminJourneyCreateSchema = z
  .object({
    bundleProductId: z.string().uuid(),
    title: z.string().min(1).max(200),
    slug: z
      .string()
      .min(1)
      .max(200)
      .regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and hyphens only"),
  })
  .strict();

export const adminJourneyUpdateSchema = z
  .object({
    id: z.string().uuid(),
    published: z.boolean(),
  })
  .strict();

export const adminJourneyDeleteSchema = z.object({ id: z.string().uuid() }).strict();

// The Contact page's text fields (app/api/contact/route.ts). Screenshots
// arrive as files in the same multipart request and are checked separately
// (lib/contact/screenshots.ts), since Zod can't usefully describe a File.
export const contactMessageSchema = z.object({
  name: z.string().trim().min(1, "Please enter your name").max(100),
  email: z.string().trim().email("Please enter a valid email address").max(254),
  message: z.string().trim().min(1, "Please enter a message").max(5_000),
  // The page they came from (document.referrer), so a bug report says where
  // it happened. Only an http(s) URL is kept; anything else is dropped.
  page: z
    .string()
    .max(2_000)
    .optional()
    .transform((v) => (v && /^https?:\/\//i.test(v) ? v : undefined)),
});

// ---------- AMAZON CLAIMS ----------
// Amazon prints an order number as three groups of digits, 123-1234567-1234567.
// Readers paste it with or without the dashes (or with spaces); it's stored in
// the printed form so the same order can't be claimed twice by spelling it
// differently. The shape is all we can check: Amazon offers no way to look an
// order up (see amazonClaims in lib/db/schema.ts).

export const amazonOrderNumberSchema = z
  .string()
  .max(40)
  .transform((value) => value.replace(/[\s‐-―-]/g, ""))
  .refine((digits) => /^\d{17}$/.test(digits), { message: `That doesn't look like an Amazon order number. ${AMAZON_ORDER_NUMBER_HINT}` })
  .transform((digits) => `${digits.slice(0, 3)}-${digits.slice(3, 10)}-${digits.slice(10)}`);

export const amazonClaimSchema = z
  .object({
    productId: z.string().uuid(),
    orderNumber: amazonOrderNumberSchema,
  })
  .strict();

export const amazonClaimRevokeSchema = z.object({ id: z.string().uuid() }).strict();
