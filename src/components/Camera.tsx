// Camera.tsx - Versión corregida sin errores de TypeScript

import { useRef, useEffect, useState } from 'react';

interface CameraProps {
  isFrontCamera: boolean;
  onCapture?: (imageData: string) => void;
}

export default function Camera({ isFrontCamera, onCapture }: CameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
    };
  }, [isFrontCamera]);

  const startCamera = async () => {
    try {
      setIsLoading(true);
      
      // Detener stream anterior si existe
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }

      // Configuración base de constraints (SIN advanced para evitar error TypeScript)
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: isFrontCamera ? 'user' : 'environment',
          width: { ideal: 1080 },
          height: { ideal: 1920 }
        } as MediaTrackConstraints,
        audio: false
      };

      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      
      // DESPUÉS de obtener el stream, aplicar configuración de estabilización
      if (isFrontCamera) {
        const videoTrack = mediaStream.getVideoTracks()[0];
        
        // Intentar desactivar estabilización (solo funciona en algunos navegadores)
        try {
          await videoTrack.applyConstraints({
            // @ts-ignore - imageStabilization existe pero no está en los tipos de TS
            advanced: [{ imageStabilization: false }]
          });
          console.log('Estabilización desactivada');
        } catch (e) {
          console.log('Estabilización no soportada en este navegador');
        }
      }

      setStream(mediaStream);
      
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      
      setIsLoading(false);
    } catch (error) {
      console.error('Error al acceder a la cámara:', error);
      setIsLoading(false);
      alert('No se pudo acceder a la cámara. Verifica los permisos.');
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    if (!context) return;

    // Establecer dimensiones del canvas
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Dibujar el frame actual del video
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Convertir a imagen
    const imageData = canvas.toDataURL('image/jpeg', 0.95);
    
    if (onCapture) {
      onCapture(imageData);
    }

    return imageData;
  };

  return (
    <div className="camera-container">
      {isLoading && (
        <div className="loading">
          <p>Cargando cámara...</p>
        </div>
      )}
      
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transform: isFrontCamera ? 'scaleX(-1)' : 'none'
        }}
      />
      
      <canvas
        ref={canvasRef}
        style={{ display: 'none' }}
      />

      <button
        onClick={capturePhoto}
        className="capture-button"
        disabled={isLoading}
      >
        📸 Capturar
      </button>

      <style jsx>{`
        .camera-container {
          position: relative;
          width: 100%;
          height: 100vh;
          background: #000;
        }

        .loading {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          color: white;
          text-align: center;
          z-index: 10;
        }

        .capture-button {
          position: absolute;
          bottom: 40px;
          left: 50%;
          transform: translateX(-50%);
          padding: 15px 30px;
          font-size: 18px;
          background: white;
          border: none;
          border-radius: 50px;
          cursor: pointer;
          z-index: 5;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        }

        .capture-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .capture-button:hover:not(:disabled) {
          background: #f0f0f0;
        }
      `}</style>
    </div>
  );
}
