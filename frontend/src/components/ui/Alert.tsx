import React, { useState, useEffect } from "react";
import { CheckCircle, XCircle, AlertTriangle, Info, X } from "lucide-react";

export type AlertType = "success" | "error" | "warning" | "info";

interface AlertProps {
  type: AlertType;
  message: string;
  dismissible?: boolean;
  autoHide?: boolean;
  autoHideDelay?: number;
  onClose?: () => void;
  className?: string;
}

const Alert: React.FC<AlertProps> = ({
  type,
  message,
  dismissible = false,
  autoHide = false,
  autoHideDelay = 5000,
  onClose,
  className = "",
}) => {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    if (autoHide) {
      const timer = setTimeout(() => setIsVisible(false), autoHideDelay);
      return () => clearTimeout(timer);
    }
  }, [autoHide, autoHideDelay]);

  const handleClose = () => {
    setIsVisible(false);
    onClose?.();
  };

  if (!isVisible) return null;

  const getStyles = () => {
    const base =
      "flex items-center p-3 rounded-lg border-l-4 shadow-sm transition-all duration-300";
    const animations = {
      success: "animate-bounce",
      error: "animate-pulse",
      warning: "animate-pulse",
      info: "animate-slide-in",
    };

    const colors = {
      success:
        "bg-green-50 dark:bg-green-900/20 border-green-400 text-green-800 dark:text-green-200",
      error:
        "bg-red-50 dark:bg-red-900/20 border-red-400 text-red-800 dark:text-red-200",
      warning:
        "bg-yellow-50 dark:bg-yellow-900/20 border-yellow-400 text-yellow-800 dark:text-yellow-200",
      info: "bg-blue-50 dark:bg-blue-900/20 border-blue-400 text-blue-800 dark:text-blue-200",
    };

    return `${base} ${colors[type]} ${animations[type]}`;
  };

  const getIcon = () => {
    const iconClass = "w-4 h-4 flex-shrink-0";
    const icons = {
      success: <CheckCircle className={`${iconClass} text-green-500`} />,
      error: <XCircle className={`${iconClass} text-red-500`} />,
      warning: <AlertTriangle className={`${iconClass} text-yellow-500`} />,
      info: <Info className={`${iconClass} text-blue-500`} />,
    };
    return icons[type];
  };

  return (
    <div className={`${getStyles()} ${className}`}>
      {getIcon()}
      <span className="ml-2 text-sm font-medium flex-1">{message}</span>
      {dismissible && (
        <button
          onClick={handleClose}
          className="ml-2 p-1 rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
        >
          <X className="w-3 h-3" />
        </button>
      )}
      {autoHide && (
        <div className="ml-2 w-8 h-1 bg-current bg-opacity-30 rounded-full overflow-hidden">
          <div
            className="h-full bg-current bg-opacity-60 transition-all ease-linear"
            style={{
              width: "100%",
              animation: `shrink ${autoHideDelay}ms linear forwards`,
            }}
          />
        </div>
      )}
    </div>
  );
};

export default Alert;
