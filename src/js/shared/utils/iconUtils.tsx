import React from "react";
import { renderToString } from "react-dom/server";
import { debugWarn } from "./debugLog";
import {
  X,
  DownloadCloud,
  CircleFadingPlus,
  Link,
  Eraser,
  WifiOff,
  Check,
  ListVideo,
  FolderOpenDot,
  AlertCircle,
  KeyRound,
  Clapperboard,
  Video,
  Play,
  Pause,
  ArrowRight,
  ArrowRightToLine,
  Volume2,
  VolumeX,
} from "lucide-react";

/**
 * Helper function to render Lucide icons as HTML strings for use in innerHTML
 * This is needed for dynamically generated HTML that can't use React components directly
 */
export const renderIconAsHTML = (
  iconName: string,
  props?: { size?: number; className?: string; style?: React.CSSProperties }
): string => {
  const iconProps = {
    size: props?.size || 24,
    className: props?.className,
    style: props?.style,
  };

  const iconMap: Record<string, React.ReactElement> = {
    x: <X {...iconProps} />,
    "cloud-download": <DownloadCloud {...iconProps} />,
    "copy-plus": <CircleFadingPlus {...iconProps} />,
    link: <Link {...iconProps} />,
    eraser: <Eraser {...iconProps} />,
    "wifi-off": <WifiOff {...iconProps} />,
    check: <Check {...iconProps} />,
    "list-video": <ListVideo {...iconProps} />,
    "folder-open-dot": <FolderOpenDot {...iconProps} />,
    "alert-circle": <AlertCircle {...iconProps} />,
    "key-round": <KeyRound {...iconProps} />,
    clapperboard: <Clapperboard {...iconProps} />,
    video: <Video {...iconProps} />,
    play: <Play {...iconProps} />,
    pause: <Pause {...iconProps} />,
    "arrow-right": <ArrowRight {...iconProps} />,
    "arrow-right-to-line": <ArrowRightToLine {...iconProps} />,
    volume2: <Volume2 {...iconProps} />,
    "volume-2": <Volume2 {...iconProps} />,
    volumex: <VolumeX {...iconProps} />,
    "volume-x": <VolumeX {...iconProps} />,
  };

  const icon = iconMap[iconName.toLowerCase()];
  if (!icon) {
    debugWarn(`Icon "${iconName}" not found in iconMap`);
    return "";
  }

  return renderToString(icon);
};

