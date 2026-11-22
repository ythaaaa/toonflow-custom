export type PanoramaMode = "sphere" | "cylinder";
export type PanoramaCapture = {
  images: { blob: Blob; width: number; height: number; label: string }[];
  columns: number;
  count: number;
};

export function getPanoramaViews(mode: PanoramaMode, count: 1 | 4 | 12, yaw: number, pitch: number) {
  const startYaw = Number.isFinite(yaw) ? yaw : 0;
  const startPitch = mode === "sphere" && Number.isFinite(pitch) ? Math.max(-85, Math.min(85, pitch)) : 0;
  return Array.from({ length: count }, (_, index) => {
    const columns = count === 12 && mode === "cylinder" ? 12 : 4;
    const viewYaw = ((startYaw + (count === 1 ? 0 : index % columns * 360 / columns)) % 360 + 360) % 360;
    const viewPitch = count === 1 ? startPitch : count === 12 && mode === "sphere" ? 45 - Math.floor(index / 4) * 45 : 0;
    return { yaw: viewYaw, pitch: viewPitch, label: `水平 ${Math.round(viewYaw)}°${mode === "sphere" ? ` · 俯仰 ${viewPitch}°` : ""}` };
  });
}
