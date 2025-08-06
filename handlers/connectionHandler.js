const axios = require('axios');
const config = require('../config.json');

let lastMessageTime = Date.now();
let connectionTestInProgress = false;
let reconnectScheduled = false;

module.exports = (client) => {
    // Reset timer on any message
    client.on('samp_message', () => {
        lastMessageTime = Date.now();
    });

    // Reset timer on dialog
    client.on('dialog', () => {
        lastMessageTime = Date.now();
    });

    // Connection monitor
    setInterval(() => {
        if (connectionTestInProgress || reconnectScheduled) return;
        
        const now = Date.now();
        const inactiveTime = now - lastMessageTime;
        
        if (inactiveTime > 60 * 1000) { // 1 minute without messages
            testConnection(client);
        }
    }, 10 * 1000); // Check every 10 seconds
};

async function testConnection(client) {
    try {
        connectionTestInProgress = true;
        console.log('[Connection] Testing server connection...');
        
        // Utility to wait for dialog
        const waitForDialog = (filter, timeout) => {
            return new Promise(resolve => {
                const handler = dlg => {
                    if (filter(dlg)) {
                        cleanup();
                        resolve(dlg);
                    }
                };
                const timer = setTimeout(() => {
                    cleanup();
                    resolve(null);
                }, timeout);
                function cleanup() {
                    clearTimeout(timer);
                    client.off('dialog', handler);
                }
                client.on('dialog', handler);
            });
        };

        // Send test command
        await axios.post(
            `http://${config.raksampHost}:${config.raksampPort}/`,
            `command=${encodeURIComponent('/groups')}`,
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        );
        
        // Wait for Online Groups dialog
        const dialog = await waitForDialog(
            d => d.title.toLowerCase().includes('online groups'),
            5000 // 5 second timeout
        );
        
        if (dialog) {
            console.log('[Connection] Server responded with groups dialog');
        } else {
            console.log('[Connection] No response from server. Reconnecting...');
            await reconnectToServer();
        }
        
    } catch (error) {
        console.error('[Connection] Test failed:', error.message);
        await reconnectToServer();
    } finally {
        connectionTestInProgress = false;
        reconnectScheduled = false;
        lastMessageTime = Date.now();
    }
}

async function reconnectToServer() {
    try {
        reconnectScheduled = true;
        
        // Send reconnect command
        await axios.post(
            `http://${config.raksampHost}:${config.raksampPort}/`,
            'botcommand=reconnect',
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        );
        
        console.log('[Connection] Reconnect command sent');
    } catch (error) {
        console.error('[Connection] Reconnect failed:', error.message);
    }
}