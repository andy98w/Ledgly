import { Injectable } from '@nestjs/common';

export interface ParsedPayment {
  source: 'venmo' | 'zelle' | 'cashapp' | 'paypal' | 'unknown';
  direction: 'incoming' | 'outgoing'; // incoming = someone paid you, outgoing = you paid someone
  amount: number | null; // in cents
  payerName: string | null; // For incoming: who paid you. For outgoing: who you paid
  payerEmail: string | null;
  memo: string | null;
  transactionId: string | null;
}

@Injectable()
export class EmailParserService {
  parseEmail(
    from: string,
    subject: string,
    body: string,
    snippet?: string,
  ): ParsedPayment | null {
    // Try each parser in order
    const parsers = [
      this.parseVenmo.bind(this),
      this.parseZelle.bind(this),
      this.parseCashApp.bind(this),
      this.parsePaypal.bind(this),
    ];

    for (const parser of parsers) {
      const result = parser(from, subject, body);
      if (result) {
        // If no memo found in body, try extracting from snippet
        if (!result.memo && snippet) {
          result.memo = this.extractMemo(snippet);
        }
        return result;
      }
    }

    return null;
  }

  private parseVenmo(
    from: string,
    subject: string,
    body: string,
  ): ParsedPayment | null {
    // Venmo sends from venmo@venmo.com
    if (!from.toLowerCase().includes('venmo')) {
      return null;
    }

    // Check for OUTGOING payments first (you paid someone)
    const outgoingPatterns = [
      /you paid/i,
      /you sent/i,
      /payment to/i,
      /you completed/i,
    ];
    const isOutgoing = outgoingPatterns.some(p => p.test(subject));

    // Incoming payment patterns
    const incomingPatterns = [
      /paid you/i,
      /sent you/i,
      /you received/i,
      /completed your request/i,
      /completed your charge/i,
      /paid your request/i,
      /paid your charge/i,
      /request.*was paid/i,
      /request.*completed/i,
      /charge.*was paid/i,
      /payment received/i,
    ];
    const isIncoming = incomingPatterns.some(p => p.test(subject));

    if (!isOutgoing && !isIncoming) {
      return null;
    }

    let recipientName: string | null = null;
    let amount: number | null = null;
    const direction: 'incoming' | 'outgoing' = isOutgoing ? 'outgoing' : 'incoming';

    if (isOutgoing) {
      // Outgoing payment patterns
      // "You paid John Doe $50.00"
      // "You sent $50.00 to John Doe"
      // "You completed John Doe's request for $50.00"
      const outgoingSubjectPatterns = [
        /you paid (.+?) \$?([\d,]+\.?\d*)/i,
        /you sent \$?([\d,]+\.?\d*) to (.+)/i,
        /you completed (.+?)(?:'s)? (?:request|charge)(?: for)? \$?([\d,]+\.?\d*)/i,
        /payment to (.+?)[:\s]+\$?([\d,]+\.?\d*)/i,
      ];

      for (const pattern of outgoingSubjectPatterns) {
        const match = subject.match(pattern);
        if (match) {
          if (pattern.source.includes('sent \\$')) {
            // "You sent $X to Name" - amount first, name second
            amount = Math.round(parseFloat(match[1].replace(/,/g, '')) * 100);
            recipientName = match[2].trim();
          } else {
            // Name first, amount second
            recipientName = match[1].trim();
            amount = Math.round(parseFloat(match[2].replace(/,/g, '')) * 100);
          }
          break;
        }
      }
    } else {
      // Incoming payment patterns - order matters, more specific patterns first
      // "John Doe paid you $50.00"
      // "John Doe completed your request for $50.00"
      // "You received $50.00 from John Doe"
      // "Your $50.00 request to John Doe was paid"
      // "John Doe paid your $50.00 request"
      const incomingSubjectPatterns = [
        /^(.+?) paid you \$?([\d,]+\.?\d*)/i,
        /^(.+?) paid your \$?([\d,]+\.?\d*) (?:request|charge)/i,
        /^(.+?) completed your (?:charge|request)(?: for)? \$?([\d,]+\.?\d*)/i,
        /your \$?([\d,]+\.?\d*) (?:request|charge) (?:to|from) (.+?) was (?:paid|completed)/i,
        /received \$?([\d,]+\.?\d*) from (.+)/i,
        /^(.+?) sent you \$?([\d,]+\.?\d*)/i,
      ];

      for (const pattern of incomingSubjectPatterns) {
        const match = subject.match(pattern);
        if (match) {
          // Check if amount comes first (patterns with "your $X request" or "received $X")
          if (pattern.source.startsWith('received') || pattern.source.startsWith('your')) {
            // Amount is in group 1, name in group 2
            amount = Math.round(parseFloat(match[1].replace(/,/g, '')) * 100);
            recipientName = match[2].trim();
          } else {
            // Name is in group 1, amount in group 2
            recipientName = match[1].trim();
            amount = Math.round(parseFloat(match[2].replace(/,/g, '')) * 100);
          }
          break;
        }
      }
    }

    // Try parsing from body if subject didn't match
    if (!amount) {
      const bodyAmountMatch = body.match(/\$\s*([\d,]+\.?\d*)/);
      if (bodyAmountMatch) {
        amount = Math.round(parseFloat(bodyAmountMatch[1].replace(/,/g, '')) * 100);
      }
    }

    if (!recipientName) {
      // Try to find name in body - look for common patterns
      const nameMatch = body.match(/(?:from|paid by|sender|to|recipient)[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i);
      if (nameMatch) {
        recipientName = nameMatch[1].trim();
      }
    }

    if (!amount) {
      return null; // Can't proceed without amount
    }

    // Try to extract memo from body using shared method
    const memo = this.extractMemo(body);

    // Try to extract transaction ID
    let transactionId: string | null = null;
    const txIdMatch = body.match(/(?:Transaction ID|Payment ID|ID)[:\s]*(\d+)/i);
    if (txIdMatch) {
      transactionId = txIdMatch[1];
    }

    return {
      source: 'venmo',
      direction,
      amount,
      payerName: recipientName,
      payerEmail: null,
      memo,
      transactionId,
    };
  }

  private parseZelle(
    from: string,
    subject: string,
    body: string,
  ): ParsedPayment | null {
    const isZelle =
      from.toLowerCase().includes('zelle') ||
      subject.toLowerCase().includes('zelle') ||
      body.toLowerCase().includes('zelle');

    if (!isZelle) {
      return null;
    }

    // Check for outgoing payments
    const outgoingPatterns = [/you sent/i, /you paid/i, /payment to/i];
    const isOutgoing = outgoingPatterns.some(p => p.test(subject));

    // Outgoing: "You sent $X to Name"
    if (isOutgoing) {
      let match = subject.match(/you sent \$?([\d,]+\.?\d*) to (.+)/i);
      if (match) {
        return {
          source: 'zelle',
          direction: 'outgoing',
          amount: Math.round(parseFloat(match[1].replace(/,/g, '')) * 100),
          payerName: match[2].trim(),
          payerEmail: null,
          memo: this.extractMemo(body),
          transactionId: this.extractTransactionId(body),
        };
      }
    }

    // Incoming: "You received $X from Name"
    let match = subject.match(/received \$?([\d,]+\.?\d*) from (.+)/i);
    if (match) {
      return {
        source: 'zelle',
        direction: 'incoming',
        amount: Math.round(parseFloat(match[1].replace(/,/g, '')) * 100),
        payerName: match[2].trim(),
        payerEmail: null,
        memo: this.extractMemo(body),
        transactionId: this.extractTransactionId(body),
      };
    }

    // Incoming: "Name sent you $X"
    match = subject.match(/(.+?) sent you \$?([\d,]+\.?\d*)/i);
    if (match) {
      return {
        source: 'zelle',
        direction: 'incoming',
        amount: Math.round(parseFloat(match[2].replace(/,/g, '')) * 100),
        payerName: match[1].trim(),
        payerEmail: null,
        memo: this.extractMemo(body),
        transactionId: this.extractTransactionId(body),
      };
    }

    // Generic Zelle notification - try to parse from body
    const amountMatch = body.match(/\$?([\d,]+\.?\d*)\s*(?:has been|was)?\s*(?:deposited|received|sent)/i);
    const nameMatch = body.match(/from\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/);

    if (amountMatch) {
      return {
        source: 'zelle',
        direction: 'incoming', // Assume incoming for generic
        amount: Math.round(parseFloat(amountMatch[1].replace(/,/g, '')) * 100),
        payerName: nameMatch ? nameMatch[1].trim() : null,
        payerEmail: null,
        memo: this.extractMemo(body),
        transactionId: this.extractTransactionId(body),
      };
    }

    return null;
  }

  private parseCashApp(
    from: string,
    subject: string,
    body: string,
  ): ParsedPayment | null {
    // Cash App sends from various addresses
    if (
      !from.toLowerCase().includes('cash.app') &&
      !from.toLowerCase().includes('square.com') &&
      !subject.toLowerCase().includes('cash app')
    ) {
      return null;
    }

    // Check for OUTGOING payments first (you paid someone)
    const outgoingPatterns = [
      /you paid/i,
      /you sent/i,
      /payment to/i,
    ];
    const isOutgoing = outgoingPatterns.some(p => p.test(subject));

    if (isOutgoing) {
      // "You sent $50 to John Doe"
      // "You paid John Doe $50"
      const sentMatch = subject.match(/you sent \$?([\d,]+\.?\d*) to (.+)/i);
      if (sentMatch) {
        return {
          source: 'cashapp',
          direction: 'outgoing',
          amount: Math.round(parseFloat(sentMatch[1].replace(/,/g, '')) * 100),
          payerName: sentMatch[2].trim().replace(/^\$/, ''),
          payerEmail: null,
          memo: this.extractMemo(body),
          transactionId: this.extractTransactionId(body),
        };
      }

      const paidMatch = subject.match(/you paid (.+?) \$?([\d,]+\.?\d*)/i);
      if (paidMatch) {
        return {
          source: 'cashapp',
          direction: 'outgoing',
          amount: Math.round(parseFloat(paidMatch[2].replace(/,/g, '')) * 100),
          payerName: paidMatch[1].trim().replace(/^\$/, ''),
          payerEmail: null,
          memo: this.extractMemo(body),
          transactionId: this.extractTransactionId(body),
        };
      }
    }

    // Incoming patterns
    // Pattern: "John Doe sent you $50"
    // Pattern: "You received $50 from $johndoe"
    const paidMatch = subject.match(/(.+?) sent you \$?([\d,]+\.?\d*)/i);
    if (paidMatch) {
      const payerName = paidMatch[1].trim();
      const amount = Math.round(parseFloat(paidMatch[2].replace(/,/g, '')) * 100);
      return {
        source: 'cashapp',
        direction: 'incoming',
        amount,
        payerName,
        payerEmail: null,
        memo: this.extractMemo(body),
        transactionId: this.extractTransactionId(body),
      };
    }

    const receivedMatch = subject.match(/received \$?([\d,]+\.?\d*) from (.+)/i);
    if (receivedMatch) {
      const amount = Math.round(parseFloat(receivedMatch[1].replace(/,/g, '')) * 100);
      const payerName = receivedMatch[2].trim().replace(/^\$/, ''); // Remove $ prefix from cashtag
      return {
        source: 'cashapp',
        direction: 'incoming',
        amount,
        payerName,
        payerEmail: null,
        memo: this.extractMemo(body),
        transactionId: this.extractTransactionId(body),
      };
    }

    return null;
  }

  private parsePaypal(
    from: string,
    subject: string,
    body: string,
  ): ParsedPayment | null {
    if (!from.toLowerCase().includes('paypal.com')) {
      return null;
    }

    // Check for OUTGOING payments first (you paid someone)
    const outgoingPatterns = [
      /you sent/i,
      /you paid/i,
      /payment to/i,
      /you've sent/i,
    ];
    const isOutgoing = outgoingPatterns.some(p => p.test(subject));

    if (isOutgoing) {
      // "You sent $50 to John Doe"
      // "You paid John Doe $50"
      const sentMatch = subject.match(/you (?:sent|paid|'ve sent) \$?([\d,]+\.?\d*) to (.+)/i);
      if (sentMatch) {
        return {
          source: 'paypal',
          direction: 'outgoing',
          amount: Math.round(parseFloat(sentMatch[1].replace(/,/g, '')) * 100),
          payerName: sentMatch[2].trim(),
          payerEmail: null,
          memo: this.extractMemo(body),
          transactionId: this.extractTransactionId(body),
        };
      }

      const paidMatch = subject.match(/you (?:sent|paid) (.+?) \$?([\d,]+\.?\d*)/i);
      if (paidMatch) {
        return {
          source: 'paypal',
          direction: 'outgoing',
          amount: Math.round(parseFloat(paidMatch[2].replace(/,/g, '')) * 100),
          payerName: paidMatch[1].trim(),
          payerEmail: null,
          memo: this.extractMemo(body),
          transactionId: this.extractTransactionId(body),
        };
      }
    }

    // Incoming patterns
    // Pattern: "You received a payment of $50.00 from John Doe"
    // Pattern: "John Doe sent you $50.00"
    const receivedMatch = subject.match(
      /received (?:a payment of )?\$?([\d,]+\.?\d*) from (.+)/i,
    );
    if (receivedMatch) {
      const amount = Math.round(parseFloat(receivedMatch[1].replace(/,/g, '')) * 100);
      const payerName = receivedMatch[2].trim();
      return {
        source: 'paypal',
        direction: 'incoming',
        amount,
        payerName,
        payerEmail: null,
        memo: this.extractMemo(body),
        transactionId: this.extractTransactionId(body),
      };
    }

    const sentMatch = subject.match(/(.+?) sent you \$?([\d,]+\.?\d*)/i);
    if (sentMatch) {
      const payerName = sentMatch[1].trim();
      const amount = Math.round(parseFloat(sentMatch[2].replace(/,/g, '')) * 100);
      return {
        source: 'paypal',
        direction: 'incoming',
        amount,
        payerName,
        payerEmail: null,
        memo: this.extractMemo(body),
        transactionId: this.extractTransactionId(body),
      };
    }

    return null;
  }

  private extractMemo(body: string): string | null {
    // Clean up the body first - remove excessive whitespace
    const cleanBody = body.replace(/\s+/g, ' ').replace(/\n+/g, '\n');

    // Venmo-specific patterns - Venmo puts the note in specific formats
    const venmoPatterns = [
      // Venmo snippet format: "paid you $ 60 . 00 gym See transaction"
      // The memo appears between the spaced-out amount and "See transaction"
      /\$ [\d,]+ \. \d{2} (.+?) See transaction/i,
      // Also try without spaced amount
      /\$[\d,]+\.?\d* (.+?) See transaction/i,
      // Venmo HTML format: note often in a span or div after "Note:" or before emojis
      /[""]([^""]{3,80})[""](?:\s*[-–—]|\s*$)/,
      // Venmo puts notes in quotes sometimes
      /'([^']{3,80})'(?:\s*[-–—]|\s*$)/,
      // After the word "for" in payment context (e.g., "paid you $50 for pizza")
      /paid\s+(?:you\s+)?\$[\d,.]+\s+for\s+([^.!?\n]{3,60})/i,
      /\$[\d,.]+\s+for\s+([^.!?\n]{3,60})/i,
      // Note label pattern
      /(?:^|\s)note[:\s]+([^<\n]{3,80}?)(?:\s*[-–—|]|\s*$)/im,
      // Message label pattern
      /(?:^|\s)(?:message|memo)[:\s]+([^<\n]{3,80}?)(?:\s*[-–—|]|\s*$)/im,
      // Look for standalone emoji followed by meaningful text (Venmo style)
      /(?:^|\s)([\u{1F300}-\u{1F9FF}][\u{1F300}-\u{1F9FF}\s]*[A-Za-z][^<\n]{2,50})/u,
      // Text in smart quotes
      /[""]([A-Za-z][^""]{2,60})[""](?!\s*@)/,
      // Simple quoted text
      /"([A-Za-z][^"]{2,60})"(?!\s*@)/,
    ];

    // Try each pattern
    for (const pattern of venmoPatterns) {
      const match = cleanBody.match(pattern);
      if (match && match[1]) {
        const memo = match[1].trim();
        // Validate the memo
        if (memo.length >= 2 && memo.length < 100 && !this.isInvalidMemo(memo)) {
          return memo;
        }
      }
    }

    // Fallback: Look for Zelle "Message:" format
    const zelleMatch = cleanBody.match(/Message:\s*([^\n]{3,80})/i);
    if (zelleMatch && zelleMatch[1] && !this.isInvalidMemo(zelleMatch[1].trim())) {
      return zelleMatch[1].trim();
    }

    // Fallback: CashApp and PayPal sometimes put note after "For:"
    const forMatch = cleanBody.match(/\bFor:\s*([^\n]{3,80})/i);
    if (forMatch && forMatch[1] && !this.isInvalidMemo(forMatch[1].trim())) {
      return forMatch[1].trim();
    }

    return null;
  }

