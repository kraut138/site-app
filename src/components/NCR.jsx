import React, { useState } from "react";
import { getCategory, formatDateTime, ROLES, NCR_STATUSES } from "../data.js";
import { compressImage } from "../api.js";
import { Icon, StatusBadge, CategoryTag, Modal } from "./UI.jsx";
import DrawingPin from "./DrawingPin.jsx";

const COLUMN_HINT = {
  발생: "감리단 반려로 새로 발행된 건",
  조치중: "하도급사가 시정 조치 진행 중",
  재검측요청: "조치 완료, 감리단 재검측 대기",
  완료: "재검측 승인 완료",
};

export default function NCR({ role, buildings, ncrs, onUpdateStatus, notify }) {
  const [selectedId, setSelectedId] = useState(null);
  const selected = ncrs.find((n) => n.id === selectedId) || null;

  const sorted = [...ncrs].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return (
    <div>
      <div className="grid" style={{ gridTemplateColumns: "repeat(4, 1fr)", alignItems: "start" }}>
        {NCR_STATUSES.map((status) => {
          const items = sorted.filter((n) => n.status === status);
          return (
            <div key={status}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, padding: "0 2px" }}>
                <span className={`badge badge-${status}`}>{status}</span>
                <span className="mono" style={{ fontSize: 11.5, color: "var(--ink-faint)" }}>{items.length}건</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 60 }}>
                {items.length === 0 && (
                  <div style={{ fontSize: 11.5, color: "var(--ink-faint)", padding: "10px 4px" }}>{COLUMN_HINT[status]}</div>
                )}
                {items.map((ncr) => {
                  const cat = getCategory(ncr.categoryId);
                  const building = buildings.find((b) => b.id === ncr.buildingId);
                  return (
                    <button key={ncr.id} className="card" style={{ textAlign: "left", padding: "12px 13px", cursor: "pointer" }} onClick={() => setSelectedId(ncr.id)}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <CategoryTag category={cat} />
                      </div>
                      <div className="mono" style={{ fontSize: 11, color: "var(--ink-soft)", marginBottom: 4 }}>
                        {building ? building.name : "-"} {ncr.floor}층{ncr.unit ? ` ${ncr.unit}호` : ""}
                      </div>
                      <div style={{ fontSize: 12.5, lineHeight: 1.4, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                        {ncr.description}
                      </div>
                      <div style={{ fontSize: 10.5, color: "var(--ink-faint)", marginTop: 7 }}>{formatDateTime(ncr.createdAt)}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {selected && (
        <NCRDetail
          ncr={selected}
          building={buildings.find((b) => b.id === selected.buildingId)}
          role={role}
          onClose={() => setSelectedId(null)}
          onAdvance={async (status, extra) => {
            await onUpdateStatus(selected.id, { status, ...extra });
            notify(`NCR 상태가 "${status}"(으)로 변경되었습니다.`);
          }}
        />
      )}
    </div>
  );
}

function NCRDetail({ ncr, building, role, onClose, onAdvance }) {
  const category = getCategory(ncr.categoryId);
  const [comment, setComment] = useState("");
  const [actionPhotos, setActionPhotos] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handlePhotoAdd(e) {
    const files = Array.from(e.target.files || []).slice(0, 3 - actionPhotos.length);
    for (const f of files) {
      try {
        const dataUrl = await compressImage(f);
        setActionPhotos((prev) => [...prev, dataUrl].slice(0, 3));
      } catch (err) {
        setError(err.message);
      }
    }
    e.target.value = "";
  }

  async function advance(status, extra = {}) {
    setBusy(true);
    setError("");
    try {
      await onAdvance(status, { by: role, comment, ...extra });
      setBusy(false);
      setComment("");
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Modal title="NCR 상세" onClose={onClose} width="680px">
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <CategoryTag category={category} />
        <StatusBadge status={ncr.status} />
        <span className="mono" style={{ fontSize: 12, color: "var(--ink-soft)" }}>
          {building ? building.name : "-"} {ncr.floor}층{ncr.unit ? ` ${ncr.unit}호` : ""}
        </span>
      </div>

      <NCRStepper status={ncr.status} />

      <div className="grid grid-2" style={{ marginTop: 16 }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 8 }}>부적합 내용</div>
          <div style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 14 }}>{ncr.description}</div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>담당</div>
          <div style={{ fontSize: 12.8, color: "var(--ink-soft)" }}>{ncr.assignedTo}</div>
        </div>
        <div>
          <div className="eyebrow" style={{ marginBottom: 8 }}>도면 위치</div>
          {ncr.pin ? <DrawingPin pin={ncr.pin} pinColor="var(--fail)" /> : <div style={{ fontSize: 12.5, color: "var(--ink-faint)" }}>지정된 위치 없음</div>}
        </div>
      </div>

      {ncr.photos && ncr.photos.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>부적합 사진</div>
          <div className="photo-row">
            {ncr.photos.map((p, i) => (
              <div className="photo-thumb" key={i} style={{ width: 88, height: 88 }}>
                <img src={p} alt={`부적합사진 ${i + 1}`} />
              </div>
            ))}
          </div>
        </div>
      )}

      {ncr.actionPhotos && ncr.actionPhotos.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>조치 완료 사진</div>
          <div className="photo-row">
            {ncr.actionPhotos.map((p, i) => (
              <div className="photo-thumb" key={i} style={{ width: 88, height: 88 }}>
                <img src={p} alt={`조치사진 ${i + 1}`} />
              </div>
            ))}
          </div>
        </div>
      )}

      {ncr.history && ncr.history.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>처리 이력</div>
          {ncr.history.map((h, i) => (
            <div key={i} style={{ display: "flex", gap: 10, fontSize: 12.3, color: "var(--ink-soft)", padding: "5px 0", borderBottom: i < ncr.history.length - 1 ? "1px solid var(--line)" : "none" }}>
              <span className="mono" style={{ color: "var(--ink-faint)", minWidth: 108 }}>{formatDateTime(h.at)}</span>
              <span style={{ fontWeight: 600 }}>{h.action}</span>
              {h.comment && <span style={{ color: "var(--ink-faint)" }}>— {h.comment}</span>}
            </div>
          ))}
        </div>
      )}

      {error && <div style={{ color: "var(--fail)", fontSize: 12.5, margin: "14px 0 0" }}>{error}</div>}

      {role === ROLES.SUB && ncr.status === "발생" && (
        <div style={{ marginTop: 18, paddingTop: 18, borderTop: "1px solid var(--line)" }}>
          <button className="btn btn-primary btn-block" disabled={busy} onClick={() => advance("조치중")}>
            {busy ? "처리 중…" : "조치 시작"}
          </button>
        </div>
      )}

      {role === ROLES.SUB && ncr.status === "조치중" && (
        <div style={{ marginTop: 18, paddingTop: 18, borderTop: "1px solid var(--line)" }}>
          <div className="field">
            <label>조치 완료 사진 (선택)</label>
            <div className="photo-row">
              {actionPhotos.map((p, i) => (
                <div className="photo-thumb" key={i}>
                  <img src={p} alt={`조치사진 ${i + 1}`} />
                  <button type="button" className="rm" onClick={() => setActionPhotos(actionPhotos.filter((_, idx) => idx !== i))}>✕</button>
                </div>
              ))}
              {actionPhotos.length < 3 && (
                <label className="photo-add">
                  <Icon.Camera width="20" height="20" />
                  <input type="file" accept="image/*" multiple hidden onChange={handlePhotoAdd} />
                </label>
              )}
            </div>
          </div>
          <div className="field">
            <label>조치 내용 메모</label>
            <textarea className="input" placeholder="예: 철근 이격거리 재조정 및 결속 완료" value={comment} onChange={(e) => setComment(e.target.value)} />
          </div>
          <button className="btn btn-primary btn-block" disabled={busy} onClick={() => advance("재검측요청", { photos: actionPhotos })}>
            {busy ? "처리 중…" : "재검측 요청"}
          </button>
        </div>
      )}

      {role === ROLES.SUPER && ncr.status === "재검측요청" && (
        <div style={{ marginTop: 18, paddingTop: 18, borderTop: "1px solid var(--line)" }}>
          <div className="field">
            <label>재검측 의견 (반려 시 필수)</label>
            <textarea className="input" placeholder="재검측 결과를 입력하세요" value={comment} onChange={(e) => setComment(e.target.value)} />
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn btn-pass" style={{ flex: 1 }} disabled={busy} onClick={() => advance("완료")}>
              <Icon.Check width="15" height="15" /> 재검측 승인
            </button>
            <button
              className="btn btn-fail"
              style={{ flex: 1 }}
              disabled={busy}
              onClick={() => {
                if (!comment.trim()) {
                  setError("반려 사유를 입력해주세요.");
                  return;
                }
                advance("조치중");
              }}
            >
              <Icon.Close width="14" height="14" /> 재검측 반려
            </button>
          </div>
        </div>
      )}

      {ncr.status === "완료" && (
        <div style={{ marginTop: 18, paddingTop: 18, borderTop: "1px solid var(--line)", textAlign: "center", color: "var(--pass)", fontWeight: 600, fontSize: 13 }}>
          <Icon.Check width="16" height="16" style={{ verticalAlign: -3, marginRight: 5 }} />
          재검측 승인 완료된 항목입니다
        </div>
      )}
    </Modal>
  );
}

function NCRStepper({ status }) {
  const idx = NCR_STATUSES.indexOf(status);
  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      {NCR_STATUSES.map((s, i) => (
        <React.Fragment key={s}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
            <div
              style={{
                width: 22,
                height: 22,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 10.5,
                fontFamily: "var(--font-mono)",
                fontWeight: 700,
                background: i <= idx ? "var(--blueprint)" : "var(--surface-alt)",
                color: i <= idx ? "#fff" : "var(--ink-faint)",
              }}
            >
              {i + 1}
            </div>
            <span style={{ fontSize: 10.5, color: i <= idx ? "var(--ink)" : "var(--ink-faint)", fontWeight: i === idx ? 700 : 500, whiteSpace: "nowrap" }}>{s}</span>
          </div>
          {i < NCR_STATUSES.length - 1 && (
            <div style={{ flex: 1, height: 2, background: i < idx ? "var(--blueprint)" : "var(--surface-alt)", margin: "0 4px 18px" }} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}
