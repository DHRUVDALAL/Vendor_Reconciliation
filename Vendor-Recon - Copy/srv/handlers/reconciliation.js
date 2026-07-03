function reconcileVendorStatements(vendorStatements, companyStatements, tolerance = { amount: 0.01, days: 0 }) {
    const results = [];

    const companyMap = {};
    const companyCounts = {};
    companyStatements.forEach(record => {
        const key = record.invoiceNumber;
        if (!companyMap[key]) companyMap[key] = [];
        companyMap[key].push(record);
        companyCounts[key] = (companyCounts[key] || 0) + 1;
    });

    const matchedCompanyInvoices = new Set();

    const vendorGroups = {};
    const vendorCounts = {};
    vendorStatements.forEach(record => {
        const key = record.invoiceNumber;
        if (!vendorGroups[key]) vendorGroups[key] = [];
        vendorGroups[key].push(record);
        vendorCounts[key] = (vendorCounts[key] || 0) + 1;
    });

    for (const [invoiceNumber, vendorRecords] of Object.entries(vendorGroups)) {
        const companyRecords = companyMap[invoiceNumber] || [];
        const vendorCount = vendorCounts[invoiceNumber];
        const companyCount = companyCounts[invoiceNumber] || 0;

        if (vendorCount > 1) {
            vendorRecords.forEach(rec => {
                results.push({
                    invoiceNumber: invoiceNumber,
                    vendorCode: rec.vendorCode,
                    status: "Duplicate",
                    vendorAmount: parseFloat(rec.amount) || 0,
                    companyAmount: companyRecords.length > 0 ? parseFloat(companyRecords[0].amount) || 0 : 0,
                    amountVariance: 0,
                    vendorDate: rec.invoiceDate || null,
                    companyDate: companyRecords.length > 0 ? companyRecords[0].invoiceDate || null : null,
                    dateVarianceDays: 0,
                    currency: rec.currency || "",
                    poNumber: rec.poNumber || "",
                    grnNumber: rec.grnNumber || ""
                });
            });
            if (companyRecords.length > 0) {
                matchedCompanyInvoices.add(invoiceNumber);
            }
            continue;
        }

        if (companyRecords.length === 0) {
            const rec = vendorRecords[0];
            results.push({
                invoiceNumber: invoiceNumber,
                vendorCode: rec.vendorCode,
                status: "Missing Company",
                vendorAmount: parseFloat(rec.amount) || 0,
                companyAmount: 0,
                amountVariance: parseFloat(rec.amount) || 0,
                vendorDate: rec.invoiceDate || null,
                companyDate: null,
                dateVarianceDays: 0,
                currency: rec.currency || "",
                poNumber: rec.poNumber || "",
                grnNumber: rec.grnNumber || ""
            });
            continue;
        }

        if (companyCount > 1) {
            const vr = vendorRecords[0];
            companyRecords.forEach(rec => {
                matchedCompanyInvoices.add(invoiceNumber);
                const vAmt = parseFloat(vr.amount) || 0;
                const cAmt = parseFloat(rec.amount) || 0;
                const vDate = vr.invoiceDate ? new Date(vr.invoiceDate) : null;
                const cDate = rec.invoiceDate ? new Date(rec.invoiceDate) : null;
                const dayDiff = (vDate && cDate) ? Math.round((cDate - vDate) / 86400000) : 0;

                let status = "Matched";
                if (Math.abs(vAmt - cAmt) > tolerance.amount) status = "Amount Difference";
                else if (Math.abs(dayDiff) > tolerance.days) status = "Date Difference";

                results.push({
                    invoiceNumber: invoiceNumber,
                    vendorCode: vr.vendorCode,
                    status: status,
                    vendorAmount: vAmt,
                    companyAmount: cAmt,
                    amountVariance: vAmt - cAmt,
                    vendorDate: vr.invoiceDate || null,
                    companyDate: rec.invoiceDate || null,
                    dateVarianceDays: dayDiff,
                    currency: vr.currency || "",
                    poNumber: vr.poNumber || "",
                    grnNumber: vr.grnNumber || ""
                });
            });
            continue;
        }

        const vr = vendorRecords[0];
        const cr = companyRecords[0];
        matchedCompanyInvoices.add(invoiceNumber);

        const vAmt = parseFloat(vr.amount) || 0;
        const cAmt = parseFloat(cr.amount) || 0;
        const vDate = vr.invoiceDate ? new Date(vr.invoiceDate) : null;
        const cDate = cr.invoiceDate ? new Date(cr.invoiceDate) : null;
        const dayDiff = (vDate && cDate) ? Math.round((cDate - vDate) / 86400000) : 0;

        let status = "Matched";
        if (Math.abs(vAmt - cAmt) > tolerance.amount) {
            status = "Amount Difference";
        } else if (Math.abs(dayDiff) > tolerance.days) {
            status = "Date Difference";
        }

        results.push({
            invoiceNumber: invoiceNumber,
            vendorCode: vr.vendorCode,
            status: status,
            vendorAmount: vAmt,
            companyAmount: cAmt,
            amountVariance: vAmt - cAmt,
            vendorDate: vr.invoiceDate || null,
            companyDate: cr.invoiceDate || null,
            dateVarianceDays: dayDiff,
            currency: vr.currency || "",
            poNumber: vr.poNumber || "",
            grnNumber: vr.grnNumber || ""
        });
    }

    for (const [invoiceNumber, companyRecords] of Object.entries(companyMap)) {
        if (!matchedCompanyInvoices.has(invoiceNumber)) {
            companyRecords.forEach(rec => {
                results.push({
                    invoiceNumber: invoiceNumber,
                    vendorCode: rec.vendorCode,
                    status: "Missing Vendor",
                    vendorAmount: 0,
                    companyAmount: parseFloat(rec.amount) || 0,
                    amountVariance: -(parseFloat(rec.amount) || 0),
                    vendorDate: null,
                    companyDate: rec.invoiceDate || null,
                    dateVarianceDays: 0,
                    currency: rec.currency || "",
                    poNumber: rec.poNumber || "",
                    grnNumber: rec.grnNumber || ""
                });
            });
        }
    }

    results.sort((a, b) => a.invoiceNumber.localeCompare(b.invoiceNumber));

    return results;
}

module.exports = { reconcileVendorStatements };
