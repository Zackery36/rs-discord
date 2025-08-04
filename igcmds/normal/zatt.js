const ZoneManager = require('../../utils/ZoneManager');
const axios = require('axios');
const config = require('../../config.json');

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
    name: 'zatt',
    description: 'Attack an attackable zone by group tag',
    execute: async (client, config, args, player) => {
        if (args.length < 1) {
            return 'Usage: !zatt [groupTag]';
        }
        
        const tag = args[0];
        const groupName = ZoneManager.getGroupNameByTag(tag) || tag;
        
        if (groupName === config.defaultGroup) {
            return '❌ You cannot attack your own group!';
        }
        
        const result = ZoneManager.getZoneByGroupTag(tag);
        
        if (typeof result === 'string') {
            return result;
        }
        
        const zoneId = result;
        const position = ZoneManager.getZonePosition(zoneId);
        
        if (!position) {
            return `❌ Zone #${zoneId} position not mapped`;
        }
        
        try {
            // Teleport to zone
            await axios.post(
                `http://${config.raksampHost}:${config.raksampPort}/`,
                `command=${encodeURIComponent(`/pos ${position.x} ${position.y} ${position.z} 1 0`)}`,
                { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
            );
            
            // Short delay before attack
            await delay(300);
            
            // Start attack
            await axios.post(
                `http://${config.raksampHost}:${config.raksampPort}/`,
                `command=${encodeURIComponent('/gz')}`,
                { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
            );
            
            // Short delay before notification
            await delay(100);
            
            
            // Set timeout for return
            setTimeout(async () => {
                try {
                    await axios.post(
                        `http://${config.raksampHost}:${config.raksampPort}/`,
                        `command=${encodeURIComponent('/fr')}`,
                        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
                    );
                } catch (e) {
                    console.error(`[zatt] Failed to return: ${e.message}`);
                }
            }, 40000);
            
            return `Attacking zone #${zoneId} of ${groupName}.`;
        } catch (e) {
            return `❌ Failed to attack: ${e.message}`;
        }
    }
};