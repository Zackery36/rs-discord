const { EmbedBuilder } = require('discord.js');
const ZoneManager = require('../utils/ZoneManager');

module.exports = (client, config) => {
    client.on('samp_message', (raw) => {
        // Detect war outcome
        const warOutcomeRegex = /ZONE WAR: (.+?) (takes over|keeps) zone '#\s*(\d+)'/i;
        const warOutcomeMatch = raw.match(warOutcomeRegex);
        
        if (warOutcomeMatch) {
            const groupName = warOutcomeMatch[1];
            const action = warOutcomeMatch[2];
            const zoneId = parseInt(warOutcomeMatch[3]);
            
            const currentZone = ZoneManager.zones.get(zoneId);
            const defenderGroup = currentZone ? currentZone.owner : null;
            
            if (action === 'takes over') {
                // Handle capture
                const attackableAt = ZoneManager.recordZoneCapture(zoneId, groupName, defenderGroup);
                
                // Notify Discord
                const channel = client.channels.cache.get(config.zoneChannelId);
                if (channel) {
                    const embed = new EmbedBuilder()
                        .setTitle('⚔️ Zone Captured!')
                        .setDescription(
                            `**${groupName}** captured zone #${zoneId}\n` +
                            `Attackable again: <t:${Math.floor(attackableAt / 1000)}:R>`
                        )
                        .setColor(0x00FF00);
                    
                    channel.send({ embeds: [embed] });
                }
            } else if (action === 'keeps' && defenderGroup) {
                // Handle defense - record with previous owner's name
                const attackableAt = ZoneManager.recordZoneCapture(zoneId, defenderGroup, defenderGroup);
                
                // Notify Discord
                const channel = client.channels.cache.get(config.zoneChannelId);
                if (channel) {
                    const embed = new EmbedBuilder()
                        .setTitle('🛡️ Zone Defended!')
                        .setDescription(
                            `**${defenderGroup}** defended zone #${zoneId}\n` +
                            `Attackable again: <t:${Math.floor(attackableAt / 1000)}:R>`
                        )
                        .setColor(0xFFFF00); // Yellow color for defense
                    
                    channel.send({ embeds: [embed] });
                }
            }
        }
    });
};