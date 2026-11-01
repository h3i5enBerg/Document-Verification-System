# Frontend Web Application (Member 3)

Welcome to the client portal for the Document Verification System. This web application provides role-based interfaces for document issuers, verifiers, and citizens.

## Service Overview
- **Framework**: Next.js 14+ (App Router)
- **Port**: `3000` (runs locally at `http://localhost:3000`)
- **Backend API Base URL**: `http://localhost:5000`

## Target Portal Routes
1. `/issuer`
   - Role: Authorized issuing institutions (universities, government boards, corporate issuers).
   - Features: Upload document, run pre-issuance AI validation, compute SHA-256 hash, upload encrypted copy to IPFS, and sign transaction on Polygon/Hardhat via MetaMask.
2. `/verifier`
   - Role: Third-party background checkers, employers, institutions.
   - Features: Upload suspect document, inspect OCR & tamper analysis report, verify on-chain hash integrity and check revocation status.
3. `/citizen`
   - Role: Document recipient / owner.
   - Features: Connect wallet, view minted credentials, view IPFS document preview, and share proof / verification links.

## Contract ABI Integration
Contract artifacts and ABIs are synced to:
```
../shared/abi/DocumentRegistry.json
```
Import the ABI directly into your ethers/viem/wagmi setup:
```typescript
import DocumentRegistryABI from '../../shared/abi/DocumentRegistry.json';
```

## Recommended Local Setup
```bash
cd client
npm install
npm run dev
```

