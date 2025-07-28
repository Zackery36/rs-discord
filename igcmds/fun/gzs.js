const ZoneManager = require('../../utils/ZoneManager');
const config = require('../../config.json');

module.exports = {
    name: 'gzs',
    description: 'Check group war status',
    execute: async (client, config, args, player, playerId) => {
        let groupTag = args[0];
        let groupName;
        
        // If no tag provided, use default group
        if (!groupTag) {
            groupName = config.defaultGroup;
        } else {
            groupName = ZoneManager.getGroupNameByTag(groupTag);
            if (!groupName) return `❌ No group found with tag: ${groupTag}`;
        }
        
        const opponent = ZoneManager.getGroupWarStatus(groupName);
        
        if (opponent) {
            // Get group name without tag for response
            const groupNameOnly = groupName.split(' ')[0];
            const opponentNameOnly = opponent.split(' ')[0];
            return `⚔️ ${groupName} is currently in war against ${opponent}!`;
        }
        
        return `⚔️ ${groupName} is not currently in a war.`;
    }
};