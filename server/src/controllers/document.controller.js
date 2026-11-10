const crypto = require("crypto");
const { ethers } = require("ethers");
const prisma = require("../config/prisma");
const aiGatewayService = require("../services/aiGateway.service");
const ipfsService = require("../services/ipfs.service");
const blockchainService = require("../services/blockchain.service");

/**
 * POST /api/documents/issue
 * Issues a document: hashes buffer, prevents duplicates, runs AI check,
 * pins to IPFS, anchors on-chain, and persists Document + AiAnalysisLog atomically.
 */
async function issueDocument(req, res, next) {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({
        error: "ValidationError",
        message: "Document file is required under field name 'document'.",
      });
    }

    const { recipient_email, recipient_id, recipient_address, doc_type_id } = req.body;

    const parsedDocTypeId = Number(doc_type_id);
    if (!Number.isInteger(parsedDocTypeId) || parsedDocTypeId <= 0) {
      return res.status(400).json({
        error: "ValidationError",
        message: "A valid positive integer doc_type_id is required.",
      });
    }

    if (!recipient_id && !recipient_email) {
      return res.status(400).json({
        error: "ValidationError",
        message: "Either recipient_id or recipient_email is required.",
      });
    }

    const docType = await prisma.documentType.findUnique({
      where: { id: parsedDocTypeId },
    });
    if (!docType) {
      return res.status(400).json({
        error: "ValidationError",
        message: `DocumentType with id=${parsedDocTypeId} does not exist.`,
      });
    }

    const recipient = await prisma.user.findUnique({
      where: recipient_id
        ? { id: String(recipient_id).trim() }
        : { email: String(recipient_email).trim().toLowerCase() },
    });
    if (!recipient) {
      return res.status(404).json({
        error: "NotFound",
        message: "Recipient user not found.",
      });
    }

    const targetWallet = (recipient_address || recipient.wallet_address || "").trim();
    if (!targetWallet || !ethers.isAddress(targetWallet)) {
      return res.status(400).json({
        error: "ValidationError",
        message:
          "Recipient must have a valid Ethereum wallet_address or a valid recipient_address must be provided.",
      });
    }

    // 3. Calculate SHA-256 hash formatted as bytes32 (0x-prefixed 64 hex chars)
    const hashHex = crypto.createHash("sha256").update(req.file.buffer).digest("hex");
    const docHashBytes32 = `0x${hashHex}`;

    // 4. Duplicate checks in PostgreSQL and on-chain
    const existingDoc = await prisma.document.findUnique({
      where: { sha256_hash: docHashBytes32 },
    });
    if (existingDoc) {
      return res.status(409).json({
        error: "Conflict",
        message: "A document with this SHA-256 hash has already been issued in the database.",
        existingDocumentId: existingDoc.id,
      });
    }

    const onChainStatus = await blockchainService.verifyDocumentOnChain(docHashBytes32);
    if (onChainStatus.exists) {
      return res.status(409).json({
        error: "Conflict",
        message: "A document with this SHA-256 hash is already anchored on-chain.",
      });
    }

    // 5. Run AI OCR & tampering check (falls back gracefully if AI service is offline)
    const aiResult = await aiGatewayService.analyzeDocument(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype
    );

    // 6. Pin document bytes to IPFS
    const ipfsCid = await ipfsService.pinFileToIPFS(
      req.file.buffer,
      req.file.originalname
    );

    // 7. Anchor hash, recipient, and CID on-chain
    const receipt = await blockchainService.issueDocumentOnChain(
      docHashBytes32,
      targetWallet,
      ipfsCid
    );

    // 8. Persist Document and AiAnalysisLog in a single Prisma transaction
    const { document, aiLog } = await prisma.$transaction(async (tx) => {
      const createdDoc = await tx.document.create({
        data: {
          doc_type_id: parsedDocTypeId,
          issuer_id: req.user.userId,
          recipient_id: recipient.id,
          ipfs_cid: ipfsCid,
          sha256_hash: docHashBytes32,
          blockchain_tx_hash: receipt.hash,
          is_revoked: false,
        },
      });

      const createdAiLog = await tx.aiAnalysisLog.create({
        data: {
          document_id: createdDoc.id,
          ocr_confidence: aiResult.ocr_confidence ?? 0,
          tamper_detected: Boolean(aiResult.tamper_detected),
          ela_anomaly_score: aiResult.ela_anomaly_score ?? null,
        },
      });

      return { document: createdDoc, aiLog: createdAiLog };
    });

    return res.status(201).json({
      message: "Document issued and anchored successfully.",
      document: {
        id: document.id,
        sha256_hash: document.sha256_hash,
        ipfs_cid: document.ipfs_cid,
        ipfs_url: ipfsService.getIPFSUrl(document.ipfs_cid),
        blockchain_tx_hash: document.blockchain_tx_hash,
        issued_at: document.issued_at,
        is_revoked: document.is_revoked,
      },
      ai_analysis: {
        id: aiLog.id,
        ocr_confidence: Number(aiLog.ocr_confidence),
        tamper_detected: aiLog.tamper_detected,
        ela_anomaly_score:
          aiLog.ela_anomaly_score !== null ? Number(aiLog.ela_anomaly_score) : null,
        service_offline: Boolean(aiResult.service_offline),
      },
    });
  } catch (err) {
    if (err.code === "P2002") {
      return res.status(409).json({
        error: "Conflict",
        message: "A document with this SHA-256 hash already exists.",
      });
    }
    return next(err);
  }
}

