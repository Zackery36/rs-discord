const fs = require('fs');
const path = require('path');
const config = require('../config.json');

class PlayerManager {
    constructor() {
        this.players = new Map();
        this.filePath = path.join(__dirname, '../data/players.json');
        console.log('[PlayerManager] Initializing...');
        console.log(`[PlayerManager] Data file: ${this.filePath}`);
        this.load();
        
        this.saveInterval = setInterval(() => {
            console.log('[PlayerManager] Periodic save triggered');
            this.save();
        }, 30 * 1000);
        
        process.on('exit', () => {
            clearInterval(this.saveInterval);
            console.log('[PlayerManager] Saving before exit...');
            this.save();
        });
    }

    load() {
        console.log('[PlayerManager] Loading player data...');
        try {
            if (fs.existsSync(this.filePath)) {
                console.log('[PlayerManager] Players file exists');
                const fileContent = fs.readFileSync(this.filePath, 'utf8');
                
                if (fileContent.trim() === '') {
                    console.log('[PlayerManager] Players file is empty');
                    return;
                }
                
                const data = JSON.parse(fileContent);
                this.players = new Map(data.players || []);
                console.log(`[PlayerManager] Loaded ${this.players.size} players`);
            } else {
                console.log('[PlayerManager] No players file found');
            }
        } catch (e) {
            console.error('[PlayerManager] Failed to load players data:', e);
            if (fs.existsSync(this.filePath)) {
                const backupPath = `${this.filePath}.corrupted-${Date.now()}`;
                console.error(`[PlayerManager] Creating backup: ${backupPath}`);
                fs.renameSync(this.filePath, backupPath);
            }
        }
    }

    save() {
        console.log('[PlayerManager] Saving player data...');
        try {
            const data = { players: Array.from(this.players.entries()) };
            const dir = path.dirname(this.filePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
                console.log(`[PlayerManager] Created directory: ${dir}`);
            }
            fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2));
            console.log(`[PlayerManager] Saved ${this.players.size} players`);
        } catch (e) {
            console.error('[PlayerManager] Failed to save players data:', e);
        }
    }

    updatePlayer(playerName, data) {
        const key = playerName.toLowerCase();
        const playerData = this.players.get(key) || {};
        const newData = {...playerData, ...data};
        console.log(`[PlayerManager] Updating ${playerName}:`, newData);
        this.players.set(key, newData);
    }

    getPlayer(playerName) {
        const key = playerName.toLowerCase();
        const player = this.players.get(key) || {};
        console.log(`[PlayerManager] Get ${playerName}:`, player);
        return player;
    }

    setRank(playerName, rank) {
        console.log(`[PlayerManager] Setting rank for ${playerName} to ${rank}`);
        this.updatePlayer(playerName, { rank });
    }

    setGroup(playerName, groupName) {
        console.log(`[PlayerManager] Setting group for ${playerName} to ${groupName}`);
        this.updatePlayer(playerName, { groupName });
    }

    setRole(playerName, role) {
        console.log(`[PlayerManager] Setting role for ${playerName} to ${role}`);
        this.updatePlayer(playerName, { role });
    }

    setLastActive(playerName, lastActive) {
        console.log(`[PlayerManager] Setting last active for ${playerName} to ${lastActive}`);
        this.updatePlayer(playerName, { lastActive });
    }

    isAdmin(playerName) {
        console.log(`[PlayerManager] Admin check for: ${playerName}`);
        if (!config.adminPlayers || !config.adminRanks) {
            console.error('[Admin Check] Configuration missing adminPlayers or adminRanks');
            return false;
        }
        const player = this.getPlayer(playerName);
        const isAdminByName = config.adminPlayers.includes(playerName.toLowerCase());
        const isAdminByRank = player.rank && config.adminRanks.includes(player.rank);
        console.log(`[Admin Check] Player: ${playerName}, Rank: ${player.rank || 'none'}, AdminByName: ${isAdminByName}, AdminByRank: ${isAdminByRank}`);
        return isAdminByName || isAdminByRank;
    }

    hasRequiredRole(playerName, commandType) {
        console.log(`[Role Check] Checking permissions for ${playerName}, command type: ${commandType}`);
        const player = this.getPlayer(playerName);
        const isServerAdmin = config.adminPlayers.includes(playerName.toLowerCase());
        const requiredRoles = config.requiredRoles[commandType] || [];
        console.log(`[Role Check] Player role: ${player.role || 'None'}, Required: ${requiredRoles.join(', ')}`);
        
        if (isServerAdmin) {
            console.log(`[Role Check] ${playerName} is server admin - access granted`);
            return true;
        }
        
        // Allow higher roles to use lower commands
        if (commandType === 'normal' && player.role === 'Leader') {
            console.log(`[Role Check] Leader can use normal commands`);
            return true;
        }
        
        const hasRole = player.role && requiredRoles.includes(player.role);
        console.log(`[Role Check] Role match: ${hasRole}`);
        return hasRole;
    }
}

module.exports = new PlayerManager();