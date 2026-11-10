const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

const ABI_PATH = path.resolve(__dirname, "../../../shared/abi/DocumentRegistry.json");
const DEPLOYMENTS_PATH = path.resolve(
  __dirname,
  "../../../shared/contracts/deployments.json"
);

function getContractAbi() {
  if (!fs.existsSync(ABI_PATH)) {
    throw new Error(`Contract ABI not found at ${ABI_PATH}. Run contract compilation first.`);
  }
  const artifact = JSON.parse(fs.readFileSync(ABI_PATH, "utf8"));
  if (!artifact.abi) {
    throw new Error(`Invalid ABI file at ${ABI_PATH}: missing "abi" field.`);
  }
  return artifact.abi;
}

function getDeployedAddress() {
  if (process.env.CONTRACT_ADDRESS) {
    return process.env.CONTRACT_ADDRESS.trim();
  }

  if (!fs.existsSync(DEPLOYMENTS_PATH)) {
    throw new Error(
      `Deployments file not found at ${DEPLOYMENTS_PATH}. Deploy DocumentRegistry first or set CONTRACT_ADDRESS.`
    );
  }

  const deployments = JSON.parse(fs.readFileSync(DEPLOYMENTS_PATH, "utf8"));
  const network = (process.env.BLOCKCHAIN_NETWORK || "localhost").trim();

  const address =
    deployments[network]?.DocumentRegistry?.address ||
    deployments.amoy?.DocumentRegistry?.address ||
    deployments.hardhat?.DocumentRegistry?.address;

  if (!address) {
    throw new Error(
      `DocumentRegistry address not found for network "${network}" in ${DEPLOYMENTS_PATH}.`
    );
  }

  return address;
}

function getProvider() {
  const rpcUrl =
    process.env.BLOCKCHAIN_RPC_URL ||
    process.env.AMOY_RPC_URL ||
    "http://127.0.0.1:8545";
  return new ethers.JsonRpcProvider(rpcUrl);
}

function getSigner(provider) {
  const rawKey = (
    process.env.BLOCKCHAIN_PRIVATE_KEY ||
    process.env.PRIVATE_KEY ||
    ""
  ).trim();

  if (!rawKey) {
    throw new Error(
      "Blockchain signer private key missing. Set BLOCKCHAIN_PRIVATE_KEY or PRIVATE_KEY in .env."
    );
  }

  const formattedKey = rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`;
  return new ethers.Wallet(formattedKey, provider);
}

function getReadOnlyContract() {
  const provider = getProvider();
  const address = getDeployedAddress();
  const abi = getContractAbi();
  return new ethers.Contract(address, abi, provider);
}

function getWritableContract() {
  const provider = getProvider();
  const signer = getSigner(provider);
  const address = getDeployedAddress();
  const abi = getContractAbi();
  return new ethers.Contract(address, abi, signer);
}

/**
 * Anchors a document hash, recipient address, and IPFS CID on-chain via DocumentRegistry.issueDocument.
 * @param {string} docHashBytes32 - 0x-prefixed 32-byte hex string.
 * @param {string} recipientAddress - Ethereum wallet address of recipient.
 * @param {string} ipfsCID - Pinned IPFS content identifier.
 * @returns {Promise<import("ethers").TransactionReceipt>} Mined transaction receipt.
 */
async function issueDocumentOnChain(docHashBytes32, recipientAddress, ipfsCID) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(docHashBytes32)) {
    throw new Error(`Invalid docHashBytes32 format: ${docHashBytes32}`);
  }
  if (!ethers.isAddress(recipientAddress)) {
    throw new Error(`Invalid recipient Ethereum address: ${recipientAddress}`);
  }
  if (!ipfsCID || typeof ipfsCID !== "string") {
    throw new Error("Invalid ipfsCID: expected non-empty string.");
  }

  const contract = getWritableContract();
  const tx = await contract.issueDocument(docHashBytes32, recipientAddress, ipfsCID);
  const receipt = await tx.wait();
  return receipt;
}

/**
 * Queries DocumentRegistry.verifyDocument view method on-chain.
 * @param {string} docHashBytes32 - 0x-prefixed 32-byte hex string.
 * @returns {Promise<{exists: boolean, issuer: string, recipient: string, ipfsCID: string, timestamp: number, isRevoked: boolean}>}
 */
async function verifyDocumentOnChain(docHashBytes32) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(docHashBytes32)) {
    throw new Error(`Invalid docHashBytes32 format: ${docHashBytes32}`);
  }

  const contract = getReadOnlyContract();
  const [exists, issuer, recipient, ipfsCID, timestamp, isRevoked] =
    await contract.verifyDocument(docHashBytes32);

  return {
    exists: Boolean(exists),
    issuer,
    recipient,
    ipfsCID,
    timestamp: Number(timestamp),
    isRevoked: Boolean(isRevoked),
  };
}

/**
 * Revokes an issued document on-chain via DocumentRegistry.revokeDocument.
 * Only the configured original issuer signer can revoke.
 * @param {string} docHashBytes32 - 0x-prefixed 32-byte hex string.
 * @returns {Promise<{txHash: string, blockNumber: number}>}
 */
async function revokeDocumentOnChain(docHashBytes32) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(docHashBytes32)) {
    throw new Error(`Invalid docHashBytes32 format: ${docHashBytes32}`);
  }

  const contract = getWritableContract();
  const tx = await contract.revokeDocument(docHashBytes32);
  const receipt = await tx.wait();
  return {
    txHash: receipt.hash,
    blockNumber: receipt.blockNumber,
  };
}

module.exports = {
  issueDocumentOnChain,
  revokeDocumentOnChain,
  verifyDocumentOnChain,
  getDeployedAddress,
  getProvider,
};

