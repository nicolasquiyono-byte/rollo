export const es = {
  brand: 'Rollo',
  tagline: 'Tu cámara desechable digital para eventos',

  nav: {
    create: 'Crear rollo',
    join: 'Unirme a un rollo',
  },

  home: {
    hero: 'Captura el momento, revélalo después.',
    sub: 'Una cámara desechable digital para bodas, fiestas y reuniones. Sin app, solo el código del evento.',
    cta_create: 'Crear un rollo',
    cta_join: 'Tengo un código',
    how_title: '¿Cómo funciona?',
    steps: [
      'Crea un rollo para tu evento.',
      'Comparte el código o QR con tus invitados.',
      'Cada invitado captura sus momentos.',
      'Revela todas las fotos juntos al final.',
    ],
  },

  create: {
    title: 'Crear un nuevo rollo',
    sub: 'Configura tu evento en menos de un minuto.',
    name_label: 'Nombre del evento',
    name_placeholder: 'Boda de Ana y Luis',
    cover_label: 'Imagen de portada',
    duration_label: 'Duración del evento',
    duration_hint: '¿Cuánto tiempo estará abierto el rollo?',
    duration_hours: 'horas',
    shot_limit_label: 'Disparos por invitado',
    shot_limit_hint: 'Cada invitado podrá tomar este número de fotos.',
    reveal_label: 'Tipo de revelado',
    reveal_instant: 'Instantáneo',
    reveal_instant_hint: 'Las fotos aparecen apenas se toman.',
    reveal_delayed: 'Revelado al final',
    reveal_delayed_hint: 'Las fotos se revelan cuando termina el evento.',
    host_name_label: 'Tu nombre',
    submit: 'Crear rollo',
    creating: 'Creando rollo…',
  },

  join: {
    title: 'Unirme a un rollo',
    sub: 'Ingresa el código o escanea el QR.',
    code_label: 'Código del rollo',
    code_placeholder: 'ABC123',
    scan_qr: 'Escanear QR',
    name_label: 'Tu nombre',
    name_placeholder: '¿Cómo te llamas?',
    submit: 'Entrar al rollo',
    joining: 'Entrando…',
    not_found: 'No encontramos ese rollo. Revisa el código.',
    closed: 'Este rollo ya cerró.',
  },

  event: {
    open_camera: 'Capturar momento',
    open_gallery: 'Ver galería',
    share_event: 'Compartir evento',
    shots_left: (n: number) => `Te quedan ${n} disparos`,
    no_shots_left: 'Ya no te quedan disparos',
    closes_in: 'Cierra en',
    reveals_in: 'Se revela en',
    guests_count: (n: number) => `${n} invitados`,
    photos_count: (n: number) => `${n} fotos`,
  },

  camera: {
    capture: 'Capturar momento',
    flip: 'Voltear cámara',
    flash: 'Flash',
    close: 'Cerrar',
    confirm: 'Usar esta foto',
    retake: 'Tomar otra',
    uploading: 'Subiendo…',
    queued_offline: 'Sin internet. Guardamos tu foto y se subirá después.',
    permission_denied: 'Necesitamos permiso para usar la cámara.',
    not_supported: 'Tu navegador no soporta la cámara. Usa Safari o Chrome.',
  },

  gallery: {
    title: 'Galería del rollo',
    empty: 'Aún no hay fotos. ¡Sé el primero!',
    locked_title: 'Las fotos se revelan al final del evento',
    locked_sub: 'Espera a que termine el rollo para ver todos los momentos.',
    download_all: 'Descargar todas',
    share_whatsapp: 'Compartir por WhatsApp',
    by: 'por',
    view_all: 'Todas las fotos',
    view_by_guest: 'Por invitado',
    back_to_list: 'Volver',
    photos_count: (n: number) => `${n} foto${n === 1 ? '' : 's'}`,
  },

  countdown: {
    days: 'd',
    hours: 'h',
    minutes: 'm',
    seconds: 's',
  },

  errors: {
    generic: 'Algo salió mal. Intenta de nuevo.',
    upload_failed: 'No pudimos subir la foto. La guardamos para reintentar.',
    shot_limit_reached: 'Alcanzaste tu límite de disparos.',
  },
} as const;

export type Locale = typeof es;
