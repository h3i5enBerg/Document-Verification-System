const crypto = require("crypto");
const { Readable } = require("stream");
const pinataSDK = require("@pinata/sdk");

const DEFAULT_IPFS_GATEWAY = "https://gateway.pinata.cloud/ipfs";

/**
 * Creates a configured Pinata SDK client using JWT or API key/secret credentials.
 */
function getPinataClient() {
  const pinataJwt = process.env.PINATA_JWT;
  const apiKey = process.env.PINATA_API_KEY;
  const apiSecret = process.env.PINATA_SECRET_API_KEY;

  if (pinataJwt) {
    return new pinataSDK({ pinataJWTKey: pinataJwt });
  }

  if (apiKey && apiSecret) {
    return new pinataSDK(apiKey, apiSecret);
  }

  throw new Error(
    "Pinata credentials missing. Set PINATA_JWT or PINATA_API_KEY and PINATA_SECRET_API_KEY in .env."
  );
}

/**
 * Pins a file buffer to IPFS via Pinata and returns the resulting CID string.
 * @param {Buffer} fileBuffer - Raw bytes of the file to upload.
 * @param {string} fileName - Original file name for Pinata metadata & multipart boundary.
 * @returns {Promise<string>} The IPFS CID (IpfsHash).
 */
async function pinFileToIPFS(fileBuffer, fileName) {
  if (!Buffer.isBuffer(fileBuffer) || fileBuffer.length === 0) {
    throw new Error("Invalid fileBuffer: expected a non-empty Buffer.");
  }
  if (!fileName || typeof fileName !== "string") {
    throw new Error("Invalid fileName: expected a non-empty string.");
  }

  if (process.env.IPFS_MOCK === "true") {
    const digest = crypto.createHash("sha256").update(fileBuffer).digest("hex").slice(0, 32);
    return `bafkreimock${digest}`;
  }

  const pinata = getPinataClient();
  const stream = Readable.from(fileBuffer);
  // form-data inside @pinata/sdk requires .path on Readable streams from buffers
  stream.path = fileName;

  const options = {
    pinataMetadata: {
      name: fileName,
    },
    pinataOptions: {
      cidVersion: 1,
    },
  };

  const result = await pinata.pinFileToIPFS(stream, options);
  if (!result || !result.IpfsHash) {
    throw new Error("Pinata upload succeeded without returning an IpfsHash.");
  }

  return result.IpfsHash;
}

/**
 * Builds a public or dedicated IPFS gateway URL for client consumption.
 * @param {string} cid - The IPFS content identifier.
 * @returns {string} Full gateway URL pointing to the pinned resource.
 */
function getIPFSUrl(cid) {
  if (!cid || typeof cid !== "string" || !cid.trim()) {
    throw new Error("Invalid CID: expected a non-empty string.");
  }

  const gateway = (process.env.PINATA_GATEWAY || DEFAULT_IPFS_GATEWAY).replace(/\/+$/, "");
  const cleanCid = cid.trim().replace(/^\/+/, "");
  return `${gateway}/${cleanCid}`;
}

module.exports = {
  pinFileToIPFS,
  getIPFSUrl,
};

