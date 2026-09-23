import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { IS_PUBLIC_KEY } from './public.decorator';
@Injectable() export class JwtGuard implements CanActivate{
 constructor(private readonly reflector:Reflector,private readonly config:ConfigService){}
 canActivate(ctx:ExecutionContext){if(this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY,[ctx.getHandler(),ctx.getClass()]))return true;const req=ctx.switchToHttp().getRequest();const h=req.headers.authorization;if(!h?.startsWith('Bearer '))throw new UnauthorizedException('Bearer token required');try{req.user=jwt.verify(h.slice(7),this.config.getOrThrow<string>('JWT_SECRET'));return true;}catch{throw new UnauthorizedException('Invalid or expired token');}}
}
