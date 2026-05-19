// Camera.tsx - Con botón circular blanco original

import { useRef, useEffect, useState } from 'react';

interface CameraProps {
  facing?: 'user' | 'environment';
  disabled?: boolean;
  onCapture?: (data: { blob: Blob; width: number; height: number }) => void;
}

export default function Camera({ facing = 'environment', disabled = false, onCapture }: CameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [capturedData, setCapturedData] = useState<{ blob: Blob; width: number; height: number } | null>(null);
  const isFrontCamera = facing === 'user';

  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
    };
  }, [facing]);

  const startCamera = async () => {
    try {
      // Detener stream anterior si existe
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }

      // Configuración optimizada - campo de visión más amplio
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: isFrontCamera ? 'user' : 'environment',
          // Resolución más baja = menos zoom
          width: { ideal: 640, max: 1280 },
          height: { ideal: 480, max: 960 },
          aspectRatio: { ideal: 4 / 3 }
        } as MediaTrackConstraints,
        audio: false
      };

      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      
      // Desactivar estabilización en modo selfie para evitar giro excesivo
      if (isFrontCamera) {
        const videoTrack = mediaStream.getVideoTracks()[0];
        
        try {
          await videoTrack.applyConstraints({
            // @ts-ignore - imageStabilization existe pero no está en tipos
            advanced: [{ imageStabilization: false }]
          });
        } catch (e) {
          // Ignorar si no está soportado
        }
      }

      setStream(mediaStream);
      
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (error) {
      console.error('[Camera] Error:', error);
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  };

  const capturePhoto = async () => {
    if (!videoRef.current || !canvasRef.current || disabled) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    if (!context) return;

    const width = video.videoWidth;
    const height = video.videoHeight;
    canvas.width = width;
    canvas.height = height;

    context.drawImage(video, 0, 0, width, height);

    // Guardar preview y datos
    const imageDataUrl = canvas.toDataURL('image/jpeg', 0.95);
    setCapturedImage(imageDataUrl);

    return new Promise<void>((resolve) => {
      canvas.toBlob((blob) => {
        if (blob) {
          setCapturedData({ blob, width, height });
        }
        resolve();
      }, 'image/jpeg', 0.95);
    });
  };

  const confirmPhoto = () => {
    if (capturedData && onCapture) {
      onCapture(capturedData);
    }
    setCapturedImage(null);
    setCapturedData(null);
  };

  const retakePhoto = () => {
    setCapturedImage(null);
    setCapturedData(null);
  };

  return (
    <>
      {/* Video stream */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 h-full w-full object-cover"
        style={{
          transform: isFrontCamera ? 'scaleX(-1)' : 'none',
          display: capturedImage ? 'none' : 'block'
        }}
      />
      
      {/* Canvas oculto para captura */}
      <canvas
        ref={canvasRef}
        style={{ display: 'none' }}
      />

      {/* Preview de foto capturada */}
      {capturedImage && (
        <div className="absolute inset-0 z-30 bg-black">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img 
            src={capturedImage} 
            alt="Preview"
            className="h-full w-full object-cover"
            style={{
              transform: isFrontCamera ? 'scaleX(-1)' : 'none'
            }}
          />
          
          {/* Botones de confirmación */}
          <div className="absolute inset-x-0 flex justify-center gap-4" style={{
            bottom: 'max(env(safe-area-inset-bottom, 0px) + 30px, 30px)'
          }}>
            {/* Tomar otra */}
            <button
              onClick={retakePhoto}
              className="flex h-14 items-center gap-2 rounded-full bg-white/20 px-6 text-white backdrop-blur-lg transition active:scale-95"
            >
              <span className="text-2xl">↻</span>
              <span className="font-medium">Tomar otra</span>
            </button>
            
            {/* Usar esta foto */}
            <button
              onClick={confirmPhoto}
              className="flex h-14 items-center gap-2 rounded-full bg-white px-6 text-black transition active:scale-95"
            >
              <span className="text-2xl">✓</span>
              <span className="font-medium">Usar esta foto</span>
            </button>
          </div>
        </div>
      )}

      {/* Botón de captura circular blanco - con animación */}
      {!capturedImage && (
        <button
          onClick={capturePhoto}
          disabled={disabled}
          aria-label="Tomar foto"
          className="absolute left-1/2 z-20 h-[70px] w-[70px] -translate-x-1/2 rounded-full border-4 border-white bg-white shadow-lg shadow-black/40 transition-all duration-150 active:scale-90 active:border-[6px] disabled:opacity-50"
          style={{
            bottom: 'max(env(safe-area-inset-bottom, 0px) + 30px, 30px)'
          }}
        />
      )}
    </>
  );
}
