import { getDb } from "@/lib/db/client";
import { amazonClaims, products, users } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import Link from "next/link";
import { RevokeClaimButton } from "@/components/admin/RevokeClaimButton";
import { formatDate } from "@/lib/format/date";

export const dynamic = "force-dynamic";

/**
 * Every digital edition claimed with an Amazon order number (/claim). Access
 * is granted on trust when claimed; this is where an admin checks order
 * numbers against Amazon's own sales reports and revokes a bad one.
 */
export default async function AmazonClaimsReportPage() {
  const db = await getDb();
  const claims = await db
    .select({
      id: amazonClaims.id,
      orderNumber: amazonClaims.amazonOrderNumber,
      createdAt: amazonClaims.createdAt,
      revokedAt: amazonClaims.revokedAt,
      userEmail: users.email,
      productTitle: products.title,
    })
    .from(amazonClaims)
    .innerJoin(users, eq(amazonClaims.userId, users.id))
    .innerJoin(products, eq(amazonClaims.productId, products.id))
    .orderBy(desc(amazonClaims.createdAt))
    .limit(500);

  const active = claims.filter((c) => !c.revokedAt).length;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/reports" className="text-sm text-moss">
          ← Reports
        </Link>
        <h1 className="text-xl font-semibold">Amazon claims</h1>
        <p className="text-sm text-moss mt-1 max-w-2xl">
          Readers who bought a printed book on Amazon unlock its digital edition with their order number. Amazon
          can&apos;t confirm a number for us, so access is granted straight away. Check numbers against your
          Amazon sales and revoke any that don&apos;t match; a revoked number can&apos;t be claimed again.
        </p>
      </div>

      <div className="flex gap-8">
        <div>
          <p className="text-2xl font-semibold">{active}</p>
          <p className="text-sm text-moss">Active claims</p>
        </div>
        <div>
          <p className="text-2xl font-semibold">{claims.length - active}</p>
          <p className="text-sm text-moss">Revoked</p>
        </div>
      </div>

      {claims.length === 0 ? (
        <p className="text-moss">No claims yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b text-moss">
                <th scope="col" className="py-2 pr-4 font-medium">Date</th>
                <th scope="col" className="py-2 pr-4 font-medium">Reader</th>
                <th scope="col" className="py-2 pr-4 font-medium">Book</th>
                <th scope="col" className="py-2 pr-4 font-medium">Amazon order</th>
                <th scope="col" className="py-2 pr-4 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {claims.map((c) => (
                <tr key={c.id} className="border-b align-top">
                  <td className="py-2 pr-4 whitespace-nowrap">{c.createdAt ? formatDate(c.createdAt) : ""}</td>
                  <td className="py-2 pr-4">{c.userEmail}</td>
                  <td className="py-2 pr-4">{c.productTitle}</td>
                  <td className="py-2 pr-4 font-mono whitespace-nowrap">{c.orderNumber}</td>
                  <td className="py-2 pr-4">
                    {c.revokedAt ? (
                      <span className="text-moss">Revoked {formatDate(c.revokedAt)}</span>
                    ) : (
                      <RevokeClaimButton claimId={c.id} label={`${c.productTitle} for ${c.userEmail}`} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
