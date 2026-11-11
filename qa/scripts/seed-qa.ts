// QA fixture seed — ALWAYS targets TEST_DATABASE_URL directly via a raw `pg`
// client, never getDb()/DATABASE_URL, so this can never accidentally write
// into the real, shared-with-staging Supabase project (see vitest.setup.ts
// and CLAUDE.md's 2026-11-05 data-leak entries for why that distinction
// matters here). Safe to re-run: every fixture row is identified by a fixed,
// hardcoded slug/email and deleted before being re-inserted.
//
// Also creates three real Supabase Auth identities (qa-user@, qa-leader@,
// qa-admin@soul-dust-revival.test) via the Admin API, since there is no
// separate staging Supabase project for this app yet (SECURITY_REVIEW.md
// recommends one) — Auth identities necessarily live in the one real,
// shared Supabase project regardless of which Postgres DATABASE_URL points
// at for the app's own tables. These are clearly-named test fixtures, the
// same convention already used for prior QA/test accounts in this project's
// history. Run `tsx --env-file=.env.local qa/scripts/cleanup-qa.ts` to
// remove them from Supabase Auth when a QA pass is done.
import { Client } from "pg";
import { createClient } from "@supabase/supabase-js";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../../lib/db/schema";
import type { StudyWeekContent } from "../../lib/study/studyContent";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
if (!TEST_DATABASE_URL) {
  throw new Error(
    "TEST_DATABASE_URL is not set. QA fixtures must never be seeded against DATABASE_URL " +
      "(the real, shared-with-staging project). See .env.example."
  );
}
if (TEST_DATABASE_URL.includes("supabase.co")) {
  throw new Error(
    "TEST_DATABASE_URL points at a supabase.co host -- refusing to seed QA fixtures there. " +
      "This script only targets a local/disposable Postgres."
  );
}

const QA_EMAILS = {
  user: "qa-user@soul-dust-revival.test",
  leader: "qa-leader@soul-dust-revival.test",
  admin: "qa-admin@soul-dust-revival.test",
} as const;

async function ensureSupabaseAuthUser(email: string): Promise<string> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY must be set (real Supabase project).");
  }
  const admin = createClient(supabaseUrl, serviceKey);

  // generateLink both creates the Auth user (if it doesn't exist yet) and
  // returns its real UID -- same call the login fixture uses to sign in.
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error || !data.user) {
    throw new Error(`Could not ensure Supabase Auth user for ${email}: ${error?.message}`);
  }
  return data.user.id;
}

function stationBlock(args: {
  ref: string;
  verse: string;
  question: string;
  greek: string;
  translit: string;
  gloss: string;
  xref: string;
  body: string[];
  live: string;
  verseNums: string[];
  anchor: { v: string; word: string } | null;
}) {
  return args;
}

