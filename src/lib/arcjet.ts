import arcjet, { detectBot, shield, tokenBucket, filter, sensitiveInfo, validateEmail } from "@arcjet/next";
import { isSpoofedBot, isMissingUserAgent } from "@arcjet/inspect";
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { errorResponse } from "@/lib/response";
import type { ArcjetEmailType } from "arcjet";

const ARCJET_MODE = process.env.ARCJET_SHIELD_MODE === 'production' ? 'LIVE' : 'DRY_RUN';
const EMAIL_DENY_TYPES: ArcjetEmailType[] = ['DISPOSABLE', 'INVALID', 'NO_MX_RECORDS'];
const EMAIL_REASON_MESSAGES: Record<ArcjetEmailType, string> = {
  DISPOSABLE: 'Disposable email addresses are not allowed.',
  INVALID: 'Email address is invalid.',
  NO_MX_RECORDS: 'Email domain has no MX records configured.',
  NO_GRAVATAR: 'Email address could not be verified.',
  FREE: 'Email provider is not allowed.',
};

export const aj = arcjet({
  key: process.env.ARCJET_KEY || '',
  characteristics: ['http.request.headers["user-agent"]', 'ip.src'],
  rules: [
    shield({ 
      mode: ARCJET_MODE,
    }),
    
    filter({
      mode: ARCJET_MODE,
      deny: [
        'ip.src.vpn or ip.src.tor or lower(http.request.headers["user-agent"]) matches "curl" or len(http.request.headers["user-agent"]) eq 0',
      ],
    }),
    
    detectBot({
      mode: ARCJET_MODE,
      allow: [
        "CATEGORY:SEARCH_ENGINE",
        "CATEGORY:MONITOR",
      ],
    }),
    
    tokenBucket({
      mode: ARCJET_MODE,
      refillRate: 5,
      interval: 10,
      capacity: 10,
    }),
  ],
});

export const ajWithSensitiveInfo = arcjet({
  key: process.env.ARCJET_KEY || '',
  characteristics: ['http.request.headers["user-agent"]', 'ip.src'],
  rules: [
    shield({ mode: ARCJET_MODE }),
    filter({
      mode: ARCJET_MODE,
      deny: [
        'ip.src.vpn or ip.src.tor or lower(http.request.headers["user-agent"]) matches "curl" or len(http.request.headers["user-agent"]) eq 0',
      ],
    }),
    detectBot({
      mode: ARCJET_MODE,
      allow: [
        "CATEGORY:SEARCH_ENGINE",
        "CATEGORY:MONITOR",
      ],
    }),
    tokenBucket({
      mode: ARCJET_MODE,
      refillRate: 5,
      interval: 10,
      capacity: 10,
    }),
    sensitiveInfo({
      mode: ARCJET_MODE,
      deny: ["EMAIL"],
    }),
  ],
});

const ajEmail = arcjet({
  key: process.env.ARCJET_KEY || '',
  rules: [
    validateEmail({
      mode: ARCJET_MODE,
      deny: EMAIL_DENY_TYPES,
    }),
  ],
});

function formatEmailDenyMessage(types: ArcjetEmailType[]): string {
  const unique = Array.from(new Set(types));
  const messages = unique
    .map((type) => EMAIL_REASON_MESSAGES[type] ?? `Email failed validation (${type.toLowerCase()})`);
  return messages.join(' ');
}

export interface ProtectOptions {
  requested?: number;
  useSensitiveInfo?: boolean;
}

