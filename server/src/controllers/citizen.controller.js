const prisma = require("../config/prisma");
const ipfsService = require("../services/ipfs.service");
const blockchainService = require("../services/blockchain.service");

function buildOwnershipWhere(user) {
  if (user.walletAddress) {
    return {
      OR: [
        { recipient_id: user.userId },
        {
          recipient: {
            wallet_address: user.walletAddress.toLowerCase(),
          },
        },
      ],
    };
  }
  return { recipient_id: user.userId };
}

function isOwnedByCitizen(doc, user) {
  if (doc.recipient_id === user.userId) {
    return true;
  }
  if (
    user.walletAddress &&
    doc.recipient?.wallet_address &&
    doc.recipient.wallet_address.toLowerCase() === user.walletAddress.toLowerCase()
  ) {
    return true;
  }
  return false;
}

function formatCitizenDocument(doc) {
  return {
    id: doc.id,
    doc_type: doc.doc_type,
    issuer: {
      id: doc.issuer.id,
      email: doc.issuer.email,
      wallet_address: doc.issuer.wallet_address,
      organization_profile: doc.issuer.organization_profile,
    },
    sha256_hash: doc.sha256_hash,
    ipfs_cid: doc.ipfs_cid,
    ipfs_url: ipfsService.getIPFSUrl(doc.ipfs_cid),
    blockchain_tx_hash: doc.blockchain_tx_hash,
    is_revoked: doc.is_revoked,
    status: doc.is_revoked ? "REVOKED" : "ACTIVE",
    issued_at: doc.issued_at,
    ai_analysis_log: doc.ai_analysis_logs?.[0] || null,
  };
}

/**
 * GET /api/citizen/my-documents
 * Returns paginated documents issued to the authenticated CITIZEN.
 */
async function getMyDocuments(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const skip = (page - 1) * limit;

    const where = buildOwnershipWhere(req.user);

    const [total, documents] = await Promise.all([
      prisma.document.count({ where }),
      prisma.document.findMany({
        where,
        skip,
        take: limit,
        orderBy: { issued_at: "desc" },
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
          ai_analysis_logs: {
            orderBy: { analyzed_at: "desc" },
            take: 1,
          },
        },
      }),
    ]);

    return res.status(200).json({
      data: documents.map(formatCitizenDocument),
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
 * GET /api/citizen/documents/:id
 * Returns full metadata, IPFS URL, and on-chain verification payload for a citizen-owned document.
 */
async function getDocumentById(req, res, next) {
  try {
    const { id } = req.params;

    const doc = await prisma.document.findUnique({
      where: { id },
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
        ai_analysis_logs: {
          orderBy: { analyzed_at: "desc" },
          take: 1,
        },
      },
    });

    if (!doc) {
      return res.status(404).json({
        error: "NotFound",
        message: "Document not found.",
      });
    }

    if (!isOwnedByCitizen(doc, req.user)) {
      return res.status(403).json({
        error: "Forbidden",
        message: "You do not have permission to access this document.",
      });
    }

    const onChainRecord = await blockchainService.verifyDocumentOnChain(doc.sha256_hash);
    const verificationStatus = !onChainRecord.exists
      ? "NOT_FOUND"
      : onChainRecord.isRevoked || doc.is_revoked
      ? "REVOKED"
      : "VALID";

    return res.status(200).json({
      document: {
        ...formatCitizenDocument(doc),
        recipient: doc.recipient,
      },
      verification: {
        status: verificationStatus,
        on_chain_record: onChainRecord,
      },
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getMyDocuments,
  getDocumentById,
};

