const express = require('express');

module.exports = (client, config) => {
    console.log('Express booting on port:', config.incomingPort);
    const app = express();
    
    // Simple root endpoint
    app.get('/', (req, res) => res.send('SA:MP bridge alive'));
    
    app.use(express.urlencoded({ extended: false }));
    
    // Existing routes for main bot
    app.use(
        '/incoming-chat',
        require('../routes/incomingChat')(client, config)
    );
    
    app.use(
        '/incoming-dialog',
        require('../routes/incomingDialog')(client, config)
    );
    
    app.use(
        '/incoming-textdraw',
        require('../routes/incomingTextdraw')(client, config)
    );
    
    // New route for scanner dialogs
    app.use(
        '/scanner/incoming-dialog',
        require('../routes/scanner/incomingDialog')(client, config)
    );
    
    app.listen(config.incomingPort, () => {
        console.log(`✅ Express listening on port ${config.incomingPort}`);
    });
    
    return app;
};