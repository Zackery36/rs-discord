const axios = require('axios');
const InputSanitizer = require('../../utils/inputSanitizer');
const colorConverter = require('../../utils/colorConverter');

module.exports = {
    name: 'grole',
    description: 'Set a player\'s group role (Admin only)',
    execute: async (client, config, args, player) => {
        if (args.length < 2) {
            return 'Usage: !grole [playerName] [roleName]';
        }
        
        const playerName = args[0];
        const roleName = args[1];
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

            // Send /grole command
            await axios.post(
                baseUrl,
                `command=${encodeURIComponent('/grole')}`,
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

            // Wait for role dialog
            const roleDialog = await waitForDialog(
                d => d.title.toLowerCase().includes('group role'),
                5000
            );
            
            if (!roleDialog) {
                return '❌ Role selection dialog not received';
            }

            // Find role
            const cleanInfo = colorConverter.stripSampColors(roleDialog.info)
                .replace(/[{}]/g, '')
                .replace(/<[A-F0-9]{6}>/gi, '');
            
            const lines = cleanInfo.split('\n').map(l => l.trim()).filter(Boolean);
            let roleIndex = -1;
            let roleNameFound = '';
            
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].toLowerCase().includes(roleName.toLowerCase())) {
                    roleIndex = i;
                    roleNameFound = lines[i];
                    break;
                }
            }
            
            if (roleIndex === -1) {
                return `❌ Role "${roleName}" not found`;
            }

            // Select role
            const roleCmd = `sendDialogResponse|${roleDialog.dialogId}|1|${roleIndex}|${roleNameFound}`;
            await axios.post(
                baseUrl,
                `botcommand=${encodeURIComponent(InputSanitizer.safeStringForRakSAMP(roleCmd))}`,
                { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
            );

            return `✅ Role set: "${playerNameFound}" to "${roleNameFound}"`;

        } catch (err) {
            console.error('[IG grole] Error:', err);
            return '❌ Failed to process grole command';
        }
    }
};