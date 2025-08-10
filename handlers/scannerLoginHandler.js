const axios = require('axios');
const config = require('../config.json');

module.exports = (client) => {
    // Handle login dialogs
    client.on('scanner_dialog', async (dialog) => {
        try {
            // Auto-login for dialogs with "UIF - Login" in title
            if (dialog.title.includes('UIF - Login')) {
                const loginCmd = `botcommand=sendDialogResponse|${dialog.dialogId}|1|-1|${config.accountPassword}`;
                
                await axios.post(
                    `http://${config.raksampHost}:${config.scannerPort}/`,
                    loginCmd,
                    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
                );
            }
        } catch (e) {
            console.error('[Login] Failed to handle login dialog:', e.message);
        }
    });

    // Handle login notifications
    client.on('samp_message', async (raw) => {
        try {
            // Check for bot login message
            if (raw.includes(`${config.scannerBotName}(`) && raw.includes('logged in')) {
                // Execute spawn sequence
                await executeSpawnSequence();
            }
        } catch (e) {
            console.error('[Login] Failed to handle login message:', e.message);
        }
    });

    // Spawn sequence with retries and delays
    async function executeSpawnSequence() {
        const maxRetries = 3;
        let retryCount = 0;
        
        while (retryCount < maxRetries) {
            try {
                // Step 1: Send spawn command
                await axios.post(
                    `http://${config.raksampHost}:${config.scannerPort}/`,
                    'botcommand=spawn',
                    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
                );
                
                // Add delay before next command
                await new Promise(resolve => setTimeout(resolve, 1500));
                
                // Step 2: Send /fr command to leave interior
                await axios.post(
                    `http://${config.raksampHost}:${config.scannerPort}/`,
                    `command=${encodeURIComponent('/fr')}`,
                    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
                );
                
                // Add delay before final spawn
                await new Promise(resolve => setTimeout(resolve, 1500));
                
                // Step 3: Send spawn command again
                await axios.post(
                    `http://${config.raksampHost}:${config.scannerPort}/`,
                    'botcommand=spawn',
                    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
                );
                
                return;
                
            } catch (e) {
                retryCount++;
                if (retryCount < maxRetries) {
                    // Wait before retrying
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
        }
    }
};