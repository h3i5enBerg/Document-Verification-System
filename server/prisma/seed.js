const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const roles = [
    { role_id: 1, name: "ISSUER" },
    { role_id: 2, name: "VERIFIER" },
    { role_id: 3, name: "CITIZEN" },
  ];

  for (const role of roles) {
    await prisma.role.upsert({
      where: { name: role.name },
      update: {},
      create: role,
    });
  }

  const docTypes = [
    { name: "Degree Certificate", validity_period_days: null },
    { name: "Academic Transcript", validity_period_days: null },
    { name: "Identity Credential", validity_period_days: 3650 },
  ];

  for (const dt of docTypes) {
    await prisma.documentType.upsert({
      where: { name: dt.name },
      update: {},
      create: dt,
    });
  }

  // Seed default development users (Hardhat deterministic addresses)
  const devUsers = [
    {
      email: "issuer@university.edu",
      password: "IssuerPass123!",
      role_id: 1,
      wallet_address: "0x70997970c51812dc3a010c7d01b50e0d17dc79c8",
    },
    {
      email: "verifier@corp.com",
      password: "VerifierPass123!",
      role_id: 2,
      wallet_address: "0x90f79bf6eb2c4f870365e785982e1f101e93b906",
    },
    {
      email: "citizen@example.com",
      password: "CitizenPass123!",
      role_id: 3,
      wallet_address: "0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc",
    },
  ];

  for (const u of devUsers) {
    const password_hash = await bcrypt.hash(u.password, 10);
    await prisma.user.upsert({
      where: { email: u.email },
      update: {
        role_id: u.role_id,
        wallet_address: u.wallet_address,
      },
      create: {
        email: u.email,
        password_hash,
        role_id: u.role_id,
        wallet_address: u.wallet_address,
      },
    });
  }

  const seededRoles = await prisma.role.findMany({ orderBy: { role_id: "asc" } });
  const seededDocTypes = await prisma.documentType.findMany({ orderBy: { id: "asc" } });
  console.log("[seed] Seeded roles:", seededRoles);
  console.log("[seed] Seeded document types:", seededDocTypes);
  console.log("[seed] Seeded dev users: issuer@university.edu, verifier@corp.com, citizen@example.com");
}

main()
  .catch((err) => {
    console.error("[seed] Error seeding database:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
