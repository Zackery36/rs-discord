const { SlashCommandBuilder } = require('discord.js');
const axios = require('axios');
const InputSanitizer = require('../../utils/inputSanitizer');

// Textdraw IDs for PM state
const PM_TEXTDRAW_ID = 2051;
const PM_ON_TEXT = "~g~Private Messages ~w~ON";
const PM_OFF_TEXT = "~g~Player disabled PMs";

// Active PM sessions: { channelId: { playerId, timeout, handler, weEnabledPMs } }
const pmSessions = new Map();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('pm')
        .setDescription('Send a private message in SA:MP')
        .addIntegerOption(opt =>
            opt.setName('id')
                .setDescription('Target player ID')
                .setRequired(true))
        .addStringOption(opt =>
            opt.setName('message')
                .setDescription('Message to send')
                .setRequired(true)),

    async execute(interaction, config) {
        // Handle interaction properly
        if (!interaction.deferred && !interaction.replied) {
            await interaction.deferReply();
        }

        const playerId = interaction.options.getInteger('id');
        const rawMessage = interaction.options.getString('message');
        const channelId = interaction.channel.id;
        const client = interaction.client;

        // Sanitize the message
        const sanitizedMsg = InputSanitizer.sanitizeForRakSAMP(rawMessage);
        if (!InputSanitizer.isValidRakSAMPInput(sanitizedMsg)) {
            return interaction.editReply('❌ Message contains dangerous characters!');
        }

        try {
            // Check if we have an active session
            const hasActiveSession = pmSessions.has(channelId);
            
            // Only check PM state if we don't have an active session
            let weEnabledPMs = false;
            if (!hasActiveSession) {
                // Send /pms to toggle PM state
                await axios.post(
                    `http://${config.raksampHost}:${config.raksampPort}/`,
                    `command=${encodeURIComponent('/pms')}`,
                    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
                );
                
                // Wait for PM state textdraw
                const pmState = await new Promise(resolve => {
                    const handler = (td) => {
                        if (td.textdrawId === PM_TEXTDRAW_ID) {
                            client.off('textdraw', handler);
                            resolve(td.text);
                        }
                    };
                    client.on('textdraw', handler);
                    
                    // Timeout after 3 seconds
                    setTimeout(() => {
                        client.off('textdraw', handler);
                        resolve(null);
                    }, 3000);
                });

                if (pmState === PM_OFF_TEXT) {
                    return interaction.editReply('❌ Player has disabled PMs. Unable to send message.');
                }
                
                // If we got the ON textdraw, mark that we enabled PMs
                if (pmState === PM_ON_TEXT) {
                    weEnabledPMs = true;
                }
            }

            // Send the PM
            const cmd = `/pm ${playerId} ${sanitizedMsg}`;
            await axios.post(
                `http://${config.raksampHost}:${config.raksampPort}/`,
                `command=${encodeURIComponent(cmd)}`,
                { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
            );

            // Start new session or extend existing one
            if (!hasActiveSession) {
                // Set up PM listener
                const pmHandler = (pm) => {
                    if (pm.playerId === playerId) {
                        const adminStatus = pm.isAdmin ? 'Admin' : 'Not Admin';
                        interaction.channel.send(
                            `📩 **PM from ${pm.playerName} (ID:${pm.playerId}) (${adminStatus}):** ${pm.content}`
                        );
                        
                        // Reset timeout
                        if (pmSessions.has(channelId)) {
                            clearTimeout(pmSessions.get(channelId).timeout);
                            pmSessions.get(channelId).timeout = setTimeout(endSession, 30000);
                        }
                    }
                };
                
                // Function to end session properly
                const endSession = () => {
                    if (pmSessions.has(channelId)) {
                        const session = pmSessions.get(channelId);
                        clearTimeout(session.timeout);
                        client.off('samp_pm', session.handler);
                        
                        // Disable PMs if we enabled them
                        if (session.weEnabledPMs) {
                            axios.post(
                                `http://${config.raksampHost}:${config.raksampPort}/`,
                                `command=${encodeURIComponent('/pms')}`,
                                { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
                            ).catch(console.error);
                        }
                        
                        pmSessions.delete(channelId);
                        interaction.channel.send('⏱️ PM session ended after 30 seconds of inactivity');
                    }
                };
                
                // Store session
                pmSessions.set(channelId, {
                    playerId,
                    timeout: setTimeout(endSession, 30000),
                    handler: pmHandler,
                    weEnabledPMs
                });
                
                client.on('samp_pm', pmHandler);
            }

            await interaction.editReply(`✅ PM sent to player ${playerId}\n📩 You'll receive replies here for 30 seconds`);
            
        } catch (e) {
            console.error('[PM] Error:', e.message);
            await interaction.editReply('❌ Failed to send PM. Please try again.');
        }
    }
};