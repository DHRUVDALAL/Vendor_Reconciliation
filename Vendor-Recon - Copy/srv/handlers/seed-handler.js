const XLSX = require('xlsx');
const store = require('./memory-store');

function normalizeRow(row) {
    const norm = {};
    for (const [k, v] of Object.entries(row)) {
        if (v === null || v === undefined) continue;
        const cleanK = k.trim().toLowerCase().replace(/\s+/g, '');
        if (cleanK === 'vendorcode' || cleanK === 'vendor') norm.vendorCode = String(v).trim();
        else if (cleanK === 'vendorname' || cleanK === 'name') norm.vendorName = String(v).trim();
        else if (cleanK === 'email') norm.email = String(v).trim();
        else if (cleanK === 'phone') norm.phone = String(v).trim();
        else if (cleanK === 'address') norm.address = String(v).trim();
        else if (cleanK === 'gstnumber' || cleanK === 'gst') norm.gstNumber = String(v).trim();
        else if (cleanK === 'currency') norm.currency = String(v).trim();
        else if (cleanK === 'vendorinvoiceno' || cleanK === 'invoicenumber' || cleanK === 'invoice') norm.invoiceNumber = String(v).trim();
        else if (cleanK === 'invoiceamount' || cleanK === 'amount') norm.amount = parseFloat(v) || 0;
        else if (cleanK === 'invoicedate' || cleanK === 'date') norm.invoiceDate = String(v).trim();
        else if (cleanK === 'poreference' || cleanK === 'po') norm.poReference = String(v).trim();
        else if (cleanK === 'paymentreference' || cleanK === 'payment') norm.paymentReference = String(v).trim();
        else if (cleanK === 'gst') norm.gst = parseFloat(v) || 0;
        else if (cleanK === 'tds') norm.tds = parseFloat(v) || 0;
    }
    return norm;
}

function seedSapMockData(base64Content) {
    console.log('Seed Started');
    const buffer = Buffer.from(base64Content, 'base64');
    const workbook = XLSX.read(buffer, { type: 'buffer' });

    // Locate sheet names (case insensitive)
    const masterName = workbook.SheetNames.find(n => n.toLowerCase() === 'vendormaster') || 'VendorMaster';
    const ledgerName = workbook.SheetNames.find(n => n.toLowerCase() === 'vendorledgeritems') || 'VendorLedgerItems';
    const grirName = workbook.SheetNames.find(n => n.toLowerCase() === 'grirsnapshot') || 'GrirSnapshot';

    const rawMaster = XLSX.utils.sheet_to_json(workbook.Sheets[masterName] || {});
    const rawLedger = XLSX.utils.sheet_to_json(workbook.Sheets[ledgerName] || {});
    const rawGrir = XLSX.utils.sheet_to_json(workbook.Sheets[grirName] || {});

    store.sapVendorMaster = rawMaster.map(normalizeRow).filter(r => r.vendorCode);
    store.sapVendorLedger = rawLedger.map(normalizeRow).filter(r => r.invoiceNumber);
    store.sapGrirSnapshot = rawGrir.map(normalizeRow).filter(r => r.invoiceNumber);

    store.seedStats = {
        vendorCount: store.sapVendorMaster.length,
        ledgerCount: store.sapVendorLedger.length,
        grirCount: store.sapGrirSnapshot.length
    };

    console.log(`Seed Completed - Vendors: ${store.seedStats.vendorCount}, Ledger: ${store.seedStats.ledgerCount}, GRIR: ${store.seedStats.grirCount}`);
    return `Seed Complete - Vendors: ${store.seedStats.vendorCount}, Ledger: ${store.seedStats.ledgerCount}, GRIR: ${store.seedStats.grirCount}`;
}

module.exports = {
    seedSapMockData
};
