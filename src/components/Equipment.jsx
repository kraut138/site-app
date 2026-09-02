import React, { useState } from "react";
import { compressImage } from "../api.js";
import { formatDateTime } from "../data.js";
import { Icon, StatusBadge, EmptyState } from "./UI.jsx";

export default function Equipment({ equipment, onCreateEquipment, notify }) {
  const [companyName, setCompanyName] = useState("");
  const [registrantName, setRegistrantName] = useState("");
  const [equipmentName, setEquipmentName] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleImageChange(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    try {
      const dataUrl = await compressImage(file);
      setImageDataUrl(dataUrl);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!companyName.trim() || !registrantName.trim() || !equipmentName.trim()) {
      setError("건설사명, 등록자명, 장비명은 모두 필수입니다.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onCreateEquipment({
        companyName: companyName.trim(),
        registrantName: registrantName.trim(),
        equipmentName: equipmentName.trim(),
        imageDataUrl,
      });
      setCompanyName("");
      setRegistrantName("");
      setEquipmentName("");
      setImageDataUrl(null);
      notify("건설기계 등록을 요청했습니다. 감리단 승인 후 최종 등록됩니다.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const sorted = [...equipment].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return (
    <div>
      <div className="card card-pad" style={{ marginBottom: 20 }}>
        <div className="section-title" style={{ marginBottom: 14 }}>건설기계 등록</div>
        <form onSubmit={handleSubmit}>
          <div className="field-row">
            <div className="field">
              <label>건설사명</label>
              <input className="input" placeholder="예: 대한중장비" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
            </div>
            <div className="field">
              <label>등록자명</label>
              <input className="input" placeholder="예: 김철수" value={registrantName} onChange={(e) => setRegistrantName(e.target.value)} />
            </div>
          </div>

          <div className="field">
            <label>건설기계명</label>
            <input className="input" placeholder="예: 굴삭기 0.7㎥, 타워크레인 등" value={equipmentName} onChange={(e) => setEquipmentName(e.target.value)} />
          </div>

          <div className="field">
            <label>기계 사진</label>
            {imageDataUrl ? (
              <div className="photo-thumb" style={{ width: 120, height: 120 }}>
                <img src={imageDataUrl} alt="건설기계 사진" />
                <button type="button" className="rm" onClick={() => setImageDataUrl(null)}>
                  ✕
                </button>
              </div>
            ) : (
              <label className="photo-add" style={{ width: 120, height: 120 }}>
                <Icon.Camera width="24" height="24" />
                <input type="file" accept="image/*" hidden onChange={handleImageChange} />
              </label>
            )}
          </div>

          {error && <div style={{ color: "var(--fail)", fontSize: 12.5, marginBottom: 12 }}>{error}</div>}

          <button className="btn btn-primary btn-block" disabled={busy}>
            {busy ? "등록 중…" : "건설기계 등록 요청"}
          </button>
        </form>
      </div>

      <div className="card">
        <div style={{ padding: "16px 20px 4px" }}>
          <div className="section-title">등록 현황</div>
          <div style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: 4 }}>감리단 승인이 완료되어야 최종 등록됩니다.</div>
        </div>
        {sorted.length === 0 ? (
          <EmptyState message="등록된 건설기계가 없습니다." />
        ) : (
          sorted.map((eq) => (
            <div className="list-row" key={eq.id} style={{ cursor: "default" }}>
              {eq.imageDataUrl ? (
                <img src={eq.imageDataUrl} alt={eq.equipmentName} style={{ width: 40, height: 40, borderRadius: "var(--radius-s)", objectFit: "cover", flexShrink: 0 }} />
              ) : (
                <span style={{ width: 40, height: 40, borderRadius: "var(--radius-s)", background: "var(--surface-alt)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Icon.Excavator width="18" height="18" style={{ color: "var(--ink-faint)" }} />
                </span>
              )}
              <span className="loc">{eq.companyName}</span>
              <div className="grow">
                <div className="title">{eq.equipmentName}</div>
                <div className="meta">{eq.registrantName} · {formatDateTime(eq.createdAt)}</div>
              </div>
              <StatusBadge status={eq.status} />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
