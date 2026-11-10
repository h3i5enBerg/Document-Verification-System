const express = require("express");
const {
  issueDocument,
  getIssuerDocuments,
  revokeDocument,
} = require("../controllers/document.controller");
const { verifyToken, requireRole } = require("../middlewares/auth.middleware");
const upload = require("../middlewares/upload.middleware");

const router = express.Router();

router.post(
  "/issue",
  verifyToken,
  requireRole(["ISSUER"]),
  upload.single("document"),
  issueDocument
);

router.post(
  "/revoke",
  verifyToken,
  requireRole(["ISSUER"]),
  revokeDocument
);

router.get(
  "/my-issued",
  verifyToken,
  requireRole(["ISSUER"]),
  getIssuerDocuments
);

module.exports = router;

