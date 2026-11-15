/**
 * Automated verification script for Step 3:
 * Document Issuance & On-Chain Anchoring.
 *
 * Prerequisites:
 * 1. PostgreSQL running and database seeded.
 * 2. Local Hardhat node running on http://127.0.0.1:8545.
 * 3. DocumentRegistry deployed.
 * 4. AI service running on http://localhost:8000.
 *
 * Usage:
 * npm run verify:issue
 */

require("dotenv").config();

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

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

  const abiPath = path.resolve(
    __dirname,
    "../../shared/abi/DocumentRegistry.json",
  );

  const { abi } = JSON.parse(fs.readFileSync(abiPath, "utf8"));

  const issuerKey =
    process.env.BLOCKCHAIN_PRIVATE_KEY ||
    "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

  const issuerWallet = new ethers.Wallet(issuerKey, provider);
  const readContract = new ethers.Contract(address, abi, provider);

  const isAuthorized = await readContract.authorizedIssuers(
    issuerWallet.address,
  );

  if (!isAuthorized) {
    console.log(`[verify-issue] Authorizing issuer ${issuerWallet.address}...`);

    const adminWallet = new ethers.Wallet(HARDHAT_ADMIN_KEY, provider);
    const adminContract = new ethers.Contract(address, abi, adminWallet);

    const tx = await adminContract.setIssuerStatus(issuerWallet.address, true);

    await tx.wait();

    console.log("[verify-issue] Issuer authorized on-chain.");
  }
}

