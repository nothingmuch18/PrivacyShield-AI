/**
 * PrivacyShield AI — Secret Scanner
 *
 * Detects secrets, credentials, and authentication tokens in both
 * screenshot text (via OCR) and DOM content. Operates as part of
 * the local detection pipeline.
 *
 * Architecture:
 *   SecretScanner
 *   ├── PatternScanner  — regex-based API key / token detection
 *   ├── EntropyScanner  — Shannon entropy for high-randomness strings
 *   └── ContextScanner  — keyword context (e.g., "Authorization: Bearer ...")
 */

// ═══════════════════════════════════════════════════════════════
//  SECRET DETECTION RESULT
// ═══════════════════════════════════════════════════════════════

export interface SecretDetection {
  type: string;
  confidence: number;
  source: 'pattern' | 'entropy' | 'context';
  match: string;       // Partially redacted for safe logging
  fullLength: number;  // Length of the full match (for metrics)
  context?: string;    // Surrounding keyword context (redacted)
}

// ═══════════════════════════════════════════════════════════════
//  PATTERN DEFINITIONS
// ═══════════════════════════════════════════════════════════════

const SECRET_PATTERNS: Array<{ type: string; pattern: RegExp; confidence: number }> = [
  // Cloud providers
  { type: 'AWS_ACCESS_KEY', pattern: /\bAKIA[A-Z0-9]{16}\b/g, confidence: 0.95 },
  { type: 'AWS_SECRET_KEY', pattern: /\b[A-Za-z0-9/+=]{40}\b/g, confidence: 0.5 }, // Needs context
  { type: 'GOOGLE_API_KEY', pattern: /\bAIza[A-Za-z0-9_-]{35}\b/g, confidence: 0.95 },
  { type: 'GOOGLE_OAUTH', pattern: /\b\d+-[a-z0-9_]{32}\.apps\.googleusercontent\.com\b/g, confidence: 0.95 },

  // Version control
  { type: 'GITHUB_TOKEN', pattern: /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,}\b/g, confidence: 0.98 },
  { type: 'GITLAB_TOKEN', pattern: /\bglpat-[A-Za-z0-9_-]{20,}\b/g, confidence: 0.98 },

  // AI/ML API keys
  { type: 'GROQ_API_KEY', pattern: /\bgsk_[A-Za-z0-9]{48,}\b/g, confidence: 0.98 },
  { type: 'OPENAI_API_KEY', pattern: /\bsk-[A-Za-z0-9]{32,}\b/g, confidence: 0.90 },
  { type: 'ANTHROPIC_KEY', pattern: /\bsk-ant-[A-Za-z0-9_-]{32,}\b/g, confidence: 0.95 },

  // Communication
  { type: 'SLACK_TOKEN', pattern: /\bxox[bpas]-[A-Za-z0-9-]{10,}\b/g, confidence: 0.95 },
  { type: 'SENDGRID_KEY', pattern: /\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\b/g, confidence: 0.98 },

  // Auth tokens
  { type: 'JWT_TOKEN', pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, confidence: 0.90 },
  { type: 'BEARER_TOKEN', pattern: /Bearer\s+[A-Za-z0-9_.-]{20,}/gi, confidence: 0.85 },

  // Cryptographic
  { type: 'RSA_PRIVATE_KEY', pattern: /-----BEGIN RSA PRIVATE KEY-----/g, confidence: 0.99 },
  { type: 'EC_PRIVATE_KEY', pattern: /-----BEGIN EC PRIVATE KEY-----/g, confidence: 0.99 },
  { type: 'PRIVATE_KEY', pattern: /-----BEGIN PRIVATE KEY-----/g, confidence: 0.99 },

  // Database
  { type: 'MONGODB_URI', pattern: /mongodb(\+srv)?:\/\/[^\s"']+/gi, confidence: 0.90 },
  { type: 'POSTGRES_URI', pattern: /postgres(ql)?:\/\/[^\s"']+/gi, confidence: 0.90 },
  { type: 'REDIS_URI', pattern: /redis:\/\/[^\s"']+/gi, confidence: 0.90 },
];

/** Context keywords that boost confidence when found near a potential secret */
const SECRET_CONTEXT_KEYWORDS = [
  'api_key', 'api-key', 'apikey', 'apiKey',
  'secret', 'secret_key', 'secretKey',
  'password', 'passwd', 'pass',
  'token', 'access_token', 'accessToken',
  'authorization', 'auth',
  'private_key', 'privateKey',
  'credential', 'credentials',
  'connection_string', 'connectionString',
  'database_url', 'databaseUrl',
];

// ═══════════════════════════════════════════════════════════════
//  SECRET SCANNER
// ═══════════════════════════════════════════════════════════════

export class SecretScanner {
  /**
   * Scan text for secrets and credentials.
   */
  scan(text: string): SecretDetection[] {
    if (!text || text.length < 10) return [];

    const detections: SecretDetection[] = [];

    // 1. Pattern scanning
    detections.push(...this.patternScan(text));

    // 2. Entropy scanning for unrecognized high-randomness strings
    detections.push(...this.entropyScan(text));

    // 3. Context scanning (keywords near suspicious values)
    detections.push(...this.contextScan(text));

    // Deduplicate by match position
    return this.deduplicateDetections(detections);
  }

  /**
   * Pattern-based secret detection.
   */
  private patternScan(text: string): SecretDetection[] {
    const detections: SecretDetection[] = [];

    for (const { type, pattern, confidence } of SECRET_PATTERNS) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = pattern.exec(text)) !== null) {
        detections.push({
          type,
          confidence,
          source: 'pattern',
          match: this.redactForLogging(match[0]),
          fullLength: match[0].length,
        });
      }
    }

    return detections;
  }

  /**
   * Entropy-based detection for high-randomness strings that might be secrets.
   */
  private entropyScan(text: string): SecretDetection[] {
    const detections: SecretDetection[] = [];

    // Find strings that look like tokens (long, alphanumeric, no spaces)
    const tokenPattern = /\b[A-Za-z0-9_-]{32,}\b/g;
    let match: RegExpExecArray | null;

    while ((match = tokenPattern.exec(text)) !== null) {
      const candidate = match[0];
      const entropy = this.calculateShannonEntropy(candidate);

      // High entropy (>4.0) suggests a random/generated string
      if (entropy > 4.0) {
        // Check context for confirmation
        const contextStart = Math.max(0, match.index - 50);
        const contextEnd = Math.min(text.length, match.index + candidate.length + 50);
        const context = text.substring(contextStart, contextEnd).toLowerCase();

        const hasSecretContext = SECRET_CONTEXT_KEYWORDS.some(kw => context.includes(kw));

        if (hasSecretContext) {
          detections.push({
            type: 'HIGH_ENTROPY_SECRET',
            confidence: Math.min(0.85, entropy / 6),
            source: 'entropy',
            match: this.redactForLogging(candidate),
            fullLength: candidate.length,
            context: 'Near secret-related keyword',
          });
        }
      }
    }

    return detections;
  }

  /**
   * Context-based detection for key=value patterns near sensitive keywords.
   */
  private contextScan(text: string): SecretDetection[] {
    const detections: SecretDetection[] = [];

    for (const keyword of SECRET_CONTEXT_KEYWORDS) {
      // Look for patterns like: keyword = "value" or keyword: "value"
      const pattern = new RegExp(
        `${keyword}\\s*[=:]\\s*["']?([A-Za-z0-9_/+=.-]{16,})["']?`,
        'gi'
      );

      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        const value = match[1];
        if (value && value.length >= 16) {
          detections.push({
            type: 'CONTEXTUAL_SECRET',
            confidence: 0.75,
            source: 'context',
            match: this.redactForLogging(value),
            fullLength: value.length,
            context: `Found near "${keyword}"`,
          });
        }
      }
    }

    return detections;
  }

  /**
   * Calculate Shannon entropy of a string.
   * Higher entropy indicates more randomness (potential secret).
   */
  private calculateShannonEntropy(str: string): number {
    const freq = new Map<string, number>();
    for (const char of str) {
      freq.set(char, (freq.get(char) || 0) + 1);
    }

    let entropy = 0;
    const len = str.length;
    for (const count of freq.values()) {
      const p = count / len;
      if (p > 0) {
        entropy -= p * Math.log2(p);
      }
    }

    return entropy;
  }

  /**
   * Redact a secret value for safe logging.
   */
  private redactForLogging(value: string): string {
    if (value.length <= 8) return '***';
    return value.slice(0, 4) + '*'.repeat(Math.min(value.length - 8, 20)) + value.slice(-4);
  }

  /**
   * Remove duplicate detections (same value detected by multiple methods).
   */
  private deduplicateDetections(detections: SecretDetection[]): SecretDetection[] {
    const seen = new Set<string>();
    return detections.filter(d => {
      const key = `${d.type}:${d.match}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}
