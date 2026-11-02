import { z } from "zod";

// ---------- Checkout ----------
export const checkoutSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: z.number().int().min(1).max(50), // cap prevents absurd/abusive orders
      })
    )
    .min(1)
    .max(50), // cap cart size — prevents pathological Stripe line-item payloads
  guestEmail: z.string().email().optional(),
  // Required for every order regardless of format/guest status — see
  // orders.country in the schema and PRIVACY.md for why. "OTHER" is an
  // accepted sentinel alongside real ISO 3166-1 alpha-2 codes, for buyers
  // whose country isn't in the checkout page's shorter selector list.
  country: z
    .string()
    .refine((v) => v === "OTHER" || /^[A-Z]{2}$/.test(v), "Invalid country code"),
});

// ---------- Responses (study answers) ----------
export const responseSchema = z.object({
  contentBlockId: z.string().uuid(),
  answerText: z.string().max(20_000), // generous but bounded — prevents unbounded payloads
});

// ---------- Progress ----------
export const progressSchema = z.object({
  lessonId: z.string().uuid(),
  status: z.enum(["not_started", "in_progress", "completed"]),
});

// ---------- Admin: products ----------
export const productSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().min(1).max(200),
  slug: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and hyphens only"),
  description: z.string().max(5_000).optional().nullable(),
  priceCents: z.number().int().min(0).max(100_000_00), // sanity ceiling: $100,000
  format: z.enum(["physical", "digital"]),
  type: z.enum(["book", "study_access", "bundle"]),
  imageUrl: z.string().url().optional().nullable(),
  imageAlt: z.string().max(300).optional().nullable(), // required in the UI whenever imageUrl is set
  active: z.boolean(),
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
  published: z.boolean(),
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

export const uploadUrlSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(300)
    .regex(/^[a-zA-Z0-9/_.-]+$/, "Key contains invalid characters"),
  contentType: z.enum(ALLOWED_IMAGE_TYPES as [string, ...string[]]),
});

// Leader resource downloads (guides, notes) — a separate, narrower allowlist
// from the image upload endpoint above, so widening this one for PDFs
// doesn't also widen what the general-purpose image endpoint will accept.
const ALLOWED_RESOURCE_FILE_TYPES = ["application/pdf"];

export const resourceFileUploadUrlSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(300)
    .regex(/^[a-zA-Z0-9/_.-]+$/, "Key contains invalid characters"),
  contentType: z.enum(ALLOWED_RESOURCE_FILE_TYPES as [string, ...string[]]),
});

// ---------- Admin: user roles ----------
export const roleUpdateSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["admin", "leader", "user"]),
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

// ---------- Admin: study import ----------
export const studyImportFieldsSchema = z.object({
  title: z.string().min(1).max(200),
  slug: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and hyphens only"),
  productId: z.string().uuid(),
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

// ---------- Admin: blog ----------
export const blogPostCreateSchema = z.object({
  title: z.string().min(1).max(200),
  slug: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and hyphens only"),
  body: z.string().min(1).max(100_000),
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
  body: z.string().min(1).max(100_000).optional(),
  published: z.boolean().optional(),
});

export const blogSuggestSchema = z.object({
  customInstruction: z.string().max(2_000).optional(),
});
