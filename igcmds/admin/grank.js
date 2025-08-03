const InputSanitizer = require('../../utils/inputSanitizer');
const axios = require('axios');
const colorConverter = require('../../utils/colorConverter');

module.exports = {
    name: 'grank',
    description: 'Set a player\'s group rank (Admin only)',
    execute: async (client, config, args, player) => {
        if (args.length < 2) {
            return 'Usage: !grank [playerName] [rankName]';
        }
        
        const playerName = args[0];
        const rankName = args[1];
        const groupName = config.groupName || 'Your Group';
        const baseUrl = `http://${config.raksampHost}:${config.raksampPort}/`;
        
        try {
            // Send /grank command
            await axios.post(
                baseUrl,
                `command=${encodeURIComponent('/grank')}`,
                { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
            );
            
            // Add to command queue with full pagination logic
            client.commandQueue.push({
                type: 'dialog',
                filter: d => d.title.toLowerCase().includes(groupName.toLowerCase()),
                maxPages: 8,
                playerName,
                action: async (dialog) => {
                    let currentDialog = dialog;
                    let page = 0;
                    let playerFound = false;
                    let playerIndex = -1;
                    let playerEntry = '';
                    
                    while (page < this.maxPages && !playerFound) {
                        // Clean and parse dialog
                        const cleanInfo = colorConverter.stripSampColors(currentDialog.info)
                            .replace(/[{}]/g, '')
                            .replace(/<[A-F0-9]{6}>/gi, '');
                        
                        const lines = cleanInfo.split('\n').map(l => l.trim()).filter(Boolean);
                        
                        // Search for player
                        for (let i = 0; i < lines.length; i++) {
                            const line = lines[i];
                            const match = line.match(/^(\d+)\s+([^\s]+)/);
                            
                            if (match) {
                                const name = match[2].trim();
                                if (name.toLowerCase().includes(playerName.toLowerCase())) {
                                    playerIndex = i;
                                    playerEntry = line.substring(0, line.indexOf(name) + name);
                                    playerFound = true;
                                    break;
                                }
                            }
                        }
                        
                        // If not found, go to next page
                        if (!playerFound) {
                            const nextCmd = `sendDialogResponse|${currentDialog.dialogId}|0|0|Next`;
                            await axios.post(
                                baseUrl,
                                `botcommand=${encodeURIComponent(InputSanitizer.safeStringForRakSAMP(nextCmd))}`,
                                { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
                            );
                            
                            // Wait for next dialog
                            const nextDialog = await new Promise(resolve => {
                                const handler = dlg => {
                                    if (dlg.title.toLowerCase().includes(groupName.toLowerCase())) {
                                        client.off('dialog', handler);
                                        resolve(dlg);
                                    }
                                };
                                client.on('dialog', handler);
                                setTimeout(() => resolve(null), 3000);
                            });
                            
                            if (!nextDialog) break;
                            currentDialog = nextDialog;
                            page++;
                        }
                    }
                    
                    if (!playerFound) {
                        client.sendPlayerMessage(player.id, `❌ Player "${playerName}" not found after ${page + 1} pages`);
                        return;
                    }
                    
                    // Select player
                    const playerCmd = `sendDialogResponse|${currentDialog.dialogId}|1|${playerIndex}|${playerEntry}`;
                    await axios.post(
                        baseUrl,
                        `botcommand=${encodeURIComponent(InputSanitizer.safeStringForRakSAMP(playerCmd))}`,
                        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
                    );
                    
                    // Add rank selection handler
                    client.commandQueue.push({
                        type: 'dialog',
                        filter: d => d.title.toLowerCase().includes('group rank'),
                        action: async (dialog) => {
                            const cleanInfo = colorConverter.stripSampColors(dialog.info)
                                .replace(/[{}]/g, '')
                                .replace(/<[A-F0-9]{6}>/gi, '');
                            
                            const lines = cleanInfo.split('\n').map(l => l.trim()).filter(Boolean);
                            let rankIndex = -1;
                            
                            for (let i = 0; i < lines.length; i++) {
                                const match = lines[i].match(/^(\d+)\s+(.+)$/);
                                if (match && match[2].toLowerCase().includes(rankName.toLowerCase())) {
                                    rankIndex = i;
                                    break;
                                }
                            }
                            
                            if (rankIndex === -1) {
                                client.sendPlayerMessage(player.id, `❌ Rank "${rankName}" not found`);
                                return;
                            }
                            
                            const rankCmd = `sendDialogResponse|${dialog.dialogId}|1|${rankIndex}|${lines[rankIndex]}`;
                            await axios.post(
                                baseUrl,
                                `botcommand=${encodeURIComponent(InputSanitizer.safeStringForRakSAMP(rankCmd))}`,
                                { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
                            );
                            
                            client.sendPlayerMessage(player.id, `✅ Rank set to "${lines[rankIndex].split(/\s+/).slice(1).join(' ')}"`);
                        }
                    });
                }
            });
            
            return `⌛ Searching for ${playerName} in group...`;
        } catch (err) {
            console.error('[IG grank] Error:', err);
            return '❌ Failed to process grank command';
        }
    }
};