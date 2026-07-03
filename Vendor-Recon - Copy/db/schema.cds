namespace sap.btp.vendorrecon;

entity Vendors {
    key code : String(50);
    name     : String(255);
    email    : String(255);
    phone    : String(50);
    address  : String(1000);
    currency : String(3);
    gstNumber: String(50);
}

entity Invoices {
    key invoiceNumber : String(100);
    vendorCode        : String(50);
    amount            : Decimal(15, 2);
    invoiceDate       : Date;
    poNumber          : String(100);
    grnNumber         : String(100);
    currency          : String(3);
    gstAmount         : Decimal(15, 2);
    status            : String(50);
    paymentStatus     : String(50);
}

entity Payments {
    key paymentReference : String(100);
    vendorCode           : String(50);
    invoiceNumber        : String(100);
    amount               : Decimal(15, 2);
    paymentDate          : Date;
    status               : String(50);
    currency             : String(3);
}

entity VendorStatements {
    key ID           : UUID;
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

entity CompanyStatements {
    key ID           : UUID;
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
