import { Body, Controller, Get, HttpCode, Inject, Post, Res, UseGuards } from "@nestjs/common";
import { type Me, signInInput, type SignInInput, signUpInput, type SignUpInput, type User } from "@aashi/contracts";
import type { Response } from "express";
import { CONFIG, type Config, ZodPipe } from "../../platform";
import { AuthService, SESSION_TTL_MS } from "./auth.service";
import { CurrentSession, type Session, SESSION_COOKIE, SessionGuard } from "./session.guard";

@Controller("v1")
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(CONFIG) private readonly config: Config,
  ) {}

  @Post("auth/sign-up")
  async signUp(
    @Body(new ZodPipe(signUpInput)) body: SignUpInput,
    @Res({ passthrough: true }) res: Response,
  ): Promise<User> {
    const { user, token } = await this.auth.signUp(body);
    this.setCookie(res, token);
    return user;
  }

  @Post("auth/sign-in")
  @HttpCode(200)
  async signIn(
    @Body(new ZodPipe(signInInput)) body: SignInInput,
    @Res({ passthrough: true }) res: Response,
  ): Promise<User> {
    const { user, token } = await this.auth.signIn(body);
    this.setCookie(res, token);
    return user;
  }

  @Post("auth/sign-out")
  @HttpCode(204)
  @UseGuards(SessionGuard)
  async signOut(@CurrentSession() session: Session, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.signOut(session.userId, session.sessionId);
    res.clearCookie(SESSION_COOKIE, { path: "/" });
  }

  @Get("me")
  @UseGuards(SessionGuard)
  me(@CurrentSession() session: Session): Promise<Me> {
    return this.auth.me(session.userId);
  }

  private setCookie(res: Response, token: string): void {
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: this.config.production,
      path: "/",
      maxAge: SESSION_TTL_MS,
    });
  }
}
