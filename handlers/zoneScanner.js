const axios = require('axios');
const ZoneManager = require('../utils/ZoneManager');
const colorConverter = require('../utils/colorConverter');
const config = require('../config.json');

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
        this.cooldownDuration = ZoneManager.cooldownDuration;
        this.cycleDuration = ZoneManager.cycleDuration;
        this.currentZoneId = null;
        this.isProcessingTag = false;
        
        // Convert durations to minutes
        this.cooldownMinutes = this.cooldownDuration / (60 * 1000); // 360 minutes (6 hours)
        this.cycleMinutes = this.cycleDuration / (60 * 1000);       // 420 minutes (7 hours)
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
        if (this.dialogHandler) this.client.off('scanner_dialog', this.dialogHandler);
        console.log('[ZoneScanner] Scanning stopped');
    }

    buildZoneQueue() {
        const zones = [];
        for (const [zoneId, zoneData] of ZoneManager.zones) {
            if (ZoneManager.getZonePosition(zoneId) && zoneData.capturedAt) {
                zones.push({
                    zoneId,
                    capturedAt: zoneData.capturedAt
                });
            }
        }
        
        // Sort by oldest capture time first
        zones.sort((a, b) => a.capturedAt - b.capturedAt);
        this.zoneQueue = zones.map(z => z.zoneId);
        console.log(`[ZoneScanner] Built queue with ${this.zoneQueue.length} zones`);
    }

    async scanNextZone() {
        if (!this.isScanning || this.isProcessingTag) {
            console.log(`[ZoneScanner] Scan paused (scanning: ${this.isScanning}, processing tag: ${this.isProcessingTag})`);
            return;
        }

        if (this.currentZoneIndex >= this.zoneQueue.length) {
            console.log('[ZoneScanner] Completed queue. Rebuilding...');
            this.currentZoneIndex = 0;
            this.buildZoneQueue();
            
            // Wait before restarting
            setTimeout(() => this.scanNextZone(), 30000);
            return;
        }

        const zoneId = this.zoneQueue[this.currentZoneIndex];
        this.currentZoneId = zoneId;
        console.log(`[ZoneScanner] Scanning zone ${zoneId} (${this.currentZoneIndex + 1}/${this.zoneQueue.length})`);

        try {
            const position = ZoneManager.getZonePosition(zoneId);
            if (!position) {
                console.log(`[ZoneScanner] Position not found for zone ${zoneId}. Skipping.`);
                this.currentZoneIndex++;
                this.scanNextZone();
                return;
            }

            // Teleport to zone
            console.log(`[ZoneScanner] Teleporting to zone ${zoneId} at (${position.x}, ${position.y}, ${position.z})`);
            await axios.post(
                `http://${config.raksampHost}:${config.scannerPort}/`,
                `botcommand=${encodeURIComponent(`teleport|${position.x}|${position.y}|${position.z}`)}`,
                { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
            );

            // Wait for teleport
            console.log(`[ZoneScanner] Waiting for teleport to complete...`);
            await new Promise(resolve => setTimeout(resolve, 5000));

            // Send /gzinfo command
            console.log(`[ZoneScanner] Sending /gzinfo command`);
            await axios.post(
                `http://${config.raksampHost}:${config.scannerPort}/`,
                `command=${encodeURIComponent('/gzinfo')}`,
                { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
            );

            // Setup dialog handler
            this.setupDialogHandler(zoneId);

            // Set timeout
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
        if (this.dialogHandler) {
            this.client.off('scanner_dialog', this.dialogHandler);
        }

        this.dialogHandler = (dialog) => {
            const title = this.cleanDialogText(dialog.title);
            if (!title.toLowerCase().includes('group zone info')) {
                console.log(`[ZoneScanner] Ignoring dialog: ${title}`);
                return;
            }

            console.log(`[ZoneScanner] Received dialog for zone ${zoneId}`);
            clearTimeout(this.timeout);
            
            try {
                this.processDialog(dialog, zoneId);
            } catch (error) {
                console.error(`[ZoneScanner] Error processing dialog:`, error);
            } finally {
                this.scanNextZone();
            }
        };

        this.client.once('scanner_dialog', this.dialogHandler);
    }

    async processDialog(dialog, expectedZoneId) {
        const cleanInfo = this.cleanDialogText(dialog.info);
        const lines = cleanInfo.split('\n').filter(line => line.trim() !== '');
        
        console.log(`[ZoneScanner] Dialog content for zone ${expectedZoneId}:\n${cleanInfo}`);
        
        // Verify zone ID from dialog
        let dialogZoneId = null;
        const zoneLine = lines.find(line => line.toLowerCase().includes('zone name:'));
        if (zoneLine) {
            const match = zoneLine.match(/#\s*(\d+)/i);
            if (match && match[1]) dialogZoneId = parseInt(match[1]);
        }
        
        if (dialogZoneId === null || dialogZoneId !== expectedZoneId) {
            console.log(`[ZoneScanner] Zone ID mismatch! Expected ${expectedZoneId}, got ${dialogZoneId || 'unknown'}. Skipping.`);
            this.currentZoneIndex++;
            return;
        }
        
        // Extract owner group
        let newOwner = null;
        const ownerLine = lines.find(line => line.includes('owned by group'));
        if (ownerLine) {
            const match = ownerLine.match(/owned by group "([^"]+)"/);
            if (match && match[1]) newOwner = match[1].trim();
        }

        // Extract time until attackable
        let timeLeftMinutes = null;
        const timeLine = lines.find(line => line.includes('attacked in'));
        if (timeLine) {
            const hoursMatch = timeLine.match(/(\d+)\s+hours?/);
            const minutesMatch = timeLine.match(/(\d+)\s+minutes?/);
            const hours = hoursMatch ? parseInt(hoursMatch[1]) : 0;
            const minutes = minutesMatch ? parseInt(minutesMatch[1]) : 0;
            timeLeftMinutes = hours * 60 + minutes; // Total minutes
            
            // Skip if less than 1 hour remaining
            if (timeLeftMinutes < 60) {
                console.log(`[ZoneScanner] Skipping zone ${expectedZoneId} (less than 1 hour remaining)`);
                this.currentZoneIndex++;
                return;
            }
        }
        
        // Handle "no members online" case - same as normal processing
        if (!newOwner) {
            if (timeLine) {
                console.log(`[ZoneScanner] Owner offline for zone ${expectedZoneId}, but we'll still process time`);
                // Continue with time processing
            } else {
                console.log(`[ZoneScanner] No owner and no time info for zone ${expectedZoneId}. Skipping.`);
                this.currentZoneIndex++;
                return;
            }
        }

        // Check if group tag is missing
        if (newOwner && !ZoneManager.getGroupTag(newOwner)) {
            console.log(`[ZoneScanner] Missing tag for ${newOwner}, fetching...`);
            await this.fetchGroupTag(dialog.dialogId, newOwner, expectedZoneId, timeLeftMinutes);
        } else {
            this.updateZoneData(expectedZoneId, newOwner, timeLeftMinutes);
            this.currentZoneIndex++;
        }
    }

    updateZoneData(zoneId, newOwner, timeLeftMinutes) {
        const now = Date.now();
        const currentZone = ZoneManager.zones.get(zoneId);
        if (!currentZone) {
            console.log(`[ZoneScanner] Zone ${zoneId} not found in manager. Skipping.`);
            return;
        }

        const currentOwner = currentZone.owner;
        const currentCapturedAt = currentZone.capturedAt;
        let needsUpdate = false;

        // Handle owner change
        if (newOwner && newOwner !== currentOwner) {
            console.log(`[ZoneScanner] Owner changed for zone ${zoneId}: ${currentOwner} -> ${newOwner}`);
            currentZone.owner = newOwner;
            needsUpdate = true;
            
            // Update group zones
            ZoneManager.updateGroupZone(currentOwner, zoneId, false);
            ZoneManager.updateGroupZone(newOwner, zoneId, true);
        }

        // Calculate expected time left based on current capture time (in minutes)
        let expectedTimeLeftMinutes = null;
        if (currentCapturedAt) {
            const timeSinceCaptureMs = now - currentCapturedAt;
            const timeSinceCaptureMinutes = timeSinceCaptureMs / (60 * 1000);
            
            // Calculate position in cycle (0-420 minutes)
            const positionInCycleMinutes = timeSinceCaptureMinutes % this.cycleMinutes;
            
            // Calculate expected time left
            if (positionInCycleMinutes < this.cooldownMinutes) {
                expectedTimeLeftMinutes = this.cooldownMinutes - positionInCycleMinutes;
            } else {
                expectedTimeLeftMinutes = 0; // Attackable now
            }
            
            console.log(`[ZoneScanner] Time calculation for zone ${zoneId}:`);
            console.log(`  - Current time: ${new Date(now).toISOString()}`);
            console.log(`  - Captured at: ${new Date(currentCapturedAt).toISOString()}`);
            console.log(`  - Time since capture: ${timeSinceCaptureMinutes.toFixed(2)} minutes`);
            console.log(`  - Position in cycle: ${positionInCycleMinutes.toFixed(2)} minutes`);
            console.log(`  - Expected time left: ${expectedTimeLeftMinutes.toFixed(2)} minutes`);
        }

        // Handle time discrepancy (more than 2 minutes difference)
        if (timeLeftMinutes !== null && expectedTimeLeftMinutes !== null) {
            console.log(`[ZoneScanner] Dialog time left: ${timeLeftMinutes} minutes`);
            
            const timeDiff = Math.abs(timeLeftMinutes - expectedTimeLeftMinutes);
            console.log(`[ZoneScanner] Time difference: ${timeDiff.toFixed(2)} minutes`);
            
            if (timeDiff > 2) {
                console.log(`[ZoneScanner] Time discrepancy detected for zone ${zoneId}`);
                
                // Calculate new capture time based on dialog info
                const minutesToDeduct = this.cooldownMinutes - timeLeftMinutes;
                currentZone.capturedAt = now - (minutesToDeduct * 60 * 1000);
                
                console.log(`[ZoneScanner] Updating capture time to: ${new Date(currentZone.capturedAt).toISOString()}`);
                needsUpdate = true;
            }
        }

        if (needsUpdate) {
            ZoneManager.zones.set(zoneId, currentZone);
            ZoneManager.saveZones();
            console.log(`[ZoneScanner] Updated zone ${zoneId} data`);
        } else {
            console.log(`[ZoneScanner] No updates needed for zone ${zoneId}`);
        }
    }
    
    async fetchGroupTag(dialogId, groupName, zoneId, timeLeftMinutes) {
        this.isProcessingTag = true;
        console.log(`[ZoneScanner] Starting tag fetch for ${groupName}`);
        
        try {
            // Send dialog response to open group stats
            console.log(`[ZoneScanner] Sending dialog response to open group stats`);
            await this.sendDialogResponse(dialogId, 1, 1, 0);
            
            // Wait for group stats dialog
            console.log(`[ZoneScanner] Waiting for group stats dialog...`);
            const statsDialog = await this.waitForDialog(
                d => this.cleanDialogText(d.title).toLowerCase().includes('group stats'),
                5000
            );
            
            if (!statsDialog) {
                console.log('[ZoneScanner] Group stats dialog not received');
                return;
            }
            
            console.log(`[ZoneScanner] Received group stats dialog for ${groupName}`);
            
            // Extract tag from stats
            const statsClean = this.cleanDialogText(statsDialog.info);
            let tag = null;
            
            const tagMatch = statsClean.match(/- Tag:\s*(\S+)/i);
            if (tagMatch && tagMatch[1]) {
                tag = tagMatch[1].trim();
                console.log(`[ZoneScanner] Extracted tag for ${groupName}: ${tag}`);
            } else {
                console.log(`[ZoneScanner] Tag not found for ${groupName}`);
                console.log(`Dialog content:\n${statsClean}`);
            }
            
            if (tag) {
                ZoneManager.setGroupTag(groupName, tag);
                console.log(`[ZoneScanner] Saved tag for ${groupName}`);
            }
            
            // Update zone data after tag extraction
            console.log(`[ZoneScanner] Updating zone data after tag fetch`);
            this.updateZoneData(zoneId, groupName, timeLeftMinutes);
            
        } catch (error) {
            console.error(`[ZoneScanner] Error fetching tag for ${groupName}:`, error);
        } finally {
            this.isProcessingTag = false;
            this.currentZoneIndex++;
            console.log(`[ZoneScanner] Tag fetch completed for ${groupName}`);
        }
    }

    async sendDialogResponse(dialogId, response, listItem, inputText) {
        try {
            const botcmd = `sendDialogResponse|${dialogId}|${response}|${listItem}|${inputText}`;
            console.log(`[ZoneScanner] Sending dialog response: ${botcmd}`);
            
            await axios.post(
                `http://${config.raksampHost}:${config.scannerPort}/`,
                `botcommand=${encodeURIComponent(botcmd)}`,
                { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
            );
        } catch (error) {
            console.error('[ZoneScanner] Failed to send dialog response:', error);
        }
    }

    waitForDialog(filter, timeout) {
        return new Promise((resolve) => {
            console.log(`[ZoneScanner] Setting up dialog waiter (timeout: ${timeout}ms)`);
            
            const handler = (dialog) => {
                console.log(`[ZoneScanner] Received dialog in waiter: ${dialog.title}`);
                if (filter(dialog)) {
                    console.log(`[ZoneScanner] Dialog matches filter`);
                    cleanup();
                    resolve(dialog);
                }
            };
            
            const timer = setTimeout(() => {
                console.log(`[ZoneScanner] Dialog wait timed out`);
                cleanup();
                resolve(null);
            }, timeout);
            
            const cleanup = () => {
                clearTimeout(timer);
                this.client.off('scanner_dialog', handler);
                console.log(`[ZoneScanner] Cleaned up dialog waiter`);
            };
            
            this.client.on('scanner_dialog', handler);
        });
    }

    retryOrSkip(zoneId) {
        this.retryCount++;
        
        if (this.retryCount <= this.maxRetries) {
            console.log(`[ZoneScanner] Retrying zone ${zoneId} (${this.retryCount}/${this.maxRetries})`);
            // Keep same zone index for retry
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
}

module.exports = ZoneScanner;