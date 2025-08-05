const ZoneManager = require('../utils/ZoneManager');
const colorConverter = require('../utils/colorConverter');
const axios = require('axios');
const config = require('../config.json');

module.exports = (client, config) => {
    let groupsDialogId = null;
    let pendingGroups = new Set();
    let isProcessing = false;
    
    // Clean dialog text
    const cleanDialogText = (text) => {
        return colorConverter.stripSampColors(text)
            .replace(/{[0-9a-f]{6}}/gi, '')
            .replace(/<\/?[a-z]{1,2}>/gi, '')
            .trim();
    };

    // Send groups command
    const fetchGroups = async () => {
        try {
            await axios.post(
                `http://${config.raksampHost}:${config.raksampPort}/`,
                `command=${encodeURIComponent('/groups')}`,
                { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
            );
            console.log('[GroupTag] Sent /groups command');
        } catch (e) {
            console.error('[GroupTag] Failed to send /groups command:', e);
        }
    };
    
    // Find group in dialog
    const findGroupInDialog = (dialog, groupName) => {
        const cleanInfo = cleanDialogText(dialog.info);
        const lines = cleanInfo.split('\n').filter(Boolean);
        
        for (const [index, line] of lines.entries()) {
            const match = line.match(/(\d+)\s+(.+)/);
            if (!match) continue;
            
            const id = parseInt(match[1]);
            const name = match[2].trim();
            
            if (!isNaN(id) && name.toLowerCase().includes(groupName.toLowerCase())) {
                return { index, id, name };
            }
        }
        
        return null;
    };
    
    // Select group in dialog
    const selectGroup = async (dialogId, itemIndex, groupId) => {
        try {
            const botcmd = `sendDialogResponse|${dialogId}|1|${itemIndex}|${groupId}`;
            await axios.post(
                `http://${config.raksampHost}:${config.raksampPort}/`,
                `botcommand=${encodeURIComponent(botcmd)}`,
                { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
            );
            console.log(`[GroupTag] Selected group at index ${itemIndex}`);
        } catch (e) {
            console.error('[GroupTag] Failed to send dialog response:', e);
        }
    };
    
    // Extract group tag
    const extractGroupTag = (dialog) => {
        const cleanStats = cleanDialogText(dialog.info);
        const lines = cleanStats.split('\n').filter(line => line.trim() !== '');
        const groupName = lines.length > 0 ? lines[0].trim() : 'Unknown Group';
        
        // Extract tag
        let tag = null;
        for (const line of lines) {
            const tagMatch = line.match(/- Tag:\s*(\S+)/i);
            if (tagMatch && tagMatch[1]) {
                tag = tagMatch[1].trim();
                break;
            }
        }
        
        if (tag) {
            ZoneManager.setGroupTag(groupName, tag);
            console.log(`[GroupTag] Extracted and saved tag for ${groupName}: ${tag}`);
            return tag;
        }
        
        console.log(`[GroupTag] Tag not found for ${groupName}`);
        return null;
    };
    
    // Main function to get group tag
    const getGroupTag = async (groupName) => {
        if (isProcessing) {
            pendingGroups.add(groupName);
            return;
        }
        
        isProcessing = true;
        console.log(`[GroupTag] Starting extraction for ${groupName}`);
        
        // First send groups command
        await fetchGroups();
        
        // Wait for groups dialog
        return new Promise((resolve) => {
            const dialogHandler = (dialog) => {
                const title = cleanDialogText(dialog.title);
                if (!title.toLowerCase().includes('online groups')) return;
                
                groupsDialogId = dialog.dialogId;
                console.log(`[GroupTag] Received groups dialog (ID: ${groupsDialogId})`);
                
                // Find the group in the dialog
                const groupInfo = findGroupInDialog(dialog, groupName);
                if (!groupInfo) {
                    console.log(`[GroupTag] Group ${groupName} not found in dialog`);
                    cleanup();
                    resolve(null);
                    return;
                }
                
                // Select the group
                selectGroup(groupsDialogId, groupInfo.index, groupInfo.id)
                    .then(() => {
                        // Wait for group stats dialog
                        const statsHandler = (statsDialog) => {
                            const statsTitle = cleanDialogText(statsDialog.title);
                            if (!statsTitle.toLowerCase().includes('group stats')) return;
                            
                            cleanup();
                            const tag = extractGroupTag(statsDialog);
                            resolve(tag);
                            
                            // Process next group
                            isProcessing = false;
                            if (pendingGroups.size > 0) {
                                const nextGroup = Array.from(pendingGroups)[0];
                                pendingGroups.delete(nextGroup);
                                getGroupTag(nextGroup);
                            }
                        };
                        
                        client.once('dialog', statsHandler);
                        setTimeout(() => {
                            client.off('dialog', statsHandler);
                            resolve(null);
                        }, 5000);
                    });
            };
            
            const cleanup = () => {
                client.off('dialog', dialogHandler);
                clearTimeout(timeout);
            };
            
            const timeout = setTimeout(() => {
                cleanup();
                console.log('[GroupTag] Timed out waiting for groups dialog');
                resolve(null);
                isProcessing = false;
            }, 5000);
            
            client.on('dialog', dialogHandler);
        });
    };
    
    // War status tracking
    client.on('samp_message', (raw) => {
        // Zone war start detection
        const warStartRegex = /ZONE WAR: (.+?) vs (.+)/i;
        const warStartMatch = raw.match(warStartRegex);
        
        if (warStartMatch) {
            const attacker = warStartMatch[1];
            const defender = warStartMatch[2];
            
            // Set both groups as in war against each other
            ZoneManager.setGroupWarStatus(attacker, defender);
            ZoneManager.setGroupWarStatus(defender, attacker);
            console.log(`[WarTracker] ${attacker} and ${defender} are now in war`);
            
            // Emit war start event through client
            client.emit('warStarted', { 
                group1: attacker, 
                group2: defender 
            });
            
            // Extract tags if missing
            if (!ZoneManager.getGroupTag(attacker)) {
                console.log(`[GroupTag] Missing tag for ${attacker}, queuing extraction`);
                getGroupTag(attacker).catch(e => 
                    console.error(`[GroupTag] Failed to extract tag for ${attacker}:`, e)
                );
            }
            if (!ZoneManager.getGroupTag(defender)) {
                console.log(`[GroupTag] Missing tag for ${defender}, queuing extraction`);
                getGroupTag(defender).catch(e => 
                    console.error(`[GroupTag] Failed to extract tag for ${defender}:`, e)
                );
            }
        }
        
        // Zone war outcome detection - IMPROVED REGEX
        const warOutcomeRegex = /ZONE WAR: (.+?) (takes over|keeps) zone ['"]#?\s*(\d+)['"]/i;
        const warOutcomeMatch = raw.match(warOutcomeRegex);
        
        if (warOutcomeMatch) {
            const groupName = warOutcomeMatch[1];
            const action = warOutcomeMatch[2];
            const zoneId = warOutcomeMatch[3];
            const opponent = ZoneManager.getGroupWarStatus(groupName);
            
            // Clear war status for both groups
            ZoneManager.setGroupWarStatus(groupName);
            if (opponent) ZoneManager.setGroupWarStatus(opponent);
            
            console.log(`[WarTracker] ${groupName} war ended against ${opponent || 'unknown'}`);
            
            // Emit war end event through client
            client.emit('warEnded', { 
                group: groupName, 
                opponent: opponent,
                action: action,
                zoneId: zoneId
            });
        }
    });
    
    // Also fetch on group login
    client.on('group_login', ({ groupName }) => {
        if (!ZoneManager.getGroupTag(groupName)) {
            console.log(`[GroupTag] Missing tag for ${groupName}, queuing extraction`);
            getGroupTag(groupName).catch(e => 
                console.error(`[GroupTag] Failed to extract tag for ${groupName}:`, e)
            );
        }
    });
    
    // Periodically reset uncaptured zones
    setInterval(() => {
        const resetCount = ZoneManager.resetUncapturedZones();
        if (resetCount > 0) {
            console.log(`[ZoneManager] Reset ${resetCount} uncaptured zones`);
        }
    }, 60 * 60 * 1000); // Check every hour
};