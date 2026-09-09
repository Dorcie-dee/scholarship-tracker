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
