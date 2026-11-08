const express = require("express");
const { register, login } = require("../controllers/auth.controller");
const { verifyToken, requireRole } = require("../middlewares/auth.middleware");

const router = express.Router();

// Public authentication endpoints
router.post("/register", register);
router.post("/login", login);

// Protected session & RBAC verification endpoints
router.get("/me", verifyToken, (req, res) => {
  res.status(200).json({ user: req.user });
});

router.get("/issuer-only", verifyToken, requireRole("ISSUER"), (req, res) => {
  res.status(200).json({ message: "Authorized as ISSUER", user: req.user });
});

router.get("/verifier-only", verifyToken, requireRole("VERIFIER"), (req, res) => {
  res.status(200).json({ message: "Authorized as VERIFIER", user: req.user });
});

router.get("/citizen-only", verifyToken, requireRole("CITIZEN"), (req, res) => {
  res.status(200).json({ message: "Authorized as CITIZEN", user: req.user });
});

module.exports = router;

