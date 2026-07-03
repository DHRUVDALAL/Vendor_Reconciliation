const XLSX = require('xlsx');
const store = require('./memory-store');
const { runMatching } = require('./matching-engine');

function normalizeStatementRow(row) {
    const norm = {};
    for (const [k, v] of Object.entries(row)) {
        if (v === null || v === undefined) continue;
        const cleanK = k.trim().toLowerCase().replace(/\s+/g, '');
        if (cleanK === 'vendorinvoiceno' || cleanK === 'invoicenumber' || cleanK === 'invoice') norm.invoiceNumber = String(v).trim();
        else if (cleanK === 'invoicedate' || cleanK === 'date') norm.invoiceDate = String(v).trim();
        else if (cleanK === 'invoiceamount' || cleanK === 'amount') norm.amount = parseFloat(v) || 0;
        else if (cleanK === 'currency') norm.currency = String(v).trim();
        else if (cleanK === 'vendorcode' || cleanK === 'vendor') norm.vendorCode = String(v).trim();
        else if (cleanK === 'poreference' || cleanK === 'po') norm.poReference = String(v).trim();
        else if (cleanK === 'paymentreference' || cleanK === 'payment') norm.paymentReference = String(v).trim();
        else if (cleanK === 'gst') norm.gst = parseFloat(v) || 0;
        else if (cleanK === 'tds') norm.tds = parseFloat(v) || 0;
    }
    return norm;
}

function uploadStatement(base64Content) {
    console.log('Upload Started');
    const buffer = Buffer.from(base64Content, 'base64');
    const workbook = XLSX.read(buffer, { type: 'buffer' });

    const firstSheetName = workbook.SheetNames[0];
    const rawRows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheetName] || {});

    if (rawRows.length === 0) {
        throw new Error("Uploaded workbook contains no records.");
    }

    const parsedStatement = rawRows.map(normalizeStatementRow).filter(r => r.invoiceNumber);

    if (parsedStatement.length === 0) {
        throw new Error("Required columns (e.g. VendorInvoiceNo / Invoice Number) not found in Excel sheet.");
    }

    // Validate that vendors in statement exist in VendorMaster (if seeded)
    if (store.sapVendorMaster && store.sapVendorMaster.length > 0) {
        const vendorCodes = new Set(store.sapVendorMaster.map(v => v.vendorCode));
        const invalidRow = parsedStatement.find(r => r.vendorCode && !vendorCodes.has(r.vendorCode));
        if (invalidRow) {
            throw new Error(`Vendor Code "${invalidRow.vendorCode}" in invoice "${invalidRow.invoiceNumber}" is not registered in SAP Vendor Master.`);
        }
    }

    const statementUploadId = `UP-${Date.now()}`;
    store.vendorStatement = parsedStatement;

    console.log(`Upload Completed - Generated ID: ${statementUploadId}, Rows: ${store.vendorStatement.length}`);

    // Trigger reconciliation engine
    runMatching();

    return statementUploadId;
}

module.exports = {
    uploadStatement
};
