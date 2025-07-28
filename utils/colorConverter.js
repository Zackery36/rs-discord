const colorMap = {
  '\\{000000\\}': '\x1b[30m',  // Black
  '\\{FF0000\\}': '\x1b[91m',  // Bright Red
  '\\{00FF00\\}': '\x1b[92m',  // Bright Green
  '\\{0000FF\\}': '\x1b[94m',  // Bright Blue
  '\\{FFFF00\\}': '\x1b[93m',  // Bright Yellow
  '\\{FF00FF\\}': '\x1b[95m',  // Bright Magenta
  '\\{00FFFF\\}': '\x1b[96m',  // Bright Cyan
  '\\{FFFFFF\\}': '\x1b[97m',  // Bright White
  '\\{C0C0C0\\}': '\x1b[37m',  // Gray
  '\\{808080\\}': '\x1b[90m',  // Bright Black
  '\\{800000\\}': '\x1b[31m',  // Red
  '\\{008000\\}': '\x1b[32m',  // Green
  '\\{000080\\}': '\x1b[34m',  // Blue
  '\\{808000\\}': '\x1b[33m',  // Yellow
  '\\{800080\\}': '\x1b[35m',  // Magenta
  '\\{008080\\}': '\x1b[36m',  // Cyan
  '\\{414141\\}': '\x1b[90m',  // Dark Gray
  '\\{282828\\}': '\x1b[90m',  // Very Dark Gray
  '\\{4e4eff\\}': '\x1b[94m',  // Episcopus Blue
  '\\{6c61dd\\}': '\x1b[94m',  // Senator Purple
  '\\{11806a\\}': '\x1b[36m',  // Decemviri Teal
  '\\{a7a4d2\\}': '\x1b[95m',  // Centurion Lavender
  '\\{740d2e\\}': '\x1b[31m',  // Foederati Maroon
  '\\{ff9c9c\\}': '\x1b[95m',  // Concordia Pink
  '\\{25c059\\}': '\x1b[92m',  // Emeritus Green
};

module.exports = {
  stripSampColors(input) {
    if (!input) return '';
    return input.replace(/\{[A-F0-9]{6}\}/gi, '');
  },

  sampToDiscord(input) {
    if (!input) return '';
    let output = input;
    
    // Replace known colors (escape curly braces)
    for (const [sampCode, ansiCode] of Object.entries(colorMap)) {
      const regex = new RegExp(sampCode, 'gi');
      output = output.replace(regex, ansiCode);
    }
    
    // Replace unknown colors with luminance-based approximation
    output = output.replace(/\{([A-F0-9]{6})\}/gi, (match, hex) => {
      const r = parseInt(hex.substr(0, 2), 16);
      const g = parseInt(hex.substr(2, 2), 16);
      const b = parseInt(hex.substr(4, 2), 16);
      const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
      
      return luminance > 180 ? '\x1b[97m' :  // Bright white
             luminance > 100 ? '\x1b[37m' :   // Normal white
             '\x1b[90m';                      // Dark gray
    });

    return output;
  },

  cleanForDiscord(input) {
    if (!input) return '';
    return input
      .replace(/`/g, '´')      // Prevent code block breaking
      .replace(/\|/g, '│')     // Replace vertical bars
      .replace(/_{3,}/g, '―')  // Replace long underscores
      .substring(0, 2000);     // Truncate long messages
  }
};