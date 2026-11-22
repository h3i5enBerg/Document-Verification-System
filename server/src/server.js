
const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { createLogger } = require("@suhanyyysm/pretty");

const logger = createLogger();

dotenv.config();

const authRoutes = require("./routes/auth.routes");
const documentRoutes = require("./routes/document.routes");
const verifyRoutes = require("./routes/verify.routes");
const citizenRoutes = require("./routes/citizen.routes");

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
    service: "document-verification-server",
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/documents", documentRoutes);
app.use("/api/verify", verifyRoutes);
app.use("/api/citizen", citizenRoutes);

// 404 handler
app.use((req, res, next) => {
  res.status(404).json({
    error: "NotFound",
    message: `Cannot ${req.method} ${req.originalUrl}`,
  });
});

// Centralized error handling middleware
app.use((err, req, res, next) => {
  logger.error("[ServerError]", err.message);

  if (err.name === "MulterError") {
    return res.status(400).json({
      error: "UploadError",
      message: err.message,
    });
  }

  const status = err.status || 500;

  return res.status(status).json({
    error: err.name || "InternalServerError",
    message: err.message || "An unexpected error occurred",
  });
});

// Start server if not imported as a module
if (require.main === module) {
  app.listen(PORT, () => {
    logger.success(
      `Document Verification Server running on port ${PORT}`
    );
  });
}

module.exports = app;
