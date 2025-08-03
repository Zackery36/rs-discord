const fs = require('fs');
const path = require('path');

class ZoneManager {
    constructor() {
        this.zones = new Map();
        this.cooldowns = new Map();
        this.groupTags = new Map();
        this.groupZones = new Map();
        this.zoneCycles = new Map();
        this.activeWars = new Map();
        this.lockedAttacks = new Map();
        this.filePath = path.join(__dirname, '../data/zones.json');
        this.cZonesPath = path.join(__dirname, '../data/czones.json');
        this.cooldownDuration = 6 * 60 * 60 * 1000;
        this.attackWindow = 60 * 60 * 1000;
        this.loadZones();
        this.loadCZonePositions();
    }

    loadZones() {
        if (fs.existsSync(this.filePath)) {
            try {
                const data = JSON.parse(fs.readFileSync(this.filePath));
                
                this.zones = new Map(data.zones || []);
                this.cooldowns = new Map(data.cooldowns || []);
                this.groupTags = new Map(data.groupTags || []);
                this.activeWars = new Map(data.activeWars || []);
                this.lockedAttacks = new Map(data.lockedAttacks || []);
                
                this.groupZones = new Map();
                if (data.groupZones) {
                    for (const [groupName, zones] of data.groupZones) {
                        this.groupZones.set(groupName, new Set(zones));
                    }
                }
                
                this.zoneCycles = new Map(data.zoneCycles || []);
                console.log(`[ZoneManager] Loaded ${this.zones.size} zones`);
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
                    const existingZone = this.zones.get(zoneId) || {};
                    this.zones.set(zoneId, {
                        ...existingZone,
                        position: zoneData.position
                    });
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
        
        const data = {
            zones: Array.from(this.zones.entries()),
            cooldowns: Array.from(this.cooldowns.entries()),
            groupTags: Array.from(this.groupTags.entries()),
            groupZones: groupZonesArray,
            zoneCycles: Array.from(this.zoneCycles.entries()),
            activeWars: Array.from(this.activeWars.entries()),
            lockedAttacks: Array.from(this.lockedAttacks.entries())
        };
        
        fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2));
    }

    saveCZonePositions() {
        const positions = [];
        for (const [zoneId, zoneData] of this.zones) {
            if (zoneData.position) {
                positions.push([zoneId, { position: zoneData.position }]);
            }
        }
        fs.writeFileSync(this.cZonesPath, JSON.stringify(positions, null, 2));
    }

    recordZoneCapture(zoneId, attackerGroup, defenderGroup) {
        const now = Date.now();
        const attackableAt = now + this.cooldownDuration;
        
        this.zones.set(zoneId, {
            owner: attackerGroup,
            capturedAt: now,
            attackableAt
        });
        
        this.updateGroupZone(attackerGroup, zoneId, true);
        this.updateGroupZone(defenderGroup, zoneId, false);
        this.cooldowns.set(zoneId, attackableAt);
        this.saveZones();
        return attackableAt;
    }

    updateGroupZone(groupName, zoneId, isAdding) {
        if (!groupName) return;
        
        let zones = this.groupZones.get(groupName) || new Set();
        if (isAdding) zones.add(zoneId);
        else zones.delete(zoneId);
        
        this.groupZones.set(groupName, zones);
        this.saveZones();
    }

    setGroupTag(groupName, tag) {
        this.groupTags.set(groupName, tag);
        this.saveZones();
    }

    getGroupTag(groupName) {
        return this.groupTags.get(groupName) || null;
    }

    addZonePosition(zoneId, x, y, z) {
        const zone = this.zones.get(zoneId) || {};
        zone.position = { x, y, z };
        this.zones.set(zoneId, zone);
        this.saveCZonePositions();  // Save to czones.json
        return true;
    }

    getZonePosition(zoneId) {
        const zone = this.zones.get(zoneId);
        return zone?.position || null;
    }

    setGroupWarStatus(groupName, opponent) {
        if (opponent) this.activeWars.set(groupName, opponent);
        else this.activeWars.delete(groupName);
        this.saveZones();
    }

    getGroupWarStatus(groupName) {
        return this.activeWars.get(groupName) || null;
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
        const cooldown = this.cooldowns.get(zoneId);
        if (!cooldown) return true;
        const now = Date.now();
        return now > cooldown && now < (cooldown + this.attackWindow);
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