const express = require('express');
const fs = require('fs');
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const config = require('./config.json');

// Ensure logs directory exists
if (!fs.existsSync('./logs')) fs.mkdirSync('./logs');

// ---- Discord client ----
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Collections
client.commands = new Collection();
client.dialogState = new Map();

// Load features
require('./features/discord')(client, config);
require('./features/express')(client, config);

// Load handlers for main bot
require('./handlers/pmHandler')(client, config);
require('./handlers/groupChatHandler')(client, config);
require('./handlers/zoneWarHandler')(client, config);
require('./handlers/groupTagExtractor')(client, config);
require('./handlers/groupEventHandler')(client, config);
require('./handlers/loginHandler')(client); // Main bot login handler
require('./handlers/connectionHandler')(client);

// Load handlers for scanner bot
require('./handlers/scannerLoginHandler')(client); // Scanner bot login handler
require('./handlers/zoneScanner')(client); // Zone scanner

// Cooldown checker
const ZoneManager = require('./utils/ZoneManager');
let lastAttackableState = new Map();

function checkNewlyAttackableZones() {
    const now = Date.now();
    const attackableZones = [];
    
    for (const [zoneId] of ZoneManager.zones) {
        const isAttackableNow = ZoneManager.isAttackable(zoneId);
        const wasAttackableBefore = lastAttackableState.get(zoneId) || false;
        
        if (isAttackableNow && !wasAttackableBefore) {
            attackableZones.push(zoneId);
        }
        
        lastAttackableState.set(zoneId, isAttackableNow);
    }
    
    return attackableZones;
}

client.once('ready', () => {
    console.log(`Discord logged in as ${client.user.tag}`);
    
    // Initialize last attackable state
    for (const [zoneId] of ZoneManager.zones) {
        lastAttackableState.set(zoneId, ZoneManager.isAttackable(zoneId));
    }
    
    // Start zone scanner
    const zoneScanner = require('./handlers/zoneScanner')(client);
    zoneScanner.start();
    
    // Set up interval checks
    setInterval(() => {
        const newlyAttackable = checkNewlyAttackableZones();
        
        if (newlyAttackable.length > 0) {
            const channel = client.channels.cache.get(config.zoneChannelId);
            if (channel) {
                channel.send(
                    `⚠️ Zones now attackable: ${newlyAttackable.join(', ')}\n` +
                    `They will be vulnerable for exactly 1 hour!`
                );
            }
        }
    }, 60 * 1000); // Check every minute
});

client.login(config.token);