class InputSanitizer {
  static sanitizeForRakSAMP(input) {
    if (!input || typeof input !== 'string') return '';
    
    let sanitized = input;
    
    // Normalize whitespace (replace control chars with space)
    sanitized = sanitized
      .replace(/[\n\r\t]/g, ' ')  // Replace control chars with space
      .replace(/\s+/g, ' ')       // Normalize multiple spaces
      .trim();
    
    // Only neutralize truly dangerous characters
    sanitized = sanitized
      .replace(/%/g, 'percent')   // Replace % to prevent format specifiers
      .replace(/\\/g, '/');       // Replace backslashes
    
    // Limit length
    if (sanitized.length > 100) {
      sanitized = sanitized.substring(0, 100).trim();
    }
    
    return sanitized;
  }
  
  static isValidRakSAMPInput(input) {
    if (!input || input.length === 0 || input.length > 100) return false;
    
    // Critical security checks only
    const dangerousPatterns = [
      /%[a-fA-F0-9]{2}/,  // URL encoded hex
      /\\[nrt]/,           // Escaped characters
      /%/                  // Any % signs
    ];
    
    return !dangerousPatterns.some(pattern => pattern.test(input));
  }
  
  static safeStringForRakSAMP(input) {
    const sanitized = this.sanitizeForRakSAMP(input);
    return this.isValidRakSAMPInput(sanitized) ? sanitized : '';
  }
}

module.exports = InputSanitizer;