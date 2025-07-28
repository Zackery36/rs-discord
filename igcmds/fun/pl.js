const axios = require('axios');
const config = require('../../config.json');

module.exports = {
    name: 'pl',
    description: 'Get packet loss of a player',
    async execute(client, config, args, player, playerId) {
        // Parse target player ID
        let targetId = args[0] || playerId;
        
        if (!targetId) {
            return '❌ Please specify a player ID (e.g., ,pl 123)';
        }
        
        return new Promise(async (resolve) => {
            let playerName = null;
            let packetLoss = null;
            let bytesResent = null;
            
            // Handler for stats dialog to get player name
            const statsHandler = (dialog) => {
                if (dialog.title.includes('Player Stats')) {
                    // Extract player name from first line
                    const cleanInfo = dialog.info.replace(/{[A-F0-9]{6}}/gi, '');
                    const firstLine = cleanInfo.split('\n')[0].trim();
                    const nameMatch = firstLine.match(/^([^(]+)/);
                    
                    if (nameMatch) {
                        playerName = nameMatch[1].trim();
                        console.log(`[PL] Found player name: ${playerName}`);
                    }
                }
            };
            
            // Handler for packet loss dialog
            const plHandler = (dialog) => {
                if (dialog.title.includes('UIF - Player Network Stats')) {
                    // Parse packet loss and bytes resent
                    const cleanInfo = dialog.info.replace(/{[A-F0-9]{6}}/gi, '');
                    
                    // Get packet loss
                    const packetLossMatch = cleanInfo.match(/Packetloss:\s*([\d.]+%)/);
                    if (packetLossMatch) {
                        packetLoss = packetLossMatch[1];
                    }
                    
                    // Get bytes resent
                    const bytesResentMatch = cleanInfo.match(/Bytes resent:\s*(\d+)/);
                    if (bytesResentMatch) {
                        bytesResent = bytesResentMatch[1];
                    }
                }
            };
            
            // Set up both handlers
            client.on('dialog', statsHandler);
            client.on('dialog', plHandler);
            
            // Send stats command to get player name
            try {
                await axios.post(
                    `http://${config.raksampHost}:${config.raksampPort}/`,
                    `command=${encodeURIComponent(`/stats ${targetId}`)}`,
                    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
                );
            } catch (e) {
                cleanupHandlers();
                resolve(`❌ Failed to fetch player name: ${e.message}`);
                return;
            }
            
            // Send pnetstats command
            setTimeout(async () => {
                try {
                    await axios.post(
                        `http://${config.raksampHost}:${config.raksampPort}/`,
                        `command=${encodeURIComponent(`/pnetstats ${targetId}`)}`,
                        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
                    );
                } catch (e) {
                    cleanupHandlers();
                    resolve(`❌ Failed to fetch packet loss: ${e.message}`);
                    return;
                }
                
                // Set timeout for results
                setTimeout(() => {
                    cleanupHandlers();
                    
                    if (!playerName) {
                        resolve(`❌ Could not find player name for ID ${targetId}`);
                        return;
                    }
                    
                    if (!packetLoss) {
                        resolve(`❌ Could not find packet loss info for ${playerName}`);
                        return;
                    }
                    
                    let response = `${playerName}'s Packet loss : ${packetLoss}`;
                    if (bytesResent) {
                        response += ` (${bytesResent} bytes resent)`;
                    }
                    
                    resolve(response);
                }, 500);
            }, 500);
            
            // Cleanup function
            const cleanupHandlers = () => {
                client.off('dialog', statsHandler);
                client.off('dialog', plHandler);
            };
        });
    }
};