const express = require("express");
const {
  verifyByHash,
  verifyByFile,
  getVerifierLogs,
} = require("../controllers/verify.controller");
const {
  verifyToken,
  optionalAuth,
  requireRole,
} = require("../middlewares/auth.middleware");
const upload = require("../middlewares/upload.middleware");

const router = express.Router();

// Public quick-check or authenticated audit-logged verification
router.post("/hash", optionalAuth, verifyByHash);
router.post("/file", optionalAuth, upload.single("document"), verifyByFile);

// Protected VERIFIER audit log history
router.get("/my-logs", verifyToken, requireRole(["VERIFIER"]), getVerifierLogs);

module.exports = router;

