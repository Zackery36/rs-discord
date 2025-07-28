const axios = require('axios');
const config = require('../../config.json');
const ZoneManager = require('../../utils/ZoneManager');

module.exports = {
    name: 'gzt',
    description: 'Check group war timer',
    execute: async (client, config, args, player, playerId) => {
        const ownGroup = config.defaultGroup;
        const opponent = ZoneManager.getGroupWarStatus(ownGroup);
        if (!opponent) {
            return '⚔️ Your group is not currently in a war.';
        }
        
        return new Promise((resolve) => {
            let timerData = null;
            let timeout = null;
            let attempts = 0;
            const maxAttempts = 3;
            
            // Textdraw handler with immediate response
            const textdrawHandler = async (data) => {
                if (data.textdrawId === 59) {
                    const match = data.text.match(/~r~~h~(\d+)~w~-~b~~h~(\d+)\s*~n~~w~(\d+:\d+)/);
                    
                    if (match) {
                        timerData = {
                            attacker: match[1],
                            defender: match[2],
                            time: match[3]
                        };
                        
                        // Cleanup immediately
                        clearTimeout(timeout);
                        client.off('textdraw', textdrawHandler);
                        
                        // Format response with opponent name
                        const response = `⏱️ War Timer: ${timerData.time} | Score: ${timerData.attacker}-${timerData.defender} (against ${opponent})`;
                        
                        // Try to leave GZ2 with retries
                        let leaveSuccess = false;
                        for (let i = 0; i < 3; i++) {
                            try {
                                await axios.post(
                                    `http://${config.raksampHost}:${config.raksampPort}/`,
                                    `command=${encodeURIComponent('/fr')}`,
                                    {
                                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                                        timeout: 2000
                                    }
                                );
                                leaveSuccess = true;
                                break;
                            } catch (e) {
                                console.error(`[GZT] /fr attempt ${i+1}/3 failed: ${e.message}`);
                                await new Promise(r => setTimeout(r, 500));
                            }
                        }
                        
                        // Send response with retries
                        for (let i = 0; i < 3; i++) {
                            try {
                                await axios.post(
                                    `http://${config.raksampHost}:${config.raksampPort}/`,
                                    `message=${encodeURIComponent(`!${response}`)}`,
                                    {
                                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                                        timeout: 2000
                                    }
                                );
                                resolve(response);
                                return;
                            } catch (e) {
                                console.error(`[GZT] Response send attempt ${i+1}/3 failed: ${e.message}`);
                                await new Promise(r => setTimeout(r, 500));
                            }
                        }
                        
                        // If all retries failed
                        resolve(`⚠️ Got timer but failed to send: ${timerData.time} | ${timerData.attacker}-${timerData.defender} (against ${opponent})`);
                    }
                }
            };

            // Set up the handler
            client.on('textdraw', textdrawHandler);
            
            // Set timeout in case textdraw never arrives
            timeout = setTimeout(() => {
                client.off('textdraw', textdrawHandler);
                resolve('❌ Failed to retrieve war timer');
            }, 10000);  // 10 second timeout
            
            // Function to join GZ2 with retries
            const joinGZ2 = async () => {
                try {
                    await axios.post(
                        `http://${config.raksampHost}:${config.raksampPort}/`,
                        `command=${encodeURIComponent('/gz2')}`,
                        {
                            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                            timeout: 2000
                        }
                    );
                    return true;
                } catch (e) {
                    console.error(`[GZT] /gz2 attempt ${attempts+1}/${maxAttempts} failed: ${e.message}`);
                    return false;
                }
            };
            
            // Attempt to join GZ2 with retries
            const attemptJoin = async () => {
                while (attempts < maxAttempts) {
                    attempts++;
                    if (await joinGZ2()) {
                        return;
                    }
                    await new Promise(r => setTimeout(r, 500));
                }
                
                // All attempts failed
                clearTimeout(timeout);
                client.off('textdraw', textdrawHandler);
                resolve('❌ Failed to join GZ2 for timer');
            };
            
            attemptJoin();
        });
    }
};