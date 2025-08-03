const ZoneManager = require('../../utils/ZoneManager');

module.exports = {
    name: 'mapzone',
    description: 'Map a zone position',
    execute: async (client, config, args, player) => {
        if (args.length < 4) {
            return 'Usage: !mapzone [zoneId] [x] [y] [z]';
        }
        
        const zoneId = parseInt(args[0]);
        const x = parseFloat(args[1]);
        const y = parseFloat(args[2]);
        const z = parseFloat(args[3]);
        
        // Save position to czones.json
        ZoneManager.addZonePosition(zoneId, x, y, z);
        return `✅ Mapped position for zone #${zoneId}`;
    }
};