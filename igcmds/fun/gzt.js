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
        console.error(`[GZT] Command failed: ${command} - ${e.message}`);
        return false;
    }
}

module.exports = {
    name: 'gzt',
    description: 'Check group war timer',
    execute: async (client, config, args, player, playerId) => {
        const ownGroup = config.defaultGroup;
        const opponent = ZoneManager.getGroupWarStatus(ownGroup);
        if (!opponent) {
            return '⚔️ Your group is not currently in a war.';
        }
        
        return new Promise(async (resolve) => {
            let timerData = null;
            const timeoutRef = setTimeout(() => {
                client.off('textdraw', textdrawHandler);
                resolve('❌ Failed to retrieve war timer');
            }, 1000);
            
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
                        const response = `⏱️ War Timer: ${timerData.time} | Score: ${timerData.attacker}-${timerData.defender} (against ${opponent})`;
                        resolve(response);
                    }
                }
            };

            // Set up the handler
            client.on('textdraw', textdrawHandler);
            
            // Join GZ2 only once
            const joined = await sendCommand('/gz2');
            if (!joined) {
                clearTimeout(timeoutRef);
                client.off('textdraw', textdrawHandler);
                resolve('❌ Failed to join GZ2');
            }
        }).then(async (response) => {
            // Always attempt to leave GZ2 after operation
            await sendCommand('/fr');
            return response;
        });
    }
};