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
            testConnection();
        }
    }, 10 * 1000); // Check every 10 seconds
};

async function testConnection() {
    try {
        connectionTestInProgress = true;
        console.log('[Connection] Testing server connection...');
        
        // Send test command
        await axios.post(
            `http://${config.raksampHost}:${config.raksampPort}/`,
            `command=${encodeURIComponent('/groups')}`,
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        );
        
        // Set timeout to check if we get dialog
        setTimeout(async () => {
            if (!connectionTestInProgress) return;
            
            console.log('[Connection] No response from server. Reconnecting...');
            await reconnectToServer();
            
            connectionTestInProgress = false;
            reconnectScheduled = false;
            lastMessageTime = Date.now();
        }, 5000); // Wait 5 seconds for dialog
    } catch (error) {
        console.error('[Connection] Test failed:', error.message);
        connectionTestInProgress = false;
        reconnectScheduled = false;
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