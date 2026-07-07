const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '';
    const safe = crypto.randomBytes(8).toString('hex');
    cb(null, `${Date.now()}-${safe}${ext}`);
  },
});

// Accept PDFs and images (quotation PDFs, invoices, delivery photos).
const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB
  fileFilter: (req, file, cb) => {
    const ok = /pdf|jpe?g|png|webp/i.test(file.mimetype) || /\.(pdf|jpe?g|png|webp)$/i.test(file.originalname);
    cb(ok ? null : new Error('Only PDF or image files are allowed'), ok);
  },
});

/**
 * POST /api/uploads  (any authenticated user)
 * multipart/form-data with a single "file" field. Returns a served URL.
 */
router.post(
  '/',
  authenticate,
  upload.single('file'),
  (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded (field name must be "file")' });
    const url = `/uploads/${req.file.filename}`;
    return res.status(201).json({
      url,
      filename: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
    });
  }
);

module.exports = router;
