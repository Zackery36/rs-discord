const ZoneManager = require('../../utils/ZoneManager');
const axios = require('axios');
const config = require('../../config.json');

// Track active attack locks
const attackLocks = new Map();

// Helper functions
async function sendGroupMessage(message) {
    await axios.post(
        `http://${config.raksampHost}:${config.raksampPort}/`,
        `command=${encodeURIComponent(message)}`,
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
}

async function sendCommand(command) {
    await axios.post(
        `http://${config.raksampHost}:${config.raksampPort}/`,
        `command=${encodeURIComponent(command)}`,
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function executeAttack(player, tag) {
    try {
        // Get next attackable zone
        const result = ZoneManager.getZoneByGroupTag(tag);
        
        // Handle error message
        if (typeof result === 'string') {
            return result;
        }
        
        // Handle valid zone ID
        const zoneId = result;
        const groupName = ZoneManager.getGroupNameByTag(tag) || tag;
        const position = ZoneManager.getZonePosition(zoneId);
        
        if (!position) {
            return `❌ Zone #${zoneId} position not mapped`;
        }
        
        // Send initial response
        await sendGroupMessage(`⚔️ Attacking zone #${zoneId} of ${groupName}. You have 40 seconds.`);
        
        // Teleport to zone
        await sendCommand(`/pos ${position.x} ${position.y} ${position.z}`);
        await delay(1000);
        
        // Start attack
        await sendCommand(`/gz ${zoneId}`);
        
        // Set timeout for /fr command
        setTimeout(async () => {
            try {
                await sendCommand('/fr');
                await sendGroupMessage('⏰ Time\'s up! Returning to spawn.');
            } catch (e) {
                console.error(`[lzatt] Failed to return to spawn: ${e.message}`);
            }
        }, 40000); // 40 seconds
        
        return `✅ Attacking zone #${zoneId} of ${groupName}.`;
    } catch (e) {
        return `❌ Failed to attack: ${e.message}`;
    }
}

module.exports = {
    name: 'lzatt',
    description: 'Continuously attack a group until stopped',
    execute: async (client, config, args, player) => {
        // Handle stop command
        if (args[0] === 'stop') {
            const lock = attackLocks.get(player);
            if (lock) {
                clearInterval(lock.interval);
                
                // Remove the war end listener
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
        
        // Check if trying to attack own group
        if (groupName === config.defaultGroup) {
            return '❌ You cannot attack your own group!';
        }
        
        // Check if already locked
        if (attackLocks.has(player)) {
            const currentLock = attackLocks.get(player);
            return `❌ You already have an active lock on ${currentLock.tag}. Use ,lzatt stop first.`;
        }
        
        // Check if group is attackable
        const attackableZones = ZoneManager.getAttackableZonesByGroup()[groupName];
        if (!attackableZones || attackableZones.length === 0) {
            return `❌ ${groupName} has no attackable zones at this time`;
        }
        
        // Set locked attack
        ZoneManager.setLockedAttack(player, tag);
        
        // Create lock object
        const lock = {
            player,
            tag,
            groupName,
            lastAttack: 0,
            interval: null,
            warListener: null
        };
        
        // Define war end listener for immediate attacks
        lock.warListener = async ({ group, opponent }) => {
            try {
                // If the war involved our locked group
                if (lock.groupName === group || lock.groupName === opponent) {
                    // Re-check war status to be safe
                    const ourWarStatus = ZoneManager.getGroupWarStatus(config.defaultGroup);
                    const theirWarStatus = ZoneManager.getGroupWarStatus(lock.groupName);
                    
                    // Only attack if both groups are not in war
                    if (!ourWarStatus && !theirWarStatus) {
                        console.log(`[lzatt] WAR ENDED - Attacking ${lock.groupName} immediately`);
                        
                        // Get next attackable zone
                        const zoneId = ZoneManager.getZoneByGroupTag(lock.tag);
                        if (typeof zoneId === 'string') {
                            console.log(`[lzatt] No attackable zones: ${zoneId}`);
                            return;
                        }
                        
                        const position = ZoneManager.getZonePosition(zoneId);
                        if (!position) {
                            console.log(`[lzatt] Position not mapped for zone ${zoneId}`);
                            return;
                        }
                        
                        // Teleport directly
                        await sendCommand(`/pos ${position.x} ${position.y} ${position.z}`);
                        
                        // Start attack immediately
                        await sendCommand(`/gz`);
                        
                        // Notify group
                        await sendGroupMessage(`⚡ IMMEDIATE ATTACK on ${lock.groupName} zone #${zoneId}`);
                        
                        // Update last attack time
                        lock.lastAttack = Date.now();
                        
                        // Set timeout for return
                        setTimeout(async () => {
                            await sendCommand('/fr');
                            await sendGroupMessage('⏰ Time\'s up! Returning to spawn.');
                        }, 40000);
                    }
                }
            } catch (e) {
                console.error(`[lzatt] Immediate attack failed: ${e.message}`);
            }
        };
        
        // Attach war end listener
        client.on('warEnded', lock.warListener);
        
        // Execute first attack immediately if possible
        try {
            // Re-check war status
            const ourWarStatus = ZoneManager.getGroupWarStatus(config.defaultGroup);
            const theirWarStatus = ZoneManager.getGroupWarStatus(groupName);
            
            if (!ourWarStatus && !theirWarStatus) {
                await executeAttack(player, tag);
                lock.lastAttack = Date.now();
            }
        } catch (e) {
            console.error(`[lzatt] Initial attack failed: ${e.message}`);
        }
        
        // Set up interval for continuous attacks (fallback)
        lock.interval = setInterval(async () => {
            try {
                // Skip if last attack was recent
                if (Date.now() - lock.lastAttack < 30000) return;
                
                // Re-check war status
                const ourWarStatus = ZoneManager.getGroupWarStatus(config.defaultGroup);
                const theirWarStatus = ZoneManager.getGroupWarStatus(lock.groupName);
                
                // Skip if either group is in war
                if (ourWarStatus || theirWarStatus) {
                    console.log(`[lzatt] Skipping attack - ${config.defaultGroup} war: ${!!ourWarStatus}, ${lock.groupName} war: ${!!theirWarStatus}`);
                    return;
                }
                
                // Check if there are attackable zones
                const result = ZoneManager.getZoneByGroupTag(lock.tag);
                if (typeof result === 'string') {
                    console.log(`[lzatt] No attackable zones: ${result}`);
                    return;
                }
                
                // Execute attack
                await executeAttack(lock.player, lock.tag);
                lock.lastAttack = Date.now();
            } catch (e) {
                console.error(`[lzatt] Interval attack failed: ${e.message}`);
            }
        }, 15000); // Check every 15 seconds
        
        attackLocks.set(player, lock);
        
        return `🔒 Locked attacks activated for ${groupName}. Will attack when war status is clear.`;
    }
};