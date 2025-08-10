const express = require('express');
const fs = require('fs');
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const config = require('./config.json');
const ZoneScanner = require('./handlers/zoneScanner');
const ZoneManager = require('./utils/ZoneManager');

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

client.once('ready', () => {
    console.log(`Discord logged in as ${client.user.tag}`);
    
    // Initialize scanner
    const zoneScanner = new ZoneScanner(client);
    zoneScanner.start();
    
    // Start attackable zone refresh
    setInterval(() => {
        ZoneManager.refreshAttackableStatus();
    }, 10000); // Every 10 seconds
});

client.login(config.token);