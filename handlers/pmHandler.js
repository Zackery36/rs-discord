const fs = require('fs');
const path = require('path');
const InputSanitizer = require('../utils/inputSanitizer');

module.exports = (client, config) => {
    const pmLogFile = path.join(__dirname, '../logs/pm.log');
    
    // Ensure log file exists
    if (!fs.existsSync(pmLogFile)) fs.writeFileSync(pmLogFile, '');
    
    client.on('samp_message', (raw) => {
        const pmRegex = /^>> PM from (.+?)\((\d+)\) \((Not )?Admin\): (.+)$/;
        const pmMatch = raw.match(pmRegex);
        
        if (pmMatch) {
            const playerName = pmMatch[1];
            const playerId = pmMatch[2];
            const isAdmin = !pmMatch[3];
            const pmContent = pmMatch[4];
            
            // Sanitize and log
            const cleanContent = InputSanitizer.sanitizeForRakSAMP(pmContent);
            fs.appendFile(pmLogFile, `${new Date().toISOString()} ${playerName} (${playerId}): ${cleanContent}\n`, (err) => {
                if (err) console.error('Failed to write to pm.log', err);
            });
            
            // Emit event for PMs
            client.emit('samp_pm', {
                playerName,
                playerId: parseInt(playerId),
                isAdmin,
                content: cleanContent
            });
        }
    });
};