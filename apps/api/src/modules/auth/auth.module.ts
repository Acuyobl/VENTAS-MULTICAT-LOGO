import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';
import { SessionService } from './session.service';
import { MfaService } from './mfa.service';
import { MagicLinkService } from './magic-link.service';
import { PasswordResetService } from './password-reset.service';
import { SessionsController } from './sessions.controller';
import { StaffJwtStrategy } from './strategies/staff-jwt.strategy';
import { CustomerJwtStrategy } from './strategies/customer-jwt.strategy';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    UsersModule,
    PassportModule.register({ session: false }),
    JwtModule.register({}),
  ],
  controllers: [AuthController, SessionsController],
  providers: [
    AuthService,
    TokenService,
    SessionService,
    MfaService,
    MagicLinkService,
    PasswordResetService,
    StaffJwtStrategy,
    CustomerJwtStrategy,
  ],
  exports: [SessionService],
})
export class AuthModule {}
