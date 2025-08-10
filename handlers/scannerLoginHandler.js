const axios = require('axios');
const config = require('../config.json');

module.exports = (client) => {
    // Handle login dialogs for scanner bot
    client.on('scanner_dialog', async (dialog) => {
        try {
            // Auto-login for dialogs with "UIF - Login" in title
            if (dialog.title.includes('UIF - Login')) {
                console.log(`[ScannerLogin] Handling login dialog for scanner bot`);
                
                const loginCmd = `botcommand=sendDialogResponse|${dialog.dialogId}|1|-1|${config.scannerAccountPassword}`;
                
                await axios.post(
                    `http://${config.raksampHost}:${config.scannerPort}/`,
                    loginCmd,
                    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
                );
                
                console.log('[ScannerLogin] Sent login credentials');
            }
        } catch (e) {
            console.error('[ScannerLogin] Failed to handle login dialog:', e.message);
        }
    });

    // Handle login notifications for scanner bot
    client.on('samp_message', async (raw) => {
        try {
            // Check for scanner bot login message
            if (raw.includes(`${config.scannerBotName}(`) && raw.includes('logged in')) {
                console.log(`[ScannerLogin] ${config.scannerBotName} logged in, executing spawn sequence`);
                await executeSpawnSequence();
            }
        } catch (e) {
            console.error('[ScannerLogin] Failed to handle login message:', e.message);
        }
    });

    // Spawn sequence with retries and delays for scanner bot
    async function executeSpawnSequence() {
        const maxRetries = 3;
        let retryCount = 0;
        
        while (retryCount < maxRetries) {
            try {
                console.log('[ScannerLogin] Executing spawn sequence attempt', retryCount + 1);
                
                // Step 1: Send spawn command to scanner bot
                await axios.post(
                    `http://${config.raksampHost}:${config.scannerPort}/`,
                    'botcommand=spawn',
                    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
                );
                
                // Add delay before next command
                await new Promise(resolve => setTimeout(resolve, 1500));
                
                // Step 2: Send /fr command to leave interior (scanner bot)
                await axios.post(
                    `http://${config.raksampHost}:${config.scannerPort}/`,
                    `command=${encodeURIComponent('/fr')}`,
                    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
                );
                
                // Add delay before final spawn
                await new Promise(resolve => setTimeout(resolve, 1500));
                
                // Step 3: Send spawn command again to scanner bot
                await axios.post(
                    `http://${config.raksampHost}:${config.scannerPort}/`,
                    'botcommand=spawn',
                    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
                );
                
                console.log('[ScannerLogin] Spawn sequence completed successfully');
                return;
                
            } catch (e) {
                retryCount++;
                console.error(`[ScannerLogin] Spawn sequence failed (attempt ${retryCount}):`, e.message);
                
                if (retryCount < maxRetries) {
                    // Wait before retrying
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
        }
        
        console.error('[ScannerLogin] Spawn sequence failed after all retries');
    }
};