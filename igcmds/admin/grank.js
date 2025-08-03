const axios = require('axios');
const InputSanitizer = require('../../utils/inputSanitizer');
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
            // Helper to wait for dialog
            const waitForDialog = (filter, timeout) => {
                return new Promise(resolve => {
                    const handler = dlg => {
                        if (filter(dlg)) {
                            client.off('dialog', handler);
                            resolve(dlg);
                        }
                    };
                    const timer = setTimeout(() => {
                        client.off('dialog', handler);
                        resolve(null);
                    }, timeout);
                    client.on('dialog', handler);
                });
            };

            // Send /grank command
            await axios.post(
                baseUrl,
                `command=${encodeURIComponent('/grank')}`,
                { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
            );

            // Wait for group member list dialog
            let memberDialog = await waitForDialog(
                d => d.title.toLowerCase().includes(groupName.toLowerCase()),
                8000
            );
            
            if (!memberDialog) {
                return '❌ Group member list dialog not received';
            }

            // Player search with pagination
            let playerFound = false;
            let playerIndex = -1;
            let playerEntry = '';
            let playerNameFound = '';
            let currentPage = 0;
            const maxPages = 8;

            while (currentPage < maxPages && !playerFound) {
                // Clean and parse dialog
                const cleanInfo = colorConverter.stripSampColors(memberDialog.info)
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
                            playerNameFound = name;
                            playerEntry = line.substring(0, line.indexOf(name) + name);
                            playerFound = true;
                            break;
                        }
                    }
                }
                
                // If not found, go to next page
                if (!playerFound) {
                    const nextCmd = `sendDialogResponse|${memberDialog.dialogId}|0|0|Next`;
                    await axios.post(
                        baseUrl,
                        `botcommand=${encodeURIComponent(InputSanitizer.safeStringForRakSAMP(nextCmd))}`,
                        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
                    );
                    
                    // Wait for next dialog
                    memberDialog = await waitForDialog(
                        d => d.title.toLowerCase().includes(groupName.toLowerCase()),
                        3000
                    );
                    
                    if (!memberDialog) break;
                    currentPage++;
                }
            }
            
            if (!playerFound) {
                return `❌ Player "${playerName}" not found after ${currentPage + 1} pages`;
            }

            // Select player
            const playerCmd = `sendDialogResponse|${memberDialog.dialogId}|1|${playerIndex}|${playerEntry}`;
            await axios.post(
                baseUrl,
                `botcommand=${encodeURIComponent(InputSanitizer.safeStringForRakSAMP(playerCmd))}`,
                { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
            );

            // Wait for rank dialog
            const rankDialog = await waitForDialog(
                d => d.title.toLowerCase().includes('group rank'),
                5000
            );
            
            if (!rankDialog) {
                return '❌ Rank selection dialog not received';
            }

            // Find rank
            const cleanInfo = colorConverter.stripSampColors(rankDialog.info)
                .replace(/[{}]/g, '')
                .replace(/<[A-F0-9]{6}>/gi, '');
            
            const lines = cleanInfo.split('\n').map(l => l.trim()).filter(Boolean);
            let rankIndex = -1;
            let rankNameFound = '';
            
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].toLowerCase().includes(rankName.toLowerCase())) {
                    rankIndex = i;
                    rankNameFound = lines[i];
                    break;
                }
            }
            
            if (rankIndex === -1) {
                return `❌ Rank "${rankName}" not found`;
            }

            // Select rank
            const rankCmd = `sendDialogResponse|${rankDialog.dialogId}|1|${rankIndex}|${rankNameFound}`;
            await axios.post(
                baseUrl,
                `botcommand=${encodeURIComponent(InputSanitizer.safeStringForRakSAMP(rankCmd))}`,
                { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
            );

            return `✅ Rank set: "${playerNameFound}" to "${rankNameFound}"`;

        } catch (err) {
            console.error('[IG grank] Error:', err);
            return '❌ Failed to process grank command';
        }
    }
};