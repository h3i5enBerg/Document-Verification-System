export interface DocumentRecord {
  docHash: string;
  issuer: string;
  recipient: string;
  ipfsCID: string;
  timestamp: number;
  isRevoked: boolean;
}

export interface AiAnalysisResult {
  ocr_confidence: number;
  tamper_detected: boolean;
  ela_anomaly_score: number | null;
  extracted_text?: string;
}

export interface VerificationResponse {
  exists: boolean;
  issuer: string;
  recipient: string;
  ipfsCID: string;
  timestamp: number;
  isRevoked: boolean;
  tamperAnalysis?: AiAnalysisResult;
}

