
import Link from "next/link";
import ConnectWallet from "@/components/ConnectWallet";

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      {/* Navigation */}
      <nav className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 px-8 py-6">
        <h1 className="text-2xl font-bold text-blue-400">
          DocVerify
        </h1>

        <ConnectWallet />
      </nav>

      {/* Welcome Section */}
      <section className="mx-auto max-w-6xl px-6 py-20 text-center">
        <h2 className="mb-5 text-4xl font-bold">
          Automated Document Verification System
        </h2>

        <p className="mx-auto mb-12 max-w-2xl text-slate-400">
          A secure platform for issuing, managing, and verifying
          documents using Blockchain and Artificial Intelligence.
        </p>

        {/* Portal Cards */}
        <div className="grid gap-6 md:grid-cols-3">
          <PortalCard
            title="Issuer Portal"
            description="Issue and manage digital documents securely."
            href="/issuer"
            icon="🏢"
          />

          <PortalCard
            title="Citizen Portal"
            description="Access your documents and check their status."
            href="/citizen"
            icon="👤"
          />

          <PortalCard
            title="Verifier Portal"
            description="Verify document authenticity and detect fraud."
            href="/verifier"
            icon="🛡️"
          />
        </div>

        {/* Platform Information */}
        <section className="mt-20">
          <h3 className="mb-8 text-2xl font-bold">
            Why Choose DocVerify?
          </h3>

          <div className="grid gap-6 text-left md:grid-cols-3">
            <FeatureCard
              icon="🔗"
              title="Blockchain Security"
              description="Designed to use blockchain records for tamper-resistant document verification."
            />

            <FeatureCard
              icon="🤖"
              title="AI-Powered Detection"
              description="Designed to detect potentially forged or altered documents using AI."
            />

            <FeatureCard
              icon="⚡"
              title="Fast Verification"
              description="A simple interface for checking document authenticity and verification status."
            />
          </div>
        </section>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-800 px-6 py-8 text-center text-sm text-slate-500">
        © 2026 DocVerify. All rights reserved.
        <p className="mt-2">
          Blockchain & AI-Based Document Verification Platform
        </p>
      </footer>
    </main>
  );
}

function PortalCard({
  title,
  description,
  href,
  icon,
}: {
  title: string;
  description: string;
  href: string;
  icon: string;
}) {
  return (
    <div className="flex flex-col rounded-2xl border border-slate-800 bg-slate-900 p-8 text-left transition duration-300 hover:-translate-y-1 hover:border-blue-500 hover:shadow-lg hover:shadow-blue-950/30">
      <div className="mb-5 text-4xl">{icon}</div>

      <h3 className="mb-3 text-xl font-semibold">
        {title}
      </h3>

<p className="mb-8 grow text-sm leading-6 text-slate-400">
        {description}
      </p>

      <Link
        href={href}
        className="inline-block rounded-lg bg-blue-600 px-5 py-3 text-center font-medium transition hover:bg-blue-700"
      >
        Open Portal →
      </Link>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
      <div className="mb-4 text-3xl">{icon}</div>

      <h4 className="mb-3 text-lg font-semibold">
        {title}
      </h4>

      <p className="text-sm leading-6 text-slate-400">
        {description}
      </p>
    </div>
  );
}