/**
 * GET /api/documents/my-issued
 * Returns paginated documents issued by the authenticated ISSUER with latest status.
 */
async function getIssuerDocuments(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const skip = (page - 1) * limit;

    const where = { issuer_id: req.user.userId };

    const [total, documents] = await Promise.all([
      prisma.document.count({ where }),
      prisma.document.findMany({
        where,
        skip,
        take: limit,
        orderBy: { issued_at: "desc" },
        include: {
          doc_type: true,
          recipient: {
            select: {
              id: true,
              email: true,
              wallet_address: true,
            },
          },
          ai_analysis_logs: {
            orderBy: { analyzed_at: "desc" },
            take: 1,
          },
          verification_logs: {
            orderBy: { verified_at: "desc" },
            take: 1,
          },
        },
      }),
    ]);

    const items = documents.map((doc) => ({
      id: doc.id,
      doc_type: doc.doc_type,
      recipient: doc.recipient,
      sha256_hash: doc.sha256_hash,
      ipfs_cid: doc.ipfs_cid,
      ipfs_url: ipfsService.getIPFSUrl(doc.ipfs_cid),
      blockchain_tx_hash: doc.blockchain_tx_hash,
      is_revoked: doc.is_revoked,
      status: doc.is_revoked ? "REVOKED" : "ACTIVE",
      issued_at: doc.issued_at,
      latest_ai_analysis: doc.ai_analysis_logs[0] || null,
      latest_verification: doc.verification_logs[0] || null,
    }));

    return res.status(200).json({
      data: items,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /api/documents/revoke
 * Revokes an issued document on-chain and updates is_revoked in PostgreSQL.
 * Payload: { hash: "0x..." } or { document_id: "..." }
 */
async function revokeDocument(req, res, next) {
  try {
    const { hash, document_id } = req.body || {};

    if (!hash && !document_id) {
      return res.status(400).json({
        error: "ValidationError",
        message: "Provide either 'hash' or 'document_id' to revoke a document.",
      });
    }

    let where;
    if (document_id) {
      where = { id: String(document_id).trim() };
    } else {
      const match = String(hash).trim().match(/^(0x)?([0-9a-fA-F]{64})$/);
      if (!match) {
        return res.status(400).json({
          error: "ValidationError",
          message: "Invalid hash format (expected 64-character hex string).",
        });
      }
      where = { sha256_hash: `0x${match[2].toLowerCase()}` };
    }

    const doc = await prisma.document.findUnique({ where });
    if (!doc) {
      return res.status(404).json({
        error: "NotFound",
        message: "Document not found.",
      });
    }

    if (doc.issuer_id !== req.user.userId) {
      return res.status(403).json({
        error: "Forbidden",
        message: "Only the original issuer can revoke this document.",
      });
    }

    const onChainRecord = await blockchainService.verifyDocumentOnChain(doc.sha256_hash);
    if (doc.is_revoked || onChainRecord.isRevoked) {
      return res.status(400).json({
        error: "BadRequest",
        message: "Document is already revoked.",
      });
    }

    const { txHash, blockNumber } = await blockchainService.revokeDocumentOnChain(
      doc.sha256_hash
    );

    const updated = await prisma.document.update({
      where: { id: doc.id },
      data: { is_revoked: true },
    });

    return res.status(200).json({
      message: "Document revoked successfully",
      hash: updated.sha256_hash,
      txHash,
      blockNumber,
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  issueDocument,
  getIssuerDocuments,
  revokeDocument,
};