async function generateMockCertificate() {
  const uniqueSuffix = `${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  page.drawText("MOCK UNIVERSITY CERTIFICATE", {
    x: 50,
    y: 700,
    size: 20,
    font,
    color: rgb(0, 0, 0),
  });

  page.drawText(`Certificate ID: ${uniqueSuffix}`, {
    x: 50,
    y: 660,
    size: 12,
    font,
  });

  page.drawText("This document is generated for local testing.", {
    x: 50,
    y: 630,
    size: 12,
    font,
  });

  const fileBuffer = Buffer.from(await pdfDoc.save());

  const expectedHash = `0x${crypto
    .createHash("sha256")
    .update(fileBuffer)
    .digest("hex")}`;

  return {
    fileBuffer,
    uniqueSuffix,
    expectedHash,
  };
}

async function run() {
  if (
    !process.env.PINATA_JWT &&
    (!process.env.PINATA_API_KEY || !process.env.PINATA_SECRET_API_KEY)
  ) {
    console.log(
      "[verify-issue] Pinata credentials not set; enabling IPFS_MOCK=true.",
    );

    process.env.IPFS_MOCK = "true";
  }

  await ensureIssuerAuthorizedOnChain();

  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  let createdDocId = null;

  try {
    // STEP 1: Login as seeded ISSUER.

    console.log("[verify-issue] 1. Logging in as seeded ISSUER...");

    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: "issuer@university.edu",
        password: "IssuerPass123!",
      }),
    });

    const loginBody = await loginRes.json();

    assert(
      loginRes.status === 200 && loginBody.token,
      `Login failed: ${JSON.stringify(loginBody)}`,
    );

    const token = loginBody.token;

    console.log("  -> Login successful.");

    // STEP 2: Generate a valid PDF certificate.

    const { fileBuffer, uniqueSuffix, expectedHash } =
      await generateMockCertificate();

    console.log(
      "[verify-issue] 2. Generated valid PDF. SHA-256:",
      expectedHash,
    );

    // STEP 3: Issue document.

    console.log("[verify-issue] 3. Sending POST /api/documents/issue...");

    const formData = new FormData();

    formData.append(
      "document",
      new Blob([fileBuffer], {
        type: "application/pdf",
      }),
      `certificate-${uniqueSuffix}.pdf`,
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
      `Expected HTTP 201, received ${issueRes.status}: ${JSON.stringify(
        issueBody,
      )}`,
    );

    createdDocId = issueBody.document.id;

    console.log("  -> Document issued:", {
      id: issueBody.document.id,
      sha256_hash: issueBody.document.sha256_hash,
      ipfs_cid: issueBody.document.ipfs_cid,
      blockchain_tx_hash: issueBody.document.blockchain_tx_hash,
      ai_service_offline: issueBody.ai_analysis.service_offline,
      ocr_confidence: issueBody.ai_analysis.ocr_confidence,
      extracted_text: issueBody.ai_analysis.extracted_text,
      tamper_detected: issueBody.ai_analysis.tamper_detected,
    });

    // STEP 4: Verify document hash.

    assert(
      issueBody.document.sha256_hash === expectedHash,
      "Document SHA-256 hash does not match the uploaded PDF.",
    );

    console.log("  -> SHA-256 hash verified.");

    // STEP 5: Verify AI service response.

    assert(
      issueBody.ai_analysis.service_offline === false,
      "AI service is offline or returned fallback data.",
    );

    assert(
      issueBody.ai_analysis.ocr_confidence > 0,
      "OCR confidence should be greater than zero.",
    );

    assert(
      typeof issueBody.ai_analysis.extracted_text === "string" &&
        issueBody.ai_analysis.extracted_text.trim().length > 0,
      "OCR extracted_text is missing from the API response.",
    );

    assert(
      issueBody.ai_analysis.extracted_text.includes(
        "MOCK UNIVERSITY CERTIFICATE",
      ),
      "OCR response does not contain the expected certificate text.",
    );

    console.log("  -> AI service and OCR response verified.");

    // STEP 6: Verify PostgreSQL records.

    const dbDoc = await prisma.document.findUnique({
      where: {
        id: createdDocId,
      },
      include: {
        ai_analysis_logs: true,
      },
    });

    assert(dbDoc !== null, "Document row missing from PostgreSQL.");

    assert(
      dbDoc.sha256_hash === expectedHash,
      "PostgreSQL document hash mismatch.",
    );

    assert(
      dbDoc.ipfs_cid === issueBody.document.ipfs_cid,
      "PostgreSQL IPFS CID mismatch.",
    );

    assert(
      dbDoc.blockchain_tx_hash === issueBody.document.blockchain_tx_hash,
      "PostgreSQL blockchain transaction hash mismatch.",
    );

    assert(
      dbDoc.ai_analysis_logs.length === 1,
      "AI analysis log missing from PostgreSQL.",
    );

    console.log("  -> PostgreSQL documents and ai_analysis_logs verified.");

    // STEP 7: Verify on-chain record.

    const onChain = await blockchainService.verifyDocumentOnChain(expectedHash);

    assert(onChain.exists === true, "Document not found on the blockchain.");

    assert(
      onChain.ipfsCID === issueBody.document.ipfs_cid,
      "On-chain IPFS CID mismatch.",
    );

    assert(
      onChain.isRevoked === false,
      "Newly issued document should not be revoked.",
    );

    console.log("  -> On-chain DocumentRegistry record verified:", onChain);

    // STEP 8: Verify issuer document listing.

    const listRes = await fetch(
      `${baseUrl}/api/documents/my-issued?page=1&limit=5`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );

    const listBody = await listRes.json();

    assert(
      listRes.status === 200,
      `Expected HTTP 200 from my-issued, received ${listRes.status}.`,
    );

    assert(
      listBody.data.some((doc) => doc.id === createdDocId),
      "Issued document missing from my-issued endpoint.",
    );

    console.log("  -> GET /api/documents/my-issued verified.");

    // STEP 9: Verify duplicate hash prevention.

    const duplicateFormData = new FormData();

    duplicateFormData.append(
      "document",
      new Blob([fileBuffer], {
        type: "application/pdf",
      }),
      `certificate-${uniqueSuffix}.pdf`,
    );

    duplicateFormData.append("recipient_email", "citizen@example.com");

    duplicateFormData.append("doc_type_id", "1");

    const duplicateRes = await fetch(`${baseUrl}/api/documents/issue`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: duplicateFormData,
    });

    assert(
      duplicateRes.status === 409,
      `Expected HTTP 409 for duplicate document, received ${duplicateRes.status}.`,
    );

    console.log("  -> Duplicate hash rejection (409) verified.");

    console.log("\n[verify-issue] ALL STEP 3 DOCUMENT ISSUANCE CHECKS PASSED!");
  } finally {
    if (createdDocId) {
      await prisma.document
        .delete({
          where: {
            id: createdDocId,
          },
        })
        .catch(() => {});
    }

    await prisma.$disconnect();

    server.close();
  }
}

run().catch((err) => {
  console.error("[verify-issue] FAILED:", err);
  process.exit(1);
});
