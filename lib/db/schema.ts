import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";

// ---------- USERS ----------
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  fullName: text("full_name"),
  // Three-tier role system, replacing the earlier boolean is_admin:
  // 'admin' — full admin UI + role management; 'leader' — leader resource
  // section, no admin access; 'user' — regular studies/books customer.
  role: text("role").notNull().default("user").$type<"admin" | "leader" | "user">(),
  // Captured at signup (or first purchase for guests who later create an
  // account) — needed to apply the right data-protection rules per the
  // user's jurisdiction. ISO 3166-1 alpha-2 code (e.g. "US", "GB"). See
  // PRIVACY.md for what this is used for and its legal-review caveat.
  country: text("country"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// One row per login — the basis for "how often" access reporting.
// lastActiveAt is updated by a lightweight heartbeat while the user has an
// authenticated page open, giving an approximate session duration
// (lastActiveAt - loginAt) — see PRIVACY.md / ACCESSIBILITY.md-style caveat
// in the reporting admin page for exactly how approximate this is.
export const loginEvents = pgTable("login_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  loginAt: timestamp("login_at", { withTimezone: true }).defaultNow(),
  lastActiveAt: timestamp("last_active_at", { withTimezone: true }).defaultNow(),
  userAgent: text("user_agent"),
});

// Leader-only content — kept as a simple flat resource list (title + rich
// text + optional file link) rather than the full study/lesson block model,
// since leader material is typically a handful of guides/notes, not a
// multi-week interactive curriculum.
export const leaderResources = pgTable("leader_resources", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  body: text("body"), // rich text HTML, same Tiptap + DOMPurify pattern as lessons
  fileUrl: text("file_url"), // optional R2-hosted download (PDF guide, etc.)
  fileName: text("file_name"),
  published: boolean("published").notNull().default(false),
  orderIndex: integer("order_index").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ---------- COMMERCE ----------
export const products = pgTable("products", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: text("type").notNull().$type<"book" | "study_access" | "bundle">(),
  // "both" sells the physical and digital versions of the same title as two
  // independent purchases, each with its own price (digitalPriceCents) and
  // its own lazily-created Stripe Price (digitalStripeProductId/
  // digitalStripePriceId) -- priceCents/stripeProductId/stripePriceId always
  // describe the physical side for "both" (same as they already do for a
  // plain "physical" product). See productSchema and ProductForm.tsx.
  format: text("format").notNull().$type<"physical" | "digital" | "both">(),
  title: text("title").notNull(),
  slug: text("slug").notNull().unique(), // used for public /books/[slug] pages
  description: text("description"),
  imageUrl: text("image_url"), // Cloudflare R2 public URL -- front cover, for book products
  imageAlt: text("image_alt"), // encouraged but not enforced (WCAG 1.1.1) -- see ACCESSIBILITY.md
  // Book products: the back-cover image and the original full-wrap cover PDF
  // it (and imageUrl) were split from -- see lib/images/bookCover.ts. Null
  // for non-book products and for any book product using the older
  // plain-image upload path instead of the PDF-split flow.
  backImageUrl: text("back_image_url"),
  backImageAlt: text("back_image_alt"), // encouraged but not enforced (WCAG 1.1.1) -- see ACCESSIBILITY.md
  coverPdfUrl: text("cover_pdf_url"), // retained for reference/reprints
  priceCents: integer("price_cents").notNull(), // physical price for "both"; the only price for "physical"/"digital"
  // Digital price + Stripe IDs, used only for format "both" -- a plain
  // "digital" product keeps using priceCents/stripeProductId/stripePriceId
  // above, unchanged, since it only ever has one price.
  digitalPriceCents: integer("digital_price_cents"),
  digitalStripeProductId: text("digital_stripe_product_id"),
  digitalStripePriceId: text("digital_stripe_price_id"),
  active: boolean("active").notNull().default(true),
  stripeProductId: text("stripe_product_id"), // created lazily on first checkout
  stripePriceId: text("stripe_price_id"),      // created lazily on first checkout
  // Purchase routing: physical books are mostly sold through Amazon rather
  // than our own Stripe checkout. A product can offer either route, both
  // (two buttons), or just Stripe. Digital products always sell through
  // Stripe only — entitlements are granted off the Stripe webhook, and an
  // Amazon sale would have no way to unlock app access — so amazonUrl/
  // sellOnStripe=false are only meaningful (and only validated as allowed)
  // for format: "physical". See productSchema in lib/validation/schemas.ts.
  amazonUrl: text("amazon_url"),
  sellOnStripe: boolean("sell_on_stripe").notNull().default(true),
  // Shown in the homepage's "Featured content" section (up to 8 -- enforced
  // in the API route, since "no more than 8 featured" is a cross-row count,
  // not something a single-row Zod schema can check). Not an ordering
  // field -- see the homepage query for how these are sorted.
  featured: boolean("featured").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const orders = pgTable("orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id), // null for guest (physical-only) orders
  guestEmail: text("guest_email"), // set when userId is null
  // Captured explicitly on the checkout page for every order — including
  // guest and digital-only purchases that never go through Stripe's
  // shipping-address collection — since data-protection obligations depend
  // on the buyer's country regardless of what they bought. ISO 3166-1
  // alpha-2. See PRIVACY.md.
  country: text("country").notNull(),
  stripeCheckoutId: text("stripe_checkout_id"),
  status: text("status").notNull().default("pending").$type<"pending" | "paid" | "refunded">(),
  totalCents: integer("total_cents").notNull(),
  requiresShipping: boolean("requires_shipping").notNull().default(false),
  shippingName: text("shipping_name"),
  shippingLine1: text("shipping_line1"),
  shippingLine2: text("shipping_line2"),
  shippingCity: text("shipping_city"),
  shippingState: text("shipping_state"),
  shippingPostalCode: text("shipping_postal_code"),
  shippingCountry: text("shipping_country"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const orderItems = pgTable("order_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").references(() => orders.id).notNull(),
  productId: uuid("product_id").references(() => products.id).notNull(),
  quantity: integer("quantity").notNull().default(1),
  // Which half of a format: "both" product this line item is -- null for
  // every other format, where the product's own format already says
  // everything (physical ships, digital grants an entitlement). Set at
  // checkout time and read back by the webhook handler to decide shipping
  // vs. entitlement-granting per line item, not per product.
  variant: text("variant").$type<"physical" | "digital" | null>(),
});

// ---------- ENTITLEMENTS ----------
export const entitlements = pgTable("entitlements", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  productId: uuid("product_id").references(() => products.id).notNull(),
  grantedAt: timestamp("granted_at", { withTimezone: true }).defaultNow(),
  source: text("source").notNull().$type<"purchase" | "admin_grant" | "trial">(),
  expiresAt: timestamp("expires_at", { withTimezone: true }), // null = permanent
});

// ---------- CONTENT STRUCTURE ----------
export const studies = pgTable("studies", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id").references(() => products.id).notNull(),
  title: text("title").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  coverImageUrl: text("cover_image_url"),
  coverImageAlt: text("cover_image_alt"), // required alt text (WCAG 1.1.1)
  published: boolean("published").notNull().default(false),
  sourceFileUrl: text("source_file_url"), // original .pdf/.docx if this study was imported
  sourceFileName: text("source_file_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const lessons = pgTable("lessons", {
  id: uuid("id").primaryKey().defaultRandom(),
  studyId: uuid("study_id").references(() => studies.id).notNull(),
  orderIndex: integer("order_index").notNull(),
  title: text("title").notNull(),
  published: boolean("published").notNull().default(false),
});

export const contentBlocks = pgTable("content_blocks", {
  id: uuid("id").primaryKey().defaultRandom(),
  lessonId: uuid("lesson_id").references(() => lessons.id).notNull(),
  orderIndex: integer("order_index").notNull(),
  type: text("type").notNull().$type<"text" | "image" | "video" | "audio" | "question" | "callout">(),
  body: text("body"), // rich text HTML (from Tiptap) for 'text' and 'callout' blocks
  imageUrl: text("image_url"), // R2 public URL for 'image' blocks
  imageAlt: text("image_alt"), // required alt text for 'image' blocks (WCAG 1.1.1)
  mediaId: text("media_id"), // Cloudflare Stream UID for video/audio
  captionsUrl: text("captions_url"), // WebVTT captions file (R2 URL) for 'video' blocks (WCAG 1.2.2)
  transcript: text("transcript"), // full text transcript for 'video'/'audio' blocks (WCAG 1.2.1)
  questionPrompt: text("question_prompt"), // for 'question' blocks
  calloutTitle: text("callout_title"), // for 'callout' blocks, e.g. "Key Verse"
  calloutColor: text("callout_color"), // hex color, free picker, for 'callout' blocks
});

// ---------- USER INTERACTION / PROGRESS ----------
export const lessonProgress = pgTable("lesson_progress", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  lessonId: uuid("lesson_id").references(() => lessons.id).notNull(),
  status: text("status").notNull().default("not_started").$type<"not_started" | "in_progress" | "completed">(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const responses = pgTable("responses", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  contentBlockId: uuid("content_block_id").references(() => contentBlocks.id).notNull(),
  answerText: text("answer_text"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// ---------- BLOG ----------
export const posts = pgTable("posts", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  slug: text("slug").notNull().unique(),
  body: text("body").notNull(), // sanitized HTML, authored via the Tiptap rich text editor
  published: boolean("published").notNull().default(false),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  // Same provenance pattern as social_posts — tracks whether a post started
  // as an AI suggestion and what prompted it, for editorial transparency.
  sourceType: text("source_type").notNull().default("manual").$type<"manual" | "ai_suggested">(),
  aiPrompt: text("ai_prompt"),
  createdByUserId: uuid("created_by_user_id").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ---------- SOCIAL MEDIA ----------

// One row per connected external account/API credential, covering both the
// three social platforms (OAuth tokens) and the Anthropic API (a bare key,
// no OAuth) — unified into one table since the admin Connections page
// treats all four the same way: connect, show status, disconnect.
// Tokens/keys are stored encrypted (see lib/crypto/tokenCipher.ts and
// SOCIAL.md) — never stored or logged in plaintext.
export const integrationConnections = pgTable("integration_connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  provider: text("provider").notNull().$type<"anthropic" | "x" | "facebook" | "instagram">(),
  displayName: text("display_name"), // e.g. the connected Page name, @handle, or "Anthropic API"
  externalAccountId: text("external_account_id"), // platform's own account/page ID
  accessTokenEncrypted: text("access_token_encrypted"),
  refreshTokenEncrypted: text("refresh_token_encrypted"),
  tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
  status: text("status").notNull().default("connected").$type<"connected" | "disconnected" | "error">(),
  lastError: text("last_error"),
  connectedByUserId: uuid("connected_by_user_id").references(() => users.id),
  connectedAt: timestamp("connected_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// The composed content of a social post — one row per piece of content,
// independent of which platform(s) it targets or how many times it repeats.
export const socialPosts = pgTable("social_posts", {
  id: uuid("id").primaryKey().defaultRandom(),
  body: text("body").notNull(),
  imageUrl: text("image_url"), // R2 public URL — required to be public for Instagram's API specifically
  imageAlt: text("image_alt"),
  createdByUserId: uuid("created_by_user_id").references(() => users.id),
  sourceType: text("source_type").notNull().default("manual").$type<"manual" | "ai_suggested">(),
  aiPrompt: text("ai_prompt"), // the context/prompt that produced this draft, if AI-suggested
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// One row per (post, platform, schedule) — a single post body can target
// multiple platforms, and each platform's send is tracked independently
// since timing, character limits, success/failure, and published IDs all
// differ per platform.
export const socialPostTargets = pgTable("social_post_targets", {
  id: uuid("id").primaryKey().defaultRandom(),
  postId: uuid("post_id").references(() => socialPosts.id).notNull(),
  platform: text("platform").notNull().$type<"x" | "facebook" | "instagram">(),
  frequency: text("frequency").notNull().default("once").$type<"once" | "daily" | "weekly">(),
  // For 'weekly' only — 0 (Sunday) through 6 (Saturday).
  dayOfWeek: integer("day_of_week"),
  // Time-of-day the post should go out, stored as "HH:MM" in UTC — kept as
  // text rather than a DB time type so it's trivial to combine with a date
  // in application code without timezone-library overhead.
  timeOfDay: text("time_of_day").notNull(),
  // The next actual send time the scheduler should act on — recalculated
  // after each successful send for recurring posts. This is the single
  // field the cron job queries against, rather than recomputing schedules
  // from frequency/dayOfWeek/timeOfDay on every run.
  nextRunAt: timestamp("next_run_at", { withTimezone: true }).notNull(),
  endDate: timestamp("end_date", { withTimezone: true }), // recurring posts stop being scheduled after this date, if set
  status: text("status").notNull().default("scheduled").$type<
    "draft" | "scheduled" | "sending" | "published" | "failed" | "paused"
  >(),
  externalPostId: text("external_post_id"), // the platform's own ID for the published post, used for metrics fetch
  publishedAt: timestamp("published_at", { withTimezone: true }),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// Periodic snapshots of engagement stats per published target, fetched by
// a scheduled job — one row per fetch, not overwritten in place, so the
// analytics report can show a trend over time, not just a current count.
export const socialPostMetrics = pgTable("social_post_metrics", {
  id: uuid("id").primaryKey().defaultRandom(),
  targetId: uuid("target_id").references(() => socialPostTargets.id).notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).defaultNow(),
  likes: integer("likes").notNull().default(0),
  comments: integer("comments").notNull().default(0),
  shares: integer("shares").notNull().default(0), // retweets/reposts for X, shares for Facebook, not applicable for Instagram
  impressions: integer("impressions"), // not available from every platform's API tier — nullable
});
