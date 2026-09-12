import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AppConfig } from '../../config/configuration';
import { UserRole } from '../../types';
import { AuthenticatedUser } from '../decorators/current-user.decorator';

interface JwtPayload {
  sub: string;
  email: string;
  isVerified: boolean;
  role: UserRole;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService<AppConfig, true>) {
    const secret = configService.get('auth', { infer: true }).accessTokenSecret;
    if (!secret) {
      throw new Error(
        'JWT_ACCESS_SECRET is not set. Copy sample.env to .env and fill it in.',
      );
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
      // Production hardening (Batch 10) — explicit algorithm pinning. This
      // app only ever signs with HS256 (see auth.service.ts's issueTokens())
      // and `secretOrKey` above is a single symmetric secret, not an
      // asymmetric keypair — pinning `algorithms` here closes the classic
      // "alg confusion" class of JWT vulnerability outright (a token
      // crafted with a different `alg` header, e.g. attempting to coerce a
      // public-key algorithm into treating this secret as a public key, or
      // `alg: none`) rather than relying on the library's own default
      // protections against it.
      algorithms: ['HS256'],
    });
  }

  /** Return value becomes `request.user` — see CurrentUser decorator. */
  validate(payload: JwtPayload): AuthenticatedUser {
    return {
      userId: payload.sub,
      email: payload.email,
      isVerified: payload.isVerified,
      role: payload.role,
    };
  }
}
