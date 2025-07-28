const fs = require('fs');
const path = require('path');
const axios = require('axios');
const PlayerManager = require('../utils/PlayerManager');
const config = require('../config.json');

// Simple 100-character chunking (including spaces)
function chunkMessage(message, chunkSize = 100) {
    const chunks = [];
    for (let i = 0; i < message.length; i += chunkSize) {
        chunks.push(message.substring(i, i + chunkSize));
    }
    return chunks;
}

// Initialize commands
const igCommands = { admin: {}, normal: {}, fun: {} };
['admin', 'normal', 'fun'].forEach(category => {
    const commandPath = path.join(__dirname, `../igcmds/${category}`);
    if (fs.existsSync(commandPath)) {
        fs.readdirSync(commandPath).forEach(file => {
            if (file.endsWith('.js')) {
                const command = require(path.join(commandPath, file));
                igCommands[category][command.name] = command;
            }
        });
    }
});

module.exports = (client, config) => {
    const groupLogFile = path.join(__dirname, '../logs/gchat.log');
    if (!fs.existsSync(groupLogFile)) fs.writeFileSync(groupLogFile, '');
    
    client.on('samp_message', async (raw) => {
        if (raw.startsWith('(GROUP)') || raw.startsWith('GROUP:')) {
            // Log raw message
            fs.appendFileSync(groupLogFile, `${new Date().toISOString()} ${raw}\n`);
            
            // Parse group message
            const match = raw.match(/\(GROUP\)\s*\[(\d+)\]\s*([^:]+):\s*,(.+)$/);
            if (!match) return;
            
            const playerWithId = match[2].trim();
            const fullCommand = match[3].trim();
            const playerIdMatch = playerWithId.match(/\((\d+)\)$/);
            const playerId = playerIdMatch ? playerIdMatch[1] : null;
            const player = playerWithId.replace(/\(\d+\)$/, '').trim();
            
            if (player === config.botName) return;
            
            const [commandName, ...args] = fullCommand.split(' ');
            let response = `Unknown command: ${commandName}`;
            let commandExecuted = false;
            
            try {
                // Command handling logic remains the same
                if (igCommands.admin[commandName]) {
                    if (PlayerManager.hasRequiredRole(player, 'admin')) {
                        response = await igCommands.admin[commandName].execute(client, config, args, player, playerId);
                        commandExecuted = true;
                    } else {
                        response = "You need Leader role to use this command!";
                        commandExecuted = true;
                    }
                }
                
                if (!commandExecuted && igCommands.normal[commandName]) {
                    if (PlayerManager.hasRequiredRole(player, 'normal')) {
                        response = await igCommands.normal[commandName].execute(client, config, args, player, playerId);
                        commandExecuted = true;
                    } else {
                        response = "You need Co-Leader role to use this command!";
                        commandExecuted = true;
                    }
                }
                
                if (!commandExecuted && igCommands.fun[commandName]) {
                    response = await igCommands.fun[commandName].execute(client, config, args, player, playerId);
                    commandExecuted = true;
                }
            } catch (e) {
                console.error(`[Command] ${commandName} error:`, e);
                response = `Command error: ${e.message}`;
            }
            
            // Skip empty responses
            if (!response || response.toString().trim() === '') return;
            
            try {
                // Convert to string and split into 100-char chunks
                const responseText = response.toString();
                const chunks = chunkMessage(responseText);
                
                for (const chunk of chunks) {
                    // Use direct chat command format
                    const payload = `message=!${encodeURIComponent(chunk)}`;
                    
                    let retries = 3;
                    while (retries > 0) {
                        try {
                            await axios.post(
                                `http://${config.raksampHost}:${config.raksampPort}/`,
                                payload,
                                {
                                    headers: { 
                                        'Content-Type': 'application/x-www-form-urlencoded',
                                        'Content-Length': Buffer.byteLength(payload)
                                    },
                                    timeout: 3000
                                }
                            );
                            break;
                        } catch (e) {
                            retries--;
                            if (retries === 0) {
                                console.error(
                                    '[Response] Send failure:',
                                    `Status: ${e.response?.status || 'No response'}`,
                                    `Payload: ${payload.substring(0, 50)}...`
                                );
                            }
                            await new Promise(r => setTimeout(r, 500));
                        }
                    }
                    
                    // Add delay between chunks
                    await new Promise(r => setTimeout(r, 300));
                }
            } catch (e) {
                console.error('[Response] Critical error:', e.message);
            }
        }
    });
};