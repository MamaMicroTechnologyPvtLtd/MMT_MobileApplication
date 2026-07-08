const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
require('dotenv').config();

const { errorHandler } = require('./middleware/errorHandler');

const app = express();

app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(morgan('dev'));

// Serve uploaded documents (quotation PDFs, invoices, delivery docs).
const uploadDir = process.env.UPLOAD_DIR || 'uploads';
app.use('/uploads', express.static(path.resolve(uploadDir)));

app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

const supplierQuotations = require('./routes/supplierQuotations');

app.use('/api/auth', require('./routes/auth'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/listings', require('./routes/listings'));
app.use('/api/staff', require('./routes/staff'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/suppliers', require('./routes/suppliers'));
app.use('/api/enquiries', require('./routes/enquiries'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/orders', supplierQuotations); // supplier submit + own quotations under an order
app.use('/api/supplier-quotations', supplierQuotations.actionRouter); // shortlist / request final
app.use('/api/quotations', require('./routes/quotations'));
app.use('/api/deliveries', require('./routes/deliveries'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/supplier', require('./routes/supplierInbox'));
app.use('/api/uploads', require('./routes/uploads'));

app.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use(errorHandler);

module.exports = app;
