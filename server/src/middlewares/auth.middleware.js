const jwt = require("jsonwebtoken");

const VALID_ROLES = ["ISSUER", "VERIFIER", "CITIZEN"];

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not configured in environment variables.");
  }
  return secret;
}

function decodeBearerUser(token) {
  const decoded = jwt.verify(token, getJwtSecret());
  return {
    userId: decoded.userId,
    email: decoded.email,
    role: decoded.role,
    walletAddress: decoded.walletAddress || null,
  };
}

/**
 * Validates JWT from the Authorization Bearer header and attaches req.user.
 */
function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      error: "Unauthorized",
      message: "Missing or malformed Authorization Bearer token.",
    });
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return res.status(401).json({
      error: "Unauthorized",
      message: "Authorization token cannot be empty.",
    });
  }

  try {
    req.user = decodeBearerUser(token);
    return next();
  } catch (err) {
    const message =
      err.name === "TokenExpiredError"
        ? "Authentication token has expired."
        : "Invalid authentication token.";
    return res.status(401).json({
      error: "Unauthorized",
      message,
    });
  }
}

/**
 * Optional authentication middleware: attaches req.user when a valid Bearer JWT
 * is supplied, or sets req.user = null for unauthenticated public requests.
 */
function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    req.user = null;
    return next();
  }

  if (!authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      error: "Unauthorized",
      message: "Malformed Authorization Bearer header.",
    });
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    req.user = null;
    return next();
  }

  try {
    req.user = decodeBearerUser(token);
    return next();
  } catch (err) {
    const message =
      err.name === "TokenExpiredError"
        ? "Authentication token has expired."
        : "Invalid authentication token.";
    return res.status(401).json({
      error: "Unauthorized",
      message,
    });
  }
}

/**
 * Role-based access control middleware restricting routes to specified roles
 * (ISSUER, VERIFIER, or CITIZEN).
 * @param {string|string[]} roles - Allowed role(s) for the route.
 */
function requireRole(roles) {
  const roleList = (Array.isArray(roles) ? roles : [roles]).map((r) =>
    String(r).toUpperCase()
  );

  for (const r of roleList) {
    if (!VALID_ROLES.includes(r)) {
      throw new Error(`Invalid RBAC role configured: ${r}`);
    }
  }

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "Authentication required before role verification.",
      });
    }

    const userRole = req.user.role ? String(req.user.role).toUpperCase() : "";
    if (!VALID_ROLES.includes(userRole) || !roleList.includes(userRole)) {
      return res.status(403).json({
        error: "Forbidden",
        message: `Access denied. Required role(s): ${roleList.join(", ")}.`,
      });
    }

    return next();
  };
}

module.exports = {
  verifyToken,
  optionalAuth,
  requireRole,
  VALID_ROLES,
};

