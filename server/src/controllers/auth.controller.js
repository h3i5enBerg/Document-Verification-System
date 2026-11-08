const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const prisma = require("../config/prisma");

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ETH_ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/;

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not configured in environment variables.");
  }
  return secret;
}

/**
 * POST /api/auth/register
 * Registers a new user with validated email, bcrypt password hash, role_id, and optional wallet_address.
 */
async function register(req, res, next) {
  try {
    const { email, password, role_id, wallet_address } = req.body;

    if (!email || typeof email !== "string" || !EMAIL_REGEX.test(email.trim())) {
      return res.status(400).json({
        error: "ValidationError",
        message: "A valid email address is required.",
      });
    }

    if (!password || typeof password !== "string" || password.length < 6) {
      return res.status(400).json({
        error: "ValidationError",
        message: "Password must be at least 6 characters long.",
      });
    }

    const parsedRoleId = Number(role_id);
    if (!Number.isInteger(parsedRoleId) || parsedRoleId <= 0) {
      return res.status(400).json({
        error: "ValidationError",
        message: "A valid positive integer role_id is required.",
      });
    }

    let normalizedWallet = null;
    if (wallet_address !== undefined && wallet_address !== null && wallet_address !== "") {
      if (typeof wallet_address !== "string" || !ETH_ADDRESS_REGEX.test(wallet_address.trim())) {
        return res.status(400).json({
          error: "ValidationError",
          message: "wallet_address must be a valid Ethereum address (0x followed by 40 hex chars).",
        });
      }
      normalizedWallet = wallet_address.trim().toLowerCase();
    }

    const normalizedEmail = email.trim().toLowerCase();

    const roleRecord = await prisma.role.findUnique({
      where: { role_id: parsedRoleId },
    });
    if (!roleRecord) {
      return res.status(400).json({
        error: "ValidationError",
        message: `Role with role_id=${parsedRoleId} does not exist.`,
      });
    }

    const existingEmail = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (existingEmail) {
      return res.status(409).json({
        error: "Conflict",
        message: "An account with this email already exists.",
      });
    }

    if (normalizedWallet) {
      const existingWallet = await prisma.user.findUnique({
        where: { wallet_address: normalizedWallet },
      });
      if (existingWallet) {
        return res.status(409).json({
          error: "Conflict",
          message: "An account with this wallet_address already exists.",
        });
      }
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        password_hash: passwordHash,
        role_id: parsedRoleId,
        wallet_address: normalizedWallet,
      },
      include: {
        role: true,
      },
    });

    return res.status(201).json({
      message: "User registered successfully.",
      user: {
        id: user.id,
        email: user.email,
        role_id: user.role_id,
        role: user.role.name,
        wallet_address: user.wallet_address,
        created_at: user.created_at,
      },
    });
  } catch (err) {
    if (err.code === "P2002") {
      return res.status(409).json({
        error: "Conflict",
        message: "A user with that email or wallet_address already exists.",
      });
    }
    return next(err);
  }
}

/**
 * POST /api/auth/login
 * Verifies password hash and issues JWT with { userId, email, role, walletAddress }.
 */
async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    if (!email || typeof email !== "string" || !password || typeof password !== "string") {
      return res.status(400).json({
        error: "ValidationError",
        message: "Email and password are required.",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: { role: true },
    });

    if (!user) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "Invalid email or password.",
      });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "Invalid email or password.",
      });
    }

    const payload = {
      userId: user.id,
      email: user.email,
      role: user.role.name,
      walletAddress: user.wallet_address,
    };

    const token = jwt.sign(payload, getJwtSecret(), {
      expiresIn: process.env.JWT_EXPIRES_IN || "24h",
    });

    return res.status(200).json({
      message: "Login successful.",
      token,
      user: payload,
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  register,
  login,
};

