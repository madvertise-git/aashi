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

export interface Session {
  sessionId: string;
  userId: string;
  email: string;
}

type RequestWithSession = Request & { session?: Session };

/** Step one of the request pipeline: who is this? */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<RequestWithSession>();
    const session = await this.auth.resolveSession(req);
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
