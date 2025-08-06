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
        
        // Remove zone from all groups that previously owned it
        for (const [group, zones] of this.groupZones) {
            if (zones.has(zoneId)) {
                zones.delete(zoneId);
            }
        }
        
        // Update zone ownership
        this.zones.set(zoneId, {
            owner: attackerGroup,
            capturedAt: now,
            attackableAt
        });
        
        // Add zone to attacker's groupZones
        this.updateGroupZone(attackerGroup, zoneId, true);
        
        this.saveZones();
        return attackableAt;
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
        // If tag is empty, set it directly
        if (!tag) {
            this.groupTags.set(groupName, tag);
            this.saveZones();
            console.log(`[ZoneManager] Set tag for ${groupName}: ${tag}`);
            return;
        }

        // Check if tag is already in use
        const lowerTag = tag.toLowerCase();
        let isDuplicate = false;
        let newTag = tag;
        let suffix = 2;

        for (const [name, existingTag] of this.groupTags) {
            // Skip current group
            if (name === groupName) continue;
            
            if (existingTag && existingTag.toLowerCase() === lowerTag) {
                isDuplicate = true;
                break;
            }
        }

        // Append number if duplicate exists
        if (isDuplicate) {
            while (true) {
                newTag = tag + suffix;
                const newLowerTag = newTag.toLowerCase();
                let foundDuplicate = false;

                for (const [name, existingTag] of this.groupTags) {
                    if (name === groupName) continue;
                    
                    if (existingTag && existingTag.toLowerCase() === newLowerTag) {
                        foundDuplicate = true;
                        break;
                    }
                }

                if (!foundDuplicate) break;
                suffix++;
            }
        }

        this.groupTags.set(groupName, newTag);
        this.saveZones();
        console.log(`[ZoneManager] Set tag for ${groupName}: ${newTag}`);
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
            this.warStartTimes.set(groupName, Date.now());
        } else {
            this.activeWars.delete(groupName);
            this.warStartTimes.delete(groupName);
        }
        this.saveZones();
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
        
        // Calculate how many full cycles have passed since last capture
        const cycleLength = this.cooldownDuration + this.attackWindow;
        const cyclesPassed = Math.floor((now - capturedAt) / cycleLength);
        
        // Calculate the current attack window start time
        const currentWindowStart = capturedAt + cyclesPassed * cycleLength + this.cooldownDuration;
        const currentWindowEnd = currentWindowStart + this.attackWindow;
        
        return now >= currentWindowStart && now <= currentWindowEnd;
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