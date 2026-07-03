const store = require('./memory-store');

function getCockpitData() {
    const totalUploaded = store.vendorStatement ? store.vendorStatement.length : 0;
    const matchResults = store.matchResults || [];
    
    const matchedCount = matchResults.filter(r => r.status === 'MATCHED').length;
    const exceptionsCount = store.exceptions ? store.exceptions.length : 0;
    const pendingCount = store.exceptions ? store.exceptions.filter(e => e.status === 'OPEN').length : 0;
    const resolvedCount = store.exceptions ? store.exceptions.filter(e => e.status === 'RESOLVED').length : 0;

    // Calculate counts for categories
    let amountMismatch = 0;
    let vendorMismatch = 0;
    let dateMismatch = 0;
    let missingVendor = 0;
    let missingCompany = 0;

    matchResults.forEach(r => {
        if (r.status !== 'MATCHED') {
            const out = r.outcome || '';
            if (out.includes('AMOUNT')) amountMismatch++;
            if (out.includes('VENDOR')) vendorMismatch++;
            if (out.includes('DATE')) dateMismatch++;
            if (out.includes('MISSING_VENDOR')) missingVendor++;
            if (out.includes('MISSING_COMPANY')) missingCompany++;
        }
    });

    const maxVal = Math.max((store.sapVendorLedger || []).length, totalUploaded);
    const matchRate = maxVal > 0 ? Math.round((matchedCount / maxVal) * 100) : 0;

    return {
        totalUploaded: totalUploaded,
        matched: matchedCount,
        exceptions: exceptionsCount,
        pending: pendingCount,
        resolved: resolvedCount,
        matchRate: matchRate + '%',
        executionTimeMs: store.recentUploadInfo ? store.recentUploadInfo.durationMs : 0,
        recentUpload: store.recentUploadInfo,
        categories: {
            amountMismatch,
            vendorMismatch,
            dateMismatch,
            missingVendor,
            missingCompany
        }
    };
}

module.exports = {
    getCockpitData
};
