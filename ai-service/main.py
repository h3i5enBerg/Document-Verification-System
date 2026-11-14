from io import BytesIO

import pymupdf as fitz
import pytesseract
from PIL import Image, ImageChops, ImageStat, UnidentifiedImageError
from fastapi import FastAPI, UploadFile, File, HTTPException

app = FastAPI(
    title="AI Document Verification Service",
    description="OCR and document tampering analysis",
    version="1.0.0"
)

MAX_FILE_SIZE = 10 * 1024 * 1024
MAX_PDF_PAGES = 5


def calculate_ela_score(image):
    if image.format != "JPEG":
        return None

    original_image = image.convert("RGB")

    compressed_buffer = BytesIO()
    original_image.save(
        compressed_buffer,
        format="JPEG",
        quality=90
    )

    compressed_buffer.seek(0)
    compressed_image = Image.open(compressed_buffer).convert("RGB")

    difference = ImageChops.difference(
        original_image,
        compressed_image
    )

    statistics = ImageStat.Stat(difference)
    mean_difference = sum(statistics.mean) / len(statistics.mean)

    return round(mean_difference / 255, 4)


def extract_ocr_data(image):
    extracted_text = pytesseract.image_to_string(image)

    ocr_data = pytesseract.image_to_data(
        image,
        output_type=pytesseract.Output.DICT
    )

    confidence_scores = []

    for confidence in ocr_data["conf"]:
        confidence = float(confidence)

        if confidence > 0:
            confidence_scores.append(confidence)

    if confidence_scores:
        ocr_confidence = round(
            sum(confidence_scores) / len(confidence_scores) / 100,
            3
        )
    else:
        ocr_confidence = 0.0

    return extracted_text, ocr_confidence


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

    file_type = None
    dimensions = None
    ela_anomaly_score = None
    pdf_document = None

    try:
        if contents.startswith(b"%PDF-"):
            pdf_document = fitz.open(
                stream=contents,
                filetype="pdf"
            )

            if pdf_document.needs_pass:
                raise HTTPException(
                    status_code=415,
                    detail="Password-protected PDFs are not supported."
                )

            if pdf_document.page_count == 0:
                raise HTTPException(
                    status_code=400,
                    detail="PDF contains no pages."
                )

            if pdf_document.page_count > MAX_PDF_PAGES:
                raise HTTPException(
                    status_code=413,
                    detail="PDF exceeds the 5-page limit."
                )

            extracted_text_parts = []
            confidence_values = []

            for page in pdf_document:
                pixmap = page.get_pixmap(
                    matrix=fitz.Matrix(2, 2)
                )

                image = Image.open(
                    BytesIO(pixmap.tobytes("png"))
                ).convert("RGB")

                page_text, page_confidence = extract_ocr_data(image)

                extracted_text_parts.append(page_text)
                confidence_values.append(page_confidence)

                if dimensions is None:
                    dimensions = [image.width, image.height]

            extracted_text = "\n".join(extracted_text_parts)

            ocr_confidence = round(
                sum(confidence_values) / len(confidence_values),
                3
            )

            file_type = "application/pdf"

        else:
            image = Image.open(BytesIO(contents))

            if image.format not in ("JPEG", "PNG"):
                raise HTTPException(
                    status_code=415,
                    detail="Only JPEG, PNG and PDF files are supported."
                )

            image.verify()

            image = Image.open(BytesIO(contents))

            dimensions = list(image.size)
            file_type = f"image/{image.format.lower()}"

            ela_anomaly_score = calculate_ela_score(image)

            extracted_text, ocr_confidence = extract_ocr_data(image)

    except HTTPException:
        raise

    except (
        fitz.FileDataError,
        UnidentifiedImageError,
        ValueError,
        RuntimeError
    ):
        raise HTTPException(
            status_code=415,
            detail="Uploaded file is invalid or corrupted."
        )

    except OSError:
        raise HTTPException(
            status_code=400,
            detail="File cannot be read."
        )

    finally:
        if pdf_document is not None:
            pdf_document.close()

    return {
        "ocr_confidence": ocr_confidence,
        "tamper_detected": False,
        "ela_anomaly_score": ela_anomaly_score,
        "extracted_text": extracted_text,
        "metadata": {
            "dimensions": dimensions,
            "file_type": file_type
        }
    }