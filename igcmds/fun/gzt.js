const ZoneManager = require('../../utils/ZoneManager');

module.exports = {
    name: 'gzt',
    description: 'Manage group zone timers and countdowns',
    execute: async (client, config, args, player) => {
        if (args[0] === 'status') {
            const status = ZoneManager.countdownEnabled ? 'enabled' : 'disabled';
            return `Countdown status: ${status}`;
        }
        
        if (args[0] === 'enable') {
            ZoneManager.toggleCountdown(true);
            return '✅ Group war countdowns enabled';
        }
        
        if (args[0] === 'disable') {
            ZoneManager.toggleCountdown(false);
            return '✅ Group war countdowns disabled';
        }
        
        if (args.length < 1) {
            return 'Usage: ,gzt [status|enable|disable]';
        }
        
        const groupName = args.join(' ');
        const warOpponent = ZoneManager.getGroupWarStatus(groupName);
        
        if (!warOpponent) {
            return `❌ ${groupName} is not currently in a war`;
        }
        
        const startTime = ZoneManager.getWarStartTime(groupName);
        if (!startTime) {
            return `❌ Could not find war start time for ${groupName}`;
        }
        
        const warDuration = 10 * 60 * 1000; // 10 minutes
        const elapsed = Date.now() - startTime;
        const remaining = warDuration - elapsed;
        
        if (remaining <= 0) {
            return `❌ War for ${groupName} has already ended`;
        }
        
        const minutes = Math.floor(remaining / 60000);
        const seconds = Math.floor((remaining % 60000) / 1000);
        
        return `⏳ **${groupName} vs ${warOpponent}**: ${minutes}m ${seconds}s remaining`;
    }
};