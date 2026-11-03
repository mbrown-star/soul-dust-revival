import { db } from "@/lib/db/client";
import { products, posts } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import Link from "next/link";
import Image from "next/image";
import { DustHero } from "@/components/marketing/DustHero";

// Rendered dynamically per-request rather than statically at build time —
// this reads live product/post data an admin can change anytime, and a
// static build would otherwise freeze this content as of the last deploy
// (and would require a live database reachable during the build itself).
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const featuredProducts = await db
    .select()
    .from(products)
    .where(eq(products.active, true))
    .orderBy(desc(products.createdAt))
    .limit(4);

  const recentPosts = await db
    .select()
    .from(posts)
    .where(eq(posts.published, true))
    .orderBy(desc(posts.publishedAt))
    .limit(3);

  return (
    <>
      <DustHero />

      {/* Featured studies & books */}
      <section className="max-w-5xl mx-auto px-4 py-16 sm:py-20">
        <h2 className="font-display font-bold text-2xl sm:text-3xl text-ink mb-8">
          Start where you are
        </h2>

        {featuredProducts.length === 0 ? (
          <p className="font-serif text-moss">New studies and books are on the way.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {featuredProducts.map((p) => (
              <Link
                key={p.id}
                href={`/books/${p.slug}`}
                className="group focus:outline-none focus:ring-2 focus:ring-ink rounded-lg"
              >
                <div className="aspect-[3/4] bg-dusk rounded-lg overflow-hidden mb-3 relative">
                  {p.imageUrl ? (
                    <Image
                      src={p.imageUrl}
                      alt={p.imageAlt ?? ""}
                      fill
                      sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
                      className="object-cover group-hover:scale-105 transition-transform"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-parchment/70 font-display text-sm">
                      Soul Dust Revival
                    </div>
                  )}
                </div>
                <p className="font-sans text-xs uppercase tracking-wide text-moss mb-1">
                  {p.format === "digital" ? "Study · Web app" : "Book · Ships to you"}
                </p>
                <h3 className="font-display font-semibold text-ink group-hover:text-ember">
                  {p.title}
                </h3>
                <p className="font-sans text-sm text-moss mt-1">
                  ${(p.priceCents / 100).toFixed(2)}
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* How a study works — a genuine sequence, so numbered steps earn their place here */}
      <section className="bg-dusk text-parchment">
        <div className="max-w-5xl mx-auto px-4 py-16 sm:py-20">
          <h2 className="font-display font-bold text-2xl sm:text-3xl mb-10">
            How a study works
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            <div>
              <p className="font-display font-black text-4xl text-gold mb-2">1</p>
              <h3 className="font-sans font-semibold mb-1">Choose a study</h3>
              <p className="font-serif text-parchment/80 text-sm">
                Pick a study built for where you are — a season of doubt, discipline, or
                just showing up honestly.
              </p>
            </div>
            <div>
              <p className="font-display font-black text-4xl text-gold mb-2">2</p>
              <h3 className="font-sans font-semibold mb-1">Read it, alone or together</h3>
              <p className="font-serif text-parchment/80 text-sm">
                Each lesson mixes short readings, video, and Scripture — built for a
                single sitting or a group discussion.
              </p>
            </div>
            <div>
              <p className="font-display font-black text-4xl text-gold mb-2">3</p>
              <h3 className="font-sans font-semibold mb-1">Answer, and be answered</h3>
              <p className="font-serif text-parchment/80 text-sm">
                Every study includes real questions — the kind that ask something of you,
                not just about you.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Recent blog posts */}
      {recentPosts.length > 0 && (
        <section className="max-w-5xl mx-auto px-4 py-16 sm:py-20">
          <div className="flex items-center justify-between mb-8">
            <h2 className="font-display font-bold text-2xl sm:text-3xl text-ink">
              From the blog
            </h2>
            <Link
              href="/blog"
              className="font-sans text-sm font-medium text-ember hover:underline focus:outline-none focus:ring-2 focus:ring-ink rounded p-1 -m-1"
            >
              View all
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {recentPosts.map((post) => (
              <Link
                key={post.id}
                href={`/blog/${post.slug}`}
                className="focus:outline-none focus:ring-2 focus:ring-ink rounded-lg"
              >
                <h3 className="font-display font-semibold text-ink hover:text-ember mb-1">
                  {post.title}
                </h3>
                {post.publishedAt && (
                  <p className="font-sans text-xs text-moss">
                    {new Date(post.publishedAt).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </p>
                )}
              </Link>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
