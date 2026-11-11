/**
 * Automated verification script for Step 4 Verifier Engine & Dual Verification APIs.
 *
 * Prerequisites:
 *   1. PostgreSQL running with schema pushed & seeded (npx prisma db seed).
 *   2. Local Hardhat node running on http://127.0.0.1:8545 with DocumentRegistry deployed
 *      (cd contracts && npx hardhat node & npm run deploy:local).
 *
 * Usage: npm run verify:validation
 */
require("dotenv").config();
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");
const app = require("../src/server");
const prisma = require("../src/config/prisma");
const blockchainService = require("../src/services/blockchain.service");

const HARDHAT_ADMIN_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function ensureIssuerAuthorizedOnChain() {
  const provider = blockchainService.getProvider();
  const address = blockchainService.getDeployedAddress();
  const abiPath = path.resolve(__dirname, "../../shared/abi/DocumentRegistry.json");
  const { abi } = JSON.parse(fs.readFileSync(abiPath, "utf8"));

  const issuerKey =
    process.env.BLOCKCHAIN_PRIVATE_KEY ||
    "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
  const issuerWallet = new ethers.Wallet(issuerKey, provider);
  const readContract = new ethers.Contract(address, abi, provider);

  const isAuthorized = await readContract.authorizedIssuers(issuerWallet.address);
  if (!isAuthorized) {
    const adminWallet = new ethers.Wallet(HARDHAT_ADMIN_KEY, provider);
    const adminContract = new ethers.Contract(address, abi, adminWallet);
    const tx = await adminContract.setIssuerStatus(issuerWallet.address, true);
    await tx.wait();
  }
}

async function loginUser(baseUrl, email, password) {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json();
  assert(res.status === 200 && body.token, `Login failed for ${email}: ${JSON.stringify(body)}`);
  return body.token;
}

