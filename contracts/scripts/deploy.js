const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

function validateAmoyEnv() {
  const rpcUrl = process.env.AMOY_RPC_URL ? process.env.AMOY_RPC_URL.trim() : "";
  const rawKey = process.env.PRIVATE_KEY ? process.env.PRIVATE_KEY.trim() : "";
  const formattedKey = rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`;

  if (!rpcUrl) {
    throw new Error("Missing AMOY_RPC_URL in contracts/.env");
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(formattedKey)) {
    throw new Error(
      "Missing or invalid PRIVATE_KEY in contracts/.env (expected 64 hex characters)"
    );
  }
}

function updateDeploymentRecord(networkName, record) {
  const deploymentsDir = path.resolve(__dirname, "../../shared/contracts");
  const deploymentsFile = path.join(deploymentsDir, "deployments.json");

  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  let deployments = {};
  if (fs.existsSync(deploymentsFile)) {
    try {
      const existing = fs.readFileSync(deploymentsFile, "utf8");
      deployments = existing.trim() ? JSON.parse(existing) : {};
    } catch (err) {
      console.warn(
        `[deploy] Warning: Could not parse existing deployments.json, overwriting: ${err.message}`
      );
      deployments = {};
    }
  }

  deployments[networkName] = {
    ...(deployments[networkName] || {}),
    DocumentRegistry: record,
  };

  fs.writeFileSync(deploymentsFile, JSON.stringify(deployments, null, 2) + "\n", "utf8");
  return deploymentsFile;
}

async function main() {
  const networkName = hre.network.name;

  if (networkName === "amoy") {
    validateAmoyEnv();
  }

  const [deployer] = await hre.ethers.getSigners();
  if (!deployer) {
    throw new Error(
      `No deployer signer available for network "${networkName}". Check contracts/.env.`
    );
  }

  const network = await hre.ethers.provider.getNetwork();
  const chainId = Number(network.chainId);

  console.log(`[deploy] Network: ${networkName} (chainId: ${chainId})`);
  console.log(`[deploy] Deployer: ${deployer.address}`);

  const DocumentRegistry = await hre.ethers.getContractFactory("DocumentRegistry");
  const documentRegistry = await DocumentRegistry.deploy();
  await documentRegistry.waitForDeployment();

  const contractAddress = await documentRegistry.getAddress();
  const deployTx = documentRegistry.deploymentTransaction();
  const txHash = deployTx ? deployTx.hash : null;

  console.log(`[deploy] DocumentRegistry deployed to: ${contractAddress}`);
  if (txHash) {
    console.log(`[deploy] Deployment transaction hash: ${txHash}`);
  }

  const deploymentsFile = updateDeploymentRecord(networkName, {
    address: contractAddress,
    chainId,
    deployer: deployer.address,
    txHash,
    deployedAt: new Date().toISOString(),
  });

  console.log(`[deploy] Updated deployment record at: ${deploymentsFile}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("[deploy] Deployment failed:", error.message || error);
    process.exit(1);
  });

