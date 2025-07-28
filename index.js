// index.js
const express = require('express');
const fs      = require('fs');
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const config  = require('./config.json');

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
client.commands   = new Collection();
client.dialogState = new Map();

// Load features
require('./features/discord')(client, config);
require('./features/express')(client, config);

// Load handlers
require('./handlers/pmHandler')(client, config);
require('./handlers/groupChatHandler')(client, config);
require('./handlers/zoneWarHandler')(client, config);
require('./handlers/groupTagExtractor')(client, config);
require('./handlers/groupEventHandler')(client, config);
require('./handlers/loginHandler')(client); // Add login handler here

// Cooldown checker
const ZoneManager = require('./utils/ZoneManager');
setInterval(() => {
    const now = Date.now();
    const attackableZones = [];
    
    for (const [zoneId, cooldown] of ZoneManager.cooldowns) {
        if (now > cooldown && !ZoneManager.isAttackable(zoneId)) {
            attackableZones.push(zoneId);
        }
    }
    
    if (attackableZones.length > 0) {
        const channel = client.channels.cache.get(config.zoneChannelId);
        if (channel) {
            channel.send(
                `⚠️ Zones now attackable: ${attackableZones.join(', ')}\n` +
                `They will be vulnerable for 1 hour!`
            );
        }
    }
}, 5 * 60 * 1000); // Check every 5 minutes

client.once('ready', () => {
  console.log(`Discord logged in as ${client.user.tag}`);
});

client.login(config.token);