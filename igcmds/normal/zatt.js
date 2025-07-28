const ZoneManager = require('../../utils/ZoneManager');
const axios = require('axios');
const config = require('../../config.json');

module.exports = {
    name: 'zatt',
    description: 'Attack an attackable zone by group tag',
    execute: async (client, config, args, player) => {
        if (args.length < 1) {
            return 'Usage: !zatt [groupTag]';
        }
        
        const tag = args[0];
        const groupName = ZoneManager.getGroupNameByTag(tag) || tag;
        
        // Check if trying to attack own group
        if (groupName === config.defaultGroup) {
            return '❌ You cannot attack your own group!';
        }
        
        const result = ZoneManager.getZoneByGroupTag(tag);
        
        // Handle error message
        if (typeof result === 'string') {
            return result;
        }
        
        // Handle valid zone ID
        const zoneId = result;
        const position = ZoneManager.getZonePosition(zoneId);
        
        if (!position) {
            return `❌ Zone #${zoneId} position not mapped`;
        }
        
        try {
            // Send initial response
            const initialResponse = `Attacking zone #${zoneId} of ${groupName}.`;
            await axios.post(
                `http://${config.raksampHost}:${config.raksampPort}/`,
                `command=${encodeURIComponent(initialResponse)}`,
                { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
            );
            
            // Teleport to zone
            const teleportCmd = `/pos ${position.x} ${position.y} ${position.z}`;
            await axios.post(
                `http://${config.raksampHost}:${config.raksampPort}/`,
                `command=${encodeURIComponent(teleportCmd)}`,
                { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
            );
            
            // Start attack
            const attackCmd = `/gz`;
            await axios.post(
                `http://${config.raksampHost}:${config.raksampPort}/`,
                `command=${encodeURIComponent(attackCmd)}`,
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
                        `command=${encodeURIComponent('⏰ Time\'s up! Returning to spawn.')}`,
                        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
                    );
                } catch (e) {
                    console.error(`[zatt] Failed to return to spawn: ${e.message}`);
                }
            }, 40000); // 40 seconds
            
            return `✅ Attacking zone #${zoneId} of ${groupName}. `;
        } catch (e) {
            return `❌ Failed to attack: ${e.message}`;
        }
    }
};