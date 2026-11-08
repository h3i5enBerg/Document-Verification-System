/**
 * Automated verification script for Step 2 Auth, JWT, and RBAC endpoints.
 * Assumes PostgreSQL is reachable at DATABASE_URL, schema is pushed, and roles are seeded.
 *
 * Usage: node scripts/verify-auth.js
 */
require("dotenv").config();
const http = require("http");
const jwt = require("jsonwebtoken");
const app = require("../src/server");
const prisma = require("../src/config/prisma");

function request(server, method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const address = server.address();
    const payload = body ? JSON.stringify(body) : null;
    const headers = {
      "Content-Type": "application/json",
    };
    if (payload) {
      headers["Content-Length"] = Buffer.byteLength(payload);
    }
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: address.port,
        path,
        method,
        headers,
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode, body: data });
          }
        });
      }
    );

    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function run() {
  const server = app.listen(0);
  const runId = Date.now();

  const testUsers = [
    {
      role_id: 1,
      expectedRole: "ISSUER",
      email: `issuer.${runId}@example.com`,
      password: "Password123!",
      wallet_address: `0x111111111111111111111111111111${String(runId).slice(-10)}`,
    },
    {
      role_id: 2,
      expectedRole: "VERIFIER",
      email: `verifier.${runId}@example.com`,
      password: "Password123!",
      wallet_address: `0x222222222222222222222222222222${String(runId).slice(-10)}`,
    },
    {
      role_id: 3,
      expectedRole: "CITIZEN",
      email: `citizen.${runId}@example.com`,
      password: "Password123!",
      wallet_address: null,
    },
  ];

  const createdEmails = [];

  try {
    console.log("[verify-auth] 1. Checking /health endpoint...");
    const healthRes = await request(server, "GET", "/health");
    assert(healthRes.status === 200 && healthRes.body.status === "ok", "Health check failed");
    console.log("  -> OK:", healthRes.body);

    const tokens = {};

    for (const u of testUsers) {
      console.log(`[verify-auth] 2. Registering ${u.expectedRole}: ${u.email}`);
      const regRes = await request(server, "POST", "/api/auth/register", {
        email: u.email,
        password: u.password,
        role_id: u.role_id,
        wallet_address: u.wallet_address,
      });
      assert(regRes.status === 201, `Register failed for ${u.expectedRole}: ${JSON.stringify(regRes.body)}`);
      assert(regRes.body.user.role === u.expectedRole, "Returned role mismatch");
      createdEmails.push(u.email);

      console.log(`[verify-auth] 3. Logging in ${u.expectedRole}...`);
      const loginRes = await request(server, "POST", "/api/auth/login", {
        email: u.email,
        password: u.password,
      });
      assert(loginRes.status === 200 && loginRes.body.token, "Login failed to return JWT");

      const decoded = jwt.verify(loginRes.body.token, process.env.JWT_SECRET);
      assert(decoded.userId === regRes.body.user.id, "JWT userId mismatch");
      assert(decoded.email === u.email, "JWT email mismatch");
      assert(decoded.role === u.expectedRole, "JWT role mismatch");
      tokens[u.expectedRole] = loginRes.body.token;
      console.log(`  -> JWT verified for ${u.expectedRole} (userId=${decoded.userId})`);
    }

    console.log("[verify-auth] 4. Testing verifyToken & requireRole RBAC guards...");
    const noTokenRes = await request(server, "GET", "/api/auth/me");
    assert(noTokenRes.status === 401, "Expected 401 when missing token");

    const badTokenRes = await request(server, "GET", "/api/auth/me", null, "invalid.jwt.token");
    assert(badTokenRes.status === 401, "Expected 401 for invalid token");

    // ISSUER checks
    assert((await request(server, "GET", "/api/auth/issuer-only", null, tokens.ISSUER)).status === 200, "ISSUER should access /issuer-only");
    assert((await request(server, "GET", "/api/auth/verifier-only", null, tokens.ISSUER)).status === 403, "ISSUER must be blocked from /verifier-only");
    assert((await request(server, "GET", "/api/auth/citizen-only", null, tokens.ISSUER)).status === 403, "ISSUER must be blocked from /citizen-only");

    // VERIFIER checks
    assert((await request(server, "GET", "/api/auth/verifier-only", null, tokens.VERIFIER)).status === 200, "VERIFIER should access /verifier-only");
    assert((await request(server, "GET", "/api/auth/issuer-only", null, tokens.VERIFIER)).status === 403, "VERIFIER must be blocked from /issuer-only");

    // CITIZEN checks
    assert((await request(server, "GET", "/api/auth/citizen-only", null, tokens.CITIZEN)).status === 200, "CITIZEN should access /citizen-only");
    assert((await request(server, "GET", "/api/auth/issuer-only", null, tokens.CITIZEN)).status === 403, "CITIZEN must be blocked from /issuer-only");

    console.log("[verify-auth] ALL AUTH, JWT & RBAC CHECKS PASSED!");
  } finally {
    if (createdEmails.length > 0) {
      await prisma.user.deleteMany({
        where: { email: { in: createdEmails } },
      });
    }
    await prisma.$disconnect();
    server.close();
  }
}

run().catch((err) => {
  console.error("[verify-auth] FAILED:", err);
  process.exit(1);
});

