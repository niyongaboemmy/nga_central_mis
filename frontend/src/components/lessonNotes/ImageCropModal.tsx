import React, { useCallback, useState } from "react";
import Cropper, { Area } from "react-easy-crop";
import "react-easy-crop/react-easy-crop.css";
import Modal from "../ui/Modal";
import { Crop, ZoomIn, ZoomOut, Square, RectangleHorizontal, RectangleVertical, Maximize } from "lucide-react";

interface Props {
  isOpen: boolean;
  src: string | null;
  onClose: () => void;
  onApply: (croppedDataUrl: string) => void;
}

// react-easy-crop only supports a fixed-aspect crop box you pan/zoom within (no freeform
// corner-drag resize) — presets cover the shapes a teacher actually reaches for (a square
// avatar-style crop, a wide banner, a tall portrait); "Original" leaves the source's own
// ratio in place so zoom/pan alone can tighten the framing without changing its shape.
const ASPECTS: { label: string; value: number | null; icon: React.ReactNode }[] = [
  { label: "Original", value: null, icon: <Maximize className="w-3.5 h-3.5" /> },
  { label: "Square", value: 1, icon: <Square className="w-3.5 h-3.5" /> },
  { label: "Wide", value: 16 / 9, icon: <RectangleHorizontal className="w-3.5 h-3.5" /> },
  { label: "Tall", value: 3 / 4, icon: <RectangleVertical className="w-3.5 h-3.5" /> },
];

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = src;
  });
}

async function getCroppedDataUrl(src: string, area: Area): Promise<string> {
  const img = await loadImage(src);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(area.width);
  canvas.height = Math.round(area.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, canvas.width, canvas.height);
  // PNG keeps transparency (diagrams/screenshots with alpha); quality loss from re-encoding
  // a photo is an acceptable tradeoff for that, and the source was already a raster image.
  return canvas.toDataURL("image/png");
}

const ImageCropModal: React.FC<Props> = ({ isOpen, src, onClose, onApply }) => {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [aspect, setAspect] = useState<number | null>(null);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [applying, setApplying] = useState(false);

  const resetState = () => {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setAspect(null);
    setCroppedAreaPixels(null);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const onCropComplete = useCallback((_area: Area, areaPixels: Area) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  const handleApply = async () => {
    if (!src || !croppedAreaPixels) return;
    setApplying(true);
    try {
      const dataUrl = await getCroppedDataUrl(src, croppedAreaPixels);
      onApply(dataUrl);
      resetState();
      onClose();
    } catch {
      // Cropping is a pure client-side canvas op on an already-loaded image — a failure
      // here means something is structurally wrong (e.g. a tainted canvas), not something
      // worth a generic "try again" toast; fail silently closed rather than block the modal.
    } finally {
      setApplying(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} size="xl" contentClassName="p-0" title="Crop image">
      {src && (
        <div className="flex flex-col">
          <div className="relative w-full h-[26rem] bg-gray-900">
            <Cropper
              image={src}
              crop={crop}
              zoom={zoom}
              aspect={aspect ?? undefined}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
              restrictPosition
            />
          </div>
          <div className="flex flex-col gap-3 p-4 border-t border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-1.5">
              {ASPECTS.map((a) => (
                <button
                  key={a.label}
                  type="button"
                  onClick={() => setAspect(a.value)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                    aspect === a.value
                      ? "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300"
                      : "bg-gray-100 text-gray-600 dark:bg-gray-700/50 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                  }`}
                >
                  {a.icon} {a.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <ZoomOut className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <input
                type="range"
                min={1}
                max={3}
                step={0.05}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="flex-1 accent-violet-600"
              />
              <ZoomIn className="w-4 h-4 text-gray-400 flex-shrink-0" />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={handleClose}
                className="px-4 py-2 text-sm rounded-full border border-gray-200 dark:border-gray-700/50 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/40"
              >
                Cancel
              </button>
              <button
                onClick={handleApply}
                disabled={applying || !croppedAreaPixels}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-full bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Crop className="w-4 h-4" /> {applying ? "Applying..." : "Apply crop"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
};

export default ImageCropModal;
