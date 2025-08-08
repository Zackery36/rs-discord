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

// Load handlers
require('./handlers/pmHandler')(client, config);
require('./handlers/groupChatHandler')(client, config);
require('./handlers/zoneWarHandler')(client, config);
require('./handlers/groupTagExtractor')(client, config);
require('./handlers/groupEventHandler')(client, config);
require('./handlers/loginHandler')(client);
require('./handlers/connectionHandler')(client);

// Cooldown checker
const ZoneManager = require('./utils/ZoneManager');
let lastAttackableState = new Map(); // Track previous attackable state

// Function to check for newly attackable zones
function checkNewlyAttackableZones() {
  const now = Date.now();
  const attackableZones = [];
  
  // Check all zones for attackable status
  for (const [zoneId] of ZoneManager.zones) {
    const isAttackableNow = ZoneManager.isAttackable(zoneId);
    const wasAttackableBefore = lastAttackableState.get(zoneId) || false;
    
    if (isAttackableNow && !wasAttackableBefore) {
      attackableZones.push(zoneId);
    }
    
    // Update last known state
    lastAttackableState.set(zoneId, isAttackableNow);
  }
  
  return attackableZones;
}

// Set up interval for cooldown checking
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
}, 60 * 1000); // Check every minute for precision

client.once('ready', () => {
  console.log(`Discord logged in as ${client.user.tag}`);
  
  // Initialize last attackable state
  for (const [zoneId] of ZoneManager.zones) {
    lastAttackableState.set(zoneId, ZoneManager.isAttackable(zoneId));
  }
});

client.login(config.token);