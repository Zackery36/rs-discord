const ZoneManager = require('../../utils/ZoneManager');
const axios = require('axios');
const config = require('../../config.json');

module.exports = {
    name: 'zav',
    description: 'List attackable zones',
    execute: async (client, config, args, player) => {
        try {
            const attackableZones = ZoneManager.getAttackableZonesByGroup();
            if (!attackableZones || Object.keys(attackableZones).length === 0) {
                return 'No attackable zones available';
            }
            
            let response = 'ZA : ';
            for (const [groupName, zones] of Object.entries(attackableZones)) {
                const tag = ZoneManager.getGroupTag(groupName) || groupName.substring(0, 3).toUpperCase();
                response += `[${tag} ${zones.length}] `;
            }
            
            // Split response into chunks of max 100 characters
            const chunks = [];
            let currentChunk = '';
            const words = response.split(' ');
            
            for (const word of words) {
                if ((currentChunk + word).length + 1 > 100) {
                    chunks.push(currentChunk.trim());
                    currentChunk = '';
                }
                currentChunk += word + ' ';
            }
            
            if (currentChunk.trim()) {
                chunks.push(currentChunk.trim());
            }
            
            // Send chunks to SA-MP server
            for (const chunk of chunks) {
                await axios.post(
                    `http://${config.raksampHost}:${config.raksampPort}/`,
                    `message=!${encodeURIComponent(chunk)}`,
                    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
                );
                await new Promise(resolve => setTimeout(resolve, 300)); // Small delay between messages
            }
            
            return null; // Don't send response to Discord
        } catch (e) {
            console.error('[zav] Command error:', e);
            return 'Error fetching zones';
        }
    }
};