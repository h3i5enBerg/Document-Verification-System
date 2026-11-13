
"use client";

import { useRef, useState } from "react";
import Link from "next/link";

type DocumentRecord = {
  id: string;
  issuer: string;
  type: string;
  status: "Verified" | "Pending";
};

const demoDocuments: DocumentRecord[] = [
  {
    id: "DOC-001",
    issuer: "ADYPU University",
    type: "Degree Certificate",
    status: "Verified",
  },
  {
    id: "DOC-002",
    issuer: "HCU University",
    type: "Academic Transcript",
    status: "Pending",
  },
  {
    id: "DOC-003",
    issuer: "TTD Institute",
    type: "Course Certificate",
    status: "Verified",
  },
];

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const allowedTypes = ["application/pdf", "image/jpeg", "image/png"];

export default function VerifierPage() {
  const [documentId, setDocumentId] = useState("");
  const [result, setResult] = useState<DocumentRecord | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  function verifyDocument() {
    const found = demoDocuments.find(
      (doc) => doc.id === documentId.trim().toUpperCase()
    );

    setResult(found ?? null);
    setNotFound(!found);
    setUploadMessage("");
  }

  function handleFile(file: File | undefined) {
    if (!file) return;

    setFileError("");
    setUploadMessage("");
    setSelectedFile(null);

    if (!allowedTypes.includes(file.type)) {
      setFileError("Only PDF, JPG, and PNG files are supported.");
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setFileError("File size must be 10 MB or less.");
      return;
    }

    setSelectedFile(file);
  }

  function handleUploadVerification() {
    if (!selectedFile) return;

    setResult(null);
    setNotFound(false);
    setUploadMessage(
      "File selected successfully. Actual file verification will work after the backend and AI services are connected."
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <header className="flex items-center justify-between border-b border-slate-800 px-8 py-6">
        <Link href="/" className="text-2xl font-bold text-blue-400">
          DocVerify
        </Link>

        <Link href="/" className="text-slate-300 hover:text-white">
          Back to Home
        </Link>
      </header>

      <div className="mx-auto max-w-4xl px-6 py-12">
        <h1 className="text-3xl font-bold">Document Verification</h1>
        <p className="mt-3 text-slate-400">
          Verify the authenticity of digital documents.
        </p>

        <section className="mt-10 rounded-2xl border border-slate-800 bg-slate-900 p-8">
          <h2 className="mb-6 text-xl font-semibold">
            Verify Using Document ID
          </h2>

          <label className="mb-2 block text-sm text-slate-300">
            Document ID
          </label>

          <input
            type="text"
            value={documentId}
            onChange={(event) => setDocumentId(event.target.value)}
            placeholder="Enter Document ID (e.g. DOC-001)"
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-4 text-white outline-none focus:border-blue-500"
          />

          <button
            onClick={verifyDocument}
            disabled={!documentId.trim()}
            className="mt-6 w-full rounded-lg bg-blue-600 px-4 py-4 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Verify Document
          </button>
        </section>

        {result && (
          <section className="mt-6 rounded-xl border border-slate-700 bg-slate-900 p-6">
            <h2 className="text-xl font-semibold">Verification Result</h2>

            <p className="mt-4">Document ID: {result.id}</p>
            <p className="mt-2">Issuer: {result.issuer}</p>
            <p className="mt-2">Document Type: {result.type}</p>

            <p
              className={`mt-4 font-bold ${
                result.status === "Verified"
                  ? "text-green-400"
                  : "text-yellow-400"
              }`}
            >
              Demo Status: {result.status}
            </p>

            <p className="mt-3 text-xs text-slate-400">
              This is sample data, not a live blockchain verification.
            </p>
          </section>
        )}

        {notFound && (
          <div className="mt-6 rounded-xl border border-red-800 bg-red-950/30 p-5 text-red-300">
            No matching demo document was found.
          </div>
        )}

        <section className="mt-10 rounded-2xl border border-slate-800 bg-slate-900 p-8">
          <h2 className="text-xl font-semibold">
            Verify by Uploading a Document
          </h2>

          <p className="mt-2 text-sm text-slate-400">
            Select a PDF or image to prepare it for verification.
          </p>

          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            className="hidden"
            onChange={(event) => {
              handleFile(event.target.files?.[0]);
              event.target.value = "";
            }}
          />

          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              setIsDragging(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setIsDragging(false);
              handleFile(event.dataTransfer.files[0]);
            }}
            className={`mt-6 cursor-pointer rounded-xl border-2 border-dashed p-12 text-center transition ${
              isDragging
                ? "border-blue-400 bg-blue-950/30"
                : "border-slate-600 bg-slate-800/60 hover:border-blue-500"
            }`}
          >
            <div className="text-4xl">📄</div>

            <p className="mt-4 font-medium">
              {selectedFile
                ? selectedFile.name
                : "Drag and drop your document here"}
            </p>

            <p className="mt-2 text-sm text-slate-400">
              Or click to browse files
            </p>

            <p className="mt-4 text-xs text-slate-500">
              PDF, JPG, PNG — Maximum 10 MB
            </p>
          </div>

          {fileError && (
            <p className="mt-4 text-sm text-red-400">{fileError}</p>
          )}

          {selectedFile && (
            <p className="mt-4 text-sm text-green-400">
              File ready: {selectedFile.name}
            </p>
          )}

          <button
            onClick={handleUploadVerification}
            disabled={!selectedFile}
            className="mt-6 w-full rounded-lg bg-blue-600 px-4 py-4 font-semibold hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Verify Uploaded Document
          </button>

          {uploadMessage && (
            <p className="mt-5 rounded-lg border border-blue-800 bg-blue-950/30 p-4 text-sm text-blue-200">
              {uploadMessage}
            </p>
          )}
        </section>

        <section className="mt-10 rounded-xl border border-slate-800 p-6">
          <h3 className="font-semibold">Try Demo Documents</h3>

          <div className="mt-4 space-y-3">
            {demoDocuments.map((doc) => (
              <button
                key={doc.id}
                onClick={() => {
                  setDocumentId(doc.id);
                  setResult(doc);
                  setNotFound(false);
                  setUploadMessage("");
                }}
                className="block text-left text-sm text-slate-400 hover:text-blue-400"
              >
                {doc.id} — {doc.issuer} ({doc.status})
              </button>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
