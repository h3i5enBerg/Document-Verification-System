const crypto = require("crypto");
const prisma = require("../config/prisma");
const blockchainService = require("../services/blockchain.service");
const aiGatewayService = require("../services/aiGateway.service");
const ipfsService = require("../services/ipfs.service");

const HASH_HEX_REGEX = /^(0x)?([0-9a-fA-F]{64})$/;

function normalizeBytes32Hash(rawHash) {
  if (!rawHash || typeof rawHash !== "string") {
    return null;
  }
  const match = rawHash.trim().match(HASH_HEX_REGEX);
  if (!match) {
    return null;
  }
  return `0x${match[2].toLowerCase()}`;
}

function resolveCryptographicStatus(onChain) {
  if (!onChain.exists) {
    return "NOT_FOUND";
  }
  if (onChain.isRevoked) {
    return "REVOKED";
  }
  return "VALID";
}

async function findDocumentWithMetadata(docHash) {
  return prisma.document.findUnique({
    where: { sha256_hash: docHash },
    include: {
      doc_type: true,
      issuer: {
        select: {
          id: true,
          email: true,
          wallet_address: true,
          organization_profile: true,
        },
      },
      recipient: {
        select: {
          id: true,
          email: true,
          wallet_address: true,
        },
      },
    },
  });
}

function formatMetadata(dbDoc) {
  if (!dbDoc) {
    return null;
  }
  return {
    document_id: dbDoc.id,
    doc_type: dbDoc.doc_type,
    issuer: {
      id: dbDoc.issuer.id,
      email: dbDoc.issuer.email,
      wallet_address: dbDoc.issuer.wallet_address,
      organization_profile: dbDoc.issuer.organization_profile,
    },
    recipient: dbDoc.recipient,
    ipfs_cid: dbDoc.ipfs_cid,
    ipfs_url: ipfsService.getIPFSUrl(dbDoc.ipfs_cid),
    sha256_hash: dbDoc.sha256_hash,
    blockchain_tx_hash: dbDoc.blockchain_tx_hash,
    is_revoked: dbDoc.is_revoked,
    issued_at: dbDoc.issued_at,
  };
}

async function recordVerificationLog(dbDoc, user, status) {
  if (!user || !user.userId || !dbDoc) {
    return null;
  }
  return prisma.verificationLog.create({
    data: {
      document_id: dbDoc.id,
      verifier_id: user.userId,
      verification_status: status,
    },
  });
}

/**
 * POST /api/verify/hash
 * Verifies a document hash against DocumentRegistry on-chain and PostgreSQL metadata.
 */
async function verifyByHash(req, res, next) {
  try {
    const docHash = normalizeBytes32Hash(req.body?.hash);
    if (!docHash) {
      return res.status(400).json({
        error: "ValidationError",
        message: "A valid 64-character hex SHA-256 hash (with optional 0x prefix) is required.",
      });
    }

    const [onChainRecord, dbDoc] = await Promise.all([
      blockchainService.verifyDocumentOnChain(docHash),
      findDocumentWithMetadata(docHash),
    ]);

    const status = resolveCryptographicStatus(onChainRecord);
    const verificationLog = await recordVerificationLog(dbDoc, req.user, status);

    return res.status(200).json({
      status,
      on_chain_record: onChainRecord,
      metadata: formatMetadata(dbDoc),
      verification_log_id: verificationLog ? verificationLog.id : null,
      verified_at: verificationLog ? verificationLog.verified_at : new Date().toISOString(),
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /api/verify/file
 * Dual verification: computes SHA-256 hash + checks on-chain registry + runs AI forensics.
 */
async function verifyByFile(req, res, next) {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({
        error: "ValidationError",
        message: "Document file is required under field name 'document'.",
      });
    }

    const hashHex = crypto.createHash("sha256").update(req.file.buffer).digest("hex");
    const docHash = `0x${hashHex}`;

    const [onChainRecord, dbDoc, aiResult] = await Promise.all([
      blockchainService.verifyDocumentOnChain(docHash),
      findDocumentWithMetadata(docHash),
      aiGatewayService.analyzeDocument(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype
      ),
    ]);

    const cryptographicStatus = resolveCryptographicStatus(onChainRecord);
    const cryptographicValid = cryptographicStatus === "VALID";

    let overallVerdict = cryptographicStatus;
    if (cryptographicStatus === "NOT_FOUND") {
      overallVerdict = aiResult.tamper_detected ? "TAMPER_DETECTED" : "UNANCHORED";
    } else if (cryptographicStatus === "VALID" && aiResult.tamper_detected) {
      overallVerdict = "TAMPER_DETECTED";
    }

    const verificationLog = await recordVerificationLog(dbDoc, req.user, overallVerdict);

    return res.status(200).json({
      sha256_hash: docHash,
      cryptographic_status: cryptographicStatus,
      cryptographic_valid: cryptographicValid,
      ai_forensics: {
        tamper_detected: Boolean(aiResult.tamper_detected),
        ela_anomaly_score: aiResult.ela_anomaly_score ?? null,
        ocr_confidence: aiResult.ocr_confidence ?? 0,
        service_offline: Boolean(aiResult.service_offline),
      },
      overall_verdict: overallVerdict,
      on_chain_record: onChainRecord,
      metadata: formatMetadata(dbDoc),
      audit_logged: Boolean(verificationLog),
      verification_log_id: verificationLog ? verificationLog.id : null,
      verified_at: verificationLog ? verificationLog.verified_at : new Date().toISOString(),
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /api/verify/my-logs
 * Returns paginated verification audit logs executed by the authenticated VERIFIER.
 */
async function getVerifierLogs(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const skip = (page - 1) * limit;

    const where = { verifier_id: req.user.userId };

    const [total, logs] = await Promise.all([
      prisma.verificationLog.count({ where }),
      prisma.verificationLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { verified_at: "desc" },
        include: {
          document: {
            include: {
              doc_type: true,
              issuer: {
                select: {
                  id: true,
                  email: true,
                  wallet_address: true,
                  organization_profile: true,
                },
              },
            },
          },
        },
      }),
    ]);

    return res.status(200).json({
      data: logs,
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

module.exports = {
  verifyByHash,
  verifyByFile,
  getVerifierLogs,
};

