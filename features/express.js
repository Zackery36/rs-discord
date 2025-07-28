const express = require('express');

module.exports = (client, config) => {
  console.log('Express feature booting… port:', config.incomingPort);
  const app = express();
  
  // Simple root endpoint
  app.get('/', (req, res) => res.send('SA:MP bridge alive'));
  
  app.use(express.urlencoded({ extended: false }));
  
  // Existing routes
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
  
  app.listen(config.incomingPort, () => {
    console.log(`✅ Express listening on port ${config.incomingPort}`);
  });
  
  return app;
};