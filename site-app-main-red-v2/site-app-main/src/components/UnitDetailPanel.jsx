import React, { useState } from "react";
import { CATEGORIES, formatDateTime, categoryProgress, itemsForCategory, itemStatusForUnit, findUnitFloorPlan } from "../data.js";
import { Icon, EmptyState, CategoryTag, StatusBadge } from "./UI.jsx";
import DrawingPin from "./DrawingPin.jsx";

const BAR_COLOR = {
  미시작: "var(--line-strong)",
  대기: "var(--pending)",
  승인: "var(--pass)",
  반려: "var(--fail)",
};

// 특이사항에 핀을 찍을 때 순서대로 돌려 쓰는 색상 팔레트 - 핀과 그 메모의 테두리가 항상 같은 색이 되도록,
// 메모 생성 시점에 색을 하나 배정해서 저장해둔다(나중에 다른 메모가 지워져도 색이 안 바뀌게).
const NOTE_PIN_PALETTE = ["#c0392b", "#8e44ad", "#2166ac", "#158a72", "#b8860b", "#5b6b74", "#c2185b", "#1f6f3f"];

function ItemStatusIcon({ status }) {
  if (status === "승인") {
    return (
      <span style={{ color: "var(--pass)", flexShrink: 0, display: "flex" }}>
        <Icon.Check width="14" height="14" />
      </span>
    );
  }
  if (status === "대기") {
    return <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--pending)", flexShrink: 0 }} />;
  }
  if (status === "반려") {
    return (
      <span style={{ color: "var(--fail)", flexShrink: 0, display: "flex" }}>
        <Icon.Close width="12" height="12" />
      </span>
    );
  }
  return <span style={{ width: 8, height: 8, borderRadius: "50%", border: "1.5px solid var(--line-strong)", flexShrink: 0 }} />;
}

/**
 * 호실 하나의 상세 정보(공종별 진행도 / 특이사항 / 평면도)를 보여주는 공용 패널.
 * props:
 * - building, buildingId, floor, unit
 * - inspections, checklistItems, unitNotes, unitFloorPlans
 * - onCreateNote, onDeleteNote, notify
 * - layout: "split"(기본, 좌우 2열) | "stacked"(세로로 순서대로, 모바일 화면용)
 */
