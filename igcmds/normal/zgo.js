const ZoneManager = require('../../utils/ZoneManager');
const axios = require('axios');
const config = require('../../config.json');

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
    name: 'zgo',
    description: 'Teleport to an attackable zone by group tag',
    execute: async (client, config, args, player) => {
        if (args.length < 1) {
            return 'Usage: !zgo [groupTag]';
        }
        
        const tag = args[0];
        const result = ZoneManager.getZoneByGroupTag(tag);
        
        if (typeof result === 'string') {
            return result;
        }
        
        const zoneId = result;
        const groupName = ZoneManager.getGroupNameByTag(tag) || tag;
        const position = ZoneManager.getZonePosition(zoneId);
        
        if (!position) {
            return `Zone #${zoneId} position not mapped`;
        }
        
        try {
            // Teleport to zone
            await axios.post(
                `http://${config.raksampHost}:${config.raksampPort}/`,
                `command=${encodeURIComponent(`/pos ${position.x} ${position.y} ${position.z}`)}`,
                { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
            );
            
            // Short delay before notification
            await delay(100);
            
            // Send notification
            await axios.post(
                `http://${config.raksampHost}:${config.raksampPort}/`,
                `message=${encodeURIComponent(`!Going to zone #${zoneId} of ${groupName}. You have 40 seconds.`)}`,
                { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
            );
            
            // Set timeout for return
            setTimeout(async () => {
                try {
                    await axios.post(
                        `http://${config.raksampHost}:${config.raksampPort}/`,
                        `command=${encodeURIComponent('/fr')}`,
                        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
                    );
                } catch (e) {
                    console.error(`[zgo] Failed to return: ${e.message}`);
                }
            }, 40000);
            
            return `Teleported to zone #${zoneId} of ${groupName}. You have 40 seconds.`;
        } catch (e) {
            return `Failed to teleport: ${e.message}`;
        }
    }
};