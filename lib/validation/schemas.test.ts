import { describe, expect, it } from "vitest";
import {
  adminUserCreateSchema,
  adminUserUpdateSchema,
  anthropicKeySchema,
  blogPostCreateSchema,
  blogPostUpdateSchema,
  bundleDeleteSchema,
  bundleSchema,
  captionsUploadUrlSchema,
  checkoutSchema,
  connectionDisconnectSchema,
  contentBlockCreateSchema,
  contentBlockUpdateSchema,
  leaderResourceCreateSchema,
  productSchema,
  progressSchema,
  resourceFileUploadUrlSchema,
  responseSchema,
  roleUpdateSchema,
  socialPostCreateSchema,
  socialPostTargetInputSchema,
  socialSuggestSchema,
  studySchema,
  studyWeekContentSchema,
  uploadUrlSchema,
} from "./schemas";

const uuid = "123e4567-e89b-12d3-a456-426614174000";

describe("checkoutSchema", () => {
  it("accepts a valid single-item cart", () => {
    const result = checkoutSchema.safeParse({
      items: [{ productId: uuid, quantity: 1 }],
      country: "US",
    });
    expect(result.success).toBe(true);
  });

  it("accepts the OTHER country sentinel", () => {
    const result = checkoutSchema.safeParse({
      items: [{ productId: uuid, quantity: 1 }],
      country: "OTHER",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty cart", () => {
    const result = checkoutSchema.safeParse({ items: [], country: "US" });
    expect(result.success).toBe(false);
  });

  it("rejects a cart over the 50-item cap", () => {
    const result = checkoutSchema.safeParse({
      items: Array.from({ length: 51 }, () => ({ productId: uuid, quantity: 1 })),
      country: "US",
    });
    expect(result.success).toBe(false);
  });

  it("rejects quantity over the per-line cap", () => {
    const result = checkoutSchema.safeParse({
      items: [{ productId: uuid, quantity: 51 }],
      country: "US",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a zero or negative quantity", () => {
    expect(
      checkoutSchema.safeParse({ items: [{ productId: uuid, quantity: 0 }], country: "US" }).success
    ).toBe(false);
    expect(
      checkoutSchema.safeParse({ items: [{ productId: uuid, quantity: -1 }], country: "US" }).success
    ).toBe(false);
  });

  it("rejects a non-UUID productId (price/product tampering guard)", () => {
    const result = checkoutSchema.safeParse({
      items: [{ productId: "not-a-uuid", quantity: 1 }],
      country: "US",
    });
    expect(result.success).toBe(false);
  });

  it("does not accept a client-supplied price field (pricing integrity)", () => {
    // priceCents isn't part of the schema at all -- extra keys are stripped
    // by default zod behavior, not merged into the parsed result.
    const parsed = checkoutSchema.parse({
      items: [{ productId: uuid, quantity: 1, priceCents: 1 }],
      country: "US",
    });
    expect(parsed.items[0]).not.toHaveProperty("priceCents");
  });

  it("rejects an invalid country code", () => {
    expect(
      checkoutSchema.safeParse({ items: [{ productId: uuid, quantity: 1 }], country: "usa" }).success
    ).toBe(false);
    expect(
      checkoutSchema.safeParse({ items: [{ productId: uuid, quantity: 1 }], country: "" }).success
    ).toBe(false);
  });

  it("rejects a missing country", () => {
    const result = checkoutSchema.safeParse({ items: [{ productId: uuid, quantity: 1 }] });
    expect(result.success).toBe(false);
  });

  it("accepts an optional guestEmail and rejects a malformed one", () => {
    expect(
      checkoutSchema.safeParse({
        items: [{ productId: uuid, quantity: 1 }],
        country: "US",
        guestEmail: "a@example.com",
      }).success
    ).toBe(true);
    expect(
      checkoutSchema.safeParse({
        items: [{ productId: uuid, quantity: 1 }],
        country: "US",
        guestEmail: "not-an-email",
      }).success
    ).toBe(false);
  });
});

describe("responseSchema", () => {
  it("accepts a valid answer", () => {
    expect(responseSchema.safeParse({ contentBlockId: uuid, answerText: "hello" }).success).toBe(true);
  });

  it("accepts an empty answer (clearing a response)", () => {
    expect(responseSchema.safeParse({ contentBlockId: uuid, answerText: "" }).success).toBe(true);
  });

  it("rejects an answer over the 20,000 char cap", () => {
    const result = responseSchema.safeParse({ contentBlockId: uuid, answerText: "a".repeat(20_001) });
    expect(result.success).toBe(false);
  });

  it("rejects a non-UUID contentBlockId", () => {
    expect(responseSchema.safeParse({ contentBlockId: "x", answerText: "hi" }).success).toBe(false);
  });
});

describe("progressSchema", () => {
  it("accepts each valid status", () => {
    for (const status of ["not_started", "in_progress", "completed"] as const) {
      expect(progressSchema.safeParse({ lessonId: uuid, status }).success).toBe(true);
    }
  });

  it("rejects an unknown status", () => {
    expect(progressSchema.safeParse({ lessonId: uuid, status: "done" }).success).toBe(false);
  });
});

describe("productSchema", () => {
  const base = {
    title: "Study One",
    slug: "study-one",
    priceCents: 2900,
    format: "digital" as const,
    type: "study_access" as const,
    active: true,
  };

  it("accepts a minimal valid product", () => {
    expect(productSchema.safeParse(base).success).toBe(true);
  });

  describe("Coming soon and Amazon without a link", () => {
    const physical = { ...base, type: "book" as const, format: "physical" as const };

    it("lets a Coming soon title have no price or purchase route yet", () => {
      const result = productSchema.safeParse({ ...physical, priceCents: 0, sellOnStripe: false, comingSoon: true });
      expect(result.success).toBe(true);
    });

    it("still requires a route for a title that's on sale", () => {
      expect(productSchema.safeParse({ ...physical, sellOnStripe: false }).success).toBe(false);
    });

    it("counts Amazon as a route before its link exists", () => {
      const result = productSchema.safeParse({ ...physical, sellOnStripe: false, sellOnAmazon: true, amazonUrl: null });
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ sellOnAmazon: true, amazonUrl: null });
    });

    it("treats an Amazon link as choosing Amazon, even if sellOnAmazon wasn't sent", () => {
      const result = productSchema.safeParse({
        ...physical,
        sellOnStripe: false,
        amazonUrl: "https://www.amazon.com/dp/B000000000",
      });
      expect(result.success).toBe(true);
      expect(result.data?.sellOnAmazon).toBe(true);
    });

    it("refuses Amazon for a digital-only product, with or without a link", () => {
      expect(productSchema.safeParse({ ...base, sellOnAmazon: true }).success).toBe(false);
    });

    it("defaults both to false", () => {
      expect(productSchema.parse(base)).toMatchObject({ comingSoon: false, sellOnAmazon: false });
    });
  });

  it("rejects an uppercase or symbol-containing slug", () => {
    expect(productSchema.safeParse({ ...base, slug: "Study-One" }).success).toBe(false);
    expect(productSchema.safeParse({ ...base, slug: "study one" }).success).toBe(false);
    expect(productSchema.safeParse({ ...base, slug: "study_one!" }).success).toBe(false);
  });

  it("rejects a negative price", () => {
    expect(productSchema.safeParse({ ...base, priceCents: -1 }).success).toBe(false);
  });

  it("rejects a non-integer price (fractional cents)", () => {
    expect(productSchema.safeParse({ ...base, priceCents: 29.5 }).success).toBe(false);
  });

  it("rejects a price above the $100,000 sanity ceiling", () => {
    expect(productSchema.safeParse({ ...base, priceCents: 100_000_01 }).success).toBe(false);
  });

  it("rejects an unknown format or type", () => {
    expect(productSchema.safeParse({ ...base, format: "ebook" }).success).toBe(false);
    expect(productSchema.safeParse({ ...base, type: "subscription" }).success).toBe(false);
  });

  it("rejects a non-URL imageUrl when provided", () => {
    expect(productSchema.safeParse({ ...base, imageUrl: "not-a-url" }).success).toBe(false);
  });

  it("allows imageUrl and imageAlt to be null", () => {
    expect(productSchema.safeParse({ ...base, imageUrl: null, imageAlt: null }).success).toBe(true);
  });

  it("allows a non-book product image with no alt text (no longer required, per 2026-11-05 decision)", () => {
    expect(
      productSchema.safeParse({ ...base, type: "study_access", imageUrl: "https://example.com/a.jpg", imageAlt: null })
        .success
    ).toBe(true);
  });

  it("allows a book's front/back cover images with no alt text", () => {
    expect(
      productSchema.safeParse({
        ...base,
        type: "book",
        format: "physical",
        imageUrl: "https://example.com/front.jpg",
        imageAlt: null,
        backImageUrl: "https://example.com/back.jpg",
        backImageAlt: null,
      }).success
    ).toBe(true);
  });

  it("defaults sellOnStripe to true when omitted", () => {
    const parsed = productSchema.safeParse(base);
    expect(parsed.success && parsed.data.sellOnStripe).toBe(true);
  });

  it("accepts a physical product with a valid Amazon product URL", () => {
    expect(
      productSchema.safeParse({
        ...base,
        format: "physical",
        amazonUrl: "https://www.amazon.com/dp/B000000000",
      }).success
    ).toBe(true);
  });

  it("rejects an amazonUrl on a digital product", () => {
    expect(
      productSchema.safeParse({ ...base, format: "digital", amazonUrl: "https://www.amazon.com/dp/B000000000" })
        .success
    ).toBe(false);
  });

  it("rejects a digital product with sellOnStripe: false", () => {
    expect(productSchema.safeParse({ ...base, format: "digital", sellOnStripe: false }).success).toBe(false);
  });

  it("rejects a physical product with neither Stripe nor Amazon enabled", () => {
    expect(
      productSchema.safeParse({ ...base, format: "physical", sellOnStripe: false, amazonUrl: null }).success
    ).toBe(false);
  });

  it("rejects a non-Amazon URL for amazonUrl", () => {
    expect(
      productSchema.safeParse({ ...base, format: "physical", amazonUrl: "https://evil.example.com/dp/123" })
        .success
    ).toBe(false);
  });

  it("rejects a lookalike host whose real domain isn't amazon (amazon.<tld> as a subdomain of another domain)", () => {
    expect(
      productSchema.safeParse({ ...base, format: "physical", amazonUrl: "https://amazon.com.evil.com/dp/123" })
        .success
    ).toBe(false);
  });

  it("rejects a userinfo trick where 'amazon.com' appears before an '@' but the real host is attacker-controlled", () => {
    expect(
      productSchema.safeParse({ ...base, format: "physical", amazonUrl: "https://amazon.com@evil.com/dp/123" })
        .success
    ).toBe(false);
  });

  it("rejects a plain http:// Amazon link (must be https)", () => {
    expect(
      productSchema.safeParse({ ...base, format: "physical", amazonUrl: "http://www.amazon.com/dp/123" }).success
    ).toBe(false);
  });

  it("accepts a subdomain and a two-label ccTLD Amazon host", () => {
    expect(
      productSchema.safeParse({
        ...base,
        format: "physical",
        amazonUrl: "https://smile.amazon.co.uk/dp/B000000000",
      }).success
    ).toBe(true);
  });

  it("rejects a javascript: scheme disguised as a URL for amazonUrl", () => {
    expect(
      productSchema.safeParse({ ...base, format: "physical", amazonUrl: "javascript:alert(1)" }).success
    ).toBe(false);
  });

  it("accepts a physical product sold Amazon-exclusively (sellOnStripe: false)", () => {
    expect(
      productSchema.safeParse({
        ...base,
        format: "physical",
        sellOnStripe: false,
        amazonUrl: "https://www.amazon.co.uk/dp/B000000000",
      }).success
    ).toBe(true);
  });

  describe("format: \"both\"", () => {
    it("requires digitalPriceCents", () => {
      expect(productSchema.safeParse({ ...base, format: "both" }).success).toBe(false);
      expect(productSchema.safeParse({ ...base, format: "both", digitalPriceCents: 999 }).success).toBe(true);
    });

    it("rejects digitalPriceCents on a plain physical or digital product", () => {
      expect(productSchema.safeParse({ ...base, format: "physical", digitalPriceCents: 999 }).success).toBe(
        false
      );
      expect(productSchema.safeParse({ ...base, format: "digital", digitalPriceCents: 999 }).success).toBe(
        false
      );
    });

    it("allows an Amazon-exclusive physical side (sellOnStripe: false) -- amazonUrl/sellOnStripe describe only the physical route", () => {
      expect(
        productSchema.safeParse({
          ...base,
          format: "both",
          digitalPriceCents: 999,
          sellOnStripe: false,
          amazonUrl: "https://www.amazon.com/dp/B000000000",
        }).success
      ).toBe(true);
    });

    it("requires at least one physical purchase route (Stripe or Amazon), same as a plain physical product", () => {
      expect(
        productSchema.safeParse({
          ...base,
          format: "both",
          digitalPriceCents: 999,
          sellOnStripe: false,
          amazonUrl: null,
        }).success
      ).toBe(false);
    });
  });

  it("defaults kind to \"book\" when omitted", () => {
    const parsed = productSchema.safeParse(base);
    expect(parsed.success && parsed.data.kind).toBe("book");
  });

  it("accepts kind \"study\" and \"devotional\"", () => {
    expect(productSchema.safeParse({ ...base, kind: "study" }).success).toBe(true);
    expect(productSchema.safeParse({ ...base, kind: "devotional" }).success).toBe(true);
  });

  it("rejects an unknown kind", () => {
    expect(productSchema.safeParse({ ...base, kind: "newsletter" }).success).toBe(false);
  });

  it("allows a physical product's bookBinding to be softback or hardback", () => {
    expect(
      productSchema.safeParse({ ...base, type: "book", format: "physical", bookBinding: "softback" }).success
    ).toBe(true);
    expect(
      productSchema.safeParse({ ...base, type: "book", format: "physical", bookBinding: "hardback" }).success
    ).toBe(true);
  });

  it("rejects bookBinding on a purely digital product", () => {
    expect(productSchema.safeParse({ ...base, format: "digital", bookBinding: "hardback" }).success).toBe(false);
  });

  it("allows bookBinding on a \"both\"-format product (it still has a physical side)", () => {
    expect(
      productSchema.safeParse({ ...base, format: "both", digitalPriceCents: 999, bookBinding: "softback" }).success
    ).toBe(true);
  });
});

describe("bundleSchema", () => {
  const base = {
    title: "Colossians Box Set",
    slug: "colossians-box-set",
    priceCents: 4900,
    format: "digital" as const,
    active: true,
    componentProductIds: [uuid],
  };

  it("accepts a minimal valid bundle", () => {
    expect(bundleSchema.safeParse(base).success).toBe(true);
  });

  it("defaults featured to false when omitted", () => {
    const parsed = bundleSchema.safeParse(base);
    expect(parsed.success && parsed.data.featured).toBe(false);
  });

  it("rejects an empty componentProductIds array", () => {
    expect(bundleSchema.safeParse({ ...base, componentProductIds: [] }).success).toBe(false);
  });

  it("rejects more than 50 components", () => {
    const tooMany = Array.from({ length: 51 }, () => uuid);
    expect(bundleSchema.safeParse({ ...base, componentProductIds: tooMany }).success).toBe(false);
  });

  it("rejects a non-UUID component id", () => {
    expect(bundleSchema.safeParse({ ...base, componentProductIds: ["not-a-uuid"] }).success).toBe(false);
  });

  describe("format: \"both\"", () => {
    it("requires digitalPriceCents", () => {
      expect(bundleSchema.safeParse({ ...base, format: "both" }).success).toBe(false);
      expect(bundleSchema.safeParse({ ...base, format: "both", digitalPriceCents: 999 }).success).toBe(true);
    });

    it("rejects digitalPriceCents on a plain physical or digital bundle", () => {
      expect(bundleSchema.safeParse({ ...base, format: "physical", digitalPriceCents: 999 }).success).toBe(false);
      expect(bundleSchema.safeParse({ ...base, format: "digital", digitalPriceCents: 999 }).success).toBe(false);
    });
  });

  it("rejects an unknown format", () => {
    expect(bundleSchema.safeParse({ ...base, format: "ebook" }).success).toBe(false);
  });

  it("rejects a negative or fractional price", () => {
    expect(bundleSchema.safeParse({ ...base, priceCents: -1 }).success).toBe(false);
    expect(bundleSchema.safeParse({ ...base, priceCents: 49.5 }).success).toBe(false);
  });

  it("accepts an optional id for an update", () => {
    expect(bundleSchema.safeParse({ ...base, id: uuid }).success).toBe(true);
  });

  it("rejects a non-UUID id", () => {
    expect(bundleSchema.safeParse({ ...base, id: "not-a-uuid" }).success).toBe(false);
  });
});

describe("bundleDeleteSchema", () => {
  it("accepts a valid id", () => {
    expect(bundleDeleteSchema.safeParse({ id: uuid }).success).toBe(true);
  });

  it("rejects a missing or non-UUID id", () => {
    expect(bundleDeleteSchema.safeParse({}).success).toBe(false);
    expect(bundleDeleteSchema.safeParse({ id: "not-a-uuid" }).success).toBe(false);
  });
});

describe("studySchema", () => {
  it("rejects a non-UUID productId", () => {
    const result = studySchema.safeParse({
      productId: "not-a-uuid",
      title: "Study",
      slug: "study",
      published: false,
    });
    expect(result.success).toBe(false);
  });
});

describe("contentBlockCreateSchema / contentBlockUpdateSchema", () => {
  it("accepts every known content block type", () => {
    for (const type of ["text", "image", "video", "audio", "question", "callout"] as const) {
      expect(contentBlockCreateSchema.safeParse({ lessonId: uuid, type }).success).toBe(true);
    }
  });

  it("rejects an unknown content block type", () => {
    expect(contentBlockCreateSchema.safeParse({ lessonId: uuid, type: "poll" }).success).toBe(false);
  });

  it("rejects body over the 200,000 char cap", () => {
    expect(
      contentBlockUpdateSchema.safeParse({ id: uuid, body: "a".repeat(200_001) }).success
    ).toBe(false);
  });

  it("rejects an invalid callout color", () => {
    expect(
      contentBlockUpdateSchema.safeParse({ id: uuid, calloutColor: "red" }).success
    ).toBe(false);
    expect(
      contentBlockUpdateSchema.safeParse({ id: uuid, calloutColor: "#fef3c7" }).success
    ).toBe(true);
  });
});

describe("uploadUrlSchema", () => {
  it("accepts an allowlisted image type, a known folder and a size", () => {
    expect(uploadUrlSchema.safeParse({ folder: "products", contentType: "image/jpeg", size: 1000 }).success).toBe(true);
  });

  it("rejects a non-allowlisted content type (e.g. svg, html, executable)", () => {
    for (const contentType of ["image/svg+xml", "text/html", "application/octet-stream", "application/pdf"]) {
      expect(uploadUrlSchema.safeParse({ folder: "products", contentType, size: 1000 }).success).toBe(false);
    }
  });

  it("rejects a client-chosen key: the server names every object", () => {
    expect(
      uploadUrlSchema.safeParse({ key: "../../etc/passwd", folder: "products", contentType: "image/png", size: 10 })
        .success
    ).toBe(false);
  });
});

describe("resourceFileUploadUrlSchema", () => {
  it("accepts application/pdf only, not image types", () => {
    expect(resourceFileUploadUrlSchema.safeParse({ contentType: "application/pdf", size: 10 }).success).toBe(true);
    expect(resourceFileUploadUrlSchema.safeParse({ contentType: "image/png", size: 10 }).success).toBe(false);
  });
});

describe("roleUpdateSchema", () => {
  it("accepts each of the three roles", () => {
    for (const role of ["admin", "leader", "user"] as const) {
      expect(roleUpdateSchema.safeParse({ userId: uuid, role }).success).toBe(true);
    }
  });

  it("rejects an unknown role (no self-serve escalation path via a bogus value)", () => {
    expect(roleUpdateSchema.safeParse({ userId: uuid, role: "superadmin" }).success).toBe(false);
  });
});

describe("adminUserCreateSchema", () => {
  it("accepts an email and role with no optional fields", () => {
    expect(adminUserCreateSchema.safeParse({ email: "new@example.com", role: "user" }).success).toBe(true);
  });

  it("accepts optional fullName and country", () => {
    expect(
      adminUserCreateSchema.safeParse({
        email: "new@example.com",
        role: "leader",
        fullName: "Jamie Rivera",
        country: "US",
      }).success
    ).toBe(true);
  });

  it("rejects an invalid email", () => {
    expect(adminUserCreateSchema.safeParse({ email: "not-an-email", role: "user" }).success).toBe(false);
  });

  it("rejects an unknown role (no self-serve escalation path via a bogus value)", () => {
    expect(adminUserCreateSchema.safeParse({ email: "new@example.com", role: "superadmin" }).success).toBe(false);
  });

  it("rejects an invalid country code", () => {
    expect(
      adminUserCreateSchema.safeParse({ email: "new@example.com", role: "user", country: "usa" }).success
    ).toBe(false);
  });

  it("rejects a blank fullName", () => {
    expect(
      adminUserCreateSchema.safeParse({ email: "new@example.com", role: "user", fullName: "" }).success
    ).toBe(false);
  });
});

describe("adminUserUpdateSchema", () => {
  it("accepts just a userId with no fields to change", () => {
    expect(adminUserUpdateSchema.safeParse({ userId: uuid }).success).toBe(true);
  });

  it("accepts null to clear fullName and country", () => {
    expect(
      adminUserUpdateSchema.safeParse({ userId: uuid, fullName: null, country: null }).success
    ).toBe(true);
  });

  it("rejects a non-uuid userId", () => {
    expect(adminUserUpdateSchema.safeParse({ userId: "not-a-uuid" }).success).toBe(false);
  });

  it("rejects an invalid email", () => {
    expect(adminUserUpdateSchema.safeParse({ userId: uuid, email: "not-an-email" }).success).toBe(false);
  });
});

describe("leaderResourceCreateSchema", () => {
  it("rejects an empty title", () => {
    expect(leaderResourceCreateSchema.safeParse({ title: "" }).success).toBe(false);
  });
});

describe("socialPostTargetInputSchema / socialPostCreateSchema", () => {
  const baseTarget = {
    platform: "x" as const,
    frequency: "once" as const,
    timeOfDay: "14:30",
    startDate: new Date().toISOString(),
  };

  it("accepts a valid target", () => {
    expect(socialPostTargetInputSchema.safeParse(baseTarget).success).toBe(true);
  });

  it("rejects an unknown platform", () => {
    expect(socialPostTargetInputSchema.safeParse({ ...baseTarget, platform: "tiktok" }).success).toBe(
      false
    );
  });

  it("rejects a malformed timeOfDay", () => {
    for (const timeOfDay of ["9:30", "24:00", "14:60", "noon"]) {
      expect(socialPostTargetInputSchema.safeParse({ ...baseTarget, timeOfDay }).success).toBe(false);
    }
  });

  it("rejects dayOfWeek outside 0-6", () => {
    expect(socialPostTargetInputSchema.safeParse({ ...baseTarget, dayOfWeek: 7 }).success).toBe(false);
    expect(socialPostTargetInputSchema.safeParse({ ...baseTarget, dayOfWeek: -1 }).success).toBe(false);
  });

  it("rejects more than 3 targets on a post (at most one per platform)", () => {
    const result = socialPostCreateSchema.safeParse({
      body: "hello",
      targets: [baseTarget, baseTarget, baseTarget, baseTarget],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a body over Facebook's 63,206 char ceiling", () => {
    const result = socialPostCreateSchema.safeParse({
      body: "a".repeat(63_207),
      targets: [baseTarget],
    });
    expect(result.success).toBe(false);
  });

  it("defaults sourceType to manual", () => {
    const parsed = socialPostCreateSchema.parse({ body: "hi", targets: [baseTarget] });
    expect(parsed.sourceType).toBe("manual");
  });
});

describe("socialSuggestSchema", () => {
  it("rejects an empty platforms array", () => {
    expect(socialSuggestSchema.safeParse({ platforms: [] }).success).toBe(false);
  });

  it("rejects more than 3 platforms", () => {
    expect(
      socialSuggestSchema.safeParse({ platforms: ["x", "facebook", "instagram", "x"] }).success
    ).toBe(false);
  });
});

describe("anthropicKeySchema", () => {
  it("rejects a key shorter than 20 chars", () => {
    expect(anthropicKeySchema.safeParse({ apiKey: "short-key" }).success).toBe(false);
  });

  it("accepts a plausible key length", () => {
    expect(anthropicKeySchema.safeParse({ apiKey: "sk-ant-" + "a".repeat(20) }).success).toBe(true);
  });
});

describe("connectionDisconnectSchema", () => {
  it("rejects an unknown provider", () => {
    expect(connectionDisconnectSchema.safeParse({ provider: "google" }).success).toBe(false);
  });
});

describe("blogPostCreateSchema / blogPostUpdateSchema", () => {
  it("rejects an empty body on create", () => {
    expect(
      blogPostCreateSchema.safeParse({ title: "T", slug: "t", body: "" }).success
    ).toBe(false);
  });

  it("rejects a body that's effectively empty HTML (Tiptap's empty-editor output)", () => {
    expect(
      blogPostCreateSchema.safeParse({ title: "T", slug: "t", body: "<p></p>" }).success
    ).toBe(false);
    expect(
      blogPostUpdateSchema.safeParse({ id: uuid, body: "<p><br></p>" }).success
    ).toBe(false);
  });

  it("accepts a body with real HTML content", () => {
    expect(
      blogPostCreateSchema.safeParse({ title: "T", slug: "t", body: "<p>Hello</p>" }).success
    ).toBe(true);
  });

  it("allows a partial update (all optional fields except id)", () => {
    expect(blogPostUpdateSchema.safeParse({ id: uuid }).success).toBe(true);
  });

  it("rejects an invalid slug on update when provided", () => {
    expect(blogPostUpdateSchema.safeParse({ id: uuid, slug: "Not Valid!" }).success).toBe(false);
  });
});

describe("content block media schemas", () => {
  const id = "11111111-1111-4111-8111-111111111111";

  it("accepts only https URLs for images, linked media, and captions", () => {
    for (const field of ["imageUrl", "mediaUrl", "captionsUrl"] as const) {
      expect(contentBlockUpdateSchema.safeParse({ id, [field]: "https://cdn.example.com/a" }).success).toBe(true);
      expect(contentBlockUpdateSchema.safeParse({ id, [field]: "http://cdn.example.com/a" }).success).toBe(false);
      expect(contentBlockUpdateSchema.safeParse({ id, [field]: "javascript:alert(1)" }).success).toBe(false);
      expect(contentBlockUpdateSchema.safeParse({ id, [field]: null }).success).toBe(true);
    }
  });

  it("allows WebVTT on the captions upload endpoint, and nothing else", () => {
    expect(captionsUploadUrlSchema.safeParse({ contentType: "text/vtt", size: 10 }).success).toBe(true);
    expect(captionsUploadUrlSchema.safeParse({ contentType: "image/png" }).success).toBe(false);
  });

  it("still rejects text/vtt on the image-only upload endpoint", () => {
    expect(uploadUrlSchema.safeParse({ key: "captions/a.vtt", contentType: "text/vtt" }).success).toBe(false);
  });

  it("accepts an insert position and initial fields when creating a block", () => {
    const parsed = contentBlockCreateSchema.safeParse({ lessonId: id, type: "text", insertAt: 2, initial: { body: "<p>x</p>" } });
    expect(parsed.success).toBe(true);
    expect(contentBlockCreateSchema.safeParse({ lessonId: id, type: "text", insertAt: -1 }).success).toBe(false);
  });
});

describe("Study week media", () => {
  const base = {
    subtitle: "",
    keyVerse: "v",
    keyRef: "r",
    study: { sections: [], parts: [] },
    passageRef: "p",
    passage: [],
    stationsLabel: "",
    stationsIntro: "",
    stations: [],
    lifeTitle: "",
    lifeIntro: "",
    practices: [],
    prayerLead: "",
    prayerBeats: [],
    prayerClose: "",
    bottomLine: [],
    benediction: [],
    closingVerse: "",
    closingRef: "",
    carry: "",
  };
  const id = "11111111-1111-4111-8111-111111111111";
  const withSectionMedia = (media: unknown) => ({ ...base, study: { sections: [{ heading: "H", paras: [], media: [media] }], parts: [] } });

  it("accepts an https image, a linked or uploaded video, and a callout", () => {
    for (const media of [
      { id, type: "image", imageUrl: "https://example.com/a.png", imageAlt: "A" },
      { id, type: "video", mediaUrl: "https://example.com/v.mp4" },
      { id, type: "video", mediaId: "stream-uid" },
      { id, type: "callout", calloutTitle: "Note", calloutColor: "#fef3c7", body: "<p>x</p>" },
    ]) {
      expect(studyWeekContentSchema.safeParse(withSectionMedia(media)).success).toBe(true);
    }
  });

  it("rejects http URLs, fields from another type, and a video with both sources", () => {
    expect(studyWeekContentSchema.safeParse(withSectionMedia({ id, type: "image", imageUrl: "http://example.com/a.png" })).success).toBe(false);
    expect(studyWeekContentSchema.safeParse(withSectionMedia({ id, type: "image", calloutColor: "#ffffff" })).success).toBe(false);
    expect(
      studyWeekContentSchema.safeParse(withSectionMedia({ id, type: "video", mediaId: "uid", mediaUrl: "https://example.com/v.mp4" })).success
    ).toBe(false);
  });

  it("rejects two media items sharing one id anywhere in the week", () => {
    const media = { id, type: "image", imageUrl: "https://example.com/a.png" };
    expect(studyWeekContentSchema.safeParse({ ...withSectionMedia(media), tabMedia: { lift: [media] } }).success).toBe(false);
  });

  it("accepts media at the end of a tab", () => {
    expect(studyWeekContentSchema.safeParse({ ...base, tabMedia: { lift: [{ id, type: "audio", mediaUrl: "https://example.com/a.mp3" }] } }).success).toBe(true);
  });

  describe("Five Stations weeks (parse_five_stations.py)", () => {
    const station = {
      ref: "NUMBERS 6:24",
      verse: "Yahweh bless you, and keep you.",
      question: "Whose blessing are you waiting to earn?",
      questionBlockId: id,
      greek: "",
      translit: "bārak",
      gloss: "to bless",
      xref: "",
      body: [],
      live: "",
      verseNums: ["6:24"],
      anchor: null,
    };

    it("keeps a station's language and pull-quotes, a printed prayer, and Life Application pull-quotes", () => {
      const week = {
        ...base,
        stations: [{ ...station, lang: "hebrew", pulls: ["A pull-quote."] }],
        prayerLines: ["Father, bless me.", "Amen."],
        lifePulls: ["Another pull-quote."],
      };
      const parsed = studyWeekContentSchema.parse(week);
      // Not stripped on save: the admin builder saves through this schema.
      expect(parsed.stations[0]).toMatchObject({ lang: "hebrew", pulls: ["A pull-quote."] });
      expect(parsed.prayerLines).toEqual(["Father, bless me.", "Amen."]);
      expect(parsed.lifePulls).toEqual(["Another pull-quote."]);
    });

    it("rejects a language other than Greek or Hebrew", () => {
      expect(studyWeekContentSchema.safeParse({ ...base, stations: [{ ...station, lang: "aramaic" }] }).success).toBe(false);
    });

    it("lets an opening section go without a heading, but not a Part", () => {
      const section = { heading: "", paras: ["Opens straight into the essay."] };
      expect(studyWeekContentSchema.safeParse({ ...base, study: { sections: [section], parts: [] } }).success).toBe(true);
      const part = { label: "PART ONE", heading: "", paras: [] };
      expect(studyWeekContentSchema.safeParse({ ...base, study: { sections: [], parts: [part] } }).success).toBe(false);
    });
  });
});