async function main() {
  const pg = new Client({ connectionString: TEST_DATABASE_URL });
  await pg.connect();
  const db = drizzle(pg, { schema });

  console.log("Ensuring QA Supabase Auth identities...");
  const userIds = {
    user: await ensureSupabaseAuthUser(QA_EMAILS.user),
    leader: await ensureSupabaseAuthUser(QA_EMAILS.leader),
    admin: await ensureSupabaseAuthUser(QA_EMAILS.admin),
  };

  console.log("Clearing prior QA fixtures...");
  // Delete in FK-safe order. Scoped tightly to QA's own fixture slugs/emails
  // (never a blanket TRUNCATE) so this is safe even if real-shaped seed data
  // from scripts/seed.ts is also present in this same local database.
  const qaSlugPrefix = "qa-%";
  await pg.query(
    `DELETE FROM responses WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'qa-%@soul-dust-revival.test')`
  );
  await pg.query(
    `DELETE FROM lesson_progress WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'qa-%@soul-dust-revival.test')`
  );
  await pg.query(
    `DELETE FROM entitlements WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'qa-%@soul-dust-revival.test')`
  );
  await pg.query(
    `DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'qa-%@soul-dust-revival.test') OR guest_email LIKE 'qa-%@soul-dust-revival.test')`
  );
  await pg.query(
    `DELETE FROM orders WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'qa-%@soul-dust-revival.test') OR guest_email LIKE 'qa-%@soul-dust-revival.test'`
  );
  await pg.query(`DELETE FROM content_blocks WHERE lesson_id IN (SELECT id FROM lessons WHERE study_id IN (SELECT id FROM studies WHERE slug LIKE $1))`, [qaSlugPrefix]);
  await pg.query(`DELETE FROM lessons WHERE study_id IN (SELECT id FROM studies WHERE slug LIKE $1)`, [qaSlugPrefix]);
  await pg.query(`DELETE FROM studies WHERE slug LIKE $1`, [qaSlugPrefix]);
  await pg.query(`DELETE FROM products WHERE slug LIKE $1`, [qaSlugPrefix]);
  await pg.query(`DELETE FROM posts WHERE slug LIKE $1`, [qaSlugPrefix]);
  await pg.query(`DELETE FROM leader_resources WHERE title LIKE 'QA %'`);
  await pg.query(`DELETE FROM login_events WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'qa-%@soul-dust-revival.test')`);
  await pg.query(`DELETE FROM users WHERE email LIKE 'qa-%@soul-dust-revival.test'`);

  console.log("Seeding QA users...");
  await db.insert(schema.users).values([
    { id: userIds.user, email: QA_EMAILS.user, fullName: "QA User", role: "user", country: "US" },
    { id: userIds.leader, email: QA_EMAILS.leader, fullName: "QA Leader", role: "leader", country: "US" },
    { id: userIds.admin, email: QA_EMAILS.admin, fullName: "QA Admin", role: "admin", country: "US" },
  ]);

  // ---------- Products ----------
  console.log("Seeding QA products...");
  const [pNotStarted] = await db
    .insert(schema.products)
    .values({
      type: "study_access",
      format: "digital",
      kind: "study",
      title: "QA Digital Study — Not Started",
      slug: "qa-digital-study-not-started",
      description: "A QA fixture study the QA user owns but has never opened.",
      priceCents: 1900,
      featured: true,
      active: true,
    })
    .returning();

  const [pInProgress] = await db
    .insert(schema.products)
    .values({
      type: "study_access",
      format: "digital",
      kind: "devotional",
      title: "QA Devotional — In Progress",
      slug: "qa-devotional-in-progress",
      description: "A QA fixture devotional the QA user is partway through.",
      priceCents: 1500,
      active: true,
    })
    .returning();

  const [pCompleted] = await db
    .insert(schema.products)
    .values({
      type: "study_access",
      format: "digital",
      kind: "study",
      title: "QA Study — Completed",
      slug: "qa-study-completed",
      description: "A QA fixture study the QA user has fully finished (Start over should appear).",
      priceCents: 1200,
      active: true,
    })
    .returning();

  const [pAmazonAndStripe] = await db
    .insert(schema.products)
    .values({
      type: "book",
      format: "physical",
      title: "QA Physical Book — Amazon + Stripe",
      slug: "qa-physical-amazon-and-stripe",
      description: "A QA fixture physical book sellable through both routes.",
      priceCents: 1699,
      amazonUrl: "https://www.amazon.com/dp/QA0000000",
      sellOnStripe: true,
      active: true,
    })
    .returning();

  await db.insert(schema.products).values({
    type: "book",
    format: "physical",
    title: "QA Physical Book — Amazon Only",
    slug: "qa-physical-amazon-only",
    description: "A QA fixture physical book sold only through Amazon.",
    priceCents: 1499,
    amazonUrl: "https://www.amazon.com/dp/QA1111111",
    sellOnStripe: false,
    active: true,
  });

  const [pBoth] = await db
    .insert(schema.products)
    .values({
      type: "book",
      format: "both",
      title: "QA Bundle — Both Formats",
      slug: "qa-bundle-both-formats",
      description: "A QA fixture product sold as two independent purchases (physical ships, digital unlocks a study).",
      priceCents: 2499,
      digitalPriceCents: 1599,
      featured: true,
      active: true,
    })
    .returning();

  await db.insert(schema.products).values({
    type: "book",
    format: "physical",
    title: "QA Inactive Product",
    slug: "qa-inactive-product",
    description: "Should never appear on /books or the homepage.",
    priceCents: 999,
    active: false,
  });

  if (!pNotStarted || !pInProgress || !pCompleted || !pAmazonAndStripe || !pBoth) {
    throw new Error("QA seed: a required product insert returned no row.");
  }

  // ---------- Study S1: kind="study", linked to pNotStarted ----------
  console.log("Seeding QA interactive study (kind=study)...");
  const [s1] = await db
    .insert(schema.studies)
    .values({
      productId: pNotStarted.id,
      title: "QA Colossians-Shaped Study",
      slug: "qa-study-not-started",
      description: "A QA fixture modeled on the real Colossians 5-tab study content shape.",
      kind: "study",
      published: true,
      coverImageAlt: "QA study cover",
    })
    .returning();
  if (!s1) throw new Error("QA seed: study insert returned no row.");

  const [s1lesson1] = await db
    .insert(schema.lessons)
    .values({ studyId: s1.id, orderIndex: 1, title: "Week 1: Grace and Truth", published: true })
    .returning();
  if (!s1lesson1) throw new Error("QA seed: lesson insert returned no row.");

  // 3 stations: one matches inline, one matches inline, one has NO inline
  // match -- exercises the unmatched-Greek-station fallback button in
  // components/study/study-tabs/PassageTab.tsx (fixed 2026-11-11).
  const stationDefs = [
    stationBlock({
      ref: "1:2",
      verse: "Grace to you and peace from God our Father.",
      question: "Where have you recently needed grace more than explanation?",
      greek: "χάρις",
      translit: "charis",
      gloss: "grace, unearned favor",
      xref: "Ephesians 2:8",
      body: ["Grace is the Bible's word for a gift that was never owed."],
      live: "Name one place this week you can extend unearned favor.",
      verseNums: ["1:2"],
      anchor: { v: "1:2", word: "Grace" },
    }),
    stationBlock({
      ref: "1:4",
      verse: "Since we heard of your faith in Christ Jesus and of the love which you have for all the saints.",
      question: "What does your faith actually rest on day to day?",
      greek: "πίστις",
      translit: "pistis",
      gloss: "faith, trust",
      xref: "Hebrews 11:1",
      body: ["Faith here means active trust, not just belief."],
      live: "Write down one thing you are trusting God with this week.",
      verseNums: ["1:4"],
      anchor: { v: "1:4", word: "faith" },
    }),
    stationBlock({
      ref: "1:11",
      verse: "Strengthened with all power, according to His glorious might, for the attaining of all steadfastness and patience.",
      question: "Where do you most need steadfastness right now?",
      greek: "ὑπομονή",
      translit: "hypomonē",
      gloss: "steadfast endurance",
      xref: "James 1:3",
      body: ["This word has no clean single-word match in this week's own English rendering, so it can't be underlined inline on the Passage tab."],
      live: "Name one place patience is being asked of you.",
      verseNums: ["1:11"],
      anchor: null,
    }),
  ];

  const stationQuestionBlocks: (typeof schema.contentBlocks.$inferSelect)[] = [];
  for (let i = 0; i < stationDefs.length; i++) {
    const def = stationDefs[i]!;
    const [block] = await db
      .insert(schema.contentBlocks)
      .values({
        lessonId: s1lesson1.id,
        orderIndex: i + 1,
        type: "question",
        questionPrompt: def.question,
      })
      .returning();
    if (!block) throw new Error("QA seed: content block insert returned no row.");
    stationQuestionBlocks.push(block);
  }

  const studyContent: StudyWeekContent = {
    subtitle: "A QA fixture week",
    keyVerse: "Grace to you and peace from God our Father.",
    keyRef: "Colossians 1:2",
    study: {
      sections: [{ heading: "Where We Are", paras: ["A short QA fixture introduction paragraph."] }],
      parts: [
        { label: "Part 1", heading: "The Greeting", paras: ["Fixture paragraph for part 1."] },
        { label: "Part 2", heading: "The Thanksgiving", paras: ["Fixture paragraph for part 2."] },
      ],
    },
    passageRef: "Colossians 1:1–14",
    passage: [
      { c: 1, n: 1, text: "Paul, an apostle of Christ Jesus by the will of God, and Timothy our brother," },
      { c: 1, n: 2, text: "To the saints and faithful brothers in Christ at Colossae: Grace to you and peace from God our Father." },
      { c: 1, n: 4, text: "Since we heard of your faith in Christ Jesus and of the love which you have for all the saints." },
      { c: 1, n: 11, text: "Strengthened with all power, according to His glorious might, for the attaining of all steadfastness and patience." },
    ],
    stationsLabel: "Work the Word",
    stationsIntro: "Three stations drawn from this week's passage.",
    stations: stationDefs.map((def, i) => ({
      ref: def.ref,
      verse: def.verse,
      question: def.question,
      questionBlockId: stationQuestionBlocks[i]!.id,
      greek: def.greek,
      translit: def.translit,
      gloss: def.gloss,
      xref: def.xref,
      body: def.body,
      live: def.live,
      verseNums: def.verseNums,
      anchor: def.anchor,
    })),
    lifeTitle: "Where This Meets Real Life",
    lifeIntro: "A QA fixture life-application intro paragraph.",
    practices: [
      { n: 1, title: "Notice grace", body: "Look for one place grace shows up today." },
      { n: 2, title: "Name your trust", body: "Say out loud one thing you are trusting God with." },
    ],
    prayerLead: "Let's pray through this together.",
    prayerBeats: [
      { person: "Father", verb: "Thank", words: "the Father for His grace." },
      { person: "Son", verb: "Ask", words: "Jesus to deepen your faith." },
      { person: "Spirit", verb: "Invite", words: "the Spirit to grow steadfastness in you." },
    ],
    prayerClose: "Amen.",
    bottomLine: ["Grace isn't earned, and neither is the patience to wait on God."],
    benediction: ["Go in grace.", "Go in peace."],
    closingVerse: "Grace to you and peace from God our Father.",
    closingRef: "Colossians 1:2",
    carry: "What's one word from today you want to carry with you?",
  };

  await pg.query(`UPDATE lessons SET study_content = $1 WHERE id = $2`, [
    JSON.stringify(studyContent),
    s1lesson1.id,
  ]);

  // A second lesson with NO studyContent -- exercises the plain
  // content-block fallback reading view for a study-kind lesson.
  const [s1lesson2] = await db
    .insert(schema.lessons)
    .values({ studyId: s1.id, orderIndex: 2, title: "Introduction", published: true })
    .returning();
  if (!s1lesson2) throw new Error("QA seed: lesson insert returned no row.");
  await db.insert(schema.contentBlocks).values({
    lessonId: s1lesson2.id,
    orderIndex: 1,
    type: "text",
    body: "<p>A QA fixture lesson with no structured studyContent, to exercise the plain reading fallback.</p>",
  });

  // qa-user: entitled, zero lesson_progress -> "Not started" bucket in My Library.
  await db.insert(schema.entitlements).values({ userId: userIds.user, productId: pNotStarted.id, source: "admin_grant" });

  // ---------- Study S2: kind="devotional", linked to pInProgress ----------
  console.log("Seeding QA devotional study (kind=devotional)...");
  const [s2] = await db
    .insert(schema.studies)
    .values({
      productId: pInProgress.id,
      title: "QA Devotional Fixture",
      slug: "qa-devotional-fixture",
      description: "A QA fixture devotional modeled on the real Psalms 365-day devotional shape.",
      kind: "devotional",
      published: true,
      coverImageAlt: "QA devotional cover",
    })
    .returning();
  if (!s2) throw new Error("QA seed: study insert returned no row.");

  const devotionalDays = [
    { day: 1, month: "JANUARY", date: 1, psalm: 1, lift: "Lift your eyes to the one who planted you.", question: "What does it mean for you to be like a tree planted by water this week?" },
    { day: 2, month: "JANUARY", date: 2, psalm: 2, lift: "Lift your eyes to the King who laughs at chaos.", question: "Where do you need to trust God's bigger plan today?" },
    { day: 3, month: "JANUARY", date: 3, psalm: 3, lift: "Lift your eyes to the shield around you.", question: "What are you afraid of right now, and who holds the shield?" },
    { day: 4, month: "JANUARY", date: 4, psalm: 4, lift: "Lift your eyes to the one who gives sleep in safety.", question: "What would it look like to lie down in peace tonight?" },
    { day: 5, month: "JANUARY", date: 5, psalm: 5, lift: "Lift your eyes to the God who hears in the morning.", question: "What's the first thing you want God to hear from you tomorrow?" },
  ];

  const s2LessonIds: string[] = [];
  const s2QuestionBlockIds: (string | null)[] = [];
  for (const d of devotionalDays) {
    const title = `DAY ${d.day} · ${d.month} ${d.date} · PSALM ${d.psalm}`;
    const [lesson] = await db
      .insert(schema.lessons)
      .values({ studyId: s2.id, orderIndex: d.day, title, published: true })
      .returning();
    if (!lesson) throw new Error("QA seed: devotional lesson insert returned no row.");
    s2LessonIds.push(lesson.id);

    const body = [
      `<p><strong>${title}</strong></p>`,
      `<p>"A QA fixture key verse quote for Psalm ${d.psalm}."</p>`,
      `<p><strong>— PSALM ${d.psalm}:1</strong></p>`,
      `<p>A QA fixture reading paragraph for day ${d.day}.</p>`,
      `<p><strong>LIFT UP YOUR EYES</strong></p>`,
      `<p>${d.lift}</p>`,
      `<p><strong>A QUESTION TO SIT WITH</strong></p>`,
      `<p>${d.question}</p>`,
    ].join("\n");

    await db.insert(schema.contentBlocks).values({
      lessonId: lesson.id,
      orderIndex: 1,
      type: "text",
      body,
    });

    // Backfill a real question block for days 1-3 only, leaving 4-5
    // unbackfilled -- exercises both the real-saved-answer path and the
    // plain-display-only fallback in DevotionalDayView.
    if (d.day <= 3) {
      const [qBlock] = await db
        .insert(schema.contentBlocks)
        .values({ lessonId: lesson.id, orderIndex: 2, type: "question", questionPrompt: d.question })
        .returning();
      s2QuestionBlockIds.push(qBlock?.id ?? null);
    } else {
      s2QuestionBlockIds.push(null);
    }
  }

  await db.insert(schema.entitlements).values({ userId: userIds.user, productId: pInProgress.id, source: "admin_grant" });
  // Day 1: completed + a saved answer. Day 2: in_progress, no saved answer
  // yet. Days 3-5: not_started (no row).
  await db.insert(schema.lessonProgress).values([
    { userId: userIds.user, lessonId: s2LessonIds[0]!, status: "completed", completedAt: new Date() },
    { userId: userIds.user, lessonId: s2LessonIds[1]!, status: "in_progress" },
  ]);
  if (s2QuestionBlockIds[0]) {
    await db.insert(schema.responses).values({
      userId: userIds.user,
      contentBlockId: s2QuestionBlockIds[0],
      answerText: "A QA fixture saved answer for Day 1 -- should appear in the Journal tab.",
    });
  }

  // ---------- Study S3: kind="study", linked to pCompleted ----------
  console.log("Seeding QA completed study...");
  const [s3] = await db
    .insert(schema.studies)
    .values({
      productId: pCompleted.id,
      title: "QA Completed Study",
      slug: "qa-study-completed",
      description: "A QA fixture study the QA user has fully finished.",
      kind: "study",
      published: true,
    })
    .returning();
  if (!s3) throw new Error("QA seed: study insert returned no row.");
  const [s3lesson] = await db
    .insert(schema.lessons)
    .values({ studyId: s3.id, orderIndex: 1, title: "Week 1: Finished", published: true })
    .returning();
  if (!s3lesson) throw new Error("QA seed: lesson insert returned no row.");
  await db.insert(schema.contentBlocks).values({
    lessonId: s3lesson.id,
    orderIndex: 1,
    type: "text",
    body: "<p>A QA fixture lesson, already marked completed, to test My Library's Completed bucket and Start over.</p>",
  });
  await db.insert(schema.entitlements).values({ userId: userIds.user, productId: pCompleted.id, source: "admin_grant" });
  await db.insert(schema.lessonProgress).values({
    userId: userIds.user,
    lessonId: s3lesson.id,
    status: "completed",
    completedAt: new Date(),
  });

  // ---------- Study S4: kind="study", linked to pBoth's digital side ----------
  // Deliberately NOT entitled for qa-user yet -- this is the product the
  // checkout spec purchases fresh, to exercise entitlement-granting end to
  // end without a real Stripe webhook (see qa/checklists for the manual
  // Stripe-webhook checklist, which is the only thing that needs real
  // Stripe test-mode credentials).
  console.log("Seeding QA study linked to the 'both'-format bundle...");
  await db.insert(schema.studies).values({
    productId: pBoth.id,
    title: "QA Bundle Study",
    slug: "qa-bundle-study",
    description: "The digital side of the QA 'both'-format bundle.",
    kind: "study",
    published: true,
  });

  // ---------- Blog ----------
  // ---------- Study S5: a devotional with a free sample, owned by nobody ----------
  // Days 1-3 are the free sample (lessons.isSample) and Days 4-5 are locked,
  // so every QA account sees it as a "Sneak peek" -- qa-leader is the one the
  // sneak-peek spec reads it as. Its product is inactive so it stays off the
  // storefront and out of every other spec's product counts.
  console.log("Seeding QA free-sample devotional...");
  const [pSample] = await db
    .insert(schema.products)
    .values({
      type: "study_access",
      format: "digital",
      kind: "devotional",
      title: "QA Sample Devotional",
      slug: "qa-sample-devotional",
      priceCents: 1500,
      active: false,
    })
    .returning();
  if (!pSample) throw new Error("QA seed: product insert returned no row.");
  const [s5] = await db
    .insert(schema.studies)
    .values({
      productId: pSample.id,
      title: "QA Sample Devotional",
      slug: "qa-sample-devotional",
      kind: "devotional",
      published: true,
    })
    .returning();
  if (!s5) throw new Error("QA seed: study insert returned no row.");
  for (const d of devotionalDays) {
    const title = `DAY ${d.day} · ${d.month} ${d.date} · PSALM ${d.psalm}`;
    const [lesson] = await db
      .insert(schema.lessons)
      .values({ studyId: s5.id, orderIndex: d.day, title, published: true, isSample: d.day <= 3 })
      .returning();
    if (!lesson) throw new Error("QA seed: sample devotional lesson insert returned no row.");
    await db.insert(schema.contentBlocks).values([
      {
        lessonId: lesson.id,
        orderIndex: 1,
        type: "text",
        body: `<p><strong>${title}</strong></p>\n<p>A QA sample reading for day ${d.day}.</p>`,
      },
      { lessonId: lesson.id, orderIndex: 2, type: "question", questionPrompt: d.question },
    ]);
  }

  console.log("Seeding QA blog posts...");
  await db.insert(schema.posts).values([
    {
      title: "QA Fixture: Published Post",
      slug: "qa-fixture-published-post",
      body: "<p>A QA fixture blog post with <strong>bold</strong> and a <a href=\"https://example.com\">link</a> to check rich-text rendering and sanitization.</p>",
      published: true,
      publishedAt: new Date(),
    },
    {
      title: "QA Fixture: Draft Post",
      slug: "qa-fixture-draft-post",
      body: "<p>A QA fixture draft post -- should never appear on the public /blog listing or its own page for a logged-out visitor.</p>",
      published: false,
    },
  ]);

  // ---------- Leader resources ----------
  console.log("Seeding QA leader resources...");
  await db.insert(schema.leaderResources).values([
    { title: "QA Fixture: Published Leader Resource", body: "<p>A QA fixture leader resource.</p>", published: true, orderIndex: 1 },
    { title: "QA Fixture: Draft Leader Resource", body: "<p>Should not appear for a leader on the public listing.</p>", published: false, orderIndex: 2 },
  ]);

  // ---------- A paid + a pending order, for Account/Reports realism ----------
  console.log("Seeding QA orders...");
  const [paidOrder] = await db
    .insert(schema.orders)
    .values({
      userId: userIds.user,
      country: "US",
      status: "paid",
      totalCents: pNotStarted.priceCents,
      requiresShipping: false,
    })
    .returning();
  if (paidOrder) {
    await db.insert(schema.orderItems).values({ orderId: paidOrder.id, productId: pNotStarted.id, quantity: 1 });
  }
  const [pendingOrder] = await db
    .insert(schema.orders)
    .values({
      userId: userIds.user,
      country: "US",
      status: "pending",
      totalCents: pAmazonAndStripe.priceCents,
      requiresShipping: true,
    })
    .returning();
  if (pendingOrder) {
    await db.insert(schema.orderItems).values({ orderId: pendingOrder.id, productId: pAmazonAndStripe.id, quantity: 1 });
  }

  // A fixed, well-known id -- qa/e2e/specs/checkout.spec.ts navigates
  // directly to /checkout/success?orderId=<this> to exercise the "both"-
  // format line-item/pricing fix (qa/findings/FINDINGS_2026-11-07.md #4)
  // without needing to look the real id up dynamically.
  const BOTH_FORMAT_ORDER_ID = "00000000-0000-4000-8000-000000000001";
  await pg.query(`DELETE FROM order_items WHERE order_id = $1`, [BOTH_FORMAT_ORDER_ID]);
  await pg.query(`DELETE FROM orders WHERE id = $1`, [BOTH_FORMAT_ORDER_ID]);
  await db.insert(schema.orders).values({
    id: BOTH_FORMAT_ORDER_ID,
    userId: userIds.user,
    country: "US",
    status: "paid",
    totalCents: pBoth.priceCents * 2 + (pBoth.digitalPriceCents ?? 0) * 3,
    requiresShipping: true,
  });
  await db.insert(schema.orderItems).values([
    { orderId: BOTH_FORMAT_ORDER_ID, productId: pBoth.id, quantity: 2, variant: "physical" },
    { orderId: BOTH_FORMAT_ORDER_ID, productId: pBoth.id, quantity: 3, variant: "digital" },
  ]);

  await pg.end();
  console.log("\nQA seed complete.");
  console.log(`  qa-user:   ${QA_EMAILS.user} (${userIds.user})`);
  console.log(`  qa-leader: ${QA_EMAILS.leader} (${userIds.leader})`);
  console.log(`  qa-admin:  ${QA_EMAILS.admin} (${userIds.admin})`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
