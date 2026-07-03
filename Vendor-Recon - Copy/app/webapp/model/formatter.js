sap.ui.define([], function () {
    "use strict";

    return {
        /**
         * Returns SAPUI5 ValueState corresponding to reconciliation status
         * @param {string} sStatus - The status value
         * @returns {string} ValueState name (Success, Error, Warning, Information, None)
         */
        reconStatusState: function (sStatus) {
            switch (sStatus) {
                case "Matched":
                    return "Success";
                case "Amount Difference":
                    return "Error";
                case "Date Difference":
                case "Duplicate":
                case "Partial Match":
                    return "Warning";
                case "Missing Vendor":
                case "Missing Company":
                    return "Information";
                default:
                    return "None";
            }
        },

        /**
         * Formats numerical value to 2 decimal currency representation
         * @param {number|string} fAmount - Amount
         * @param {string} sCurrency - Currency code
         * @returns {string} Formatted string
         */
        formatCurrency: function (fAmount, sCurrency) {
            if (fAmount === null || fAmount === undefined) {
                return "0.00";
            }
            var nVal = parseFloat(fAmount);
            if (isNaN(nVal)) return "0.00";
            
            var sVal = nVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            return sCurrency ? sVal + " " + sCurrency : sVal;
        },

        /**
         * Formats a ISO date string to user locale date format
         * @param {string} sDate - Date string
         * @returns {string} Formatted date
         */
        formatDate: function (sDate) {
            if (!sDate) return "N/A";
            var oDate = new Date(sDate);
            if (isNaN(oDate.getTime())) return sDate;
            return oDate.toLocaleDateString();
        },

        /**
         * Formats OData date to display friendly text or date
         * @param {string} sDateTime - ISO DateTime
         * @returns {string}
         */
        formatDateTime: function (sDateTime) {
            if (!sDateTime) return "N/A";
            var oDate = new Date(sDateTime);
            if (isNaN(oDate.getTime())) return sDateTime;
            return oDate.toLocaleString();
        }
    };
});
