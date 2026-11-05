export const metadata = {
  title: "Privacy Policy",
};

export default function PrivacyPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-12 sm:py-16">
      <h1 className="font-display font-bold text-3xl text-ink mb-2">Privacy Policy</h1>
      <p className="font-sans text-sm text-moss mb-10">
        Last updated:{" "}
        {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
      </p>

      <div className="prose font-serif prose-headings:font-display prose-a:text-moss space-y-6">
        <p>
          This page explains what information Soul Dust Revival collects when you buy a
          book or study, create an account, or use the study web app — and what choices
          you have about it.
        </p>

        <h2>What we collect</h2>
        <ul>
          <li><strong>Email address</strong> — to create your account and send order confirmations.</li>
          <li><strong>Country</strong> — collected at checkout for every order, so we can apply the right data-protection rules for where you are.</li>
          <li><strong>Shipping address</strong> — only if you buy a physical book, collected securely through our payment processor.</li>
          <li><strong>Study answers</strong> — the responses you write inside a study, saved so you can pick up where you left off.</li>
          <li><strong>Login activity</strong> — when you log in and roughly how long you are active, so we can understand how the app is used. We do not log your IP address or precise location for this.</li>
          <li><strong>Purchase history</strong> — what you have bought, so we can grant access to digital studies you have purchased.</li>
        </ul>

        <h2>Why we collect it</h2>
        <p>
          Each piece of information above exists to make a specific part of the product
          work — creating your account, granting access to what you have bought, saving
          your progress, and shipping physical orders. We do not sell your information,
          and we do not use it for advertising.
        </p>

        <h2>Who we share it with</h2>
        <p>
          We use a small number of service providers to run this platform, each of whom
          only sees the data needed to do their part: Supabase (accounts and database),
          Stripe (payments), Cloudflare (hosting, video, file storage), and Resend
          (order emails). Each has its own privacy and security practices.
        </p>

        <h2>Your choices</h2>
        <p>
          If you have an account, visit <a href="/account">your account page</a> to
          download a copy of everything we have on file for you, or to permanently
          delete your account. Deleting your account removes your study answers and
          login history immediately. Order records are kept for financial
          record-keeping, with your personal details removed from them first.
        </p>

        <h2>How long we keep information</h2>
        <p>
          Your account data is kept as long as your account is active. If you delete
          your account, most personal data is removed immediately; order records are
          retained in an anonymized form for as long as financial record-keeping
          requires.
        </p>

        <h2>Questions</h2>
        <p>
          If you have questions about this policy or want help with a data request
          beyond what the account page offers, reach out and we will help directly.
        </p>

        <p className="text-sm text-moss italic">
          This policy describes our actual data practices in plain language. It has not
          been reviewed by an attorney for legal sufficiency in every jurisdiction we
          might serve — if you have specific legal concerns, please consult a
          professional.
        </p>
      </div>
    </div>
  );
}
