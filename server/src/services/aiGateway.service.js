const DEFAULT_AI_SERVICE_URL = "http://localhost:8000";
const DEFAULT_TIMEOUT_MS = 10000;

const OFFLINE_FALLBACK = Object.freeze({
  ocr_confidence: 0,
  tamper_detected: false,
  ela_anomaly_score: null,
  service_offline: true,
});

/**
 * Sends a document buffer to the FastAPI AI verification service for OCR and ELA tampering analysis.
 * Gracefully falls back if the AI microservice is offline or times out during development.
 *
 * @param {Buffer} fileBuffer - Raw document bytes.
 * @param {string} fileName - Original file name.
 * @param {string} mimeType - File MIME type (e.g. application/pdf, image/png, image/jpeg).
 * @returns {Promise<{ocr_confidence: number, tamper_detected: boolean, ela_anomaly_score: number|null, service_offline: boolean}>}
 */
async function analyzeDocument(fileBuffer, fileName, mimeType) {
  if (!Buffer.isBuffer(fileBuffer) || fileBuffer.length === 0) {
    throw new Error("Invalid fileBuffer passed to analyzeDocument.");
  }

  const baseUrl = (process.env.AI_SERVICE_URL || DEFAULT_AI_SERVICE_URL).replace(/\/+$/, "");
  const endpoint = `${baseUrl}/api/v1/analyze-document`;
  const timeoutMs = Number(process.env.AI_SERVICE_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;

  try {
    const formData = new FormData();
    const blob = new Blob([fileBuffer], { type: mimeType || "application/octet-stream" });
    formData.append("file", blob, fileName || "document");

    const response = await fetch(endpoint, {
      method: "POST",
      body: formData,
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      console.warn(
        `[aiGateway] AI service returned HTTP ${response.status} from ${endpoint}. Using fallback.`
      );
      return { ...OFFLINE_FALLBACK };
    }

    const data = await response.json();
    return {
      ocr_confidence: typeof data.ocr_confidence === "number" ? data.ocr_confidence : 0,
      tamper_detected: Boolean(data.tamper_detected),
      ela_anomaly_score:
        data.ela_anomaly_score !== undefined && data.ela_anomaly_score !== null
          ? Number(data.ela_anomaly_score)
          : null,
      extracted_text: data.extracted_text || null,
      service_offline: false,
    };
  } catch (err) {
    console.warn(
      `[aiGateway] AI service unavailable at ${endpoint} (${err.name}: ${err.message}). Using fallback.`
    );
    return { ...OFFLINE_FALLBACK };
  }
}

module.exports = {
  analyzeDocument,
};

