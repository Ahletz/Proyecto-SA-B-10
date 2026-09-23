import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Reflector } from '@nestjs/core';
import * as jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';
import { JwtGuard } from './jwt.guard';
import { RolesGuard } from './roles.guard';

const SECRET = 'test-secret';

function context(req: any): ExecutionContext {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

function reflector(value: unknown): Reflector {
  return { getAllAndOverride: () => value } as unknown as Reflector;
}

const config = { getOrThrow: () => SECRET } as unknown as ConfigService;

describe('JwtGuard', () => {
  it('permite rutas públicas sin token', () => {
    const guard = new JwtGuard(reflector(true), config);
    expect(guard.canActivate(context({ headers: {} }))).toBe(true);
  });

  it('rechaza peticiones sin Bearer token', () => {
    const guard = new JwtGuard(reflector(false), config);
    expect(() => guard.canActivate(context({ headers: {} }))).toThrow(UnauthorizedException);
  });

  it('rechaza tokens firmados con otro secreto', () => {
    const guard = new JwtGuard(reflector(false), config);
    const token = jwt.sign({ customerId: 'c1', role: 'CLIENT' }, 'otro-secreto');
    const req = { headers: { authorization: `Bearer ${token}` } };
    expect(() => guard.canActivate(context(req))).toThrow(UnauthorizedException);
  });

  it('acepta un token válido y adjunta el usuario al request', () => {
    const guard = new JwtGuard(reflector(false), config);
    const token = jwt.sign({ customerId: 'c1', role: 'CLIENT' }, SECRET);
    const req: any = { headers: { authorization: `Bearer ${token}` } };
    expect(guard.canActivate(context(req))).toBe(true);
    expect(req.user).toMatchObject({ customerId: 'c1', role: 'CLIENT' });
  });
});

describe('RolesGuard', () => {
  it('permite el acceso cuando la ruta no exige roles', () => {
    const guard = new RolesGuard(reflector(undefined));
    expect(guard.canActivate(context({ user: { role: 'CLIENT' } }))).toBe(true);
  });

  it('permite el acceso cuando el rol del usuario está autorizado', () => {
    const guard = new RolesGuard(reflector(['ADMIN', 'CASHIER']));
    expect(guard.canActivate(context({ user: { role: 'CASHIER' } }))).toBe(true);
  });

  it('rechaza el acceso cuando el rol no está autorizado', () => {
    const guard = new RolesGuard(reflector(['ADMIN']));
    expect(() => guard.canActivate(context({ user: { role: 'CLIENT' } }))).toThrow(ForbiddenException);
  });
});
