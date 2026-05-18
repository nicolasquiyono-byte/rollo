# Rollo — Cámara desechable digital para eventos

Aplicación tipo Once.film enfocada en México y Latam. Los anfitriones crean un "rollo" (evento), comparten un código/QR, y los invitados toman fotos desde el navegador sin instalar nada.

## Stack

- Next.js 14 (App Router) + TypeScript
- Tailwind CSS
- Supabase (auth opcional, Postgres, Storage)
- `getUserMedia` para cámara web
- `html5-qrcode` para escaneo
- `browser-image-compression` (~500KB por foto)
- IndexedDB (vía `idb`) para cola offline

## Setup

1. **Instalar dependencias**

   ```bash
   cd rollo-app
   npm install
   ```

2. **Crear proyecto en Supabase**

   - Ejecuta `supabase/schema.sql` en el SQL editor.
   - El bucket `rollo-photos` se crea automáticamente.

3. **Variables de entorno**

   Copia `.env.local.example` a `.env.local` y completa:

   ```
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   SUPABASE_SERVICE_ROLE_KEY=...
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   ```

4. **Ejecutar en dev**

   ```bash
   npm run dev
   ```

   Necesitas HTTPS (o `localhost`) para que el navegador permita acceso a la cámara.

## Rutas

| Ruta | Descripción |
|------|-------------|
| `/` | Landing |
| `/crear` | Crear un nuevo rollo |
| `/unirse` | Unirse con código o QR |
| `/rollo/[code]` | Pantalla del evento (QR, contadores, accesos) |
| `/rollo/[code]/camara` | Cámara con límite de disparos |
| `/rollo/[code]/galeria` | Galería (bloqueada si reveal `delayed`) |

## Mapa de archivos

```
src/
├── app/                        # App Router pages
├── components/                 # Camera, Gallery, QRCode, QRScanner, Countdown, ShotCounter
├── lib/
│   ├── supabase/              # createClient (browser + server)
│   ├── i18n/es.ts             # Diccionario en español ("Rollo", "Capturar momento", …)
│   └── utils/                 # compress, qr, offline-queue, device, countdown
└── types/                      # Tipos compartidos + Database<T>
```

## Pendientes razonables

- Endpoint `/api/download` que empaqueta el rollo en ZIP (placeholder en la galería).
- Realtime: suscripción a `photos` para reveals instantáneos.
- Notificaciones push cuando el rollo se revela.
- Migrar auth anónima a Supabase Auth (`signInAnonymously`) si se quiere endurecer RLS.
- Tests E2E del flujo invitado (Playwright).
