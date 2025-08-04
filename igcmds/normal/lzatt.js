const ZoneManager = require('../../utils/ZoneManager');
const axios = require('axios');
const config = require('../../config.json');

const attackLocks = new Map();

// Helper functions with proper endpoint separation
async function sendCommand(command) {
    await axios.post(
        `http://${config.raksampHost}:${config.raksampPort}/`,
        `command=${encodeURIComponent(command)}`,
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
}

async function sendGroupMessage(message) {
    await axios.post(
        `http://${config.raksampHost}:${config.raksampPort}/`,
        `message=!${encodeURIComponent(message)}`,
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function executeAttack(player, tag) {
    try {
        const result = ZoneManager.getZoneByGroupTag(tag);
        if (typeof result === 'string') return result;
        
        const zoneId = result;
        const groupName = ZoneManager.getGroupNameByTag(tag) || tag;
        const position = ZoneManager.getZonePosition(zoneId);
        
        if (!position) {
            return `❌ Zone #${zoneId} position not mapped`;
        }
        
        // Teleport to zone
        await sendCommand(`/pos ${position.x} ${position.y} ${position.z}`);
        await delay(300);
        
        // Start attack
        await sendCommand(`/gz ${zoneId}`);
        await delay(100);
        
        // Send notification
        await sendGroupMessage(`⚔️ Attacking zone #${zoneId} of ${groupName}. You have 40 seconds.`);
        
        // Set timeout for return
        setTimeout(async () => {
            try {
                await sendCommand('/fr');
            } catch (e) {
                console.error(`[lzatt] Failed to return: ${e.message}`);
            }
        }, 40000);
        
        return `✅ Attacking zone #${zoneId} of ${groupName}.`;
    } catch (e) {
        return `❌ Failed to attack: ${e.message}`;
    }
}

module.exports = {
    name: 'lzatt',
    description: 'Continuously attack a group until stopped',
    execute: async (client, config, args, player) => {
        if (args[0] === 'stop') {
            const lock = attackLocks.get(player);
            if (lock) {
                clearInterval(lock.interval);
                if (lock.warListener) {
                    client.off('warEnded', lock.warListener);
                }
                attackLocks.delete(player);
                ZoneManager.clearLockedAttack(player);
                return '🛑 Stopped locked attacks.';
            }
            return '❌ No active locked attack for you.';
        }
        
        if (args.length < 1) {
            return 'Usage: ,lzatt [groupTag] or ,lzatt stop';
        }
        
        const tag = args[0];
        const groupName = ZoneManager.getGroupNameByTag(tag) || tag;
        
        if (groupName === config.defaultGroup) {
            return '❌ You cannot attack your own group!';
        }
        
        if (attackLocks.has(player)) {
            const currentLock = attackLocks.get(player);
            return `❌ You already have an active lock on ${currentLock.tag}. Use ,lzatt stop first.`;
        }
        
        const attackableZones = ZoneManager.getAttackableZonesByGroup()[groupName];
        if (!attackableZones || attackableZones.length === 0) {
            return `❌ ${groupName} has no attackable zones at this time`;
        }
        
        ZoneManager.setLockedAttack(player, tag);
        
        const lock = {
            player,
            tag,
            groupName,
            lastAttack: 0,
            interval: null,
            warListener: null
        };
        
        lock.warListener = async ({ group, opponent }) => {
            try {
                if (lock.groupName === group || lock.groupName === opponent) {
                    const ourWarStatus = ZoneManager.getGroupWarStatus(config.defaultGroup);
                    const theirWarStatus = ZoneManager.getGroupWarStatus(lock.groupName);
                    
                    if (!ourWarStatus && !theirWarStatus) {
                        const zoneId = ZoneManager.getZoneByGroupTag(lock.tag);
                        if (typeof zoneId === 'string') return;
                        
                        const position = ZoneManager.getZonePosition(zoneId);
                        if (!position) return;
                        
                        // Teleport directly
                        await sendCommand(`/pos ${position.x} ${position.y} ${position.z}`);
                        await delay(100);
                        
                        // Start attack
                        await sendCommand(`/gz`);
                        await delay(100);
                        
                        // Notify group
                        await sendGroupMessage(`⚡ IMMEDIATE ATTACK on ${lock.groupName} zone #${zoneId}`);
                        
                        lock.lastAttack = Date.now();
                        
                        // Set timeout for return
                        setTimeout(async () => {
                            await sendCommand('/fr');
                        }, 40000);
                    }
                }
            } catch (e) {
                console.error(`[lzatt] Immediate attack failed: ${e.message}`);
            }
        };
        
        client.on('warEnded', lock.warListener);
        
        try {
            const ourWarStatus = ZoneManager.getGroupWarStatus(config.defaultGroup);
            const theirWarStatus = ZoneManager.getGroupWarStatus(groupName);
            
            if (!ourWarStatus && !theirWarStatus) {
                await executeAttack(player, tag);
                lock.lastAttack = Date.now();
            }
        } catch (e) {
            console.error(`[lzatt] Initial attack failed: ${e.message}`);
        }
        
        lock.interval = setInterval(async () => {
            try {
                if (Date.now() - lock.lastAttack < 30000) return;
                
                const ourWarStatus = ZoneManager.getGroupWarStatus(config.defaultGroup);
                const theirWarStatus = ZoneManager.getGroupWarStatus(lock.groupName);
                
                if (ourWarStatus || theirWarStatus) return;
                
                const result = ZoneManager.getZoneByGroupTag(lock.tag);
                if (typeof result === 'string') return;
                
                await executeAttack(lock.player, lock.tag);
                lock.lastAttack = Date.now();
            } catch (e) {
                console.error(`[lzatt] Interval attack failed: ${e.message}`);
            }
        }, 15000);
        
        attackLocks.set(player, lock);
        
        return `🔒 Locked attacks activated for ${groupName}. Will attack when war status is clear.`;
    }
};