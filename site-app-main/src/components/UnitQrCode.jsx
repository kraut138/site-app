import React, { useEffect, useState } from "react";
import QRCode from "qrcode";
import { buildUnitDeepLink } from "../qr.js";

/**
 * 동/층/호에 해당하는 QR 코드를 생성해 보여준다. 스캔하면 이 호실의
 * "호실 정보" 화면으로 바로 이동하는 링크가 담겨 있다.
 * props: buildingId, buildingName, floor, unit, size(px, 기본 132)
 */
export default function UnitQrCode({ buildingId, buildingName, floor, unit, size = 132 }) {
  const [dataUrl, setDataUrl] = useState(null);
  const [error, setError] = useState(false);
  const link = buildUnitDeepLink(buildingId, floor, unit);

  useEffect(() => {
    let alive = true;
    setDataUrl(null);
    setError(false);
    QRCode.toDataURL(link, { width: size * 2, margin: 1, color: { dark: "#17456f", light: "#ffffff" } })
      .then((url) => alive && setDataUrl(url))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [link, size]);

  function download() {
    if (!dataUrl) return;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `QR_${buildingName}_${floor}층_${unit}호.png`;
    a.click();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <div
        style={{
          width: size,
          height: size,
          border: "1px solid var(--line)",
          borderRadius: "var(--radius-s)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#fff",
          overflow: "hidden",
        }}
      >
        {error ? (
          <span style={{ fontSize: 11, color: "var(--fail)", padding: 8, textAlign: "center" }}>생성 실패</span>
        ) : dataUrl ? (
          <img src={dataUrl} alt={`${buildingName} ${floor}층 ${unit}호 QR코드`} width={size} height={size} />
        ) : (
          <span style={{ fontSize: 11, color: "var(--ink-faint)" }}>생성 중…</span>
        )}
      </div>
      <div className="mono" style={{ fontSize: 11.5, fontWeight: 700, color: "var(--ink-soft)" }}>
        {floor}층 {unit}호
      </div>
      {dataUrl && (
        <button type="button" className="btn btn-ghost btn-sm" style={{ padding: "4px 8px", fontSize: 11 }} onClick={download}>
          다운로드
        </button>
      )}
    </div>
  );
}
