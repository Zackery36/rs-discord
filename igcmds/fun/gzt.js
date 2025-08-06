const ZoneManager = require('../../utils/ZoneManager');
const axios = require('axios');
const config = require('../../config.json');

// Map to track active war countdowns
const activeCountdowns = new Map();

// Helper to send group messages
async function sendGroupMessage(message) {
    try {
        await axios.post(
            `http://${config.raksampHost}:${config.raksampPort}/`,
            `message=!${encodeURIComponent(message)}`,
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        );
    } catch (e) {
        console.error('[gzt] Failed to send group message:', e);
    }
}

// Start countdown for a war
function startWarCountdown(group, opponent) {
    if (activeCountdowns.has(group)) return;
    
    const warDuration = 10 * 60 * 1000; // 10 minutes
    const startTime = Date.now();
    const endTime = startTime + warDuration;
    
    // First minute countdown
    const firstMinuteTimers = [
        setTimeout(() => sendGroupMessage('⚔️ 10 seconds left in first minute!'), 50000),
        setTimeout(() => sendGroupMessage('⚔️ 5 seconds left in first minute!'), 55000),
        setTimeout(() => sendGroupMessage('⚔️ 1 second left in first minute!'), 59000)
    ];
    
    // Final countdown
    const finalCountdownTimers = [
        setTimeout(() => sendGroupMessage('⏱️ 10 SECONDS REMAINING!'), warDuration - 10000),
        setTimeout(() => sendGroupMessage('⏱️ 5 SECONDS REMAINING!'), warDuration - 5000),
        setTimeout(() => sendGroupMessage('⏱️ 1 SECOND REMAINING!'), warDuration - 1000)
    ];
    
    // War end cleanup
    const endTimer = setTimeout(() => {
        sendGroupMessage('🛑 WAR HAS ENDED!');
        activeCountdowns.delete(group);
    }, warDuration);
    
    activeCountdowns.set(group, {
        timers: [...firstMinuteTimers, ...finalCountdownTimers, endTimer],
        startTime,
        opponent
    });
}

// Stop countdown for a war
function stopWarCountdown(group) {
    if (!activeCountdowns.has(group)) return;
    
    const { timers } = activeCountdowns.get(group);
    timers.forEach(timer => clearTimeout(timer));
    activeCountdowns.delete(group);
    sendGroupMessage('🛑 WAR ENDED EARLY!');
}

module.exports = {
    name: 'gzt',
    description: 'Toggle group war countdown messages',
    execute: async (client, config, args, player) => {
        // Toggle command
        if (args.length === 0) {
            const newStatus = !ZoneManager.countdownEnabled;
            ZoneManager.toggleCountdown(newStatus);
            return `✅ Group war countdowns ${newStatus ? 'enabled' : 'disabled'}`;
        }
        
        // Status command
        if (args[0] === 'status') {
            const status = ZoneManager.countdownEnabled ? 'enabled' : 'disabled';
            return `Countdown status: ${status}`;
        }
        
        // Enable command
        if (args[0] === 'enable') {
            ZoneManager.toggleCountdown(true);
            return '✅ Group war countdowns enabled';
        }
        
        // Disable command
        if (args[0] === 'disable') {
            ZoneManager.toggleCountdown(false);
            return '✅ Group war countdowns disabled';
        }
        
        return 'Usage: ,gzt [status|enable|disable] or just ,gzt to toggle';
    },
    
    // War event listeners
    initWarListeners: (client, config) => {
        // Start countdown when war begins
        client.on('warStarted', ({ group1, group2 }) => {
            if (!ZoneManager.countdownEnabled) return;
            
            // Check if our group is involved
            if (group1 === config.defaultGroup) {
                startWarCountdown(config.defaultGroup, group2);
            } else if (group2 === config.defaultGroup) {
                startWarCountdown(config.defaultGroup, group1);
            }
        });
        
        // Stop countdown when war ends
        client.on('warEnded', ({ group }) => {
            if (group === config.defaultGroup) {
                stopWarCountdown(config.defaultGroup);
            }
        });
    }
};