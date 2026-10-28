"use client";

import { Camera, ImagePlus, Link2, LoaderCircle, QrCode, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";

type Props = {
  open: boolean;
  loading: boolean;
  onClose: () => void;
  onImport: (value: string) => void;
};

export default function ShareImportModal({ open, loading, onClose, onImport }: Props) {
  const [value, setValue] = useState("");
  const [scanState, setScanState] = useState<"idle" | "camera" | "error">("idle");
  const [message, setMessage] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const stopCamera = () => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setScanState("idle");
  };

  useEffect(() => {
    if (!open) {
      stopCamera();
      setValue("");
      setMessage("");
    }
    return () => stopCamera();
  }, [open]);

  if (!open) return null;

  const submit = () => {
    if (!value.trim() || loading) return;
    onImport(value.trim());
  };

  const scanFrames = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    if (video.readyState >= 2 && video.videoWidth > 0) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (context) {
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const image = context.getImageData(0, 0, canvas.width, canvas.height);
        const result = jsQR(image.data, image.width, image.height);
        if (result?.data) {
          stopCamera();
          setValue(result.data);
          setMessage("QR-код распознан — нажмите «Добавить в медиатеку»");
          if (result.data.includes("/share/")) onImport(result.data);
          return;
        }
      }
    }
    rafRef.current = requestAnimationFrame(scanFrames);
  };

  const startCamera = async () => {
    setMessage("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      streamRef.current = stream;
      setScanState("camera");
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        rafRef.current = requestAnimationFrame(scanFrames);
      }
    } catch {
      setScanState("error");
      setMessage("Камера недоступна. Загрузите фото QR-кода или вставьте ссылку.");
    }
  };

  const scanImage = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) return;
        context.drawImage(image, 0, 0);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
        const result = jsQR(pixels.data, pixels.width, pixels.height);
        if (result?.data) {
          setValue(result.data);
          setMessage("QR-код распознан — нажмите «Добавить в медиатеку»");
          if (result.data.includes("/share/")) onImport(result.data);
        } else {
          setMessage("На картинке не найден QR-код. Попробуйте выбрать другой формат или вставьте ссылку.");
        }
      };
      image.src = String(reader.result || "");
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal share-modal" role="dialog" aria-modal="true" aria-label="Добавить плейлист по ссылке или QR-коду" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div>
            <span className="small-kicker">МОЯ МЕДИАТЕКА</span>
            <h2>Добавить чужой плейлист</h2>
          </div>
          <button className="icon-button" aria-label="Закрыть" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <p className="share-summary">
          Вставьте ссылку вида <code>/share/...</code> (её можно получить по кнопке «Поделиться» в плейлисте друга) или
          отсканируйте его QR-код — плейлист появится в вашей медиатеке.
        </p>

        <div className="share-import-field">
          <Link2 size={16} />
          <input
            autoFocus
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="https://.../share/abc123"
            aria-label="Ссылка на общий плейлист"
            onKeyDown={(event) => {
              if (event.key === "Enter") submit();
            }}
          />
        </div>

        <div className="share-import-actions">
          <button type="button" className="solid-button" onClick={submit} disabled={!value.trim() || loading}>
            {loading ? <><LoaderCircle size={15} className="spin" /> Добавляем...</> : <><QrCode size={15} /> Добавить в медиатеку</>}
          </button>
          <button type="button" className="reco-promo-ghost" onClick={() => (scanState === "camera" ? stopCamera() : void startCamera())}>
            <Camera size={15} /> {scanState === "camera" ? "Остановить камеру" : "Сканировать камерой"}
          </button>
          <button type="button" className="reco-promo-ghost" onClick={() => fileRef.current?.click()}>
            <ImagePlus size={15} /> Фото QR-кода
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="visually-hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) scanImage(file);
              event.currentTarget.value = "";
            }}
          />
        </div>

        <div className={`share-scan-area ${scanState === "camera" ? "visible" : ""}`}>
          <video ref={videoRef} playsInline muted />
          <canvas ref={canvasRef} className="visually-hidden" />
        </div>

        {message && <p className="share-scan-message">{message}</p>}
      </div>
    </div>
  );
}
