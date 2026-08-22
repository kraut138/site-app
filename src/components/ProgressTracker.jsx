import React, { useState } from "react";
import { CATEGORIES, itemsForCategory, ROLES } from "../data.js";
import { Icon } from "./UI.jsx";

const VISIBLE_CATEGORIES = CATEGORIES.filter((c) => c.id !== "safety");
const STATUSES = ["착수", "진행중", "완료"];
const STATUS_COLOR = { 착수: "var(--pending)", 진행중: "#3e7cb1", 완료: "var(--pass)" };

export default function ProgressTracker({ role, buildings, items, progress, onSetStatus, onClearStatus, notify }) {
  const [buildingId, setBuildingId] = useState(buildings[0]?.id || "");
  const [openId, setOpenId] = useState(VISIBLE_CATEGORIES[0].id);
  const [busyKey, setBusyKey] = useState(null);
  const canEdit = role === ROLES.SUB;

  function statusFor(itemId) {
    const rec = progress.find((p) => p.buildingId === buildingId && p.itemId === itemId);
    return rec ? rec.status : "미착수";
  }

  async function handleSetStatus(item, status) {
    const key = `${buildingId}_${item.id}`;
    setBusyKey(key);
    try {
      const current = statusFor(item.id);
      if (current === status) {
        await onClearStatus(buildingId, item.id);
        notify("진행 상태를 초기화했습니다.");
      } else {
        await onSetStatus(buildingId, item.id, item.categoryId, status);
        notify(`"${item.text}" 상태를 "${status}"(으)로 표시했습니다.`);
      }
    } finally {
      setBusyKey(null);
    }
  }

  if (buildings.length === 0) {
    return (
      <div className="card">
        <div style={{ padding: 20, fontSize: 12.5, color: "var(--ink-faint)" }}>먼저 동 관리 탭에서 동을 등록해주세요.</div>
      </div>
    );
  }

  return (
    <div>
      <div className="field" style={{ maxWidth: 260, marginBottom: 18 }}>
        <label>동 선택</label>
        <select className="input" value={buildingId} onChange={(e) => setBuildingId(e.target.value)}>
          {buildings.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-3" style={{ marginBottom: 22 }}>
        {VISIBLE_CATEGORIES.map((c) => {
          const catItems = itemsForCategory(items, c.id);
          const doneCount = catItems.filter((it) => statusFor(it.id) === "완료").length;
          return (
            <button
              key={c.id}
              onClick={() => setOpenId(c.id)}
              className="card"
              style={{
                padding: "16px 16px",
                textAlign: "left",
                cursor: "pointer",
                borderColor: openId === c.id ? c.color : undefined,
                borderWidth: openId === c.id ? 2 : 1,
                boxShadow: openId === c.id ? `0 0 0 3px ${c.color}22` : undefined,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ width: 9, height: 9, borderRadius: 3, background: c.color, display: "inline-block" }} />
                <span className="eyebrow">{catItems.length}개 항목 중 {doneCount}개 완료</span>
              </div>
              <div style={{ fontSize: 15.5, fontWeight: 700 }}>{c.name}</div>
            </button>
          );
        })}
      </div>

      {VISIBLE_CATEGORIES.filter((c) => c.id === openId).map((c) => {
        const catItems = itemsForCategory(items, c.id);
        return (
          <div className="card card-pad" key={c.id}>
            <div className="section-head">
              <div className="section-title">
                <span style={{ width: 10, height: 10, borderRadius: 3, background: c.color, display: "inline-block" }} />
                {c.name} 진행 현황
              </div>
              <span className="eyebrow mono">{buildings.find((b) => b.id === buildingId)?.name}</span>
            </div>
            {catItems.length === 0 ? (
              <div style={{ fontSize: 12.5, color: "var(--ink-faint)", padding: "10px 4px" }}>등록된 항목이 없습니다.</div>
            ) : (
              catItems.map((item) => {
                const status = statusFor(item.id);
                const key = `${buildingId}_${item.id}`;
                return (
                  <div
                    key={item.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "10px 4px",
                      borderBottom: "1px solid var(--line)",
                      flexWrap: "wrap",
                    }}
                  >
                    <span style={{ fontSize: 13.5, flex: 1, minWidth: 180 }}>{item.text}</span>
                    <span
                      style={{
                        fontSize: 11.5,
                        fontWeight: 700,
                        color: status === "미착수" ? "var(--ink-faint)" : STATUS_COLOR[status],
                        minWidth: 40,
                      }}
                    >
                      {status}
                    </span>
                    {canEdit ? (
                      <div style={{ display: "flex", gap: 5 }}>
                        {STATUSES.map((s) => (
                          <button
                            key={s}
                            type="button"
                            disabled={busyKey === key}
                            onClick={() => handleSetStatus(item, s)}
                            className={`unit-picker-btn${status === s ? " active" : ""}`}
                            style={{ padding: "5px 10px", fontSize: 11.5 }}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        );
      })}

      <div style={{ marginTop: 18, display: "flex", gap: 8, alignItems: "flex-start", color: "var(--ink-soft)", fontSize: 12.5 }}>
        <Icon.Bell width="15" height="15" style={{ flexShrink: 0, marginTop: 1 }} />
        <span>
          여기서 표시하는 진행 단계는 하도급사가 스스로 기록하는 참고용 현황이며, 감리단의 정식 승인 절차(감리검측 탭)와는 별개입니다.
          {canEdit ? " 같은 단계를 다시 누르면 표시가 취소됩니다." : " 감리단/소장은 조회만 가능합니다."}
        </span>
      </div>
    </div>
  );
}
