const axios = require('axios');
const ZoneManager = require('../../utils/ZoneManager');
const colorConverter = require('../../utils/colorConverter');
const config = require('../../config.json');

class ZoneScanner {
    constructor(client) {
        this.client = client;
        this.isScanning = false;
        this.currentZoneIndex = 0;
        this.retryCount = 0;
        this.maxRetries = 3;
        this.timeout = null;
        this.dialogHandler = null;
        this.zoneQueue = [];
        this.isProcessingDialog = false;
    }

    start() {
        if (this.isScanning) return;
        this.isScanning = true;
        this.buildZoneQueue();
        this.scanNextZone();
        console.log('[ZoneScanner] Scanning started');
    }

    stop() {
        if (!this.isScanning) return;
        this.isScanning = false;
        if (this.timeout) clearTimeout(this.timeout);
        if (this.dialogHandler) this.client.off('dialog', this.dialogHandler);
        console.log('[ZoneScanner] Scanning stopped');
    }

    buildZoneQueue() {
        // Create an array of all zones with capture times
        const zones = [];
        for (const [zoneId, zoneData] of ZoneManager.zones) {
            if (ZoneManager.getZonePosition(zoneId) && zoneData.capturedAt) {
                zones.push({
                    zoneId,
                    capturedAt: zoneData.capturedAt
                });
            }
        }
        
        // Sort zones by capture time (oldest first)
        zones.sort((a, b) => a.capturedAt - b.capturedAt);
        
        this.zoneQueue = zones.map(z => z.zoneId);
        console.log(`[ZoneScanner] Built queue with ${this.zoneQueue.length} zones`);
    }

