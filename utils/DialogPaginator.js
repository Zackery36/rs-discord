const axios = require('axios');
const colorConverter = require('./colorConverter');
const InputSanitizer = require('./inputSanitizer');

class DialogPaginator {
    constructor(client, config) {
        this.client = client;
        this.config = config;
        this.baseUrl = `http://${config.raksampHost}:${config.raksampPort}/`;
        this.activeSearches = new Map();
    }

    async searchPlayerInGroup(playerName, groupName, initialCommand = '/gmembers') {
        const searchId = `${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
        this.activeSearches.set(searchId, { status: 'searching' });
        
        try {
            await axios.post(
                this.baseUrl,
                `command=${encodeURIComponent(initialCommand)}`,
                { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
            );

            const initialDialog = await this.waitForDialog(
                d => d.title.toLowerCase().includes(groupName.toLowerCase()),
                5000,
                searchId
            );

            if (!initialDialog) throw new Error('Group member list dialog not received');
            return await this.searchInDialogPages(initialDialog, playerName, groupName, searchId);
        } finally {
            this.activeSearches.delete(searchId);
        }
    }

    async searchInDialogPages(initialDialog, playerName, groupName, searchId) {
        let currentDialog = initialDialog;
        let page = 0;
        const maxPages = 10;

        while (page < maxPages) {
            const result = this.findPlayerInDialog(currentDialog, playerName);
            if (result.found) {
                return {
                    dialog: currentDialog,
                    index: result.index,
                    playerNameFound: result.playerNameFound,
                    playerEntry: result.playerEntry,
                    role: result.role,
                    lastActive: result.lastActive
                };
            }
            if (!result.hasNext) break;
            currentDialog = await this.goToNextPage(currentDialog, groupName, searchId);
            if (!currentDialog) break;
            page++;
        }
        throw new Error('Player not found in group member list');
    }

    findPlayerInDialog(dialog, playerName) {
        const originalLines = dialog.info.split('\n').map(l => l.trim()).filter(Boolean);
        const cleanLines = originalLines.map(line => {
            return colorConverter.stripSampColors(line)
                .replace(/[{}]/g, '')
                .replace(/<[A-F0-9]{6}>/gi, '');
        });
        
        const hasNext = dialog.buttons?.[0]?.toLowerCase() === 'next';
        
        for (let i = 0; i < cleanLines.length; i++) {
            const cleanLine = cleanLines[i];
            const columns = cleanLine.split(/\t|\s{2,}/).filter(col => col.trim());
            
            if (columns.length >= 5) {
                const nameParts = [];
                let j = 1;
                while (j < columns.length - 3 && 
                       !['Leader', 'Co-Leader', 'Member'].includes(columns[j]) &&
                       !columns[j].match(/\d{1,2}\s\w+$/)) {
                    nameParts.push(columns[j]);
                    j++;
                }
                const name = nameParts.join(' ');
                const role = columns[columns.length - 2];
                const lastActive = columns[columns.length - 1];
                
                if (name.toLowerCase().includes(playerName.toLowerCase())) {
                    return {
                        found: true,
                        index: i,
                        playerNameFound: name,
                        playerEntry: originalLines[i],
                        role: role,
                        lastActive: lastActive,
                        hasNext
                    };
                }
            }
        }
        return { found: false, hasNext };
    }

    async goToNextPage(currentDialog, groupName, searchId) {
        const nextCmd = `sendDialogResponse|${currentDialog.dialogId}|0|0|Next`;
        const safeNextCmd = InputSanitizer.safeStringForRakSAMP(nextCmd);
        
        await axios.post(
            this.baseUrl,
            `botcommand=${encodeURIComponent(safeNextCmd)}`,
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        );

        return await this.waitForDialog(
            d => d.title.toLowerCase().includes(groupName.toLowerCase()),
            3000,
            searchId
        );
    }

    waitForDialog(filter, timeout, searchId) {
        return new Promise((resolve) => {
            const timer = setTimeout(() => {
                cleanup();
                resolve(null);
            }, timeout);

            const handler = (dialog) => {
                if (this.activeSearches.get(searchId)?.status !== 'searching') return;
                if (filter(dialog)) {
                    cleanup();
                    resolve(dialog);
                }
            };

            const cleanup = () => {
                clearTimeout(timer);
                this.client.off('dialog', handler);
            };

            this.client.on('dialog', handler);
        });
    }
}

module.exports = DialogPaginator;