import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res, UseGuards } from "@nestjs/common";
import {
  codeInput,
  type CodeInput,
  type Me,
  passwordInput,
  type PasswordInput,
  signInInput,
  type SignInInput,
  type SignInResult,
  signUpInput,
  type SignUpInput,
  type TwoFactorSetup,
  type User,
} from "@aashi/contracts";
import type { Request, Response } from "express";
import { RateLimit, RateLimitGuard, ZodPipe } from "../../platform";
import { AuthService } from "./auth.service";
import { CurrentSession, type Session, SessionGuard } from "./session.guard";

const MINUTE = 60;

@Controller("v1")
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Post("auth/sign-up")
  @UseGuards(RateLimitGuard)
  @RateLimit({ name: "sign-up", max: 20, windowSeconds: 60 * MINUTE })
  signUp(
    @Body(new ZodPipe(signUpInput)) body: SignUpInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<User> {
    return this.auth.signUp(body, { req, res });
  }

  @Post("auth/sign-in")
  @HttpCode(200)
  @UseGuards(RateLimitGuard)
  @RateLimit({ name: "sign-in", max: 10, windowSeconds: 5 * MINUTE, bodyField: "email" })
  signIn(
    @Body(new ZodPipe(signInInput)) body: SignInInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SignInResult> {
    return this.auth.signIn(body, { req, res });
  }

  /** Step two of signing in when two-factor is on. */
  @Post("auth/two-factor/verify")
  @HttpCode(200)
  @UseGuards(RateLimitGuard)
  @RateLimit({ name: "two-factor", max: 10, windowSeconds: 5 * MINUTE })
  verifyTwoFactor(
    @Body(new ZodPipe(codeInput)) body: CodeInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<User> {
    return this.auth.verifyTwoFactor(body.code, { req, res });
  }

  @Post("auth/two-factor/enable")
  @HttpCode(200)
  @UseGuards(SessionGuard, RateLimitGuard)
  @RateLimit({ name: "two-factor-manage", max: 10, windowSeconds: 5 * MINUTE })
  enableTwoFactor(
    @Body(new ZodPipe(passwordInput)) body: PasswordInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<TwoFactorSetup> {
    return this.auth.enableTwoFactor(body.password, { req, res });
  }

  @Post("auth/two-factor/confirm")
  @HttpCode(204)
  @UseGuards(SessionGuard, RateLimitGuard)
  @RateLimit({ name: "two-factor-manage", max: 10, windowSeconds: 5 * MINUTE })
  confirmTwoFactor(
    @Body(new ZodPipe(codeInput)) body: CodeInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    return this.auth.confirmTwoFactor(body.code, { req, res });
  }

  @Post("auth/two-factor/disable")
  @HttpCode(204)
  @UseGuards(SessionGuard, RateLimitGuard)
  @RateLimit({ name: "two-factor-manage", max: 10, windowSeconds: 5 * MINUTE })
  disableTwoFactor(
    @Body(new ZodPipe(passwordInput)) body: PasswordInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    return this.auth.disableTwoFactor(body.password, { req, res });
  }

  @Post("auth/sign-out")
  @HttpCode(204)
  @UseGuards(SessionGuard)
  signOut(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    return this.auth.signOut({ req, res });
  }

  @Get("me")
  @UseGuards(SessionGuard)
  me(@CurrentSession() session: Session): Promise<Me> {
    return this.auth.me(session.userId);
  }
}
