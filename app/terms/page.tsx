import Link from "next/link";

export const metadata = {
  title: "Terms of Use — dotit",
  description: "The terms that govern your use of dotit.",
};

const UPDATED = "15 June 2026";

export default function Terms() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12 text-[var(--text)]">
      <Link href="/" className="text-sm text-[var(--faded)] hover:text-[var(--secondary)]">← Back to dotit</Link>
      <h1 className="mt-6 font-serif-i text-3xl">Terms of Use</h1>
      <p className="mt-2 text-sm text-[var(--faded)]">Last updated: {UPDATED}</p>

      <Section title="Agreement">
        These Terms govern your use of dotit, operated by <strong>Surge Software Solutions Pvt Ltd</strong>
        (“we”, “us”). By using the app you agree to these Terms. If you do not agree, please do not use dotit.
      </Section>

      <Section title="What dotit is">
        dotit gives reflective, plain-language insight based on the details you provide. It is intended
        for self-understanding and entertainment. It is <strong>not</strong> a substitute for professional
        medical, legal, financial, psychological, or other advice, and it does not predict the future with
        certainty. Decisions you make are your own responsibility.
      </Section>

      <Section title="Eligibility">
        You must be at least 18 years old to use dotit. By using it you confirm that you are.
      </Section>

      <Section title="Your account and data">
        You are responsible for the accuracy of the details you enter and for keeping access to your
        email secure. You can edit or delete your data at any time from your Profile. Our handling of
        your data is described in the <Link href="/privacy" className="underline">Privacy Policy</Link>.
      </Section>

      <Section title="Acceptable use">
        Do not misuse the app, attempt to disrupt or reverse-engineer the service, or use it to harm
        others. We may suspend access that violates these Terms or applicable law.
      </Section>

      <Section title="No guarantees">
        The app is provided “as is”. We do not warrant that readings are accurate, complete, or fit for
        any particular purpose, and to the maximum extent permitted by law we are not liable for any loss
        arising from your reliance on them. Nothing here limits liability that cannot be limited by law.
      </Section>

      <Section title="Health, crisis, and safety">
        dotit is not a medical or mental-health service. If you are in distress or crisis, please contact
        a qualified professional or your local emergency services or helpline.
      </Section>

      <Section title="Changes">
        We may update these Terms; we will revise the “last updated” date and, for material changes,
        notify you in the app. Continued use after changes means you accept them.
      </Section>

      <Section title="Governing law">
        These Terms are governed by the laws of India, with courts at Bengaluru having jurisdiction.
      </Section>

      <Section title="Contact">
        Surge Software Solutions Pvt Ltd, Bengaluru, India —{" "}
        <a className="underline" href="mailto:venumuvva@surgesoftware.co.in">venumuvva@surgesoftware.co.in</a>
      </Section>

      <p className="mt-12 text-sm text-[var(--faded)]">
        See also our <Link href="/privacy" className="underline">Privacy Policy</Link>.
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
