const fs = require("fs");
const path = require("path");

function exportAbi() {
  const artifactPath = path.resolve(
    __dirname,
    "../artifacts/contracts/DocumentRegistry.sol/DocumentRegistry.json"
  );
  const targetDir = path.resolve(__dirname, "../../shared/abi");
  const targetPath = path.join(targetDir, "DocumentRegistry.json");

  if (!fs.existsSync(artifactPath)) {
    console.error(`Artifact not found at ${artifactPath}. Please run hardhat compile first.`);
    process.exit(1);
  }

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  fs.copyFileSync(artifactPath, targetPath);
  console.log(`[export-abi] Successfully synced DocumentRegistry artifact to ${targetPath}`);
}

exportAbi();

