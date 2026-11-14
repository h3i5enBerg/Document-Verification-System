from fastapi import FastAPI

app = FastAPI(
    title="AI Document Verification Service",
    description="OCR and document tampering analysis",
    version="1.0.0"
)


@app.get("/")
def home():
    return {
        "message": "AI Document Verification Service is running!"
    }