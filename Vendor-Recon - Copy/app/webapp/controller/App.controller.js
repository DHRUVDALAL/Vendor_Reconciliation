sap.ui.define([
    "sap/ui/core/mvc/Controller"
], function (Controller) {
    "use strict";

    return Controller.extend("sap.btp.vendorrecon.controller.App", {
        onInit: function () {
            // Apply visual density class to the app
            if (this.getOwnerComponent() && this.getOwnerComponent().getContentDensityClass) {
                this.getView().addStyleClass(this.getOwnerComponent().getContentDensityClass());
            }
        }
    });
});
