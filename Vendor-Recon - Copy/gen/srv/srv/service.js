const cds = require('@sap/cds');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { reconcileVendorStatements } = require('./handlers/reconciliation');

function parseCSV(filePath) {
    if (!fs.existsSync(filePath)) {
        console.warn(`File not found: ${filePath}`);
        return [];
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split(/\r?\n/).filter(line => line.trim() !== '');
    if (lines.length === 0) return [];
    const headers = lines[0].split(',').map(h => h.trim());
    const records = [];
    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim());
        const record = {};
        headers.forEach((header, idx) => {
            record[header] = values[idx] !== undefined ? values[idx] : null;
        });
        records.push(record);
    }
    return records;
}

function parseFileContent(content, fileType) {
    if (fileType === 'csv') {
        const text = Buffer.from(content, 'base64').toString('utf-8');
        const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
        if (lines.length === 0) return [];
        const headers = lines[0].split(',').map(h => h.trim());
        const records = [];
        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',').map(v => v.trim());
            const record = {};
            headers.forEach((header, idx) => {
                record[header] = values[idx] !== undefined ? values[idx] : null;
            });
            records.push(record);
        }
        return records;
    } else if (fileType === 'xlsx') {
        const buffer = Buffer.from(content, 'base64');
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
    }
    return [];
}

function normalizeRecord(record) {
    return {
        vendorCode: record.vendorCode || '',
        invoiceNumber: record.invoiceNumber || '',
        amount: parseFloat(record.amount) || 0,
        invoiceDate: record.invoiceDate || null,
        poNumber: record.poNumber || '',
        grnNumber: record.grnNumber || '',
        currency: record.currency || '',
        gstAmount: parseFloat(record.gstAmount) || 0,
        status: record.status || ''
    };
}

