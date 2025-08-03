const axios = require('axios');
const InputSanitizer = require('../../utils/inputSanitizer');
const colorConverter = require('../../utils/colorConverter');

module.exports = {
    name: 'gkick',
    description: 'Kick a player from the group (Admin only)',
    execute: async (client, config, args, player) => {
        if (args.length < 2) {
            return 'Usage: !gkick [playerName] [reason]';
        }
        
        const playerName = args[0];
        const reason = args.slice(1).join(' ');
        const groupName = config.groupName || 'Your Group';
        const baseUrl = `http://${config.raksampHost}:${config.raksampPort}/`;
        
        try {
            // Utility to wait for dialog
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

            // Send /gkick command
            await axios.post(
                baseUrl,
                `command=${encodeURIComponent('/gkick')}`,
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
            let playerIndex = -1;
            let playerEntry = null;
            let playerNameFound = null;
            let currentPage = 0;
            const maxPages = 8;

            while (currentPage < maxPages) {
                // Parse current page
                const cleanMemberInfo = colorConverter.stripSampColors(memberDialog.info)
                    .replace(/[{}]/g, '')
                    .replace(/<[A-F0-9]{6}>/gi, '');
                
                const memberLines = cleanMemberInfo
                    .split('\n')
                    .map(l => l.trim())
                    .filter(Boolean);
                
                // Search for player in current page
                for (let i = 0; i < memberLines.length; i++) {
                    const line = memberLines[i];
                    // Extract the player name and full prefix
                    const match = line.match(/^(\d+)\s+([^\s]+)/);
                    
                    if (match) {
                        const name = match[2].trim();
                        
                        if (name.toLowerCase().includes(playerName.toLowerCase())) {
                            playerIndex = i;
                            playerNameFound = name;
                            
                            // Get the full line prefix (e.g., "3 DR.Roman")
                            const prefix = line.substring(0, line.indexOf(name) + name.length).trim();
                            playerEntry = prefix;
                            break;
                        }
                    }
                }

                // Exit loop if player found
                if (playerIndex !== -1) break;

                // Go to next page
                const nextCmd = `sendDialogResponse|${memberDialog.dialogId}|0|0|Next`;
                const safeNextCmd = InputSanitizer.safeStringForRakSAMP(nextCmd);
                
                await axios.post(
                    baseUrl,
                    `botcommand=${encodeURIComponent(safeNextCmd)}`,
                    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
                );

                // Wait for next page dialog
                memberDialog = await waitForDialog(
                    d => d.title.toLowerCase().includes(groupName.toLowerCase()),
                    3000
                );
                
                // If next page doesn't arrive, stop searching
                if (!memberDialog) break;
                
                currentPage++;
            }
            
            // Player not found after all pages
            if (playerIndex === -1) {
                return `❌ Player "${playerName}" not found in ${groupName} after ${currentPage + 1} pages.`;
            }

            // Send player selection
            const playerCmd = `sendDialogResponse|${memberDialog.dialogId}|1|${playerIndex}|${playerEntry}`;
            const safePlayerCmd = InputSanitizer.safeStringForRakSAMP(playerCmd);
            
            await axios.post(
                baseUrl,
                `botcommand=${encodeURIComponent(safePlayerCmd)}`,
                { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
            );

            // Wait for kick reason dialog
            const kickDialog = await waitForDialog(
                d => d.title.toLowerCase().includes('group kick'),
                5000
            );
            
            if (!kickDialog) {
                return '❌ Kick reason dialog not received';
            }

            // Send kick reason
            const kickCmd = `sendDialogResponse|${kickDialog.dialogId}|1|-1|${reason}`;
            await axios.post(
                baseUrl,
                `botcommand=${encodeURIComponent(InputSanitizer.safeStringForRakSAMP(kickCmd))}`,
                { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
            );

            return `✅ Player "${playerNameFound}" kicked for: ${reason}`;

        } catch (err) {
            console.error('[IG gkick] Error:', err);
            return '❌ Failed to process gkick command';
        }
    }
};