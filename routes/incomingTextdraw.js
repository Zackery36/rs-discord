const express = require('express');

module.exports = (client, config) => {
  const router = express.Router();

  router.post('/', (req, res) => {
    const { textdraw_id, text } = req.body;
    console.log(`[SA:MP→Discord] Textdraw recv: ID ${textdraw_id}, Text: ${text}`);

    // Emit an event for other parts of the bot
    client.emit('textdraw', {
      textdrawId: Number(textdraw_id),
      text
    });

    res.send('OK');
  });

  return router;
};