/**
 * Automated verification script for Step 3 Document Issuance & On-Chain Anchoring pipeline.
 *
 * Prerequisites:
 *   1. PostgreSQL running (docker compose up -d) with schema pushed & seeded (npx prisma db seed).
 *   2. Local Hardhat node running on http://127.0.0.1:8545 with DocumentRegistry deployed
 *      (cd contracts && npx hardhat node & npm run deploy:local).
 *
 * Usage: node scripts/verify-issue.js
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
    console.log(
      `[verify-issue] Authorizing issuer ${issuerWallet.address} via admin account...`
    );
    const adminWallet = new ethers.Wallet(HARDHAT_ADMIN_KEY, provider);
    const adminContract = new ethers.Contract(address, abi, adminWallet);
    const tx = await adminContract.setIssuerStatus(issuerWallet.address, true);
    await tx.wait();
    console.log("[verify-issue] Issuer authorized on-chain.");
  }
}

async function run() {
  if (!process.env.PINATA_JWT && (!process.env.PINATA_API_KEY || !process.env.PINATA_SECRET_API_KEY)) {
    console.log("[verify-issue] Pinata credentials not set; enabling IPFS_MOCK=true for local test.");
    process.env.IPFS_MOCK = "true";
  }

  await ensureIssuerAuthorizedOnChain();

  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  let createdDocId = null;

  try {
    // 1. Login as seeded ISSUER
    console.log("[verify-issue] 1. Logging in as seeded ISSUER (issuer@university.edu)...");
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "issuer@university.edu",
        password: "IssuerPass123!",
      }),
    });
    const loginBody = await loginRes.json();
    assert(loginRes.status === 200 && loginBody.token, `Login failed: ${JSON.stringify(loginBody)}`);
    const token = loginBody.token;
    console.log("  -> Logged in. UserId:", loginBody.user.userId);

    // 2. Generate mock certificate PDF buffer
    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const mockPdfContent = `%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n% Mock Certificate ${uniqueSuffix}\n%%EOF\n`;
    const fileBuffer = Buffer.from(mockPdfContent, "utf8");
    const expectedHash = `0x${crypto.createHash("sha256").update(fileBuffer).digest("hex")}`;
    console.log("[verify-issue] 2. Generated mock PDF buffer. SHA-256:", expectedHash);

    // 3. Send multipart request to POST /api/documents/issue
    console.log("[verify-issue] 3. Sending multipart POST /api/documents/issue...");
    const formData = new FormData();
    formData.append(
      "document",
      new Blob([fileBuffer], { type: "application/pdf" }),
      `certificate-${uniqueSuffix}.pdf`
    );
    formData.append("recipient_email", "citizen@example.com");
    formData.append("doc_type_id", "1");

    const issueRes = await fetch(`${baseUrl}/api/documents/issue`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    const issueBody = await issueRes.json();
    assert(
      issueRes.status === 201,
      `Expected HTTP 201, got ${issueRes.status}: ${JSON.stringify(issueBody)}`
    );
    createdDocId = issueBody.document.id;
    console.log("  -> 201 Created:", {
      id: issueBody.document.id,
      sha256_hash: issueBody.document.sha256_hash,
      ipfs_cid: issueBody.document.ipfs_cid,
      blockchain_tx_hash: issueBody.document.blockchain_tx_hash,
      ai_service_offline: issueBody.ai_analysis.service_offline,
    });

    // 4a. Assert response hash matches computed hash
    assert(
      issueBody.document.sha256_hash === expectedHash,
      `Hash mismatch: expected ${expectedHash}, got ${issueBody.document.sha256_hash}`
    );

    // 4b. Assert PostgreSQL documents and ai_analysis_logs entries
    const dbDoc = await prisma.document.findUnique({
      where: { id: createdDocId },
      include: { ai_analysis_logs: true },
    });
    assert(dbDoc !== null, "Document row missing in PostgreSQL");
    assert(dbDoc.sha256_hash === expectedHash, "DB sha256_hash mismatch");
    assert(dbDoc.ipfs_cid === issueBody.document.ipfs_cid, "DB ipfs_cid mismatch");
    assert(dbDoc.blockchain_tx_hash === issueBody.document.blockchain_tx_hash, "DB tx hash mismatch");
    assert(dbDoc.ai_analysis_logs.length === 1, "AiAnalysisLog row missing in PostgreSQL");
    console.log("  -> PostgreSQL documents & ai_analysis_logs verified.");

    // 4c. Assert on-chain record matches computed hash
    const onChain = await blockchainService.verifyDocumentOnChain(expectedHash);
    assert(onChain.exists === true, "Document not found on-chain");
    assert(onChain.ipfsCID === issueBody.document.ipfs_cid, "On-chain ipfsCID mismatch");
    assert(onChain.isRevoked === false, "Expected on-chain isRevoked to be false");
    console.log("  -> On-chain DocumentRegistry record verified:", onChain);

    // 5. Verify GET /api/documents/my-issued pagination
    const listRes = await fetch(`${baseUrl}/api/documents/my-issued?page=1&limit=5`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const listBody = await listRes.json();
    assert(listRes.status === 200, `Expected 200 on my-issued, got ${listRes.status}`);
    assert(
      listBody.data.some((d) => d.id === createdDocId),
      "Issued document missing from /api/documents/my-issued"
    );
    console.log("  -> GET /api/documents/my-issued verified.");

    // 6. Verify duplicate hash prevention (409 Conflict)
    const dupFormData = new FormData();
    dupFormData.append(
      "document",
      new Blob([fileBuffer], { type: "application/pdf" }),
      `certificate-${uniqueSuffix}.pdf`
    );
    dupFormData.append("recipient_email", "citizen@example.com");
    dupFormData.append("doc_type_id", "1");

    const dupRes = await fetch(`${baseUrl}/api/documents/issue`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: dupFormData,
    });
    assert(dupRes.status === 409, `Expected 409 for duplicate document, got ${dupRes.status}`);
    console.log("  -> Duplicate hash rejection (409) verified.");

    console.log("[verify-issue] ALL STEP 3 DOCUMENT ISSUANCE CHECKS PASSED!");
  } finally {
    if (createdDocId) {
      await prisma.document.delete({ where: { id: createdDocId } }).catch(() => {});
    }
    await prisma.$disconnect();
    server.close();
  }
}

run().catch((err) => {
  console.error("[verify-issue] FAILED:", err);
  process.exit(1);
});

