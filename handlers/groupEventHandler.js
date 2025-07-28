const PlayerManager = require('../utils/PlayerManager');
const colorConverter = require('../utils/colorConverter');
const fs = require('fs');
const path = require('path');
const DialogPaginator = require('../utils/DialogPaginator');
const config = require('../config.json');

module.exports = (client) => {
    const groupLogFile = path.join(__dirname, '../logs/group_events.log');
    
    console.log('[GroupEventHandler] Initializing...');
    
    if (!fs.existsSync(groupLogFile)) {
        fs.writeFileSync(groupLogFile, '');
        console.log(`[GroupEventHandler] Created log file: ${groupLogFile}`);
    }
    
    const paginator = new DialogPaginator(client, config);
    
    client.on('samp_message', async (raw) => {
        if (raw.startsWith('GROUP:')) {
            console.log(`[GroupEvent] Raw message: ${raw}`);
            
            const cleanRaw = colorConverter.stripSampColors(raw);
            console.log(`[GroupEvent] Clean message: ${cleanRaw}`);
            
            fs.appendFileSync(groupLogFile, `${new Date().toISOString()} ${cleanRaw}\n`);
            
            const parsePlayer = (str) => {
                const match = str.match(/^([^(]+)\((\d+)\)$/);
                if (match) {
                    const name = match[1].trim();
                    const id = match[2];
                    console.log(`[GroupEvent] Parsed player: ${name} (ID: ${id}) from ${str}`);
                    return { name, id };
                }
                console.log(`[GroupEvent] Could not parse player from: ${str}`);
                return { name: str.trim(), id: null };
            };
            
            const loginMatch = cleanRaw.match(/GROUP: ([^(]+\(\d+\)) logged in - (\S+)/);
            const logoutMatch = cleanRaw.match(/GROUP: ([^(]+\(\d+\)) logged out/);
            const rankChangeMatch = cleanRaw.match(/GROUP: ([^(]+\(\d+\)) changed the rank of ([^(]+\(\d+\)) from '(.+)' to '(.+)'/);
            const roleChangeMatch = cleanRaw.match(/GROUP: ([^(]+\(\d+\)) changed the role of ([^(]+\(\d+\)) from '(.+)' to '(.+)'/);
            
            if (loginMatch) {
                console.log('[GroupEvent] Login event detected');
                const playerWithId = loginMatch[1];
                const rank = loginMatch[2];
                const { name: playerName, id } = parsePlayer(playerWithId);
                
                PlayerManager.setRank(playerName, rank);
                PlayerManager.setGroup(playerName, config.defaultGroup);
                
                console.log(`[GroupEvent] ${playerName} logged in as ${rank}`);
                
                try {
                    console.log(`[GroupEvent] Fetching details for ${playerName}`);
                    const result = await paginator.searchPlayerInGroup(playerName, config.defaultGroup);
                    
                    if (result) {
                        PlayerManager.setRole(playerName, result.role);
                        PlayerManager.setLastActive(playerName, result.lastActive);
                        console.log(`[GroupEvent] Updated ${playerName}: role=${result.role}, lastActive=${result.lastActive}`);
                    }
                } catch (e) {
                    console.error('[GroupEvent] Failed to fetch member details:', e.message);
                }
            }
            else if (logoutMatch) {
                console.log('[GroupEvent] Logout event detected');
                const playerWithId = logoutMatch[1];
                const { name: playerName } = parsePlayer(playerWithId);
                console.log(`[GroupEvent] ${playerName} logged out`);
            }
            else if (rankChangeMatch) {
                console.log('[GroupEvent] Rank change event detected');
                const changerWithId = rankChangeMatch[1];
                const playerWithId = rankChangeMatch[2];
                const oldRank = rankChangeMatch[3];
                const newRank = rankChangeMatch[4];
                
                const { name: playerName } = parsePlayer(playerWithId);
                PlayerManager.setRank(playerName, newRank);
                console.log(`[GroupEvent] ${playerName} rank changed from ${oldRank} to ${newRank}`);
            }
            else if (roleChangeMatch) {
                console.log('[GroupEvent] Role change event detected');
                const changerWithId = roleChangeMatch[1];
                const playerWithId = roleChangeMatch[2];
                const oldRole = roleChangeMatch[3];
                const newRole = roleChangeMatch[4];
                
                const { name: playerName } = parsePlayer(playerWithId);
                PlayerManager.setRole(playerName, newRole);
                console.log(`[GroupEvent] ${playerName} role changed from ${oldRole} to ${newRole}`);
            }
            else {
                console.log('[GroupEvent] No matching event type found');
            }
        }
    });
};