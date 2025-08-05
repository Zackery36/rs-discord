const fs = require('fs');
const path = require('path');

class ZoneManager {
    constructor() {
        this.zones = new Map();
        this.groupTags = new Map();
        this.groupZones = new Map();
        this.zoneCycles = new Map();
        this.activeWars = new Map();
        this.lockedAttacks = new Map();
        this.warStartTimes = new Map();
        this.countdownEnabled = false;
        this.cooldownDuration = 6 * 60 * 60 * 1000; // 6 hours
        this.attackWindow = 60 * 60 * 1000; // 1 hour
        this.filePath = path.join(__dirname, '../data/zones.json');
        this.cZonesPath = path.join(__dirname, '../data/czones.json');
        this.zonePositions = new Map();
        this.warCountdowns = new Map(); // Stores active war countdowns
        this.loadData();
    }

    loadData() {
        this.loadZones();
        this.loadCZonePositions();
    }

    loadZones() {
        if (fs.existsSync(this.filePath)) {
            try {
                const data = JSON.parse(fs.readFileSync(this.filePath));
                
                this.zones = new Map(data.zones || []);
                this.groupTags = new Map(data.groupTags || []);
                this.activeWars = new Map(data.activeWars || []);
                this.lockedAttacks = new Map(data.lockedAttacks || []);
                this.warStartTimes = new Map(data.warStartTimes || []);
                this.countdownEnabled = data.countdownEnabled || false;
                
                this.groupZones = new Map();
                if (data.groupZones) {
                    for (const [groupName, zones] of data.groupZones) {
                        this.groupZones.set(groupName, new Set(zones));
                    }
                }
                
                this.zoneCycles = new Map(data.zoneCycles || []);
                console.log(`[ZoneManager] Loaded ${this.zones.size} zones and ${this.groupTags.size} group tags`);
            } catch (e) {
                console.error('[ZoneManager] Failed to load zones:', e);
            }
        }
    }

    loadCZonePositions() {
        if (fs.existsSync(this.cZonesPath)) {
            try {
                const cZonesData = JSON.parse(fs.readFileSync(this.cZonesPath));
                for (const [zoneId, zoneData] of cZonesData) {
                    this.zonePositions.set(zoneId, zoneData.position);
                }
                console.log(`[ZoneManager] Loaded ${cZonesData.length} zone positions`);
            } catch (e) {
                console.error('[ZoneManager] Failed to load czones:', e);
            }
        }
    }

