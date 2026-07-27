import { RequestMethod, type INestApplicationContext } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { DiscoveryService, MetadataScanner } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';
import { PERMISSION_KEY } from '../auth/decorators/require-permission.decorator';

export interface RouteRef {
  method: string;
  path: string;
  controller: string;
  handler: string;
  isPublic: boolean;
  permission: string | null;
}

function joinPath(...parts: unknown[]): string {
  const segments = parts
    .map((part) => (typeof part === 'string' ? part : ''))
    .flatMap((part) => part.split('/'))
    .filter((segment) => segment.length > 0);
  return `/${segments.join('/')}`;
}

/**
 * Enumerates every HTTP route Nest actually registered on `app`, from the DI
 * container rather than from the Express router internals — which change
 * shape between Express 4 and 5 and are not public API.
 *
 * The point of enumerating is coverage: a matrix test can fail when a route
 * exists that nobody wrote an authorization expectation for. A hand-
 * maintained list of endpoints silently stops being complete the moment
 * someone adds the 41st one.
 */
export function enumerateRoutes(app: INestApplicationContext): RouteRef[] {
  const discovery = app.get(DiscoveryService);
  const scanner = new MetadataScanner();
  const routes: RouteRef[] = [];

  for (const wrapper of discovery.getControllers()) {
    const { instance, metatype } = wrapper;
    if (!instance || !metatype) continue;
    const basePath = Reflect.getMetadata(PATH_METADATA, metatype) as string | undefined;
    const prototype = Object.getPrototypeOf(instance) as Record<string, unknown>;

    for (const handlerName of scanner.getAllMethodNames(prototype)) {
      const handler = prototype[handlerName] as (...args: unknown[]) => unknown;
      const subPath = Reflect.getMetadata(PATH_METADATA, handler) as string | undefined;
      if (subPath === undefined) continue;
      const verb = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod;

      routes.push({
        method: RequestMethod[verb] ?? 'ALL',
        // setGlobalPrefix('api') is applied in main.ts, not visible in metadata.
        path: joinPath('api', basePath, subPath),
        controller: metatype.name,
        handler: handlerName,
        isPublic:
          Reflect.getMetadata(IS_PUBLIC_KEY, handler) === true ||
          Reflect.getMetadata(IS_PUBLIC_KEY, metatype) === true,
        permission:
          (Reflect.getMetadata(PERMISSION_KEY, handler) as string | undefined) ??
          (Reflect.getMetadata(PERMISSION_KEY, metatype) as string | undefined) ??
          null,
      });
    }
  }

  return routes;
}
