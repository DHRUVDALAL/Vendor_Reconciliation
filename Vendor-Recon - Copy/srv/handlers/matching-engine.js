const store = require('./memory-store');

function runMatching() {
    console.log('Matching Started');
    const startTime = Date.now();

    const ledger = store.sapVendorLedger || [];
    const grir = store.sapGrirSnapshot || [];
    const statement = store.vendorStatement || [];

    // Create Maps for fast O(n) lookup
    const ledgerMap = new Map();
    ledger.forEach(r => {
        if (r.invoiceNumber) {
            ledgerMap.set(r.invoiceNumber, r);
        }
    });

    const grirMap = new Map();
    grir.forEach(r => {
        if (r.invoiceNumber) {
            grirMap.set(r.invoiceNumber, r);
        }
    });

    const statementMap = new Map();
    statement.forEach(r => {
        if (r.invoiceNumber) {
            statementMap.set(r.invoiceNumber, r);
        }
    });

    const matchResults = [];
    const exceptions = [];

    let matchedCount = 0;
    let exceptionCount = 0;

    // Process all items in the Vendor Statement
    statement.forEach(vr => {
        const invNo = vr.invoiceNumber;
        if (!invNo) return;

        // Try lookup in SAP Vendor Ledger first, then fallback to GR/IR Snapshot
        const cr = ledgerMap.get(invNo) || grirMap.get(invNo);

        if (!cr) {
            // Case: Missing in Company Ledger
            const outcome = 'MISSING_COMPANY';
            const record = {
                invoiceNumber: invNo,
                vendorCode: vr.vendorCode || '',
                amount: vr.amount || 0,
                currency: vr.currency || 'USD',
                poReference: vr.poReference || '',
                paymentReference: vr.paymentReference || '',
                invoiceDate: vr.invoiceDate || '',
                status: 'UNMATCHED',
                outcome: outcome,
                difference: 'Invoice missing in SAP Company Ledger',
                delta: vr.amount || 0,
                timestamp: new Date().toISOString(),
                ruleApplied: 'Verify in ERP Ledger'
            };
            matchResults.push(record);
            
            exceptions.push({
                invoiceNumber: invNo,
                vendorCode: vr.vendorCode || '',
                amount: vr.amount || 0,
                currency: vr.currency || 'USD',
                poReference: vr.poReference || '',
                paymentReference: vr.paymentReference || '',
                invoiceDate: vr.invoiceDate || '',
                outcome: outcome,
                status: 'OPEN',
                rule: 'Verify in ERP Ledger',
                delta: vr.amount || 0,
                timestamp: new Date().toISOString()
            });
            exceptionCount++;
        } else {
            // Found matching invoice: compare values
            const diffs = [];
            let delta = 0;

            const vAmt = parseFloat(vr.amount) || 0;
            const cAmt = parseFloat(cr.amount) || 0;
            if (Math.abs(vAmt - cAmt) > 0.01) {
                diffs.push('MATCHED_AMOUNT_DIFF');
                delta = vAmt - cAmt;
            }

            if (String(vr.invoiceDate) !== String(cr.invoiceDate)) {
                diffs.push('MATCHED_DATE_DIFF');
            }

            if (String(vr.vendorCode) !== String(cr.vendorCode)) {
                diffs.push('MATCHED_VENDOR_DIFF');
            }

            if (String(vr.poReference) !== String(cr.poReference)) {
                diffs.push('MATCHED_PO_DIFF');
            }

            if (String(vr.paymentReference) !== String(cr.paymentReference)) {
                diffs.push('MATCHED_PAYMENT_DIFF');
            }

            const vGst = parseFloat(vr.gst) || 0;
            const cGst = parseFloat(cr.gst) || 0;
            if (Math.abs(vGst - cGst) > 0.01) {
                diffs.push('MATCHED_GST_DIFF');
            }

            const vTds = parseFloat(vr.tds) || 0;
            const cTds = parseFloat(cr.tds) || 0;
            if (Math.abs(vTds - cTds) > 0.01) {
                diffs.push('MATCHED_TDS_DIFF');
            }

            if (String(vr.currency) !== String(cr.currency)) {
                diffs.push('MATCHED_CURRENCY_DIFF'); // Custom fallback helper
            }

            let status = 'MATCHED';
            let outcome = 'MATCHED';
            let rule = 'Invoice Exact Match';
            let diffMsg = 'Matched';

            if (diffs.length > 0) {
                status = 'DIFFERENCE';
                outcome = diffs.join(' + ');
                rule = 'Variance Checks';
                diffMsg = 'Field mismatch detected';
            }

            const record = {
                invoiceNumber: invNo,
                vendorCode: vr.vendorCode || '',
                amount: vr.amount || 0,
                currency: vr.currency || 'USD',
                poReference: vr.poReference || '',
                paymentReference: vr.paymentReference || '',
                invoiceDate: vr.invoiceDate || '',
                status: status,
                outcome: outcome,
                difference: diffMsg,
                delta: delta,
                timestamp: new Date().toISOString(),
                ruleApplied: rule
            };
            matchResults.push(record);

            if (status !== 'MATCHED') {
                exceptions.push({
                    invoiceNumber: invNo,
                    vendorCode: vr.vendorCode || '',
                    amount: vr.amount || 0,
                    currency: vr.currency || 'USD',
                    poReference: vr.poReference || '',
                    paymentReference: vr.paymentReference || '',
                    invoiceDate: vr.invoiceDate || '',
                    outcome: outcome,
                    status: 'OPEN',
                    rule: rule,
                    delta: delta,
                    timestamp: new Date().toISOString()
                });
                exceptionCount++;
            } else {
                matchedCount++;
            }
        }
    });

    // Scan Company Ledger items to find those missing from Statement
    ledger.forEach(cr => {
        const invNo = cr.invoiceNumber;
        if (!invNo) return;

        if (!statementMap.has(invNo)) {
            const outcome = 'MISSING_VENDOR';
            const record = {
                invoiceNumber: invNo,
                vendorCode: cr.vendorCode || '',
                amount: cr.amount || 0,
                currency: cr.currency || 'USD',
                poReference: cr.poReference || '',
                paymentReference: cr.paymentReference || '',
                invoiceDate: cr.invoiceDate || '',
                status: 'UNMATCHED',
                outcome: outcome,
                difference: 'Invoice missing in Vendor Statement',
                delta: -cr.amount,
                timestamp: new Date().toISOString(),
                ruleApplied: 'Review Vendor Accounts'
            };
            matchResults.push(record);

            exceptions.push({
                invoiceNumber: invNo,
                vendorCode: cr.vendorCode || '',
                amount: cr.amount || 0,
                currency: cr.currency || 'USD',
                poReference: cr.poReference || '',
                paymentReference: cr.paymentReference || '',
                invoiceDate: cr.invoiceDate || '',
                outcome: outcome,
                status: 'OPEN',
                rule: 'Review Vendor Accounts',
                delta: -cr.amount,
                timestamp: new Date().toISOString()
            });
            exceptionCount++;
        }
    });

    store.matchResults = matchResults;
    store.exceptions = exceptions;

    const duration = Date.now() - startTime;
    console.log(`Matching Finished - Duration: ${duration}ms, Matched: ${matchedCount}, Exceptions: ${exceptionCount}`);

    store.recentUploadInfo = {
        uploadTime: new Date().toLocaleString(),
        totalRows: statement.length,
        durationMs: duration,
        matchedCount: matchedCount,
        exceptionCount: exceptionCount
    };
}

module.exports = {
    runMatching
};
