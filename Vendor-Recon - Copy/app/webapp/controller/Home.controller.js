sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/ui/core/HTML",
    "sap/ui/core/BusyIndicator",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/model/Sorter"
], function (Controller, JSONModel, MessageToast, MessageBox, HTML, BusyIndicator, Filter, FilterOperator, Sorter) {
    "use strict";

    return Controller.extend("sap.btp.vendorrecon.controller.Home", {
        onInit: function () {

            // Initial data loads for standard master tables (preserves existing behavior)
            this._loadData("/catalog/Vendors", "vendorsModel");
            this._loadData("/catalog/Invoices", "invoicesModel");
            this._loadData("/catalog/Payments", "paymentsModel");

            // Initialize reconciliation models
            this.getView().setModel(new JSONModel({}), "cockpitModel");
            this.getView().setModel(new JSONModel({ matchResults: [] }), "workbenchModel");
        },

        _loadData: function (sUrl, sModelName) {
            var oView = this.getView();
            fetch(sUrl)
                .then(function (response) { return response.json(); })
                .then(function (data) {
                    var oModel = new JSONModel(data.value || data);
                    oView.setModel(oModel, sModelName);
                })
                .catch(function (error) {
                    console.error("Failed to load data from " + sUrl, error);
                });
        },

        _readFileAsBase64: function (oFile) {
            return new Promise(function (resolve, reject) {
                var oReader = new FileReader();
                oReader.onload = function (e) {
                    var sBase64 = e.target.result.split(",")[1];
                    resolve(sBase64);
                };
                oReader.onerror = function (err) {
                    reject(err);
                };
                oReader.readAsDataURL(oFile);
            });
        },

        // --- SEED SAP MOCK DATA ---
        onSeedMockData: function () {
            var oUploader = this.byId("sapLedgerUploader");
            var oFile = oUploader.getFocusDomRef().files[0];
            var oStatus = this.byId("txtSeedStatus");

            if (!oFile) {
                MessageBox.error("Please select a file to seed.");
                return;
            }

            var sName = oFile.name.toLowerCase();
            if (!sName.endsWith(".xlsx")) {
                MessageBox.error("Only Excel (.xlsx) files are supported for seeding SAP Mock Data.");
                return;
            }

            BusyIndicator.show(0);
            oStatus.setText("Loading");
            oStatus.setState("Warning");

            var that = this;
            this._readFileAsBase64(oFile)
                .then(function (sBase64) {
                    return fetch("/catalog/seedSapMockData", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ fileContent: sBase64 })
                    });
                })
                .then(function (res) {
                    if (!res.ok) {
                        return res.text().then(function (text) { throw new Error(text); });
                    }
                    return res.json();
                })
                .then(function (data) {
                    BusyIndicator.hide();
                    oStatus.setText("Completed");
                    oStatus.setState("Success");
                    MessageBox.success(data.value || "SAP Mock Data seeded successfully!");
                })
                .catch(function (err) {
                    BusyIndicator.hide();
                    oStatus.setText("Error");
                    oStatus.setState("Error");
                    MessageBox.error("Seeding failed: " + err.message);
                });
        },

        // --- UPLOAD VENDOR STATEMENT AND MATCH ---
        onUploadAndMatch: function () {
            var oUploader = this.byId("vendorStatementUploader");
            var oFile = oUploader.getFocusDomRef().files[0];
            var oStatus = this.byId("txtUploadStatus");

            if (!oFile) {
                MessageBox.error("Please select a Vendor Statement spreadsheet to upload.");
                return;
            }

            var sName = oFile.name.toLowerCase();
            if (!sName.endsWith(".xlsx")) {
                MessageBox.error("Only Excel (.xlsx) files are supported for Vendor Statement uploads.");
                return;
            }

            BusyIndicator.show(0);
            oStatus.setText("Uploading");
            oStatus.setState("Warning");

            var that = this;
            this._readFileAsBase64(oFile)
                .then(function (sBase64) {
                    oStatus.setText("Matching");
                    return fetch("/catalog/uploadStatement", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ fileContent: sBase64 })
                    });
                })
                .then(function (res) {
                    if (!res.ok) {
                        return res.text().then(function (text) { throw new Error(text); });
                    }
                    return res.json();
                })
                .then(function (data) {
                    oStatus.setText("Completed");
                    oStatus.setState("Success");
                    return that._refreshReconciliationData();
                })
                .then(function () {
                    BusyIndicator.hide();
                    MessageToast.show("Vendor statement uploaded and matched successfully.");
                })
                .catch(function (err) {
                    BusyIndicator.hide();
                    oStatus.setText("Error");
                    oStatus.setState("Error");
                    MessageBox.error("Upload & Match failed: " + err.message);
                });
        },

        _refreshReconciliationData: function () {
            var that = this;
            return Promise.all([
                fetch("/catalog/getCockpitData()").then(function (r) { return r.json(); }),
                fetch("/catalog/getWorkbenchData()").then(function (r) { return r.json(); })
            ]).then(function (aResults) {
                var oCockpit = JSON.parse(aResults[0].value || aResults[0]);
                var oWorkbench = JSON.parse(aResults[1].value || aResults[1]);

                // Map exception status (OPEN / RESOLVED / N/A) to workbench items
                var aExceptions = oWorkbench.exceptions || [];
                var oExceptionsMap = new Map();
                aExceptions.forEach(function (e) {
                    oExceptionsMap.set(e.invoiceNumber, e);
                });

                var aMatchResults = oWorkbench.matchResults || [];
                aMatchResults.forEach(function (row) {
                    if (row.status === "MATCHED") {
                        row.exceptionStatus = "N/A";
                    } else {
                        var ex = oExceptionsMap.get(row.invoiceNumber);
                        row.exceptionStatus = ex ? ex.status : "OPEN";
                    }
                });

                that.getView().getModel("cockpitModel").setData(oCockpit);
                that.getView().getModel("workbenchModel").setProperty("/matchResults", aMatchResults);

                // Render dynamic SVG dashboards
                that._renderCharts(oCockpit);
            });
        },

        _renderCharts: function (oCockpit) {
            var oPieBox = this.byId("pieChartBox");
            var oBarBox = this.byId("barChartBox");
            var oDonutBox = this.byId("donutChartBox");

            // 1. Matched vs Unmatched Pie (SVG)
            var matched = oCockpit.matched || 0;
            var unmatched = oCockpit.exceptions || 0;
            var total = matched + unmatched;
            var matchPct = total > 0 ? (matched / total) * 100 : 0;
            var unmatchPct = total > 0 ? (unmatched / total) * 100 : 0;

            var sPieSVG = '<svg width="150" height="150" viewBox="0 0 36 36" style="display: block; margin: auto;">' +
                          '<circle cx="18" cy="18" r="15.915" fill="#f3f4f6" />' +
                          '<circle cx="18" cy="18" r="15.915" fill="transparent" stroke="#10b981" stroke-width="4" ' +
                          'stroke-dasharray="' + matchPct + ' ' + (100 - matchPct) + '" stroke-dashoffset="25" />' +
                          '<circle cx="18" cy="18" r="15.915" fill="transparent" stroke="#ef4444" stroke-width="4" ' +
                          'stroke-dasharray="' + unmatchPct + ' ' + (100 - unmatchPct) + '" stroke-dashoffset="' + (25 - matchPct) + '" />' +
                          '</svg>' +
                          '<div style="text-align: center; margin-top: 15px; font-family: sans-serif; font-size: 0.85rem; font-weight: bold;">' +
                          '<span style="color: #10b981; margin-right: 15px;">● Matched: ' + Math.round(matchPct) + '%</span>' +
                          '<span style="color: #ef4444;">● Unmatched: ' + Math.round(unmatchPct) + '%</span>' +
                          '</div>';

            oPieBox.removeAllItems();
            oPieBox.addItem(new HTML({ content: sPieSVG }));

            // 2. Mismatch Categories (Bar Chart SVG/HTML)
            var cats = oCockpit.categories || {};
            var maxVal = Math.max(cats.amountMismatch || 0, cats.vendorMismatch || 0, cats.dateMismatch || 0, cats.missingVendor || 0, cats.missingCompany || 0) || 1;
            
            var amtBarPct = ((cats.amountMismatch || 0) / maxVal) * 100;
            var venBarPct = ((cats.vendorMismatch || 0) / maxVal) * 100;
            var datBarPct = ((cats.dateMismatch || 0) / maxVal) * 100;
            var misVenPct = ((cats.missingVendor || 0) / maxVal) * 100;
            var misCoPct = ((cats.missingCompany || 0) / maxVal) * 100;

            var sBarHTML = '<div style="font-family: sans-serif; font-size: 0.85rem; padding: 10px; width: 100%;">' +
                           '<div style="margin-bottom: 10px;">' +
                           '<div style="display: flex; justify-content: space-between; margin-bottom: 2px;">' +
                           '<span>Amount Mismatch</span><strong>' + (cats.amountMismatch || 0) + '</strong>' +
                           '</div>' +
                           '<div style="background: #e2e8f0; height: 12px; border-radius: 6px; overflow: hidden;">' +
                           '<div style="background: #f59e0b; width: ' + amtBarPct + '%; height: 100%;"></div>' +
                           '</div>' +
                           '</div>' +
                           '<div style="margin-bottom: 10px;">' +
                           '<div style="display: flex; justify-content: space-between; margin-bottom: 2px;">' +
                           '<span>Vendor Mismatch</span><strong>' + (cats.vendorMismatch || 0) + '</strong>' +
                           '</div>' +
                           '<div style="background: #e2e8f0; height: 12px; border-radius: 6px; overflow: hidden;">' +
                           '<div style="background: #3b82f6; width: ' + venBarPct + '%; height: 100%;"></div>' +
                           '</div>' +
                           '</div>' +
                           '<div style="margin-bottom: 10px;">' +
                           '<div style="display: flex; justify-content: space-between; margin-bottom: 2px;">' +
                           '<span>Date Mismatch</span><strong>' + (cats.dateMismatch || 0) + '</strong>' +
                           '</div>' +
                           '<div style="background: #e2e8f0; height: 12px; border-radius: 6px; overflow: hidden;">' +
                           '<div style="background: #8b5cf6; width: ' + datBarPct + '%; height: 100%;"></div>' +
                           '</div>' +
                           '</div>' +
                           '<div style="margin-bottom: 10px;">' +
                           '<div style="display: flex; justify-content: space-between; margin-bottom: 2px;">' +
                           '<span>Missing in Vendor</span><strong>' + (cats.missingVendor || 0) + '</strong>' +
                           '</div>' +
                           '<div style="background: #e2e8f0; height: 12px; border-radius: 6px; overflow: hidden;">' +
                           '<div style="background: #ec4899; width: ' + misVenPct + '%; height: 100%;"></div>' +
                           '</div>' +
                           '</div>' +
                           '<div>' +
                           '<div style="display: flex; justify-content: space-between; margin-bottom: 2px;">' +
                           '<span>Missing in Company</span><strong>' + (cats.missingCompany || 0) + '</strong>' +
                           '</div>' +
                           '<div style="background: #e2e8f0; height: 12px; border-radius: 6px; overflow: hidden;">' +
                           '<div style="background: #ef4444; width: ' + misCoPct + '%; height: 100%;"></div>' +
                           '</div>' +
                           '</div>' +
                           '</div>';

            oBarBox.removeAllItems();
            oBarBox.addItem(new HTML({ content: sBarHTML }));

            // 3. Resolved vs Pending Donut (SVG)
            var resolved = oCockpit.resolved || 0;
            var pending = oCockpit.pending || 0;
            var totalEx = resolved + pending;
            var resPct = totalEx > 0 ? (resolved / totalEx) * 100 : 0;
            var penPct = totalEx > 0 ? (pending / totalEx) * 100 : 0;

            var sDonutSVG = '<svg width="150" height="150" viewBox="0 0 36 36" style="display: block; margin: auto;">' +
                            '<circle cx="18" cy="18" r="15.915" fill="transparent" stroke="#e2e8f0" stroke-width="4.5" />' +
                            '<circle cx="18" cy="18" r="15.915" fill="transparent" stroke="#10b981" stroke-width="4.5" ' +
                            'stroke-dasharray="' + resPct + ' ' + (100 - resPct) + '" stroke-dashoffset="25" />' +
                            '<circle cx="18" cy="18" r="15.915" fill="transparent" stroke="#3b82f6" stroke-width="4.5" ' +
                            'stroke-dasharray="' + penPct + ' ' + (100 - penPct) + '" stroke-dashoffset="' + (25 - resPct) + '" />' +
                            '<circle cx="18" cy="18" r="11" fill="#ffffff" />' +
                            '<text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" font-weight="bold" font-size="5" fill="#1e293b">' +
                            totalEx +
                            '</text>' +
                            '</svg>' +
                            '<div style="text-align: center; margin-top: 15px; font-family: sans-serif; font-size: 0.85rem; font-weight: bold;">' +
                            '<span style="color: #10b981; margin-right: 15px;">● Resolved: ' + resolved + '</span>' +
                            '<span style="color: #3b82f6;">● Pending: ' + pending + '</span>' +
                            '</div>';

            oDonutBox.removeAllItems();
            oDonutBox.addItem(new HTML({ content: sDonutSVG }));
        },

        onGoToCockpit: function () {
            var oModel = this.getView().getModel("cockpitModel");
            if (!oModel.getProperty("/totalUploaded")) {
                MessageBox.warning("No data analyzed yet. Please seed mock data and upload statements first.");
                return;
            }
            this.byId("idIconTabBar").setSelectedKey("cockpit");
        },

        // --- WORKBENCH EXCEPTION RESOLUTION ---
        onResolveException: function (oEvent) {
            var oSource = oEvent.getSource();
            var oContext = oSource.getBindingContext("workbenchModel");
            var sInvoiceNumber = oContext.getProperty("invoiceNumber");
            var that = this;

            BusyIndicator.show(0);
            fetch("/catalog/resolveException", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ invoiceNumber: sInvoiceNumber })
            })
            .then(function (res) {
                if (!res.ok) {
                    return res.text().then(function (text) { throw new Error(text); });
                }
                return res.json();
            })
            .then(function () {
                // Refresh models to recalculate KPI match metrics
                return that._refreshReconciliationData();
            })
            .then(function () {
                BusyIndicator.hide();
                MessageToast.show("Exception resolved successfully.");
            })
            .catch(function (err) {
                BusyIndicator.hide();
                MessageBox.error("Failed to resolve exception: " + err.message);
            });
        },

        // --- FILTERING AND SORTING ---
        onFilterWorkbench: function () {
            var sInvoice = this.byId("filterInvoiceInput").getValue().toLowerCase();
            var sVendor = this.byId("filterVendorInput").getValue().toLowerCase();
            var sOutcome = this.byId("filterOutcomeSelect").getSelectedKey();
            var sStatus = this.byId("filterStatusSelect").getSelectedKey();
            var sCurrency = this.byId("filterCurrencyInput").getValue().toLowerCase();

            var oBinding = this.byId("workbenchTable").getBinding("items");
            var aFilters = [];

            if (sInvoice) {
                aFilters.push(new Filter("invoiceNumber", FilterOperator.Contains, sInvoice));
            }
            if (sVendor) {
                aFilters.push(new Filter("vendorCode", FilterOperator.Contains, sVendor));
            }
            if (sCurrency) {
                aFilters.push(new Filter("currency", FilterOperator.Contains, sCurrency));
            }

            if (sOutcome !== "ALL") {
                if (sOutcome === "MATCHED") {
                    aFilters.push(new Filter({
                        filters: [
                            new Filter("status", FilterOperator.EQ, "MATCHED"),
                            new Filter("status", FilterOperator.EQ, "RESOLVED")
                        ],
                        and: false
                    }));
                } else if (sOutcome === "DIFF") {
                    aFilters.push(new Filter("status", FilterOperator.EQ, "DIFFERENCE"));
                } else if (sOutcome === "MISSING") {
                    aFilters.push(new Filter("outcome", FilterOperator.Contains, "MISSING"));
                }
            }

            if (sStatus !== "ALL") {
                aFilters.push(new Filter("exceptionStatus", FilterOperator.EQ, sStatus));
            }

            oBinding.filter(aFilters);
        },

        onResetWorkbenchFilters: function () {
            this.byId("filterInvoiceInput").setValue("");
            this.byId("filterVendorInput").setValue("");
            this.byId("filterOutcomeSelect").setSelectedKey("ALL");
            this.byId("filterStatusSelect").setSelectedKey("ALL");
            this.byId("filterCurrencyInput").setValue("");
            this.byId("workbenchTable").getBinding("items").filter([]);
        },

        onSortWorkbench: function () {
            var sColumn = this.byId("sortColumnSelect").getSelectedKey();
            var sOrder = this.byId("sortOrderSelect").getSelectedKey();
            var bDescending = (sOrder === "DESC");

            var oBinding = this.byId("workbenchTable").getBinding("items");
            var oSorter = new Sorter(sColumn, bDescending);
            oBinding.sort(oSorter);
        },

        // --- EXPORT TO CSV ---
        _exportToExcel: function (aData, sFileName) {
            BusyIndicator.show(0);
            try {
                if (!aData || !aData.length) {
                    throw new Error("No data available to export.");
                }
                
                // Generate CSV content
                var aKeys = Object.keys(aData[0]);
                var sCsv = aKeys.map(function(key) {
                    return '"' + key.replace(/"/g, '""') + '"';
                }).join(",") + "\r\n";

                aData.forEach(function(row) {
                    var sRow = aKeys.map(function(key) {
                        var val = row[key] !== null && row[key] !== undefined ? row[key] : "";
                        return '"' + String(val).replace(/"/g, '""') + '"';
                    }).join(",");
                    sCsv += sRow + "\r\n";
                });

                // Add BOM for UTF-8 compatibility in Excel
                var blob = new Blob(["\ufeff" + sCsv], { type: "text/csv;charset=utf-8;" });
                var sDownloadName = sFileName.replace(/\.xlsx$/, ".csv");
                
                if (navigator.msSaveBlob) { // IE 10+
                    navigator.msSaveBlob(blob, sDownloadName);
                } else {
                    var link = document.createElement("a");
                    if (link.download !== undefined) {
                        var url = URL.createObjectURL(blob);
                        link.setAttribute("href", url);
                        link.setAttribute("download", sDownloadName);
                        link.style.visibility = "hidden";
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                    }
                }
                BusyIndicator.hide();
                MessageToast.show("Report exported successfully as " + sDownloadName);
            } catch (err) {
                BusyIndicator.hide();
                MessageBox.error("Export failed: " + err.message);
            }
        },

        onExportMatchedXLSX: function () {
            var aResults = this.getView().getModel("workbenchModel").getProperty("/matchResults") || [];
            var aMatched = aResults.filter(function (r) {
                return r.status === "MATCHED" || r.status === "RESOLVED";
            });

            var aExport = aMatched.map(function (r) {
                return {
                    "Invoice Number": r.invoiceNumber,
                    "Vendor Code": r.vendorCode,
                    "Amount": r.amount,
                    "Currency": r.currency,
                    "PO Reference": r.poReference,
                    "Payment Reference": r.paymentReference,
                    "Outcome": r.outcome,
                    "Invoice Date": r.invoiceDate
                };
            });
            this._exportToExcel(aExport, "matched_reconciliation_report.xlsx");
        },

        onExportExceptionsXLSX: function () {
            var aResults = this.getView().getModel("workbenchModel").getProperty("/matchResults") || [];
            var aExceptions = aResults.filter(function (r) {
                return r.status !== "MATCHED" && r.status !== "RESOLVED";
            });

            var aExport = aExceptions.map(function (r) {
                return {
                    "Invoice Number": r.invoiceNumber,
                    "Vendor Code": r.vendorCode,
                    "Amount": r.amount,
                    "Currency": r.currency,
                    "PO Reference": r.poReference,
                    "Payment Reference": r.paymentReference,
                    "Outcome": r.outcome,
                    "Exception Status": r.exceptionStatus,
                    "Rule": r.ruleApplied,
                    "Invoice Date": r.invoiceDate
                };
            });
            this._exportToExcel(aExport, "exception_reconciliation_report.xlsx");
        },

        onExportDashboardXLSX: function () {
            var oCockpit = this.getView().getModel("cockpitModel").getData() || {};
            var cats = oCockpit.categories || {};
            var aExport = [
                { "Metric": "Total Uploaded Statement Invoices", "Value": oCockpit.totalUploaded },
                { "Metric": "Reconciled Matched Count", "Value": oCockpit.matched },
                { "Metric": "Total Logged Exceptions", "Value": oCockpit.exceptions },
                { "Metric": "Pending Open Exceptions", "Value": oCockpit.pending },
                { "Metric": "Resolved Exceptions", "Value": oCockpit.resolved },
                { "Metric": "Match Rate Percentage", "Value": oCockpit.matchRate },
                { "Metric": "Execution Processing Time (ms)", "Value": oCockpit.executionTimeMs },
                { "Metric": "Amount Discrepancy Count", "Value": cats.amountMismatch || 0 },
                { "Metric": "Vendor Discrepancy Count", "Value": cats.vendorMismatch || 0 },
                { "Metric": "Date Discrepancy Count", "Value": cats.dateMismatch || 0 },
                { "Metric": "Missing In Vendor Count", "Value": cats.missingVendor || 0 },
                { "Metric": "Missing In Company Count", "Value": cats.missingCompany || 0 }
            ];
            this._exportToExcel(aExport, "reconciliation_dashboard_summary.xlsx");
        }
    });
});
