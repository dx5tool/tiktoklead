import React, { useEffect, useRef } from "react";

export const AppBackground: React.FC = () => {
  const gridCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const glowCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const gridCanvas = gridCanvasRef.current;
    const glowCanvas = glowCanvasRef.current;
    if (!gridCanvas || !glowCanvas) return;

    const gridCtx = gridCanvas.getContext("2d");
    const glowCtx = glowCanvas.getContext("2d");
    if (!gridCtx || !glowCtx) return;

    let animId: number;

    const render = () => {
      const isLight = document.documentElement.getAttribute("data-theme") === "light";
      const dpr = window.devicePixelRatio || 1;
      const width = window.innerWidth;
      const height = window.innerHeight;

      // Set canvas physical dimensions
      gridCanvas.width = width * dpr;
      gridCanvas.height = height * dpr;
      glowCanvas.width = width * dpr;
      glowCanvas.height = height * dpr;

      gridCtx.scale(dpr, dpr);
      glowCtx.scale(dpr, dpr);

      // --- 1. RENDER GRID & DOT MATRIX ON CANVAS 1 ---
      gridCtx.clearRect(0, 0, width, height);

      // Background fill
      gridCtx.fillStyle = isLight ? "#f8fafc" : "#090d16";
      gridCtx.fillRect(0, 0, width, height);

      // Subtle 6px micro-grid
      gridCtx.strokeStyle = isLight ? "rgba(0, 0, 0, 0.035)" : "rgba(255, 255, 255, 0.025)";
      gridCtx.lineWidth = 0.5;
      gridCtx.beginPath();
      for (let x = 0; x <= width; x += 24) {
        gridCtx.moveTo(x, 0);
        gridCtx.lineTo(x, height);
      }
      for (let y = 0; y <= height; y += 24) {
        gridCtx.moveTo(0, y);
        gridCtx.lineTo(width, y);
      }
      gridCtx.stroke();

      // Dot matrix at 24px coordinate intersections
      gridCtx.fillStyle = isLight ? "rgba(0, 0, 0, 0.07)" : "rgba(255, 255, 255, 0.08)";
      const dotSpacing = 24;
      const dotRadius = 0.8;
      for (let x = 0; x <= width; x += dotSpacing) {
        for (let y = 0; y <= height; y += dotSpacing) {
          gridCtx.beginPath();
          gridCtx.arc(x, y, dotRadius, 0, Math.PI * 2);
          gridCtx.fill();
        }
      }

      // Micro-noise overlay pattern
      const noiseWidth = 128;
      const noiseHeight = 128;
      const noiseCanvas = document.createElement("canvas");
      noiseCanvas.width = noiseWidth;
      noiseCanvas.height = noiseHeight;
      const noiseCtx = noiseCanvas.getContext("2d");
      if (noiseCtx) {
        const imgData = noiseCtx.createImageData(noiseWidth, noiseHeight);
        const buffer32 = new Uint32Array(imgData.data.buffer);
        const len = buffer32.length;
        const noiseColor = isLight ? 0x00000000 : 0x00ffffff;
        for (let i = 0; i < len; i++) {
          if (Math.random() < 0.05) {
            const alpha = isLight ? Math.floor(Math.random() * 5) + 1 : Math.floor(Math.random() * 8) + 2;
            buffer32[i] = (alpha << 24) | noiseColor;
          }
        }
        noiseCtx.putImageData(imgData, 0, 0);
        const noisePattern = gridCtx.createPattern(noiseCanvas, "repeat");
        if (noisePattern) {
          gridCtx.fillStyle = noisePattern;
          gridCtx.fillRect(0, 0, width, height);
        }
      }

      // --- 2. RENDER RADIAL GLOW CONES ON CANVAS 2 ---
      glowCtx.clearRect(0, 0, width, height);

      // Bottom-left cyan glow cone
      const blRadius = Math.max(width * 0.45, 380);
      const blGlow = glowCtx.createRadialGradient(
        width * 0.12,
        height * 0.98,
        0,
        width * 0.12,
        height * 0.98,
        blRadius
      );
      if (isLight) {
        blGlow.addColorStop(0, "rgba(6, 182, 212, 0.07)");
        blGlow.addColorStop(0.4, "rgba(6, 182, 212, 0.02)");
        blGlow.addColorStop(1, "rgba(6, 182, 212, 0)");
      } else {
        blGlow.addColorStop(0, "rgba(6, 182, 212, 0.14)");
        blGlow.addColorStop(0.4, "rgba(6, 182, 212, 0.05)");
        blGlow.addColorStop(1, "rgba(6, 182, 212, 0)");
      }
      glowCtx.fillStyle = blGlow;
      glowCtx.beginPath();
      glowCtx.arc(width * 0.12, height * 0.98, blRadius, 0, Math.PI * 2);
      glowCtx.fill();

      // Bottom-right sky blue glow cone
      const brRadius = Math.max(width * 0.5, 420);
      const brGlow = glowCtx.createRadialGradient(
        width * 0.88,
        height * 0.96,
        0,
        width * 0.88,
        height * 0.96,
        brRadius
      );
      if (isLight) {
        brGlow.addColorStop(0, "rgba(2, 132, 199, 0.06)");
        brGlow.addColorStop(0.4, "rgba(37, 99, 235, 0.02)");
        brGlow.addColorStop(1, "rgba(37, 99, 235, 0)");
      } else {
        brGlow.addColorStop(0, "rgba(147, 197, 253, 0.12)");
        brGlow.addColorStop(0.4, "rgba(37, 99, 235, 0.05)");
        brGlow.addColorStop(1, "rgba(37, 99, 235, 0)");
      }
      glowCtx.fillStyle = brGlow;
      glowCtx.beginPath();
      glowCtx.arc(width * 0.88, height * 0.96, brRadius, 0, Math.PI * 2);
      glowCtx.fill();
    };

    let resizeTimer: number;
    const handleResize = () => {
      cancelAnimationFrame(animId);
      clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        animId = requestAnimationFrame(render);
      }, 50);
    };

    render();
    window.addEventListener("resize", handleResize);

    // Watch for theme changes on html element
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === "attributes" && m.attributeName === "data-theme") {
          handleResize();
          break;
        }
      }
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    return () => {
      window.removeEventListener("resize", handleResize);
      observer.disconnect();
      clearTimeout(resizeTimer);
      cancelAnimationFrame(animId);
    };
  }, []);

  return (
    <div
      className="fixed inset-0 pointer-events-none -z-10 overflow-hidden select-none"
      aria-hidden="true"
    >
      <canvas
        ref={gridCanvasRef}
        className="absolute inset-0 w-full h-full"
      />
      <canvas
        ref={glowCanvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ filter: "blur(40px)" }}
      />
    </div>
  );
};
