const express = require('express');
const fs = require('fs');
const path = require('path');

module.exports = (client, config) => {
    const router = express.Router();
    const chatLogFile = path.join(__dirname, '../logs/chat.log');

    router.post('/', async (req, res) => {
        const raw = req.body.message || '';
        console.log('[SA:MP→Discord] raw:', raw);

        // Append to chat.log
        fs.appendFile(chatLogFile, `${new Date().toISOString()} ${raw}\n`, err => {
            if (err) console.error('Failed to write chat.log:', err);
        });

        // Emit the raw message for handlers
        client.emit('samp_message', raw);
        
        res.send('OK');
    });

    return router;
};