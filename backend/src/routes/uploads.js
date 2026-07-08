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

// Accept quotation/document files (PDF, Word, Excel, CSV, text), images, and
// short videos (delivery truck photos/videos).
const okMime = /(pdf|image\/|video\/|msword|wordprocessingml|ms-excel|spreadsheetml|csv|text\/plain)/i;
const okExt = /\.(pdf|jpe?g|png|webp|gif|heic|mp4|mov|avi|webm|mkv|doc|docx|xls|xlsx|csv|txt)$/i;
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB (videos)
  fileFilter: (req, file, cb) => {
    const ok = okMime.test(file.mimetype || '') || okExt.test(file.originalname || '');
    cb(ok ? null : new Error('Unsupported file type. Upload a PDF, Office document, image, or video.'), ok);
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
