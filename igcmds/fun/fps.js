const axios = require('axios');
const config = require('../../config.json');

module.exports = {
    name: 'fps',
    description: 'Get FPS of a player',
    async execute(client, config, args, player, playerId) {
        // Parse target player ID
        let targetId = args[0] || playerId;
        
        if (!targetId) {
            return '❌ Please specify a player ID (e.g., ,fps 123)';
        }
        
        return new Promise(async (resolve) => {
            let playerName = null;
            let fpsValue = null;
            
            // Single handler for stats dialog
            const statsHandler = (dialog) => {
                if (dialog.title.includes('Player Stats')) {
                    // Extract player name from first line
                    const cleanInfo = dialog.info.replace(/{[A-F0-9]{6}}/gi, '');
                    const lines = cleanInfo.split('\n').filter(Boolean);
                    
                    if (lines.length > 0) {
                        const firstLine = lines[0].trim();
                        const nameMatch = firstLine.match(/^([^(]+)/);
                        
                        if (nameMatch) {
                            playerName = nameMatch[1].trim();
                            console.log(`[FPS] Found player name: ${playerName}`);
                        }
                    }
                    
                    // Extract FPS from the dialog
                    for (const line of lines) {
                        const fpsMatch = line.match(/FPS:\s*(\d+)/);
                        if (fpsMatch) {
                            fpsValue = fpsMatch[1];
                            break;
                        }
                    }
                }
            };
            
            // Set up handler
            client.on('dialog', statsHandler);
            
            // Cleanup function
            const cleanup = () => {
                client.off('dialog', statsHandler);
            };
            
            // Set timeout
            const timeout = setTimeout(() => {
                cleanup();
                
                if (!playerName) {
                    resolve(`❌ Could not find player name for ID ${targetId}`);
                    return;
                }
                
                if (!fpsValue) {
                    resolve(`❌ Could not find FPS info for ${playerName}`);
                    return;
                }
                
                resolve(`🎮 ${playerName}'s FPS : ${fpsValue}`);
            }, 500);
            
            try {
                // Send stats command once
                await axios.post(
                    `http://${config.raksampHost}:${config.raksampPort}/`,
                    `command=${encodeURIComponent(`/stats ${targetId}`)}`,
                    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
                );
            } catch (e) {
                cleanup();
                clearTimeout(timeout);
                resolve(`❌ Failed to fetch player stats: ${e.message}`);
            }
        });
    }
};