    async scanNextZone() {
        if (!this.isScanning || this.isProcessingDialog) return;

        // Rebuild queue if we've scanned all zones
        if (this.currentZoneIndex >= this.zoneQueue.length) {
            console.log('[ZoneScanner] Completed queue. Rebuilding...');
            this.currentZoneIndex = 0;
            this.buildZoneQueue();
            await this.delay(30000); // Wait 30 seconds before restarting
            
            // Check if queue is empty
            if (this.zoneQueue.length === 0) {
                console.log('[ZoneScanner] No scannable zones found. Waiting...');
                setTimeout(() => this.scanNextZone(), 60000);
                return;
            }
        }

        const zoneId = this.zoneQueue[this.currentZoneIndex];
        console.log(`[ZoneScanner] Scanning zone ${zoneId} (${this.currentZoneIndex + 1}/${this.zoneQueue.length})`);

        try {
            const position = ZoneManager.getZonePosition(zoneId);
            if (!position) {
                console.log(`[ZoneScanner] Position for zone ${zoneId} not found. Skipping.`);
                this.currentZoneIndex++;
                this.scanNextZone();
                return;
            }

            // Teleport to zone using scanner port
            await axios.post(
                `http://${config.raksampHost}:${config.scannerPort}/`,
                `botcommand=${encodeURIComponent(`teleport|${position.x}|${position.y}|${position.z}`)}`,
                { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
            );

            // Wait for teleport to complete
            await this.delay(5000);

            // Send /gzinfo command
            await axios.post(
                `http://${config.raksampHost}:${config.scannerPort}/`,
                `command=${encodeURIComponent('/gzinfo')}`,
                { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
            );

            // Setup dialog listener
            this.setupDialogHandler(zoneId);

            // Set timeout for dialog response
            this.retryCount = 0;
            this.timeout = setTimeout(() => {
                console.log(`[ZoneScanner] Timeout waiting for dialog for zone ${zoneId}`);
                this.retryOrSkip(zoneId);
            }, 10000);

        } catch (error) {
            console.error(`[ZoneScanner] Error scanning zone ${zoneId}:`, error);
            this.retryOrSkip(zoneId);
        }
    }

    setupDialogHandler(zoneId) {
        if (this.dialogHandler) this.client.off('dialog', this.dialogHandler);
        
        this.dialogHandler = (dialog) => {
            const title = this.cleanDialogText(dialog.title);
            if (!title.toLowerCase().includes('group zone info')) return;

            console.log(`[ZoneScanner] Received dialog for zone ${zoneId}`);
            clearTimeout(this.timeout);
            
            try {
                this.isProcessingDialog = true;
                this.processDialog(dialog, zoneId);
            } catch (error) {
                console.error(`[ZoneScanner] Error processing dialog for zone ${zoneId}:`, error);
            } finally {
                this.isProcessingDialog = false;
                this.currentZoneIndex++;
                this.scanNextZone();
            }
        };

        this.client.on('dialog', this.dialogHandler);
    }

    processDialog(dialog, zoneId) {
        const cleanInfo = this.cleanDialogText(dialog.info);
        const lines = cleanInfo.split('\n').filter(line => line.trim() !== '');
        
        // Extract owner group
        let owner = null;
        const ownerLine = lines.find(line => line.includes('owned by group'));
        if (ownerLine) {
            const match = ownerLine.match(/owned by group "([^"]+)"/);
            if (match && match[1]) owner = match[1].trim();
        }

        // Extract attack time
        let timeLeft = null;
        const timeLine = lines.find(line => line.includes('attacked in'));
        if (timeLine) {
            const hoursMatch = timeLine.match(/(\d+)\s+hours?/);
            const minutesMatch = timeLine.match(/(\d+)\s+minutes?/);
            const hours = hoursMatch ? parseInt(hoursMatch[1]) : 0;
            const minutes = minutesMatch ? parseInt(minutesMatch[1]) : 0;
            timeLeft = hours * 60 + minutes; // Total minutes
        }

        this.updateZoneData(zoneId, owner, timeLeft);
    }

    updateZoneData(zoneId, newOwner, newTimeLeftMinutes) {
        const currentZone = ZoneManager.zones.get(zoneId) || {};
        const currentOwner = currentZone.owner;
        const currentAttackableAt = currentZone.attackableAt || 0;
        
        // Calculate new attackable time if we have time left
        let newAttackableAt = 0;
        if (newTimeLeftMinutes !== null) {
            const timeLeftMs = newTimeLeftMinutes * 60 * 1000;
            newAttackableAt = Date.now() + timeLeftMs;
        }

        // Check if we need to update
        const ownerChanged = newOwner && currentOwner !== newOwner;
        const timeDiff = Math.abs(currentAttackableAt - newAttackableAt) / 60000; // Minutes difference
        const timeNeedsUpdate = newAttackableAt > 0 && timeDiff > 3; // More than 3 minutes difference
        
        if (ownerChanged || timeNeedsUpdate) {
            if (ownerChanged) {
                console.log(`[ZoneScanner] Owner changed for zone ${zoneId}: ${currentOwner} -> ${newOwner}`);
                
                // Update group tags if needed
                if (newOwner && !ZoneManager.getGroupTag(newOwner)) {
                    this.getGroupTag(newOwner);
                }
            }
            
            if (timeNeedsUpdate) {
                console.log(`[ZoneScanner] Time updated for zone ${zoneId}: ${timeDiff.toFixed(1)} min difference`);
            }
            
            // Update zone data
            ZoneManager.zones.set(zoneId, {
                owner: newOwner || currentOwner,
                capturedAt: currentZone.capturedAt || Date.now(),
                attackableAt: newAttackableAt || currentAttackableAt
            });
            
            ZoneManager.saveZones();
        }
    }

    async getGroupTag(groupName) {
        if (!groupName) return;
        
        console.log(`[ZoneScanner] Fetching tag for group: ${groupName}`);
        
        try {
            // Send groups command to scanner bot
            await axios.post(
                `http://${config.raksampHost}:${config.scannerPort}/`,
                `command=${encodeURIComponent('/groups')}`,
                { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
            );
            
            // Wait for groups dialog
            const groupsDialog = await this.waitForDialog(
                d => this.cleanDialogText(d.title).includes('online groups'),
                5000
            );
            
            if (!groupsDialog) {
                console.log('[ZoneScanner] Groups dialog not received');
                return;
            }
            
            // Find group in the list
            const cleanInfo = this.cleanDialogText(groupsDialog.info);
            const lines = cleanInfo.split('\n').filter(Boolean);
            let groupIndex = -1;
            
            for (const [index, line] of lines.entries()) {
                if (line.toLowerCase().includes(groupName.toLowerCase())) {
                    groupIndex = index;
                    break;
                }
            }
            
            if (groupIndex === -1) {
                console.log(`[ZoneScanner] Group ${groupName} not found in groups list`);
                return;
            }
            
            // Select the group
            await axios.post(
                `http://${config.raksampHost}:${config.scannerPort}/`,
                `botcommand=${encodeURIComponent(`sendDialogResponse|${groupsDialog.dialogId}|1|${groupIndex}|0`)}`,
                { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
            );
            
            // Wait for group stats dialog
            const statsDialog = await this.waitForDialog(
                d => this.cleanDialogText(d.title).includes('group stats'),
                5000
            );
            
            if (!statsDialog) {
                console.log('[ZoneScanner] Group stats dialog not received');
                return;
            }
            
            // Extract tag from stats
            const statsClean = this.cleanDialogText(statsDialog.info);
            const statsLines = statsClean.split('\n');
            let tag = null;
            
            for (const line of statsLines) {
                const tagMatch = line.match(/- Tag:\s*(\S+)/i);
                if (tagMatch && tagMatch[1]) {
                    tag = tagMatch[1].trim();
                    break;
                }
            }
            
            if (tag) {
                ZoneManager.setGroupTag(groupName, tag);
                console.log(`[ZoneScanner] Extracted tag for ${groupName}: ${tag}`);
            } else {
                console.log(`[ZoneScanner] Tag not found for ${groupName}`);
            }
            
        } catch (error) {
            console.error(`[ZoneScanner] Error fetching tag for ${groupName}:`, error);
        }
    }

    waitForDialog(filter, timeout) {
        return new Promise((resolve) => {
            const handler = (dialog) => {
                if (filter(dialog)) {
                    cleanup();
                    resolve(dialog);
                }
            };
            
            const timer = setTimeout(() => {
                cleanup();
                resolve(null);
            }, timeout);
            
            const cleanup = () => {
                clearTimeout(timer);
                this.client.off('dialog', handler);
            };
            
            this.client.on('dialog', handler);
        });
    }

    retryOrSkip(zoneId) {
        this.retryCount++;
        
        if (this.retryCount <= this.maxRetries) {
            console.log(`[ZoneScanner] Retrying zone ${zoneId} (attempt ${this.retryCount})`);
            // Stay on same zone for retry
            this.scanNextZone();
        } else {
            console.log(`[ZoneScanner] Skipping zone ${zoneId} after ${this.maxRetries} attempts`);
            this.retryCount = 0;
            this.currentZoneIndex++;
            this.scanNextZone();
        }
    }

    cleanDialogText(text) {
        return colorConverter.stripSampColors(text)
            .replace(/{[0-9a-f]{6}}/gi, '')
            .replace(/<\/?[a-z]{1,2}>/gi, '')
            .trim();
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = ZoneScanner;