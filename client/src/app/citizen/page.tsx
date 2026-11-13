
"use client";

import { useState } from "react";
import Link from "next/link";

const documents = [
  {
    id: "DOC-001",
    name: "Degree Certificate",
    issuer: "ADYPU University",
    issued: "2026-10-12",
    status: "Verified",
  },
  {
    id: "DOC-002",
    name: "Academic Transcript",
    issuer: "HCU University",
    issued: "2026-10-20",
    status: "Pending",
  },
  {
    id: "DOC-003",
    name: "Course Certificate",
    issuer: "TT Institute",
    issued: "2026-11-01",
    status: "Verified",
  },
];

export default function CitizenPage() {
  const [search, setSearch] = useState("");

  const filteredDocuments = documents.filter((doc) =>
    `${doc.id} ${doc.name} ${doc.issuer}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

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
        <h2 className="text-3xl font-bold">Citizen Dashboard</h2>

        <p className="mt-2 text-slate-400">
          View and manage your digital documents.
        </p>

        <div className="mt-10 grid gap-6 md:grid-cols-3">
          <StatCard title="My Documents" value="3" />
          <StatCard title="Verified" value="2" />
          <StatCard title="Pending" value="1" />
        </div>

        <section className="mt-12 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h3 className="mb-5 text-xl font-semibold">
            My Documents
          </h3>

          <input
            type="text"
            placeholder="Search documents by name, ID, or issuer..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="mb-6 w-full rounded-lg border border-slate-700 bg-slate-800 p-3 outline-none focus:border-blue-500"
          />

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="border-b border-slate-700 text-slate-400">
                <tr>
                  <th className="p-4">Document ID</th>
                  <th className="p-4">Document</th>
                  <th className="p-4">Issued By</th>
                  <th className="p-4">Issue Date</th>
                  <th className="p-4">Status</th>
                </tr>
              </thead>

              <tbody>
                {filteredDocuments.map((doc) => (
                  <tr
                    key={doc.id}
                    className="border-b border-slate-800"
                  >
                    <td className="p-4">{doc.id}</td>
                    <td className="p-4">{doc.name}</td>
                    <td className="p-4">{doc.issuer}</td>
                    <td className="p-4">{doc.issued}</td>
                    <td className="p-4">
                      <span
                        className={
                          doc.status === "Verified"
                            ? "rounded-full bg-green-950 px-3 py-1 text-sm text-green-400"
                            : "rounded-full bg-yellow-950 px-3 py-1 text-sm text-yellow-400"
                        }
                      >
                        {doc.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {filteredDocuments.length === 0 && (
              <p className="py-8 text-center text-slate-400">
                No documents found.
              </p>
            )}
          </div>
        </section>

        <p className="mt-6 text-sm text-slate-500">
          Demo data only. Your actual documents will appear
          after backend integration.
        </p>
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
