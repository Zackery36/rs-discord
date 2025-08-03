const ZoneManager = require('../../utils/ZoneManager');

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
                response += `[${tag} ${zones.length}]`;
            }
            
            return response;
        } catch (e) {
            console.error('[zav] Command error:', e);
            return 'Error fetching zones';
        }
    }
};