export default function UnitDetailPanel({
  building,
  buildingId,
  floor,
  unit,
  inspections,
  checklistItems,
  unitNotes,
  unitFloorPlans,
  onCreateNote,
  onDeleteNote,
  notify,
  layout = "split",
}) {
  const [noteText, setNoteText] = useState("");
  const [busy, setBusy] = useState(false);
  const [addingPin, setAddingPin] = useState(false);
  const [draftPin, setDraftPin] = useState(null);

  const unitInspections = inspections.filter((i) => i.buildingId === buildingId && String(i.floor) === String(floor) && i.unit === unit);

  const notes = unitNotes
    .filter((n) => n.buildingId === buildingId && String(n.floor) === String(floor) && n.unit === unit)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const notesWithPin = notes.filter((n) => n.pin);
  const nextPinColor = NOTE_PIN_PALETTE[notesWithPin.length % NOTE_PIN_PALETTE.length];

  const inspectionPins = unitInspections
    .filter((i) => i.pin)
    .map((i) => ({
      x: i.pin.x,
      y: i.pin.y,
      color: i.status === "승인" ? "#276b45" : i.status === "반려" ? "#a6392a" : "#a8730f",
    }));
  const notePins = notesWithPin.map((n) => ({ x: n.pin.x, y: n.pin.y, color: n.pinColor || "#17456f" }));
  const allPins = [...inspectionPins, ...notePins];

  function startAddingPin() {
    setAddingPin(true);
    setDraftPin(null);
  }

  function cancelAddingPin() {
    setAddingPin(false);
    setDraftPin(null);
  }

  async function handleAddNote(e) {
    e.preventDefault();
    if (!noteText.trim() || !buildingId) return;
    setBusy(true);
    try {
      const payload = { buildingId, floor, unit, text: noteText.trim() };
      if (draftPin) {
        payload.pin = draftPin;
        payload.pinColor = nextPinColor;
      }
      await onCreateNote(payload);
      setNoteText("");
      setAddingPin(false);
      setDraftPin(null);
      notify("특이사항이 등록되었습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteNote(id) {
    setBusy(true);
    try {
      await onDeleteNote(id);
      notify("특이사항을 삭제했습니다.");
    } finally {
      setBusy(false);
    }
  }

  const progressCard = (
    <div className="card card-pad" style={{ marginBottom: 16 }}>
      <div className="section-head">
        <div className="section-title">
          {building ? building.name : ""} {floor}층 {unit}호 · 공종별 진행도
        </div>
      </div>
      {CATEGORIES.map((c) => {
        const prog = categoryProgress(inspections, checklistItems, buildingId, floor, unit, c.id);
        const items = itemsForCategory(checklistItems, c.id);
        return (
          <div key={c.id} style={{ marginBottom: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <CategoryTag category={c} />
              <StatusBadge status={prog.status} />
            </div>
            <div className="bar-track" style={{ marginBottom: 10 }}>
              <div className="bar-fill" style={{ width: `${prog.percent}%`, background: BAR_COLOR[prog.status] }} />
            </div>
            {items.length === 0 ? (
              <div style={{ fontSize: 11.5, color: "var(--ink-faint)" }}>등록된 세부 항목이 없습니다.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingLeft: 2 }}>
                {items.map((item) => {
                  const st = itemStatusForUnit(inspections, buildingId, floor, unit, item.id);
                  return (
                    <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <ItemStatusIcon status={st} />
                      <span
                        style={{
                          fontSize: 12.5,
                          color: st === "승인" ? "var(--ink)" : "var(--ink-soft)",
                          textDecoration: st === "승인" ? "none" : "none",
                        }}
                      >
                        {item.text}
                      </span>
                      {st === "반려" && <span style={{ fontSize: 10.5, color: "var(--fail)", fontWeight: 700 }}>반려</span>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  const notesCard = (
    <div className="card card-pad" style={{ marginBottom: layout === "stacked" ? 16 : 0 }}>
      <div className="section-head">
        <div className="section-title">특이사항</div>
        <span className="eyebrow">{notes.length}건</span>
      </div>
      <form onSubmit={handleAddNote} style={{ marginBottom: 14 }}>
        <textarea
          className="input"
          placeholder="이 호실에 대한 특이사항을 입력하세요"
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          style={{ minHeight: 60 }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          <button className="btn btn-primary btn-sm" disabled={busy || !noteText.trim()}>
            등록
          </button>
          {!addingPin ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={startAddingPin}>
              <Icon.Pin width="13" height="13" />
              도면에 위치 표시
            </button>
          ) : (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5 }}>
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: draftPin ? nextPinColor : "transparent",
                  border: `1.5px solid ${nextPinColor}`,
                }}
              />
              {draftPin ? "위치가 지정됐어요" : "아래 도면을 클릭해 위치를 지정하세요"}
              <button type="button" className="btn btn-ghost btn-sm" style={{ padding: "3px 8px" }} onClick={cancelAddingPin}>
                취소
              </button>
            </span>
          )}
        </div>
      </form>
      {notes.length === 0 ? (
        <div style={{ fontSize: 12.5, color: "var(--ink-faint)" }}>등록된 특이사항이 없습니다.</div>
      ) : (
        notes.map((n) => (
          <div
            key={n.id}
            style={{
              display: "flex",
              gap: 8,
              padding: "10px 10px 10px 12px",
              marginBottom: 6,
              borderRadius: "var(--radius-s)",
              borderLeft: n.pinColor ? `3px solid ${n.pinColor}` : "3px solid transparent",
              background: n.pinColor ? "var(--surface-alt)" : "transparent",
            }}
          >
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 4 }}>{n.text}</div>
              <div style={{ fontSize: 11, color: "var(--ink-faint)" }}>
                {n.author} · {formatDateTime(n.createdAt)}
              </div>
            </div>
            <button
              className="btn btn-ghost btn-sm"
              style={{ padding: 6, flexShrink: 0, height: "fit-content" }}
              disabled={busy}
              onClick={() => handleDeleteNote(n.id)}
              aria-label="삭제"
            >
              <Icon.Trash width="13" height="13" />
            </button>
          </div>
        ))
      )}
    </div>
  );

  const planCard = (
    <div className="card card-pad">
      <div className="section-head">
        <div className="section-title">호실 평면도</div>
        <span className="eyebrow">{addingPin ? "특이사항 위치 지정 중" : `검측 위치 ${allPins.length}건 표시`}</span>
      </div>
      <DrawingPin
        pins={allPins}
        pin={addingPin ? draftPin : null}
        pinColor={nextPinColor}
        onPin={addingPin ? setDraftPin : undefined}
        dxfData={findUnitFloorPlan(unitFloorPlans, buildingId, unit)}
      />
      <div style={{ marginTop: 12, fontSize: 11.5, color: "var(--ink-faint)", display: "flex", gap: 14, flexWrap: "wrap" }}>
        <span><span style={{ color: "#276b45" }}>●</span> 승인</span>
        <span><span style={{ color: "#a6392a" }}>●</span> 반려(NCR)</span>
        <span><span style={{ color: "#a8730f" }}>●</span> 대기중</span>
        {notesWithPin.length > 0 && <span>◆ 색이 있는 점은 특이사항 메모 위치(메모와 같은 색)</span>}
      </div>
    </div>
  );

  if (layout === "stacked") {
    return (
      <div>
        {progressCard}
        {notesCard}
        {planCard}
      </div>
    );
  }

  return (
    <div className="grid grid-2" style={{ alignItems: "start" }}>
      <div>
        {progressCard}
        {notesCard}
      </div>
      {planCard}
    </div>
  );
}
