const axios = require('axios');
const config = require('../../config.json');
const ZoneManager = require('../../utils/ZoneManager');

async function sendCommand(command) {
    try {
        await axios.post(
            `http://${config.raksampHost}:${config.raksampPort}/`,
            `command=${encodeURIComponent(command)}`,
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 2000 }
        );
        return true;
    } catch (e) {
        console.error(`[GZS] Command failed: ${command} - ${e.message}`);
        return false;
    }
}

module.exports = {
    name: 'gzs',
    description: 'Check group war status',
    execute: async (client, config, args, player, playerId) => {
        const defaultGroup = config.defaultGroup;
        let groupTag = args[0];
        let groupName;
        
        // Determine group to check
        if (!groupTag) {
            groupName = defaultGroup;
        } else {
            groupName = ZoneManager.getGroupNameByTag(groupTag);
            if (!groupName) return `❌ No group found with tag: ${groupTag}`;
        }
        
        const opponent = ZoneManager.getGroupWarStatus(groupName);
        if (!opponent) {
            return `⚔️ ${groupName} is not currently in a war.`;
        }
        
        // Check if it's our group or opponent
        if (groupName === defaultGroup || opponent === defaultGroup) {
            return new Promise(async (resolve) => {
                let timerData = null;
                const timeoutRef = setTimeout(() => {
                    client.off('textdraw', textdrawHandler);
                    resolve('❌ Failed to retrieve war timer');
                }, 10000);
                
                // Textdraw handler
                const textdrawHandler = (data) => {
                    if (data.textdrawId === 59) {
                        const match = data.text.match(/~r~~h~(\d+)~w~-~b~~h~(\d+)\s*~n~~w~(\d+:\d+)/);
                        
                        if (match) {
                            timerData = {
                                attacker: match[1],
                                defender: match[2],
                                time: match[3]
                            };
                            
                            clearTimeout(timeoutRef);
                            client.off('textdraw', textdrawHandler);
                            
                            // Format response
                            const response = `⏱️ War Timer: ${timerData.time} | Score: ${timerData.attacker}-${timerData.defender} (${groupName} vs ${opponent})`;
                            resolve(response);
                        }
                    }
                };

                // Set up the handler
                client.on('textdraw', textdrawHandler);
                
                // Join GZ2
                const joined = await sendCommand('/gz2');
                if (!joined) {
                    clearTimeout(timeoutRef);
                    client.off('textdraw', textdrawHandler);
                    resolve('❌ Failed to join GZ2');
                }
            }).then(async (response) => {
                await sendCommand('/fr');
                return response;
            });
        } 
        // For other groups
        else {
            const startTime = ZoneManager.getWarStartTime(groupName);
            if (!startTime) {
                return `⚔️ ${groupName} is in war against ${opponent}`;
            }
            
            const now = Date.now();
            const elapsed = now - startTime;
            const warDuration = 10 * 60 * 1000; // 10 minutes
            const remaining = warDuration - elapsed;
            
            if (remaining <= 0) {
                return `⚔️ ${groupName} vs ${opponent} | War has ended`;
            }
            
            const minutes = Math.floor(remaining / 60000);
            const seconds = Math.floor((remaining % 60000) / 1000);
            return `⚔️ ${groupName} vs ${opponent} | Time left: ${minutes}:${seconds.toString().padStart(2, '0')}`;
        }
    }
};