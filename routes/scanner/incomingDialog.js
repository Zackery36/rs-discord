const express = require('express');

module.exports = (client, config) => {
    const router = express.Router();

    router.post('/', (req, res) => {
        const { dialog_id, title, info } = req.body;
        console.log('[Scanner] Dialog recv:', title);

        // Emit to client for processing
        client.emit('scanner_dialog', {
            dialogId: Number(dialog_id),
            title,
            info
        });

        res.send('OK');
    });

    return router;
};