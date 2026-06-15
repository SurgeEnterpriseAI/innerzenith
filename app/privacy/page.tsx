import Link from "next/link";

export const metadata = {
  title: "Privacy Policy — dotit",
  description: "How dotit collects, uses, and protects your personal data.",
};

const UPDATED = "15 June 2026";

export default function PrivacyPolicy() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12 text-[var(--text)]">
      <Link href="/" className="text-sm text-[var(--faded)] hover:text-[var(--secondary)]">← Back to dotit</Link>
      <h1 className="mt-6 font-serif-i text-3xl">Privacy Policy</h1>
      <p className="mt-2 text-sm text-[var(--faded)]">Last updated: {UPDATED}</p>

      <Section title="Who we are">
        dotit (“the app”, “we”, “us”) is operated by <strong>Surge Software Solutions Pvt Ltd</strong>,
        Bengaluru, India. dotit is a personal-guidance app that reads the details you provide and
        gives you plain-language insight about yourself. This policy explains what we collect, why,
        and the choices you have. We follow India’s Digital Personal Data Protection Act, 2023 (DPDP).
      </Section>

      <Section title="What we collect">
        We collect only what is needed to create and personalise your reading:
        <ul className="mt-2 list-disc space-y-1 pl-5 text-[var(--secondary)]">
          <li>Your name and gender</li>
          <li>Your date of birth, time of birth, and place of birth</li>
          <li>Your current location (used only for timing context)</li>
          <li>Your email address, if you choose to enable cross-device sync</li>
          <li>The messages you send in a session and the readings generated for you</li>
        </ul>
        We do <strong>not</strong> collect data for advertising, we do <strong>not</strong> run third-party
        ad trackers, and we do <strong>not</strong> sell your data to anyone.
      </Section>

      <Section title="Why we use it">
        Your birth and location details are used solely to compute your chart and to ground each
        reading in your specific situation. Your email (if provided) is used only to send you a
        secure sign-in link and to sync your sessions across your devices. Gender is required by two
        of the underlying calculation systems; removing it would break the reading.
      </Section>

      <Section title="Consent">
        We process your personal data on the basis of your consent, given when you tick the agreement
        at the end of onboarding. You can withdraw consent at any time by deleting your data (below);
        doing so removes the basis for further processing.
      </Section>

      <Section title="Service providers">
        To run the app we share the minimum necessary data with trusted service providers who act
        only on our instructions and only to deliver the service — never for their own purposes:
        <ul className="mt-2 list-disc space-y-1 pl-5 text-[var(--secondary)]">
          <li>A cloud database provider, to securely store your profile and sessions</li>
          <li>A calculation service, which receives your birth details to compute your chart</li>
          <li>An AI provider, which receives your chart context and messages to generate your reading</li>
          <li>A speech provider, which converts a reading to audio when you tap “listen”</li>
        </ul>
        These providers are bound by contract to protect your data and not to reuse it.
      </Section>

      <Section title="Where your data is stored">
        We store personal data with the goal of keeping Indian users’ data in an India region. Some
        service providers may process data in other countries under appropriate safeguards.
      </Section>

      <Section title="Your rights">
        You can, at any time:
        <ul className="mt-2 list-disc space-y-1 pl-5 text-[var(--secondary)]">
          <li><strong>Access &amp; correct</strong> — edit your birth details in Profile.</li>
          <li><strong>Delete</strong> — use “Delete my data” in Profile to permanently erase your
            profile, chart, and sessions from our systems. This cannot be undone.</li>
          <li><strong>Withdraw consent</strong> — by deleting your data as above.</li>
        </ul>
        To raise a concern, contact our Grievance Officer at the email below.
      </Section>

      <Section title="Retention">
        We keep your data only while your account is active. When you delete your data, we remove it
        from our database; backups are purged on our normal rotation.
      </Section>

      <Section title="Security">
        Data is transmitted over encrypted connections and access is restricted. No method of storage
        or transmission is perfectly secure, but we take reasonable measures to protect your data.
      </Section>

      <Section title="Children">
        dotit is intended for adults (18+). We do not knowingly collect data from children. If you
        believe a child has provided us data, contact us and we will delete it.
      </Section>

      <Section title="Not professional advice">
        dotit offers reflective, personal guidance for self-understanding. It is not medical, legal,
        financial, or psychological advice. For health concerns, consult a qualified professional.
      </Section>

      <Section title="Changes">
        We may update this policy; we will revise the “last updated” date above and, for material
        changes, notify you in the app.
      </Section>

      <Section title="Contact">
        Surge Software Solutions Pvt Ltd, Bengaluru, India.<br />
        Grievance Officer / Privacy contact:{" "}
        <a className="underline" href="mailto:venumuvva@surgesoftware.co.in">venumuvva@surgesoftware.co.in</a>
      </Section>

      <p className="mt-12 text-sm text-[var(--faded)]">
        See also our <Link href="/terms" className="underline">Terms of Use</Link>.
      </p>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="font-serif-i text-xl">{title}</h2>
      <p className="mt-2 leading-relaxed text-[var(--secondary)]">{children}</p>
    </section>
  );
}