    saveZones() {
        const groupZonesArray = Array.from(this.groupZones.entries())
            .map(([group, zones]) => [group, Array.from(zones)]);
        
        const zonesWithoutPositions = Array.from(this.zones.entries()).map(([id, zone]) => {
            const { position, ...rest } = zone;
            return [id, rest];
        });

        const data = {
            zones: zonesWithoutPositions,
            groupTags: Array.from(this.groupTags.entries()),
            groupZones: groupZonesArray,
            zoneCycles: Array.from(this.zoneCycles.entries()),
            activeWars: Array.from(this.activeWars.entries()),
            lockedAttacks: Array.from(this.lockedAttacks.entries()),
            warStartTimes: Array.from(this.warStartTimes.entries()),
            countdownEnabled: this.countdownEnabled
        };
        
        fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2));
        console.log(`[ZoneManager] Saved zones data with ${this.groupTags.size} group tags`);
    }

    saveCZonePositions() {
        const positions = [];
        for (const [zoneId, position] of this.zonePositions) {
            positions.push([zoneId, { position }]);
        }
        fs.writeFileSync(this.cZonesPath, JSON.stringify(positions, null, 2));
    }

    recordZoneCapture(zoneId, attackerGroup, defenderGroup) {
        const now = Date.now();
        const attackableAt = now + this.cooldownDuration;
        
        // Update zone ownership
        this.zones.set(zoneId, {
            owner: attackerGroup,
            capturedAt: now,
            attackableAt
        });
        
        // Remove zone from defender's groupZones
        if (defenderGroup) {
            this.updateGroupZone(defenderGroup, zoneId, false);
        }
        
        // Add zone to attacker's groupZones
        this.updateGroupZone(attackerGroup, zoneId, true);
        
        this.saveZones();
        return attackableAt;
    }
    
    // Handle zones that weren't captured during attack window
    resetUncapturedZones() {
        const now = Date.now();
        let resetCount = 0;
        
        for (const [zoneId, zone] of this.zones) {
            const { capturedAt } = zone;
            const cycleLength = this.cooldownDuration + this.attackWindow;
            const cyclesPassed = Math.floor((now - capturedAt) / cycleLength);
            
            // Calculate the end of the current attack window
            const windowEnd = capturedAt + cyclesPassed * cycleLength + this.cooldownDuration + this.attackWindow;
            
            // If we're past the attack window and zone wasn't captured
            if (now > windowEnd) {
                // Treat it as if it was recaptured at the end of the window
                const newCaptureTime = windowEnd;
                this.zones.set(zoneId, {
                    ...zone,
                    capturedAt: newCaptureTime,
                    attackableAt: newCaptureTime + this.cooldownDuration
                });
                resetCount++;
            }
        }
        
        if (resetCount > 0) {
            console.log(`[ZoneManager] Reset ${resetCount} uncaptured zones`);
            this.saveZones();
        }
        
        return resetCount;
    }

    updateGroupZone(groupName, zoneId, isAdding) {
        if (!groupName) return;
        
        let zones = this.groupZones.get(groupName) || new Set();
        if (isAdding) {
            zones.add(zoneId);
        } else {
            zones.delete(zoneId);
        }
        
        this.groupZones.set(groupName, zones);
        this.saveZones();
    }

    setGroupTag(groupName, tag) {
        this.groupTags.set(groupName, tag);
        this.saveZones();
        console.log(`[ZoneManager] Set tag for ${groupName}: ${tag}`);
    }

    getGroupTag(groupName) {
        return this.groupTags.get(groupName) || null;
    }

    addZonePosition(zoneId, x, y, z) {
        this.zonePositions.set(zoneId, { x, y, z });
        this.saveCZonePositions();
        return true;
    }

    getZonePosition(zoneId) {
        return this.zonePositions.get(zoneId) || null;
    }

    setGroupWarStatus(groupName, opponent) {
        if (opponent) {
            this.activeWars.set(groupName, opponent);
            const startTime = Date.now();
            this.warStartTimes.set(groupName, startTime);
            
            // Setup countdown if enabled
            if (this.countdownEnabled) {
                this.setupWarCountdown(groupName, startTime);
            }
            
            console.log(`[WarTracker] War started: ${groupName} vs ${opponent}`);
        } else {
            this.activeWars.delete(groupName);
            this.warStartTimes.delete(groupName);
            
            // Clear any existing countdown
            if (this.warCountdowns.has(groupName)) {
                clearTimeout(this.warCountdowns.get(groupName));
                this.warCountdowns.delete(groupName);
            }
        }
        this.saveZones();
    }
    
    setupWarCountdown(groupName, startTime) {
        const warDuration = 10 * 60 * 1000; // 10 minutes
        
        // Clear any existing countdown
        if (this.warCountdowns.has(groupName)) {
            clearTimeout(this.warCountdowns.get(groupName));
        }
        
        const sendCountdown = (secondsLeft) => {
            const channel = this.getWarChannel();
            if (channel) {
                channel.send(`⏳ **${groupName} War**: ${secondsLeft} seconds remaining!`);
            }
        };
        
        // Schedule countdown messages
        const scheduleMessage = (timeLeft) => {
            return setTimeout(() => {
                if (this.activeWars.get(groupName)) {
                    sendCountdown(timeLeft);
                    
                    // Schedule next message if needed
                    if (timeLeft > 1) {
                        const nextTime = this.getNextCountdownTime(timeLeft);
                        if (nextTime > 0) {
                            this.warCountdowns.set(
                                groupName, 
                                scheduleMessage(nextTime)
                            );
                        }
                    }
                }
            }, warDuration - (timeLeft * 1000));
        };
        
        // Set initial countdown times
        this.warCountdowns.set(groupName, scheduleMessage(600)); // Start with 10 minutes
        
        // Special times: 10s, 5s, 1s
        [10, 5, 1].forEach(seconds => {
            setTimeout(() => {
                if (this.activeWars.get(groupName)) {
                    sendCountdown(seconds);
                }
            }, warDuration - (seconds * 1000));
        });
    }
    
    getNextCountdownTime(current) {
        // Define when to send countdown messages (last 10s of each minute)
        const thresholds = [50, 55, 59]; // 50s, 55s, 59s left in minute
        
        for (const threshold of thresholds) {
            if (current > threshold && current <= threshold + 10) {
                return threshold;
            }
        }
        
        // If we're in the last minute, handle separately
        if (current <= 60) {
            return 0; // Already handled by special times
        }
        
        // Find next minute marker
        const nextMinute = Math.floor(current / 60) * 60;
        return nextMinute - 10; // 10s before next minute
    }
    
    getWarChannel() {
        // In a real implementation, you'd get this from config
        return null; // Placeholder
    }

    getGroupWarStatus(groupName) {
        return this.activeWars.get(groupName) || null;
    }
    
    getWarStartTime(groupName) {
        return this.warStartTimes.get(groupName) || null;
    }
    
    getWarTimeLeft(groupName) {
        const startTime = this.warStartTimes.get(groupName);
        if (!startTime) return null;
        
        const warDuration = 10 * 60 * 1000; // 10 minutes
        const elapsed = Date.now() - startTime;
        const remaining = warDuration - elapsed;
        
        return remaining > 0 ? Math.floor(remaining / 1000) : 0;
    }
    
    toggleCountdown(enabled) {
        this.countdownEnabled = enabled;
        this.saveZones();
        return enabled;
    }

    getGroupNameByTag(tag) {
        const lowerTag = tag.toLowerCase();
        for (const [groupName, groupTag] of this.groupTags) {
            if (groupTag && groupTag.toLowerCase() === lowerTag) {
                return groupName;
            }
        }
        return null;
    }

    getZoneByGroupTag(tag) {
        const lowerTag = tag.toLowerCase();
        for (const [groupName, groupTag] of this.groupTags) {
            if (groupTag && groupTag.toLowerCase() === lowerTag) {
                const zones = Array.from(this.groupZones.get(groupName) || []);
                
                // Filter attackable zones
                const attackableZones = zones.filter(zoneId => 
                    this.isAttackable(zoneId)
                );
                
                if (attackableZones.length === 0) {
                    return `${groupName} has no attackable zones`;
                }
                
                // Get or create cycle index
                const cycleKey = `${groupName}:${groupTag}`;
                let currentIndex = this.zoneCycles.get(cycleKey) || 0;
                
                // Get next attackable zone
                const zoneId = attackableZones[currentIndex];
                
                // Update index for next call
                currentIndex = (currentIndex + 1) % attackableZones.length;
                this.zoneCycles.set(cycleKey, currentIndex);
                this.saveZones();
                
                return zoneId;
            }
        }
        return `No group found with tag: ${tag}`;
    }

    isAttackable(zoneId) {
        const zone = this.zones.get(zoneId);
        if (!zone) return false;
        
        const now = Date.now();
        const { capturedAt } = zone;
        const cycleLength = this.cooldownDuration + this.attackWindow;
        
        // Calculate current cycle position
        const cyclePosition = (now - capturedAt) % cycleLength;
        
        // Zone is attackable if in the attack window portion of the cycle
        return cyclePosition >= this.cooldownDuration && 
               cyclePosition <= (this.cooldownDuration + this.attackWindow);
    }
    
    getZoneCooldown(zoneId) {
        const zone = this.zones.get(zoneId);
        if (!zone) return null;

        const now = Date.now();
        const { capturedAt } = zone;
        const cycleLength = this.cooldownDuration + this.attackWindow;
        const cyclesPassed = Math.floor((now - capturedAt) / cycleLength);

        // Calculate next attack window start time
        const nextWindowStart = capturedAt + cyclesPassed * cycleLength + this.cooldownDuration;
        
        // If we're in the attack window, return 0
        if (now >= nextWindowStart && now <= nextWindowStart + this.attackWindow) {
            return 0;
        }
        
        // If before the window, return time until window opens
        if (now < nextWindowStart) {
            return nextWindowStart - now;
        }
        
        // If after the window, return time until next cycle
        return (nextWindowStart + cycleLength) - now;
    }

    getAttackableZonesByGroup() {
        const attackableZones = {};
        for (const [groupName, zones] of this.groupZones) {
            const attackable = Array.from(zones).filter(zoneId => this.isAttackable(zoneId));
            if (attackable.length > 0) attackableZones[groupName] = attackable;
        }
        return attackableZones;
    }

    setLockedAttack(player, tag) {
        this.lockedAttacks.set(player, tag);
        this.saveZones();
    }

    getLockedAttack(player) {
        return this.lockedAttacks.get(player) || null;
    }

    clearLockedAttack(player) {
        this.lockedAttacks.delete(player);
        this.saveZones();
    }
}

module.exports = new ZoneManager();