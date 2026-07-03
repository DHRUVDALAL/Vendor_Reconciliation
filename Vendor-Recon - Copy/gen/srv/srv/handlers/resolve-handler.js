const store = require('./memory-store');

function resolveException(invoiceNumber) {
    if (!invoiceNumber) {
        throw new Error("invoiceNumber parameter is required");
    }

    const exception = (store.exceptions || []).find(e => e.invoiceNumber === invoiceNumber);
    if (!exception) {
        throw new Error(`Exception with Invoice Number "${invoiceNumber}" not found.`);
    }

    exception.status = 'RESOLVED';

    // Sync state with match results
    const matchRecord = (store.matchResults || []).find(r => r.invoiceNumber === invoiceNumber);
    if (matchRecord) {
        matchRecord.status = 'RESOLVED';
    }

    console.log(`Exception resolved locally for Invoice: ${invoiceNumber}`);
    return `Exception for Invoice ${invoiceNumber} resolved successfully`;
}

module.exports = {
    resolveException
};