  private isInvalidMemo(memo: string): boolean {
    if (!memo || memo.length < 2) return true;

    // Skip HTML/code artifacts and CSS class names
    const invalidPatterns = [
      '//W3C', 'DOCTYPE', 'xmlns', '<', '>', '-//',
      'text-', '-text', 'color', 'padding', 'margin',
      'font-', 'class', 'style', 'width', 'height',
      'border', 'display', 'align', 'background'
    ];

    const lowerMemo = memo.toLowerCase();
    for (const pattern of invalidPatterns) {
      if (lowerMemo.includes(pattern.toLowerCase())) return true;
    }

    // Skip if starts with http
    if (memo.startsWith('http')) return true;

    // Skip CSS class patterns like "secondary-text"
    if (/^[a-z]+-[a-z]+(-[a-z]+)*$/i.test(memo)) return true;

    // Skip CSS values like "16px"
    if (/^\d+px$/i.test(memo)) return true;

    // Skip if it looks like an email address
    if (/@/.test(memo) && /\.\w{2,}$/.test(memo)) return true;

    // Skip common non-memo content - email UI text that's not actual memo
    const skipPhrases = [
      'view in browser', 'unsubscribe', 'privacy policy',
      'terms of service', 'copyright', 'all rights reserved',
      'more information', 'view more', 'learn more', 'click here',
      'open app', 'view in app', 'download', 'get the app',
      'view transaction', 'view payment', 'view details',
      'manage settings', 'help center', 'customer service',
      'contact us', 'follow us', 'connect with',
      'this email', 'this message', 'do not reply',
      'automated message', 'notification', 'alert',
      'powered by', 'sent by', 'from venmo', 'from zelle',
      'see full', 'full story', 'read more'
    ];
    for (const phrase of skipPhrases) {
      if (lowerMemo.includes(phrase)) return true;
    }

    // Skip if exact match of common button/link text
    const exactSkipPhrases = [
      'more', 'details', 'info', 'information', 'view', 'open',
      'see', 'show', 'hide', 'expand', 'collapse'
    ];
    if (exactSkipPhrases.includes(lowerMemo.trim())) return true;

    return false;
  }

  private extractTransactionId(body: string): string | null {
    const patterns = [
      /(?:Transaction ID|Payment ID|Confirmation|Reference):\s*([A-Za-z0-9-]+)/i,
      /(?:ID|#)\s*([A-Za-z0-9]{8,})/i,
    ];

    for (const pattern of patterns) {
      const match = body.match(pattern);
      if (match) {
        return match[1];
      }
    }

    return null;
  }
}
