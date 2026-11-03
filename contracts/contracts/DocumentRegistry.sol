// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

/**
 * @title DocumentRegistry
 * @author Member 1 (Blockchain & Backend Lead)
 * @notice Manages document hash registrations, verification, and revocation on-chain.
 */
contract DocumentRegistry {
    struct Record {
        bytes32 docHash;
        address issuer;
        address recipient;
        string ipfsCID;
        uint256 timestamp;
        bool isRevoked;
    }

    address public admin;
    mapping(bytes32 => Record) private documents;
    mapping(address => bool) public authorizedIssuers;

    // Events
    event IssuerStatusUpdated(address indexed issuer, bool status);
    event DocumentIssued(
        bytes32 indexed docHash,
        address indexed issuer,
        address indexed recipient,
        string ipfsCID,
        uint256 timestamp
    );
    event DocumentRevoked(
        bytes32 indexed docHash,
        address indexed issuer,
        uint256 timestamp
    );

    // Modifiers
    modifier onlyAdmin() {
        require(msg.sender == admin, "Caller is not the admin");
        _;
    }

    modifier onlyIssuer() {
        require(authorizedIssuers[msg.sender], "Caller is not an authorized issuer");
        _;
    }

    constructor() {
        admin = msg.sender;
    }

    /**
     * @notice Admin whitelists or revokes authorization for an issuer.
     * @param _issuer Address of the institution or issuer.
     * @param _status True to authorize, false to revoke authorization.
     */
    function setIssuerStatus(address _issuer, bool _status) external onlyAdmin {
        require(_issuer != address(0), "Invalid issuer address");
        authorizedIssuers[_issuer] = _status;
        emit IssuerStatusUpdated(_issuer, _status);
    }

    /**
     * @notice Authorized issuer issues/registers a new document on-chain.
     * @param _docHash SHA-256 or Keccak-256 hash of the document.
     * @param _recipient Address of the document owner/student/citizen.
     * @param _ipfsCID IPFS CID pointing to the encrypted document asset.
     */
    function issueDocument(
        bytes32 _docHash,
        address _recipient,
        string calldata _ipfsCID
    ) external onlyIssuer {
        require(_docHash != bytes32(0), "Invalid document hash");
        require(_recipient != address(0), "Invalid recipient address");
        require(bytes(_ipfsCID).length > 0, "IPFS CID cannot be empty");
        require(documents[_docHash].timestamp == 0, "Document hash already registered");

        documents[_docHash] = Record({
            docHash: _docHash,
            issuer: msg.sender,
            recipient: _recipient,
            ipfsCID: _ipfsCID,
            timestamp: block.timestamp,
            isRevoked: false
        });

        emit DocumentIssued(
            _docHash,
            msg.sender,
            _recipient,
            _ipfsCID,
            block.timestamp
        );
    }

    /**
     * @notice Revokes a previously issued document. Only the issuer who minted the record can revoke.
     * @param _docHash Hash of the document to revoke.
     */
    function revokeDocument(bytes32 _docHash) external {
        Record storage record = documents[_docHash];
        require(record.timestamp != 0, "Document does not exist");
        require(record.issuer == msg.sender, "Only the original issuer can revoke this document");
        require(!record.isRevoked, "Document is already revoked");

        record.isRevoked = true;
        emit DocumentRevoked(_docHash, msg.sender, block.timestamp);
    }

    /**
     * @notice Query document verification details.
     * @param _docHash Hash of the document to verify.
     * @return exists Whether the document hash exists on-chain.
     * @return issuer Address of the issuer who minted the document.
     * @return recipient Address of the document recipient.
     * @return ipfsCID IPFS CID of the encrypted document payload.
     * @return timestamp Block timestamp when document was issued.
     * @return isRevoked Whether the document has been revoked.
     */
    function verifyDocument(bytes32 _docHash)
        external
        view
        returns (
            bool exists,
            address issuer,
            address recipient,
            string memory ipfsCID,
            uint256 timestamp,
            bool isRevoked
        )
    {
        Record memory record = documents[_docHash];
        if (record.timestamp == 0) {
            return (false, address(0), address(0), "", 0, false);
        }
        return (
            true,
            record.issuer,
            record.recipient,
            record.ipfsCID,
            record.timestamp,
            record.isRevoked
        );
    }
}