export async function protectRoute(
  request: NextRequest,
  options: ProtectOptions = { requested: 1, useSensitiveInfo: false }
): Promise<NextResponse | null> {
  if (!process.env.ARCJET_KEY) {
    logger.warn('ARCJET_KEY not set, skipping protection');
    return null;
  }

  const origin = request.headers.get('origin')
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || []
  const isAllowedOrigin = origin && allowedOrigins.includes(origin)

  try {
    const instance = options.useSensitiveInfo ? ajWithSensitiveInfo : aj;
    const decision = await instance.protect(request, { requested: options.requested ?? 1 });

    for (const { reason } of decision.results) {
      if (reason.isError()) {
        logger.error('ARCJET protection error:', reason.message);
      }
    }

    if (decision.results.some(isMissingUserAgent)) {
      logger.warn('Request missing User-Agent header');
      return NextResponse.json(
        { error: "Bad request" },
        { status: 400 }
      );
    }

    if (decision.isDenied()) {
      if (decision.reason.isRateLimit()) {
        return NextResponse.json(
          { error: "Too Many Requests" },
          { status: 429 }
        );
      } else if (decision.reason.isBot()) {
        return NextResponse.json(
          { error: "No bots allowed" },
          { status: 403 }
        );
      } else if (decision.reason.isShield()) {
        return NextResponse.json(
          { error: "Request blocked by security rules" },
          { status: 403 }
        );
      } else if (decision.reason.isFilter()) {
        return NextResponse.json(
          { error: "Request blocked by filter rules" },
          { status: 403 }
        );
      } else if (decision.reason.isSensitiveInfo && decision.reason.isSensitiveInfo()) {
        return NextResponse.json(
          { error: "Sensitive information detected" },
          { status: 400 }
        );
      } else {
        return NextResponse.json(
          { error: "Forbidden" },
          { status: 403 }
        );
      }
    }

    // Skip hosting IP check for allowed origins (server-to-server requests)
    if (decision.ip.isHosting() && !isAllowedOrigin) {
      logger.ups('Blocked hosting IP');
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403 }
      );
    }

    if (decision.results.some(isSpoofedBot)) {
      logger.warn('Blocked spoofed bot');
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403 }
      );
    }

    return null;
  } catch (error) {
    logger.error('ARCJET could not protect route:', error);
    return null;
  }
}

export async function validateEmailWithArcjet(
  request: NextRequest,
  email: string
): Promise<NextResponse | null> {
  if (!process.env.ARCJET_KEY) {
    logger.warn('ARCJET_KEY not set, skipping email validation');
    return null;
  }

  try {
    const decision = await ajEmail.protect(request, { email });

    for (const { reason } of decision.results) {
      if (reason.isError()) {
        logger.error('Arcjet email validation error:', reason.message);
      }
    }

    if (decision.results.some(isMissingUserAgent)) {
      logger.warn('Email validation request missing User-Agent header');
      return errorResponse('Bad request', 400, request.headers.get('origin'));
    }

    if (decision.isDenied()) {
      if (decision.reason.isEmail()) {
        const message = formatEmailDenyMessage(decision.reason.emailTypes);
        logger.warn('Email denied by Arcjet:', email, decision.reason.emailTypes);
        return errorResponse(message || 'Email validation failed', 400, request.headers.get('origin'));
      }

      logger.warn('Email denied by Arcjet without email reason');
      return errorResponse('Email validation failed', 400, request.headers.get('origin'));
    }

    if (decision.ip.isHosting()) {
      logger.ups('Blocked hosting IP during email validation');
      return errorResponse('Forbidden', 403, request.headers.get('origin'));
    }

    if (decision.results.some(isSpoofedBot)) {
      logger.warn('Blocked spoofed bot during email validation');
      return errorResponse('Forbidden', 403, request.headers.get('origin'));
    }

    return null;
  } catch (error) {
    logger.error('Arcjet email validation exception:', error);
    return null;
  }
}

export function withArcjet<T extends (...args: any[]) => Promise<Response>>(
  handler: T,
  options?: ProtectOptions
): T {
  return (async (...args: Parameters<T>) => {
    const request = args[0] as NextRequest;
    
    const blocked = await protectRoute(request, options);
    if (blocked) {
      return blocked;
    }

    return handler(...args);
  }) as T;
}