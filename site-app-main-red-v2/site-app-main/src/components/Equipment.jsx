import React, { useState } from "react";
import { compressImage } from "../api.js";
import { formatDateTime } from "../data.js";
import { Icon, StatusBadge, EmptyState } from "./UI.jsx";
import { useLanguage } from "../LanguageContext.jsx";

export default function Equipment({ equipment, onCreateEquipment, notify }) {
  const { t } = useLanguage();
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
      setError(t("equipment.validationError"));
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
      notify(t("equipment.success"));
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
        <div className="section-title" style={{ marginBottom: 14 }}>{t("equipment.title")}</div>
        <form onSubmit={handleSubmit}>
          <div className="field-row">
            <div className="field">
              <label>{t("equipment.companyName")}</label>
              <input className="input" placeholder={t("equipment.companyPlaceholder")} value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
            </div>
            <div className="field">
              <label>{t("equipment.registrantName")}</label>
              <input className="input" placeholder={t("equipment.registrantPlaceholder")} value={registrantName} onChange={(e) => setRegistrantName(e.target.value)} />
            </div>
          </div>

          <div className="field">
            <label>{t("equipment.equipmentName")}</label>
            <input className="input" placeholder={t("equipment.equipmentPlaceholder")} value={equipmentName} onChange={(e) => setEquipmentName(e.target.value)} />
          </div>

          <div className="field">
            <label>{t("equipment.photo")}</label>
            {imageDataUrl ? (
              <div className="photo-thumb" style={{ width: 120, height: 120 }}>
                <img src={imageDataUrl} alt={t("equipment.photoAlt")} />
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
            {busy ? t("equipment.registering") : t("equipment.submit")}
          </button>
        </form>
      </div>

      <div className="card">
        <div style={{ padding: "16px 20px 4px" }}>
          <div className="section-title">{t("equipment.status")}</div>
          <div style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: 4 }}>{t("equipment.statusDesc")}</div>
        </div>
        {sorted.length === 0 ? (
          <EmptyState message={t("equipment.empty")} />
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
