import { describe, expect, it } from "vitest";
import {
  adminUserCreateSchema,
  adminUserUpdateSchema,
  anthropicKeySchema,
  blogPostCreateSchema,
  blogPostUpdateSchema,
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
  it("accepts an allowlisted image content type", () => {
    expect(uploadUrlSchema.safeParse({ key: "products/abc.jpg", contentType: "image/jpeg" }).success).toBe(
      true
    );
  });

  it("rejects a non-allowlisted content type (e.g. svg, html, executable)", () => {
    for (const contentType of ["image/svg+xml", "text/html", "application/octet-stream", "application/pdf"]) {
      expect(uploadUrlSchema.safeParse({ key: "k", contentType }).success).toBe(false);
    }
  });

  it("rejects a key containing path traversal characters", () => {
    expect(
      uploadUrlSchema.safeParse({ key: "../../etc/passwd", contentType: "image/png" }).success
    ).toBe(false);
  });

  it("rejects a key with spaces or other disallowed characters", () => {
    expect(uploadUrlSchema.safeParse({ key: "my file.png", contentType: "image/png" }).success).toBe(
      false
    );
  });

  it("rejects a key over the 300 char cap", () => {
    expect(
      uploadUrlSchema.safeParse({ key: "a".repeat(301), contentType: "image/png" }).success
    ).toBe(false);
  });
});

describe("resourceFileUploadUrlSchema", () => {
  it("accepts application/pdf only, not image types", () => {
    expect(
      resourceFileUploadUrlSchema.safeParse({ key: "guides/a.pdf", contentType: "application/pdf" }).success
    ).toBe(true);
    expect(
      resourceFileUploadUrlSchema.safeParse({ key: "guides/a.png", contentType: "image/png" }).success
    ).toBe(false);
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