async function run() {
  if (
    !process.env.PINATA_JWT &&
    (!process.env.PINATA_API_KEY || !process.env.PINATA_SECRET_API_KEY)
  ) {
    process.env.IPFS_MOCK = "true";
  }

  await ensureIssuerAuthorizedOnChain();

  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  let createdDocId = null;

  try {
    // 1. Issue a fresh valid mock document as seeded ISSUER
    console.log("[verify-validation] 1. Issuing fresh valid document via Step 3 pipeline...");
    const issuerToken = await loginUser(baseUrl, "issuer@university.edu", "IssuerPass123!");
    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const validPdfBytes = Buffer.from(
      `%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n% Valid Credential ${uniqueSuffix}\n%%EOF\n`,
      "utf8"
    );
    const validHash = `0x${crypto.createHash("sha256").update(validPdfBytes).digest("hex")}`;

    const issueForm = new FormData();
    issueForm.append(
      "document",
      new Blob([validPdfBytes], { type: "application/pdf" }),
      `credential-${uniqueSuffix}.pdf`
    );
    issueForm.append("recipient_email", "citizen@example.com");
    issueForm.append("doc_type_id", "1");

    const issueRes = await fetch(`${baseUrl}/api/documents/issue`, {
      method: "POST",
      headers: { Authorization: `Bearer ${issuerToken}` },
      body: issueForm,
    });
    const issueBody = await issueRes.json();
    assert(issueRes.status === 201, `Issue failed: ${JSON.stringify(issueBody)}`);
    createdDocId = issueBody.document.id;
    assert(issueBody.document.sha256_hash === validHash, "Issued hash mismatch");
    console.log("  -> Issued docId:", createdDocId, "hash:", validHash);

    // Log in as seeded VERIFIER
    const verifierToken = await loginUser(baseUrl, "verifier@corp.com", "VerifierPass123!");

    // 2. Verify by hash (public quick-check + authenticated verifier check)
    console.log("[verify-validation] 2. Verifying document by hash via POST /api/verify/hash...");
    const publicHashRes = await fetch(`${baseUrl}/api/verify/hash`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hash: validHash }),
    });
    const publicHashBody = await publicHashRes.json();
    assert(publicHashRes.status === 200, `Public verify/hash failed: ${JSON.stringify(publicHashBody)}`);
    assert(publicHashBody.status === "VALID", `Expected VALID, got ${publicHashBody.status}`);
    assert(publicHashBody.verification_log_id === null, "Public verify should not create user audit log");
    assert(publicHashBody.metadata?.document_id === createdDocId, "Metadata document_id mismatch");

    const authHashRes = await fetch(`${baseUrl}/api/verify/hash`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${verifierToken}`,
      },
      body: JSON.stringify({ hash: validHash }),
    });
    const authHashBody = await authHashRes.json();
    assert(authHashRes.status === 200 && authHashBody.status === "VALID", "Authenticated verify/hash failed");
    assert(Boolean(authHashBody.verification_log_id), "Authenticated verify/hash should record audit log");
    console.log("  -> POST /api/verify/hash returned VALID and logged audit id:", authHashBody.verification_log_id);

    // 3. Verify exact file upload via POST /api/verify/file
    console.log("[verify-validation] 3. Verifying exact file via POST /api/verify/file...");
    const validVerifyForm = new FormData();
    validVerifyForm.append(
      "document",
      new Blob([validPdfBytes], { type: "application/pdf" }),
      `credential-${uniqueSuffix}.pdf`
    );
    const validFileRes = await fetch(`${baseUrl}/api/verify/file`, {
      method: "POST",
      headers: { Authorization: `Bearer ${verifierToken}` },
      body: validVerifyForm,
    });
    const validFileBody = await validFileRes.json();
    assert(validFileRes.status === 200, `verify/file failed: ${JSON.stringify(validFileBody)}`);
    assert(validFileBody.cryptographic_valid === true, "Expected cryptographic_valid=true");
    assert(validFileBody.cryptographic_status === "VALID", "Expected cryptographic_status=VALID");
    assert(validFileBody.overall_verdict === "VALID", `Expected overall_verdict=VALID, got ${validFileBody.overall_verdict}`);
    assert(validFileBody.ai_forensics !== undefined, "Missing ai_forensics object");
    assert(validFileBody.audit_logged === true, "Expected audit_logged=true");
    console.log("  -> Exact file verification returned:", {
      cryptographic_status: validFileBody.cryptographic_status,
      overall_verdict: validFileBody.overall_verdict,
      ai_forensics: validFileBody.ai_forensics,
    });

    // 4. Tampered copy upload via POST /api/verify/file
    console.log("[verify-validation] 4. Uploading tampered bytes copy via POST /api/verify/file...");
    const tamperedPdfBytes = Buffer.from(
      `%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n% TAMPERED Credential ${uniqueSuffix}\n%%EOF\n`,
      "utf8"
    );
    const tamperedForm = new FormData();
    tamperedForm.append(
      "document",
      new Blob([tamperedPdfBytes], { type: "application/pdf" }),
      `tampered-${uniqueSuffix}.pdf`
    );
    const tamperedRes = await fetch(`${baseUrl}/api/verify/file`, {
      method: "POST",
      headers: { Authorization: `Bearer ${verifierToken}` },
      body: tamperedForm,
    });
    const tamperedBody = await tamperedRes.json();
    assert(tamperedRes.status === 200, `Tampered verify/file failed: ${JSON.stringify(tamperedBody)}`);
    assert(tamperedBody.cryptographic_valid === false, "Tampered file must have cryptographic_valid=false");
    assert(tamperedBody.cryptographic_status === "NOT_FOUND", `Expected NOT_FOUND, got ${tamperedBody.cryptographic_status}`);
    assert(
      tamperedBody.overall_verdict === "UNANCHORED" || tamperedBody.overall_verdict === "TAMPER_DETECTED",
      `Unexpected verdict for tampered file: ${tamperedBody.overall_verdict}`
    );
    console.log("  -> Tampered file detected as unanchored:", {
      cryptographic_status: tamperedBody.cryptographic_status,
      overall_verdict: tamperedBody.overall_verdict,
    });

    // 5. Fetch audit logs as verifier@corp.com via GET /api/verify/my-logs
    console.log("[verify-validation] 5. Checking GET /api/verify/my-logs audit trail...");
    const logsRes = await fetch(`${baseUrl}/api/verify/my-logs?page=1&limit=10`, {
      headers: { Authorization: `Bearer ${verifierToken}` },
    });
    const logsBody = await logsRes.json();
    assert(logsRes.status === 200, `GET /api/verify/my-logs failed: ${JSON.stringify(logsBody)}`);
    const matchingLogs = logsBody.data.filter((l) => l.document_id === createdDocId);
    assert(
      matchingLogs.length === 2,
      `Expected 2 verification_logs entries for docId=${createdDocId}, found ${matchingLogs.length}`
    );

    // RBAC check: ISSUER should receive 403 on GET /api/verify/my-logs
    const forbiddenLogsRes = await fetch(`${baseUrl}/api/verify/my-logs`, {
      headers: { Authorization: `Bearer ${issuerToken}` },
    });
    assert(
      forbiddenLogsRes.status === 403,
      `Expected 403 when ISSUER accesses /api/verify/my-logs, got ${forbiddenLogsRes.status}`
    );

    console.log("  -> Audit trail verified in PostgreSQL (entries:", matchingLogs.length, ") and RBAC enforced.");
    console.log("[verify-validation] ALL STEP 4 DUAL VERIFICATION CHECKS PASSED!");
  } finally {
    if (createdDocId) {
      await prisma.document.delete({ where: { id: createdDocId } }).catch(() => {});
    }
    await prisma.$disconnect();
    server.close();
  }
}

run().catch((err) => {
  console.error("[verify-validation] FAILED:", err);
  process.exit(1);
});

