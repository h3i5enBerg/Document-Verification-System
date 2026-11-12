/**
 * Automated end-to-end lifecycle verification script for Step 5:
 * Issuance -> Citizen Locker -> Verifier VALID -> Issuer Revocation -> Verifier REVOKED.
 *
 * Prerequisites:
 *   1. PostgreSQL running with schema pushed & seeded (npx prisma db seed).
 *   2. Local Hardhat node running on http://127.0.0.1:8545 with DocumentRegistry deployed.
 *
 * Usage: npm run verify:step5
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

async function registerAndLoginTempUser(baseUrl, email, password, roleId) {
  const regRes = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, role_id: roleId }),
  });
  const regBody = await regRes.json();
  assert(regRes.status === 201, `Temp register failed for ${email}: ${JSON.stringify(regBody)}`);
  return loginUser(baseUrl, email, password);
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
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  let createdDocId = null;
  const tempEmails = [];

  try {
    // 1. Log in as issuer@university.edu and issue mock certificate to citizen@example.com
    console.log("[verify-step5] 1. Issuing mock certificate as issuer@university.edu...");
    const issuerToken = await loginUser(baseUrl, "issuer@university.edu", "IssuerPass123!");
    const certBuffer = Buffer.from(
      `%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n% Step 5 Lifecycle Cert ${runId}\n%%EOF\n`,
      "utf8"
    );
    const certHash = `0x${crypto.createHash("sha256").update(certBuffer).digest("hex")}`;

    const issueForm = new FormData();
    issueForm.append(
      "document",
      new Blob([certBuffer], { type: "application/pdf" }),
      `lifecycle-${runId}.pdf`
    );
    issueForm.append("recipient_email", "citizen@example.com");
    issueForm.append("doc_type_id", "1");

    const issueRes = await fetch(`${baseUrl}/api/documents/issue`, {
      method: "POST",
      headers: { Authorization: `Bearer ${issuerToken}` },
      body: issueForm,
    });
    const issueBody = await issueRes.json();
    assert(issueRes.status === 201, `Issuance failed: ${JSON.stringify(issueBody)}`);
    createdDocId = issueBody.document.id;
    assert(issueBody.document.sha256_hash === certHash, "Hash mismatch");
    console.log("  -> Issued docId:", createdDocId);

    // 2. Citizen Locker verification
    console.log("[verify-step5] 2. Testing Citizen Locker endpoints as citizen@example.com...");
    const citizenToken = await loginUser(baseUrl, "citizen@example.com", "CitizenPass123!");

    const myDocsRes = await fetch(`${baseUrl}/api/citizen/my-documents?page=1&limit=10`, {
      headers: { Authorization: `Bearer ${citizenToken}` },
    });
    const myDocsBody = await myDocsRes.json();
    assert(myDocsRes.status === 200, `my-documents failed: ${JSON.stringify(myDocsBody)}`);
    const foundDoc = myDocsBody.data.find((d) => d.id === createdDocId);
    assert(foundDoc, "Issued document missing from /api/citizen/my-documents");
    assert(foundDoc.ipfs_url && foundDoc.ipfs_url.includes(foundDoc.ipfs_cid), "Invalid ipfs_url");
    assert(foundDoc.doc_type && foundDoc.issuer, "Missing doc_type or issuer metadata");

    const docDetailRes = await fetch(`${baseUrl}/api/citizen/documents/${createdDocId}`, {
      headers: { Authorization: `Bearer ${citizenToken}` },
    });
    const docDetailBody = await docDetailRes.json();
    assert(docDetailRes.status === 200, `documents/:id failed: ${JSON.stringify(docDetailBody)}`);
    assert(docDetailBody.document.id === createdDocId, "Detail document ID mismatch");
    assert(docDetailBody.verification.status === "VALID", "Expected citizen doc verification VALID");

    // Cross-user access rejection (another CITIZEN receives 403)
    const otherCitizenEmail = `other.citizen.${runId}@example.com`;
    tempEmails.push(otherCitizenEmail);
    const otherCitizenToken = await registerAndLoginTempUser(
      baseUrl,
      otherCitizenEmail,
      "Password123!",
      3
    );
    const crossAccessRes = await fetch(`${baseUrl}/api/citizen/documents/${createdDocId}`, {
      headers: { Authorization: `Bearer ${otherCitizenToken}` },
    });
    assert(
      crossAccessRes.status === 403,
      `Expected 403 on cross-citizen access, got ${crossAccessRes.status}`
    );
    console.log("  -> Citizen Locker endpoints & 403 ownership check passed.");

    // 3. Verifier checks document before revocation -> VALID
    console.log("[verify-step5] 3. Verifier checking document via POST /api/verify/hash...");
    const verifierToken = await loginUser(baseUrl, "verifier@corp.com", "VerifierPass123!");
    const preRevokeVerifyRes = await fetch(`${baseUrl}/api/verify/hash`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${verifierToken}`,
      },
      body: JSON.stringify({ hash: certHash }),
    });
    const preRevokeBody = await preRevokeVerifyRes.json();
    assert(preRevokeVerifyRes.status === 200 && preRevokeBody.status === "VALID", "Expected VALID before revoke");
    console.log("  -> Pre-revocation verification status: VALID");

    // 4. Issuer revocation pipeline
    console.log("[verify-step5] 4. Testing document revocation via POST /api/documents/revoke...");
    const otherIssuerEmail = `other.issuer.${runId}@university.edu`;
    tempEmails.push(otherIssuerEmail);
    const otherIssuerToken = await registerAndLoginTempUser(
      baseUrl,
      otherIssuerEmail,
      "Password123!",
      1
    );

    const unauthRevokeRes = await fetch(`${baseUrl}/api/documents/revoke`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${otherIssuerToken}`,
      },
      body: JSON.stringify({ hash: certHash }),
    });
    assert(
      unauthRevokeRes.status === 403,
      `Expected 403 for non-owner issuer revoke, got ${unauthRevokeRes.status}`
    );

    const revokeRes = await fetch(`${baseUrl}/api/documents/revoke`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${issuerToken}`,
      },
      body: JSON.stringify({ document_id: createdDocId }),
    });
    const revokeBody = await revokeRes.json();
    assert(revokeRes.status === 200, `Expected 200 on revoke, got ${revokeRes.status}: ${JSON.stringify(revokeBody)}`);
    assert(revokeBody.hash === certHash && revokeBody.txHash, "Missing hash or txHash in revoke response");

    const dupRevokeRes = await fetch(`${baseUrl}/api/documents/revoke`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${issuerToken}`,
      },
      body: JSON.stringify({ hash: certHash }),
    });
    assert(
      dupRevokeRes.status === 400,
      `Expected 400 on duplicate revocation, got ${dupRevokeRes.status}`
    );
    console.log("  -> Revocation succeeded (txHash:", revokeBody.txHash, ") & duplicate 400 verified.");

    // 5. Verifier checks revoked document via hash & file -> REVOKED
    console.log("[verify-step5] 5. Verifier checking revoked document via /hash and /file...");
    const postRevokeHashRes = await fetch(`${baseUrl}/api/verify/hash`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${verifierToken}`,
      },
      body: JSON.stringify({ hash: certHash }),
    });
    const postRevokeHashBody = await postRevokeHashRes.json();
    assert(
      postRevokeHashRes.status === 200 && postRevokeHashBody.status === "REVOKED",
      `Expected REVOKED from /api/verify/hash, got ${postRevokeHashBody.status}`
    );

    const fileVerifyForm = new FormData();
    fileVerifyForm.append(
      "document",
      new Blob([certBuffer], { type: "application/pdf" }),
      `lifecycle-${runId}.pdf`
    );
    const postRevokeFileRes = await fetch(`${baseUrl}/api/verify/file`, {
      method: "POST",
      headers: { Authorization: `Bearer ${verifierToken}` },
      body: fileVerifyForm,
    });
    const postRevokeFileBody = await postRevokeFileRes.json();
    assert(
      postRevokeFileRes.status === 200 &&
        postRevokeFileBody.cryptographic_status === "REVOKED" &&
        postRevokeFileBody.cryptographic_valid === false &&
        postRevokeFileBody.overall_verdict === "REVOKED",
      `Expected REVOKED from /api/verify/file, got ${JSON.stringify(postRevokeFileBody)}`
    );
    console.log("  -> Both /api/verify/hash and /api/verify/file returned REVOKED.");
    console.log("[verify-step5] ALL STEP 5 LIFECYCLE CHECKS PASSED!");
  } finally {
    if (createdDocId) {
      await prisma.document.delete({ where: { id: createdDocId } }).catch(() => {});
    }
    if (tempEmails.length > 0) {
      await prisma.user.deleteMany({ where: { email: { in: tempEmails } } }).catch(() => {});
    }
    await prisma.$disconnect();
    server.close();
  }
}

run().catch((err) => {
  console.error("[verify-step5] FAILED:", err);
  process.exit(1);
});

