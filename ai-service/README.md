# AI Document Verification Service (Member 2)

Welcome to the AI microservice for the Document Verification System. This service handles document optical character recognition (OCR), Error Level Analysis (ELA) for image forgery detection, and heuristic anomaly detection.

## Service Overview
- **Framework**: FastAPI (Python 3.10+)
- **Port**: `8000` (runs locally at `http://localhost:8000`)
- **Primary Endpoint**: `POST /analyze`

## Input Specification
Accepts multipart form-data containing the document image or PDF file:
- `file`: UploadFile (Image formats: JPEG, PNG, or single-page PDF)
- `document_type`: Optional string (`degree`, `transcript`, `id_card`, etc.)

## API Contract (JSON Response)
The endpoint must return an analysis payload adhering to the following JSON structure:

```json
{
  "ocr_confidence": 0.985,
  "tamper_detected": false,
  "ela_anomaly_score": 0.042,
  "extracted_text": "Sample text extracted from certificate...",
  "metadata": {
    "dimensions": [1920, 1080],
    "file_type": "image/png"
  }
}
```

### Response Schema Details
- `ocr_confidence` (`float`, range `0.0` - `1.0`): Overall confidence score from the OCR engine (e.g. Tesseract or EasyOCR).
- `tamper_detected` (`boolean`): Flags whether ELA or layout tampering heuristics exceeded safety thresholds.
- `ela_anomaly_score` (`float` or `null`, range `0.0` - `1.0`): Error Level Analysis variance score indicating compression artifacts inconsistency.

## Recommended Local Setup
```bash
cd ai-service
python3 -m venv .venv
source .venv/bin/activate
pip install fastapi uvicorn pillow pytesseract
uvicorn main:app --reload --port 8000
```