function parseCSVContent(csvText) {
    const lines = csvText.split(/\r?\n/).filter(line => line.trim() !== '');
    if (lines.length === 0) return [];
    
    const headers = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, ''));
    const records = [];
    for (let i = 1; i < lines.length; i++) {
        const row = lines[i].split(',').map(v => v.trim().replace(/^["']|["']$/g, ''));
        const record = {};
        headers.forEach((header, idx) => {
            record[header] = row[idx] !== undefined ? row[idx] : null;
        });
        records.push(record);
    }
    return records;
}

function normalizeKeys(record) {
    const normalized = {};
    for (const [key, value] of Object.entries(record)) {
        const cleanKey = key.trim().toLowerCase().replace(/\s+/g, '');
        if (cleanKey === 'invoicenumber' || cleanKey === 'invoice') {
            normalized.invoiceNumber = value;
        } else if (cleanKey === 'vendorcode' || cleanKey === 'vendor') {
            normalized.vendorCode = value;
        } else if (cleanKey === 'amount') {
            normalized.amount = value;
        } else if (cleanKey === 'invoicedate' || cleanKey === 'date') {
            normalized.invoiceDate = value;
        }
    }
    return normalized;
}

function reconcileRecords(companyRecords, vendorRecords) {
    const companyMap = new Map();
    companyRecords.forEach(rec => {
        if (rec.invoiceNumber) {
            companyMap.set(rec.invoiceNumber, rec);
        }
    });

    const vendorMap = new Map();
    vendorRecords.forEach(rec => {
        if (rec.invoiceNumber) {
            vendorMap.set(rec.invoiceNumber, rec);
        }
    });

    const matched = [];
    const unmatched = [];

    let matchedCount = 0;
    let unmatchedCount = 0;
    let missingCompanyCount = 0;
    let missingVendorCount = 0;
    let amountMismatchCount = 0;
    let vendorMismatchCount = 0;
    let dateMismatchCount = 0;

    companyRecords.forEach(cr => {
        const invoiceNumber = cr.invoiceNumber;
        if (!invoiceNumber) return;
        
        const vr = vendorMap.get(invoiceNumber);

        if (!vr) {
            unmatched.push({
                invoiceNumber: invoiceNumber,
                vendorCode: cr.vendorCode,
                companyAmount: parseFloat(cr.amount) || 0,
                vendorAmount: 0,
                companyDate: cr.invoiceDate,
                vendorDate: null,
                reason: "Missing in Vendor"
            });
            missingVendorCount++;
            unmatchedCount++;
        } else {
            const cAmt = parseFloat(cr.amount) || 0;
            const vAmt = parseFloat(vr.amount) || 0;
            const cVendor = cr.vendorCode;
            const vVendor = vr.vendorCode;
            const cDate = cr.invoiceDate;
            const vDate = vr.invoiceDate;

            const isAmtEqual = Math.abs(cAmt - vAmt) < 0.01;
            const isVendorEqual = cVendor === vVendor;
            const isDateEqual = cDate === vDate;

            if (isAmtEqual && isVendorEqual && isDateEqual) {
                matched.push({
                    invoiceNumber: invoiceNumber,
                    vendorCode: cVendor,
                    amount: cAmt,
                    invoiceDate: cDate,
                    status: "Matched"
                });
                matchedCount++;
            } else {
                const reasons = [];
                if (!isAmtEqual) {
                    reasons.push("Amount Mismatch");
                    amountMismatchCount++;
                }
                if (!isVendorEqual) {
                    reasons.push("Vendor Mismatch");
                    vendorMismatchCount++;
                }
                if (!isDateEqual) {
                    reasons.push("Date Mismatch");
                    dateMismatchCount++;
                }

                unmatched.push({
                    invoiceNumber: invoiceNumber,
                    vendorCode: cVendor,
                    companyAmount: cAmt,
                    vendorAmount: vAmt,
                    companyDate: cDate,
                    vendorDate: vDate,
                    reason: reasons.join(" + ")
                });
                unmatchedCount++;
            }
        }
    });

    vendorRecords.forEach(vr => {
        const invoiceNumber = vr.invoiceNumber;
        if (!invoiceNumber) return;

        if (!companyMap.has(invoiceNumber)) {
            unmatched.push({
                invoiceNumber: invoiceNumber,
                vendorCode: vr.vendorCode,
                companyAmount: 0,
                vendorAmount: parseFloat(vr.amount) || 0,
                companyDate: null,
                vendorDate: vr.invoiceDate,
                reason: "Missing in Company"
            });
            missingCompanyCount++;
            unmatchedCount++;
        }
    });

    return {
        matched: matched,
        unmatched: unmatched,
        summary: {
            totalCompany: companyRecords.length,
            totalVendor: vendorRecords.length,
            matched: matchedCount,
            unmatched: unmatchedCount,
            missingCompany: missingCompanyCount,
            missingVendor: missingVendorCount,
            amountMismatch: amountMismatchCount,
            vendorMismatch: vendorMismatchCount,
            dateMismatch: dateMismatchCount
        }
    };
}

module.exports = cds.service.impl(async function () {
    const dataDir = path.join(__dirname, '../data');

    this.on('READ', 'Vendors', (req) => {
        return parseCSV(path.join(dataDir, 'vendors.csv'));
    });

    this.on('READ', 'Invoices', (req) => {
        const data = parseCSV(path.join(dataDir, 'invoices.csv'));
        return data.map(row => ({
            ...row,
            amount: row.amount ? Number(row.amount) : 0,
            gstAmount: row.gstAmount ? Number(row.gstAmount) : 0
        }));
    });

    this.on('READ', 'Payments', (req) => {
        const data = parseCSV(path.join(dataDir, 'payments.csv'));
        return data.map(row => ({
            ...row,
            amount: row.amount ? Number(row.amount) : 0
        }));
    });

    this.on('READ', 'VendorStatements', (req) => {
        return [];
    });

    this.on('READ', 'CompanyStatements', (req) => {
        return [];
    });

    this.on('UploadStatement', async (req) => {
        const { fileType, statementType, content } = req.data;
        if (!content || !statementType) {
            req.error(400, 'Missing required parameters: statementType and content');
            return [];
        }
        const ext = (fileType || 'csv').toLowerCase();
        if (!['csv', 'xlsx'].includes(ext)) {
            req.error(400, 'Unsupported file type. Use CSV or XLSX.');
            return [];
        }
        try {
            const rawRecords = parseFileContent(content, ext);
            return rawRecords.map(normalizeRecord);
        } catch (err) {
            req.error(500, `File parsing failed: ${err.message}`);
            return [];
        }
    });

    this.on('Reconcile', async (req) => {
        const { vendorStatements, companyStatements, toleranceAmount, toleranceDays } = req.data;
        if (!Array.isArray(vendorStatements) || !Array.isArray(companyStatements)) {
            req.error(400, 'Both vendorStatements and companyStatements arrays are required');
            return [];
        }
        try {
            const normalizedVendor = vendorStatements.map(normalizeRecord);
            const normalizedCompany = companyStatements.map(normalizeRecord);
            const tAmount = toleranceAmount !== undefined ? parseFloat(toleranceAmount) : 0.01;
            const tDays = toleranceDays !== undefined ? parseInt(toleranceDays) : 0;
            return reconcileVendorStatements(normalizedVendor, normalizedCompany, { amount: tAmount, days: tDays });
        } catch (err) {
            req.error(500, `Reconciliation failed: ${err.message}`);
            return [];
        }
    });

    this.on('reconcile', async (req) => {
        const { companyContent, vendorContent } = req.data;
        if (!companyContent || !vendorContent) {
            req.error(400, 'Both companyContent and vendorContent are required');
            return null;
        }

        try {
            const companyText = Buffer.from(companyContent, 'base64').toString('utf-8');
            const vendorText = Buffer.from(vendorContent, 'base64').toString('utf-8');

            const rawCompany = parseCSVContent(companyText);
            const rawVendor = parseCSVContent(vendorText);

            const companyRecords = rawCompany.map(normalizeKeys);
            const vendorRecords = rawVendor.map(normalizeKeys);

            return reconcileRecords(companyRecords, vendorRecords);
        } catch (err) {
            req.error(500, `Reconciliation engine failed: ${err.message}`);
            return null;
        }
    });

    const { seedSapMockData } = require('./handlers/seed-handler');
    const { uploadStatement } = require('./handlers/upload-handler');
    const { getCockpitData } = require('./handlers/cockpit-handler');
    const { resolveException } = require('./handlers/resolve-handler');
    const store = require('./handlers/memory-store');

    this.on('seedSapMockData', async (req) => {
        const { fileContent } = req.data;
        if (!fileContent) {
            req.error(400, 'fileContent parameter is required');
            return null;
        }
        try {
            return seedSapMockData(fileContent);
        } catch (err) {
            req.error(500, `Seeding SAP Mock Data failed: ${err.message}`);
            return null;
        }
    });

    this.on('uploadStatement', async (req) => {
        const { fileContent } = req.data;
        if (!fileContent) {
            req.error(400, 'fileContent parameter is required');
            return null;
        }
        try {
            return uploadStatement(fileContent);
        } catch (err) {
            req.error(500, `Uploading statement failed: ${err.message}`);
            return null;
        }
    });

    this.on('getCockpitData', async (req) => {
        try {
            const data = getCockpitData();
            return JSON.stringify(data);
        } catch (err) {
            req.error(500, `Fetching cockpit data failed: ${err.message}`);
            return null;
        }
    });

    this.on('getWorkbenchData', async (req) => {
        try {
            const data = {
                matchResults: store.matchResults || [],
                exceptions: store.exceptions || []
            };
            return JSON.stringify(data);
        } catch (err) {
            req.error(500, `Fetching workbench data failed: ${err.message}`);
            return null;
        }
    });

    this.on('resolveException', async (req) => {
        const { invoiceNumber } = req.data;
        try {
            return resolveException(invoiceNumber);
        } catch (err) {
            req.error(500, `Resolving exception failed: ${err.message}`);
            return null;
        }
    });
});
