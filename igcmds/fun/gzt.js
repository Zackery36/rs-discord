const axios = require('axios');
const config = require('../../config.json');
const ZoneManager = require('../../utils/ZoneManager');

// Track active countdowns and toggle state
const countdownStates = new Map();

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

function startCountdown(groupName, opponent) {
    if (countdownStates.has(groupName)) {
        // Clear existing if any
        const { firstMinuteTimeout, lastMinuteTimeout } = countdownStates.get(groupName);
        clearTimeout(firstMinuteTimeout);
        clearTimeout(lastMinuteTimeout);
    }
    
    // First minute countdown (last 10 seconds)
    const firstMinuteTimeout = setTimeout(async () => {
        await sendGroupMessage('⚠️ 10 seconds left in the first minute!');
        
        setTimeout(async () => {
            await sendGroupMessage('⚠️ 5 seconds left in the first minute!');
            
            setTimeout(async () => {
                await sendGroupMessage('⚠️ 1 second left in the first minute!');
            }, 4000);
        }, 5000);
    }, 50 * 1000); // Start at 50 seconds
    
    // Final minute countdown (last 10 seconds)
    const lastMinuteTimeout = setTimeout(async () => {
        await sendGroupMessage('⚠️ 10 seconds left in the war!');
        
        setTimeout(async () => {
            await sendGroupMessage('⚠️ 5 seconds left in the war!');
            
            setTimeout(async () => {
                await sendGroupMessage('⚠️ 1 second left in the war!');
            }, 4000);
        }, 5000);
    }, (9 * 60 + 50) * 1000); // Start at 9:50
    
    // Store the timeouts
    countdownStates.set(groupName, {
        enabled: true,
        firstMinuteTimeout,
        lastMinuteTimeout
    });
}

module.exports = {
    name: 'gzt',
    description: 'Toggle war countdown notifications',
    execute: async (client, config, args, player, playerId) => {
        const defaultGroup = config.defaultGroup;
        
        // Toggle functionality
        if (args.length === 0) {
            // Toggle state
            const currentState = countdownStates.get(defaultGroup)?.enabled || false;
            const newState = !currentState;
            
            if (newState) {
                // Check if we're in a war
                const opponent = ZoneManager.getGroupWarStatus(defaultGroup);
                if (!opponent) {
                    return '⚔️ Group is not in war. Enable when war starts.';
                }
                
                startCountdown(defaultGroup, opponent);
                return '✅ War countdown notifications ENABLED!';
            } else {
                // Disable
                if (countdownStates.has(defaultGroup)) {
                    const { firstMinuteTimeout, lastMinuteTimeout } = countdownStates.get(defaultGroup);
                    clearTimeout(firstMinuteTimeout);
                    clearTimeout(lastMinuteTimeout);
                    countdownStates.delete(defaultGroup);
                }
                return '✅ War countdown notifications DISABLED!';
            }
        }
        
        return '❌ Usage: ,gzt (with no arguments to toggle)';
    }
};