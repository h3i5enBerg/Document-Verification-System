
"use client";

import { useRef, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import Link from "next/link";

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [recipient, setRecipient] = useState("");
  const [documentType, setDocumentType] = useState("");
  const [message, setMessage] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(selectedFile?: File) {
    if (!selectedFile) return;

    const allowedTypes = [
      "application/pdf",
      "image/jpeg",
      "image/png",
    ];

    if (!allowedTypes.includes(selectedFile.type)) {
      setMessage("Only PDF, JPG and PNG files are allowed.");
      setFile(null);
      return;
    }

    if (selectedFile.size > 10 * 1024 * 1024) {
      setMessage("Maximum file size is 10 MB.");
      setFile(null);
      return;
    }

    setFile(selectedFile);
    setMessage("");
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    handleFile(event.dataTransfer.files[0]);
  }

  function handleInputChange(
    event: ChangeEvent<HTMLInputElement>
  ) {
    handleFile(event.target.files?.[0]);
  }

  function handleSubmit() {
    if (!file || !recipient.trim() || !documentType) {
      setMessage("Please complete all fields and select a file.");
      return;
    }

    setMessage(
      "Form validated successfully! Backend upload integration is pending."
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <header className="flex items-center justify-between border-b border-slate-800 px-8 py-6">
        <h1 className="text-2xl font-bold text-blue-400">
          DocVerify
        </h1>

        <Link
          href="/issuer"
          className="text-slate-300 hover:text-white"
        >
          Back to Dashboard
        </Link>
      </header>

      <div className="mx-auto max-w-3xl px-6 py-12">
        <h2 className="text-3xl font-bold">
          Issue New Document
        </h2>

        <p className="mt-2 text-slate-400">
          Enter document details and upload a file.
        </p>

        <div className="mt-10 rounded-2xl border border-slate-800 bg-slate-900 p-8">
          <label className="mb-2 block text-sm font-medium">
            Recipient Name
          </label>

          <input
            type="text"
            value={recipient}
            onChange={(event) => setRecipient(event.target.value)}
            placeholder="Enter recipient name"
            className="mb-6 w-full rounded-lg border border-slate-700 bg-slate-800 p-3 outline-none focus:border-blue-500"
          />

          <label className="mb-2 block text-sm font-medium">
            Document Type
          </label>

          <select
            value={documentType}
            onChange={(event) =>
              setDocumentType(event.target.value)
            }
            className="mb-8 w-full rounded-lg border border-slate-700 bg-slate-800 p-3"
          >
            <option value="">Select document type</option>
            <option value="Degree Certificate">
              Degree Certificate
            </option>
            <option value="Academic Transcript">
              Academic Transcript
            </option>
            <option value="Course Certificate">
              Course Certificate
            </option>
            <option value="Other">Other</option>
          </select>

          <div
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            className="cursor-pointer rounded-xl border-2 border-dashed border-slate-600 bg-slate-800/50 p-12 text-center transition hover:border-blue-500"
          >
            <div className="mb-4 text-5xl">📄</div>

            <p className="font-medium">
              Drag and drop your document here
            </p>

            <p className="mt-2 text-sm text-slate-400">
              Or click to browse files
            </p>

            <p className="mt-4 text-xs text-slate-500">
              PDF, JPG, PNG — Maximum 10 MB
            </p>

            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={handleInputChange}
              className="hidden"
            />
          </div>

          {file && (
            <div className="mt-5 rounded-lg border border-green-800 bg-green-950/30 p-4">
              <p className="font-medium text-green-400">
                File selected successfully
              </p>

              <p className="mt-2 break-all text-sm">
                {file.name}
              </p>

              <p className="text-sm text-slate-400">
                {(file.size / 1024 / 1024).toFixed(2)} MB
              </p>

              <button
                type="button"
                onClick={() => {
                  setFile(null);
                  if (inputRef.current) {
                    inputRef.current.value = "";
                  }
                }}
                className="mt-3 text-sm text-red-400 hover:text-red-300"
              >
                Remove file
              </button>
            </div>
          )}

          {message && (
            <p
              role="status"
              className="mt-5 text-sm text-yellow-400"
            >
              {message}
            </p>
          )}

          <button
            type="button"
            onClick={handleSubmit}
            className="mt-8 w-full rounded-lg bg-blue-600 py-3 font-semibold transition hover:bg-blue-700"
          >
            Submit Document
          </button>
        </div>
      </div>
    </main>
  );
}
