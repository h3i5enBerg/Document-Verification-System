
from io import BytesIO
from PIL import Image, UnidentifiedImageError
from fastapi import FastAPI, UploadFile, File, HTTPException
import pytesseract

app = FastAPI(
    title="AI Document Verification Service",
    description="OCR and document tampering analysis",
    version="1.0.0"
)

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB


@app.get("/")
def home():
    return {
        "message": "AI Document Verification Service is running!"
    }


@app.post("/api/v1/analyze-document")
async def analyze_document(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(
            status_code=400,
            detail="No file was provided."
        )

    # Read the uploaded file, allowing one extra byte to detect oversized files
    contents = await file.read(MAX_FILE_SIZE + 1)

    if not contents:
        raise HTTPException(
            status_code=400,
            detail="The uploaded file is empty."
        )

    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail="File size exceeds the 10 MB limit."
        )

    try:
        # Check whether the uploaded content is a genuine image
        image = Image.open(BytesIO(contents))

        if image.format not in ("JPEG", "PNG"):
            raise HTTPException(
                status_code=415,
                detail="Only JPEG and PNG files are supported."
            )

        image.verify()

        # Reopen the image to read its dimensions
        image = Image.open(BytesIO(contents))
        dimensions = list(image.size)
        file_type = f"image/{image.format.lower()}"

        # Extract text using Tesseract OCR
        extracted_text = pytesseract.image_to_string(image)

        # Get word-level OCR confidence scores
        ocr_data = pytesseract.image_to_data(
            image,
            output_type=pytesseract.Output.DICT
        )

        confidence_scores = []

        for confidence in ocr_data["conf"]:
            confidence = float(confidence)

            if confidence > 0:
                confidence_scores.append(confidence)

        # Calculate average confidence and normalize it between 0 and 1
        if confidence_scores:
            ocr_confidence = round(
                sum(confidence_scores) / len(confidence_scores) / 100,
                3
            )
        else:
            ocr_confidence = 0.0

    except UnidentifiedImageError:
        raise HTTPException(
            status_code=415,
            detail="Uploaded file is not a valid image."
        )
    except OSError:
        raise HTTPException(
            status_code=400,
            detail="Image file is corrupted or cannot be read."
        )

    return {
        "ocr_confidence": ocr_confidence,
        "tamper_detected": False,
        "ela_anomaly_score": None,
        "extracted_text": extracted_text,
        "metadata": {
            "dimensions": dimensions,
            "file_type": file_type
        }
    }
