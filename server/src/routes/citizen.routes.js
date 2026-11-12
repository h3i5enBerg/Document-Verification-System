const express = require("express");
const { getMyDocuments, getDocumentById } = require("../controllers/citizen.controller");
const { verifyToken, requireRole } = require("../middlewares/auth.middleware");

const router = express.Router();

router.use(verifyToken, requireRole(["CITIZEN"]));

router.get("/my-documents", getMyDocuments);
router.get("/documents/:id", getDocumentById);

module.exports = router;

