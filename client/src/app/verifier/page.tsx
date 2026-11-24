"use client";

import { useState } from "react";
import Link from "next/link";

const API = process.env.NEXT_PUBLIC_API_URL || "https://doc-verify-api-3yb4.onrender.com";

export default function VerifierPage() {
  const [hash, setHash] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function request(path: string, body: unknown, isFile = false) {
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const headers: Record<string, string> = {
        "x-localtunnel-skip-warning": "true",
      };
      if (!isFile) {
        headers["Content-Type"] = "application/json";
      }

      const response = await fetch(`${API}${path}`, {
        method: "POST",
        headers,
        body: isFile ? (body as BodyInit) : JSON.stringify(body),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || data.error || JSON.stringify(data));
      setResult(data);
    } catch (e: unknown) {
      if (e instanceof Error) {
        setError(e.message);
      } else {
        setError("Could not connect to backend.");
      }
    } finally {
      setLoading(false);
    }
  }

  function verifyHash() {
    if (hash.trim()) request("/api/verify/hash", { hash: hash.trim() });
  }

  function verifyFile() {
    if (!file) return;
    const form = new FormData();
    form.append("document", file);
    request("/api/verify/file", form, true);
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <header className="flex justify-between border-b border-slate-800 px-8 py-6">
        <Link href="/" className="text-2xl font-bold text-blue-400">DocVerify</Link>
        <Link href="/" className="text-slate-300">Back to Home</Link>
      </header>

      <div className="mx-auto max-w-4xl px-6 py-12">
        <h1 className="text-3xl font-bold">Live Document Verification</h1>
        <p className="mt-3 text-slate-400">Verify documents against the backend, blockchain registry and AI forensic service.</p>

        <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-8">
          <h2 className="text-xl font-semibold">Verify by SHA-256 Hash</h2>
          <input value={hash} onChange={e => setHash(e.target.value)}
            placeholder="Paste document SHA-256 hash"
            className="mt-5 w-full rounded-lg border border-slate-700 bg-slate-800 p-4" />
          <button onClick={verifyHash} disabled={!hash.trim() || loading}
            className="mt-4 w-full rounded-lg bg-blue-600 p-4 font-semibold disabled:opacity-50">
            Verify Hash
          </button>
        </section>

        <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-8">
          <h2 className="text-xl font-semibold">Verify by Uploading a Document</h2>
          <input type="file" accept=".pdf,.jpg,.jpeg,.png"
            onChange={e => setFile(e.target.files?.[0] || null)}
            className="mt-5 block w-full text-slate-300" />
          {file && <p className="mt-3 text-sm text-green-400">Selected: {file.name}</p>}
          <button onClick={verifyFile} disabled={!file || loading}
            className="mt-4 w-full rounded-lg bg-blue-600 p-4 font-semibold disabled:opacity-50">
            Verify Uploaded File
          </button>
        </section>

        {loading && <p className="mt-6 text-blue-300">Checking backend, blockchain and AI service...</p>}
        {error && <pre className="mt-6 whitespace-pre-wrap rounded-xl border border-red-800 bg-red-950/30 p-5 text-red-300">{error}</pre>}

        {result ? (
          <section className="mt-8 rounded-2xl border border-green-800 bg-slate-900 p-6">
            <h2 className="text-xl font-bold text-green-400">Live Verification Response</h2>
            <pre className="mt-4 overflow-x-auto whitespace-pre-wrap break-words text-sm text-slate-200">
              {JSON.stringify(result, null, 2)}
            </pre>
          </section>
        ) : null}
      </div>
    </main>
  );
}
