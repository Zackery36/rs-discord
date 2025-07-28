// routes/incomingDialog.js
const express = require('express');

module.exports = (client, config) => {
  const router = express.Router();

  router.post('/', (req, res) => {
    const { dialog_id, title, info } = req.body;
    console.log('[SA:MP→Discord] Dialog recv:', { dialog_id, title });

    // Emit an event so any part of the bot can pick it up (e.g. gfind.js)
    client.emit('dialog', {
      dialogId: Number(dialog_id),
      title,
      info
    });

    res.send('OK');
  });

  return router;
};
