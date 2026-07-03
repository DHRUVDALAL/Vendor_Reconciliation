using { sap.btp.vendorrecon as my } from '../db/schema';

type ReconciliationResult {
    invoiceNumber     : String(100);
    vendorCode        : String(50);
    status            : String(50);
    vendorAmount      : Decimal(15, 2);
    companyAmount     : Decimal(15, 2);
    amountVariance    : Decimal(15, 2);
    vendorDate        : Date;
    companyDate       : Date;
    dateVarianceDays  : Integer;
    currency          : String(3);
    poNumber          : String(100);
    grnNumber         : String(100);
}

type StatementRecord {
    vendorCode       : String(50);
    invoiceNumber    : String(100);
    amount           : Decimal(15, 2);
    invoiceDate      : Date;
    poNumber         : String(100);
    grnNumber        : String(100);
    currency         : String(3);
    gstAmount        : Decimal(15, 2);
    status           : String(50);
}

service CatalogService @(path: '/catalog') {
    entity Vendors as projection on my.Vendors;
    entity Invoices as projection on my.Invoices;
    entity Payments as projection on my.Payments;

    type ReconcileSummary {
        totalCompany   : Integer;
        totalVendor    : Integer;
        matched        : Integer;
        unmatched      : Integer;
        missingCompany : Integer;
        missingVendor  : Integer;
        amountMismatch : Integer;
        vendorMismatch : Integer;
        dateMismatch   : Integer;
    }

    type MatchRecord {
        invoiceNumber : String(100);
        vendorCode    : String(50);
        amount        : Decimal(15, 2);
        invoiceDate   : Date;
        status        : String(50);
    }

    type UnmatchRecord {
        invoiceNumber : String(100);
        vendorCode    : String(50);
        companyAmount : Decimal(15, 2);
        vendorAmount  : Decimal(15, 2);
        companyDate   : Date;
        vendorDate    : Date;
        reason        : String(100);
    }

    type ReconcileResponse {
        matched   : array of MatchRecord;
        unmatched : array of UnmatchRecord;
        summary   : ReconcileSummary;
    }

    action reconcile(
        companyContent : LargeString,
        vendorContent  : LargeString
    ) returns ReconcileResponse;

    entity VendorStatements as projection on my.VendorStatements;
    entity CompanyStatements as projection on my.CompanyStatements;

    action UploadStatement(
        fileType      : String(10),
        statementType : String(20),
        content       : LargeString
    ) returns array of StatementRecord;

    action Reconcile(
        vendorStatements  : array of StatementRecord,
        companyStatements : array of StatementRecord,
        toleranceAmount   : Decimal(15, 2),
        toleranceDays     : Integer
    ) returns array of ReconciliationResult;

    action seedSapMockData(fileContent : LargeString) returns String;
    action uploadStatement(fileContent : LargeString) returns String;
    function getCockpitData() returns String;
    function getWorkbenchData() returns String;
    action resolveException(invoiceNumber : String) returns String;
}
