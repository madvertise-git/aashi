import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";
import { AuthService } from "./auth.service";

export const SESSION_COOKIE = "aashi_session";

export interface Session {
  sessionId: string;
  userId: string;
}

type RequestWithSession = Request & { session?: Session };

function readCookie(req: Request, name: string): string | undefined {
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const eq = part.indexOf("=");
    if (eq > 0 && part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return undefined;
}

/** Step one of the request pipeline: who is this? */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<RequestWithSession>();
    const token = readCookie(req, SESSION_COOKIE);
    const session = token ? await this.auth.resolveSession(token) : undefined;
    if (!session) throw new UnauthorizedException("Sign in required.");
    req.session = session;
    return true;
  }
}

/** The signed-in user's session. Only valid on routes behind SessionGuard. */
export const CurrentSession = createParamDecorator((_: unknown, context: ExecutionContext): Session => {
  const session = context.switchToHttp().getRequest<RequestWithSession>().session;
  if (!session) throw new UnauthorizedException("Sign in required.");
  return session;
});
