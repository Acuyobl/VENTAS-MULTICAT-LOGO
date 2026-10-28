# Bootstrap medido — criterio 8 de F0

Este documento cierra el criterio 8 de la fase 0: **medir el bootstrap de un entorno nuevo** para
que la incorporación de otra persona no dependa de conocimiento tribal. Lo ejecuta
[`tools/bootstrap-check.mjs`](../tools/bootstrap-check.mjs):

```bash
node tools/bootstrap-check.mjs
```

> Requiere los servidores de desarrollo **detenidos**: en Windows, `prisma generate` no puede
> reemplazar el motor mientras la API lo tiene abierto (`EPERM` al renombrar el `.dll`). El script
> falla de inmediato si detecta ese caso.

## Entorno medido

| Dato | Valor |
| --- | --- |
| Fecha | 2026-10-28 (zona America/Costa_Rica) |
| Máquina | Intel Core i7-1185G7 @ 3.00 GHz, 31.7 GB RAM, Windows 11 |
| Node | 24.21.0 local (CI fija 22.13.1) |
| pnpm | 9.15.4 |
| Infraestructura | Docker Compose: PostgreSQL 16, Redis 7, MinIO, Mailpit |
| Caché | `pnpm store` y `turbo` tibios; Docker con imágenes descargadas |

## Resultado (ejecución real)

| Paso | Tiempo |
| --- | --- |
| instalar dependencias (`pnpm install --frozen-lockfile`) | 6.6 s |
| levantar infraestructura (`pnpm infra:up`) | 1.2 s |
| aplicar migraciones (`pnpm db:deploy`) | 3.4 s |
| sembrar datos demo (`pnpm db:seed`) | 7.6 s |
| compilar paquetes y apps (`pnpm build`) | 56.1 s |
| esperar PostgreSQL listo | 0.3 s |
| **Total** | **75.1 s** |

Aproximaciones honestas:

- Con **caché fría** (primer `pnpm install` en la máquina) el paso 1 sube a ~2–4 min y el total
  queda en **4–6 min**. El resto es estable.
- Arrancar API y web en caliente (`pnpm dev`) agrega ~20 s hasta `/health/ready`; el arranque de
  Next en modo producción tarda ~10 s más.
- La compilación de web (56 s) domina el total; en CI se cachea por rama.

**Conclusión del criterio 8:** ✅ un entorno nuevo llega a datos demo en **~75 s en caliente** y
**~4–6 min en frío**, con un solo comando de medición reproducible.

## Camino manual equivalente

```bash
cp .env.example .env          # ajustar puertos/secretos si hacen falta
pnpm install                  # incluye prisma generate en postinstall
pnpm infra:up                 # postgres, redis, minio, mailpit
pnpm db:deploy                # migraciones
pnpm db:seed                  # roles, usuarios demo, catálogo demo con imágenes
pnpm dev                      # API :3001 y web :3010
curl http://localhost:3001/api/v1/health/ready
```

Usuarios demo (`Demo1234!`): `admin@ventascatalogo.local` (org_admin, MFA autocompletado en dev),
`cliente@ventascatalogo.local` (customer), `mixto@ventascatalogo.local` (vendedor + customer en otra
organización). Hosts: `app.localhost:3010` (backoffice), `tienda.localhost:3010` (tienda).

## Riesgos conocidos del bootstrap

- Puertos ocupados (`3000`, `3010`, `5432`, `55432`): el `.env` usa `POSTGRES_PORT=55432` porque
  `5432` y `5433` los usan otros proyectos de la máquina.
- Windows: si la API está corriendo, `pnpm install`/`db:generate` falla con `EPERM`; detenerla
  primero.
- Sin credenciales de Google Drive ni Stripe el bootstrap funciona igual: sus módulos quedan
  bloqueados con error explícito.
