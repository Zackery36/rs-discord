const axios = require('axios');
const config = require('../../config.json');
const ZoneManager = require('../../utils/ZoneManager');

// Track active countdowns
const activeCountdowns = new Map();

async function sendGroupMessage(message) {
    try {
        await axios.post(
            `http://${config.raksampHost}:${config.raksampPort}/`,
            `message=${encodeURIComponent(message)}`,
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 2000 }
        );
    } catch (e) {
        console.error(`[GZT] Failed to send message: ${e.message}`);
    }
}

module.exports = {
    name: 'gzt',
    description: 'Toggle war countdown notifications',
    execute: async (client, config, args, player, playerId) => {
        const defaultGroup = config.defaultGroup;
        
        // Toggle functionality
        if (args[0] === 'on' || args[0] === 'off') {
            const enabled = args[0] === 'on';
            ZoneManager.toggleCountdown(enabled);
            return `✅ War countdown notifications ${enabled ? 'ENABLED' : 'DISABLED'}`;
        }
        
        // Check if we're in a war
        const opponent = ZoneManager.getGroupWarStatus(defaultGroup);
        if (!opponent) {
            return '⚔️ Your group is not currently in a war.';
        }
        
        // Start countdown if not already running
        if (!activeCountdowns.has(defaultGroup)) {
            const warDuration = 10 * 60; // 10 minutes in seconds
            let remaining = warDuration;
            
            // First minute countdown (last 10 seconds)
            setTimeout(async () => {
                for (let i = 10; i > 0; i--) {
                    setTimeout(async () => {
                        if (i === 10) await sendGroupMessage('⚠️ 10 seconds left in the first minute!');
                        if (i === 5) await sendGroupMessage('⚠️ 5 seconds left in the first minute!');
                        if (i === 1) await sendGroupMessage('⚠️ 1 second left in the first minute!');
                    }, (60 - i) * 1000);
                }
            }, 50 * 1000); // Start at 50 seconds
            
            // Final minute countdown (last 10 seconds)
            setTimeout(async () => {
                for (let i = 10; i > 0; i--) {
                    setTimeout(async () => {
                        if (i === 10) await sendGroupMessage('⚠️ 10 seconds left in the war!');
                        if (i === 5) await sendGroupMessage('⚠️ 5 seconds left in the war!');
                        if (i === 1) await sendGroupMessage('⚠️ 1 second left in the war!');
                    }, (9 * 60 * 1000) + (60 - i) * 1000);
                }
            }, (9 * 60 + 50) * 1000); // Start at 9:50
            
            // Store the countdown reference
            activeCountdowns.set(defaultGroup, true);
            return '✅ War countdown started!';
        }
        
        return '❌ Countdown is already running for this war.';
    }
};