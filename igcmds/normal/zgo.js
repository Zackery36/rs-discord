const ZoneManager = require('../../utils/ZoneManager');
const axios = require('axios');
const config = require('../../config.json');

module.exports = {
    name: 'zgo',
    description: 'Teleport to an attackable zone by group tag',
    execute: async (client, config, args, player) => {
        if (args.length < 1) {
            return 'Usage: !zgo [groupTag]';
        }
        
        const tag = args[0];
        const result = ZoneManager.getZoneByGroupTag(tag);
        
        // Handle error message
        if (typeof result === 'string') {
            return result;
        }
        
        // Handle valid zone ID
        const zoneId = result;
        const groupName = ZoneManager.getGroupNameByTag(tag) || tag;
        const position = ZoneManager.getZonePosition(zoneId);
        
        if (!position) {
            return `Zone #${zoneId} position not mapped`;
        }
        
        try {
            // Send initial response
            const initialResponse = `Going to zone #${zoneId} of ${groupName}. You have 40 seconds.`;
            await axios.post(
                `http://${config.raksampHost}:${config.raksampPort}/`,
                `message=${encodeURIComponent(`!${initialResponse}`)}`,
                { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
            );
            
            // Teleport to zone
            const teleportCmd = `/pos ${position.x} ${position.y} ${position.z}`;
            await axios.post(
                `http://${config.raksampHost}:${config.raksampPort}/`,
                `command=${encodeURIComponent(teleportCmd)}`,
                { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
            );
            
            // Set timeout for /fr command
            setTimeout(async () => {
                try {
                    await axios.post(
                        `http://${config.raksampHost}:${config.raksampPort}/`,
                        `command=${encodeURIComponent('/fr')}`,
                        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
                    );
                    
                    // Send return notification
                    await axios.post(
                        `http://${config.raksampHost}:${config.raksampPort}/`,
                        `message=${encodeURIComponent('!⏰ Time\'s up! Returning to spawn.')}`,
                        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
                    );
                } catch (e) {
                    console.error(`[zgo] Failed to return to spawn: ${e.message}`);
                }
            }, 40000); // 40 seconds
            
            return `eleported to zone #${zoneId} of ${groupName}. You have 40 seconds.`;
        } catch (e) {
            return `Failed to teleport: ${e.message}`;
        }
    }
};