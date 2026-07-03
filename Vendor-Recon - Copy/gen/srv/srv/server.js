const cds = require('@sap/cds');

cds.on('bootstrap', (app) => {
    // Redirect global metadata request to the catalog service metadata
    app.get('/\\$metadata', (req, res) => {
        res.redirect('/catalog/$metadata');
    });
});

module.exports = cds.server;
