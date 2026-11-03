const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("DocumentRegistry", function () {
  let documentRegistry;
  let admin, issuer1, issuer2, recipient, unauthorizedUser;

  // Sample test data
  const sampleDocHash = ethers.keccak256(ethers.toUtf8Bytes("DEGREE_CERTIFICATE_12345"));
  const duplicateDocHash = sampleDocHash;
  const sampleDocHash2 = ethers.keccak256(ethers.toUtf8Bytes("TRANSCRIPT_67890"));
  const sampleCID = "QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco";

  beforeEach(async function () {
    [admin, issuer1, issuer2, recipient, unauthorizedUser] = await ethers.getSigners();

    const DocumentRegistryFactory = await ethers.getContractFactory("DocumentRegistry");
    documentRegistry = await DocumentRegistryFactory.deploy();
    await documentRegistry.waitForDeployment();
  });

  describe("Deployment & Access Control", function () {
    it("should set deployer as admin", async function () {
      expect(await documentRegistry.admin()).to.equal(admin.address);
    });

    it("should allow admin to whitelist and revoke issuer status", async function () {
      // Whitelist issuer1
      await expect(documentRegistry.connect(admin).setIssuerStatus(issuer1.address, true))
        .to.emit(documentRegistry, "IssuerStatusUpdated")
        .withArgs(issuer1.address, true);

      expect(await documentRegistry.authorizedIssuers(issuer1.address)).to.be.true;

      // Revoke issuer1
      await expect(documentRegistry.connect(admin).setIssuerStatus(issuer1.address, false))
        .to.emit(documentRegistry, "IssuerStatusUpdated")
        .withArgs(issuer1.address, false);

      expect(await documentRegistry.authorizedIssuers(issuer1.address)).to.be.false;
    });

    it("should reject non-admin attempting to set issuer status", async function () {
      await expect(
        documentRegistry.connect(unauthorizedUser).setIssuerStatus(issuer1.address, true)
      ).to.be.revertedWith("Caller is not the admin");
    });
  });

  describe("Document Issuance", function () {
    beforeEach(async function () {
      await documentRegistry.connect(admin).setIssuerStatus(issuer1.address, true);
    });

    it("should allow authorized issuer to register a document hash successfully", async function () {
      const tx = await documentRegistry
        .connect(issuer1)
        .issueDocument(sampleDocHash, recipient.address, sampleCID);

      await expect(tx)
        .to.emit(documentRegistry, "DocumentIssued")
        .withArgs(sampleDocHash, issuer1.address, recipient.address, sampleCID, (await ethers.provider.getBlock("latest")).timestamp);

      const [exists, issuer, rec, ipfsCID, timestamp, isRevoked] =
        await documentRegistry.verifyDocument(sampleDocHash);

      expect(exists).to.be.true;
      expect(issuer).to.equal(issuer1.address);
      expect(rec).to.equal(recipient.address);
      expect(ipfsCID).to.equal(sampleCID);
      expect(timestamp).to.be.gt(0);
      expect(isRevoked).to.be.false;
    });

    it("should fail when non-authorized address attempts to issue a document", async function () {
      await expect(
        documentRegistry
          .connect(unauthorizedUser)
          .issueDocument(sampleDocHash, recipient.address, sampleCID)
      ).to.be.revertedWith("Caller is not an authorized issuer");
    });

    it("should revert when attempting to issue a duplicate docHash", async function () {
      await documentRegistry
        .connect(issuer1)
        .issueDocument(sampleDocHash, recipient.address, sampleCID);

      await expect(
        documentRegistry
          .connect(issuer1)
          .issueDocument(duplicateDocHash, recipient.address, sampleCID)
      ).to.be.revertedWith("Document hash already registered");
    });

    it("should revert if document hash is empty bytes32(0)", async function () {
      await expect(
        documentRegistry
          .connect(issuer1)
          .issueDocument(ethers.ZeroHash, recipient.address, sampleCID)
      ).to.be.revertedWith("Invalid document hash");
    });

    it("should revert if recipient address is zero address", async function () {
      await expect(
        documentRegistry
          .connect(issuer1)
          .issueDocument(sampleDocHash, ethers.ZeroAddress, sampleCID)
      ).to.be.revertedWith("Invalid recipient address");
    });

    it("should revert if IPFS CID is empty string", async function () {
      await expect(
        documentRegistry
          .connect(issuer1)
          .issueDocument(sampleDocHash, recipient.address, "")
      ).to.be.revertedWith("IPFS CID cannot be empty");
    });
  });

  describe("Document Verification & Revocation", function () {
    beforeEach(async function () {
      await documentRegistry.connect(admin).setIssuerStatus(issuer1.address, true);
      await documentRegistry.connect(admin).setIssuerStatus(issuer2.address, true);
      await documentRegistry
        .connect(issuer1)
        .issueDocument(sampleDocHash, recipient.address, sampleCID);
    });

    it("should return exists == false for non-existent document hash", async function () {
      const nonExistentHash = ethers.keccak256(ethers.toUtf8Bytes("NON_EXISTENT_DOCUMENT"));
      const [exists, issuer, rec, ipfsCID, timestamp, isRevoked] =
        await documentRegistry.verifyDocument(nonExistentHash);

      expect(exists).to.be.false;
      expect(issuer).to.equal(ethers.ZeroAddress);
      expect(rec).to.equal(ethers.ZeroAddress);
      expect(ipfsCID).to.equal("");
      expect(timestamp).to.equal(0);
      expect(isRevoked).to.be.false;
    });

    it("should allow original issuer to revoke document and verify isRevoked == true", async function () {
      const tx = await documentRegistry.connect(issuer1).revokeDocument(sampleDocHash);

      await expect(tx)
        .to.emit(documentRegistry, "DocumentRevoked")
        .withArgs(sampleDocHash, issuer1.address, (await ethers.provider.getBlock("latest")).timestamp);

      const [exists, issuer, rec, ipfsCID, timestamp, isRevoked] =
        await documentRegistry.verifyDocument(sampleDocHash);

      expect(exists).to.be.true;
      expect(issuer).to.equal(issuer1.address);
      expect(rec).to.equal(recipient.address);
      expect(ipfsCID).to.equal(sampleCID);
      expect(timestamp).to.be.gt(0);
      expect(isRevoked).to.be.true;
    });

    it("should revert when non-issuer tries to revoke the document", async function () {
      // Unauthorized user
      await expect(
        documentRegistry.connect(unauthorizedUser).revokeDocument(sampleDocHash)
      ).to.be.revertedWith("Only the original issuer can revoke this document");

      // Another authorized issuer who didn't mint this specific document
      await expect(
        documentRegistry.connect(issuer2).revokeDocument(sampleDocHash)
      ).to.be.revertedWith("Only the original issuer can revoke this document");
    });

    it("should revert when attempting to revoke an already revoked document", async function () {
      await documentRegistry.connect(issuer1).revokeDocument(sampleDocHash);

      await expect(
        documentRegistry.connect(issuer1).revokeDocument(sampleDocHash)
      ).to.be.revertedWith("Document is already revoked");
    });

    it("should revert when attempting to revoke a non-existent document", async function () {
      const nonExistentHash = ethers.keccak256(ethers.toUtf8Bytes("DOES_NOT_EXIST"));
      await expect(
        documentRegistry.connect(issuer1).revokeDocument(nonExistentHash)
      ).to.be.revertedWith("Document does not exist");
    });
  });
});

