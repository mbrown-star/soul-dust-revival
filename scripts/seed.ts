import { db } from "../lib/db/client";
import { products, studies, lessons, contentBlocks, posts } from "../lib/db/schema";

async function seed() {
  const [product] = await db
    .insert(products)
    .values({
      type: "study_access",
      format: "digital",
      title: "Foundations: A 6-Week Study",
      slug: "foundations-study",
      description: "A six-week study on the basics of faith, with video teaching and guided questions.",
      priceCents: 2900,
      featured: true,
    })
    .returning();
  if (!product) throw new Error("Seed failed: product insert returned no row.");

  await db.insert(products).values({
    type: "book",
    format: "physical",
    title: "Foundations: The Companion Book",
    slug: "foundations-companion-book",
    description: "The printed companion book for the Foundations study.",
    priceCents: 1899,
    featured: true,
  });

  const [study] = await db
    .insert(studies)
    .values({
      productId: product.id,
      title: "Foundations",
      slug: "foundations",
      description: "A six-week study on the basics of faith.",
      published: true,
    })
    .returning();
  if (!study) throw new Error("Seed failed: study insert returned no row.");

  const [lesson] = await db
    .insert(lessons)
    .values({
      studyId: study.id,
      orderIndex: 1,
      title: "Week 1: Introduction",
      published: true,
    })
    .returning();
  if (!lesson) throw new Error("Seed failed: lesson insert returned no row.");

  await db.insert(contentBlocks).values([
    {
      lessonId: lesson.id,
      orderIndex: 1,
      type: "text",
      body: "<p>Welcome to Foundations. This week we look at where it all begins.</p>",
    },
    {
      lessonId: lesson.id,
      orderIndex: 2,
      type: "callout",
      calloutTitle: "Key Verse",
      calloutColor: "#fef3c7",
      body: "<p>\"In the beginning...\"</p>",
    },
    {
      lessonId: lesson.id,
      orderIndex: 3,
      type: "video",
      mediaId: "REPLACE_WITH_CLOUDFLARE_STREAM_UID",
      transcript: "REPLACE_WITH_ACTUAL_TRANSCRIPT — required before publishing (WCAG 1.2.1).",
    },
    {
      lessonId: lesson.id,
      orderIndex: 4,
      type: "question",
      questionPrompt: "What stood out to you most from this week's video?",
    },
  ]);

  await db.insert(posts).values({
    title: "Why We Built Foundations",
    slug: "why-we-built-foundations",
    body: "<p>A short post about the heart behind this study.</p>",
    published: true,
    publishedAt: new Date(),
  });

  console.log("Seed complete.");
}

seed().then(() => process.exit(0));
