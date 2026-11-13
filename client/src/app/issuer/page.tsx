
import Link from "next/link";

const documents = [
  {
    id: "DOC-001",
    name: "Degree Certificate",
    recipient: "Rahul Sharma",
    status: "Verified",
  },
  {
    id: "DOC-002",
    name: "Academic Transcript",
    recipient: "Priya Reddy",
    status: "Pending",
  },
  {
    id: "DOC-003",
    name: "Course Completion Certificate",
    recipient: "Arjun Kumar",
    status: "Verified",
  },
];

export default function IssuerPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <header className="flex items-center justify-between border-b border-slate-800 px-8 py-6">
        <h1 className="text-2xl font-bold text-blue-400">
          DocVerify
        </h1>
        <Link href="/" className="text-slate-300 hover:text-white">
          Back to Home
        </Link>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-12">
        <h2 className="text-3xl font-bold">Issuer Dashboard</h2>
        <p className="mt-2 text-slate-400">
          Manage and issue digital documents securely.
        </p>

        <div className="mt-10 grid gap-6 md:grid-cols-3">
          <StatCard title="Total Documents" value="3" />
          <StatCard title="Verified" value="2" />
          <StatCard title="Pending" value="1" />
        </div>

        <section className="mt-12 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h3 className="mb-5 text-xl font-semibold">
            Issue New Document
          </h3>

          <p className="mb-5 text-slate-400">
            Upload a document to begin the issuance process.
          </p>

          <Link
            href="/issuer/upload"
            className="inline-block rounded-lg bg-blue-600 px-6 py-3 font-medium hover:bg-blue-700"
          >
            + Upload Document
          </Link>
        </section>

        <section className="mt-10">
          <h3 className="mb-5 text-xl font-semibold">
            Recent Documents
          </h3>

          <div className="overflow-x-auto rounded-2xl border border-slate-800">
            <table className="w-full text-left">
              <thead className="bg-slate-800 text-slate-300">
                <tr>
                  <th className="p-4">Document ID</th>
                  <th className="p-4">Document</th>
                  <th className="p-4">Recipient</th>
                  <th className="p-4">Status</th>
                </tr>
              </thead>

              <tbody>
                {documents.map((doc) => (
                  <tr
                    key={doc.id}
                    className="border-t border-slate-800"
                  >
                    <td className="p-4">{doc.id}</td>
                    <td className="p-4">{doc.name}</td>
                    <td className="p-4">{doc.recipient}</td>
                    <td className="p-4">
                      <span
                        className={
                          doc.status === "Verified"
                            ? "text-green-400"
                            : "text-yellow-400"
                        }
                      >
                        {doc.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}

function StatCard({
  title,
  value,
}: {
  title: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
      <p className="text-sm text-slate-400">{title}</p>
      <h3 className="mt-3 text-3xl font-bold">{value}</h3>
    </div>
  );
}
