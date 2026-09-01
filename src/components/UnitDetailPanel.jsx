import React, { useState } from "react";
import { CATEGORIES, formatDateTime, categoryProgress, findUnitFloorPlan } from "../data.js";
import { Icon, EmptyState, CategoryTag, StatusBadge } from "./UI.jsx";
import DrawingPin from "./DrawingPin.jsx";

const BAR_COLOR = {
  미시작: "var(--line-strong)",
  대기: "var(--pending)",
  승인: "var(--pass)",
  반려: "var(--fail)",
};

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

  const unitInspections = inspections.filter((i) => i.buildingId === buildingId && String(i.floor) === String(floor) && i.unit === unit);

  const notes = unitNotes
    .filter((n) => n.buildingId === buildingId && String(n.floor) === String(floor) && n.unit === unit)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const pins = unitInspections
    .filter((i) => i.pin)
    .map((i) => ({
      x: i.pin.x,
      y: i.pin.y,
      color: i.status === "승인" ? "#276b45" : i.status === "반려" ? "#a6392a" : "#a8730f",
    }));

  async function handleAddNote(e) {
    e.preventDefault();
    if (!noteText.trim() || !buildingId) return;
    setBusy(true);
    try {
      await onCreateNote({ buildingId, floor, unit, text: noteText.trim() });
      setNoteText("");
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
        return (
          <div key={c.id} style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <CategoryTag category={c} />
              <StatusBadge status={prog.status} />
            </div>
            <div className="bar-track">
              <div className="bar-fill" style={{ width: `${prog.percent}%`, background: BAR_COLOR[prog.status] }} />
            </div>
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
        <button className="btn btn-primary btn-sm" style={{ marginTop: 8 }} disabled={busy || !noteText.trim()}>
          등록
        </button>
      </form>
      {notes.length === 0 ? (
        <div style={{ fontSize: 12.5, color: "var(--ink-faint)" }}>등록된 특이사항이 없습니다.</div>
      ) : (
        notes.map((n) => (
          <div key={n.id} style={{ display: "flex", gap: 8, padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
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
        <span className="eyebrow">검측 위치 {pins.length}건 표시</span>
      </div>
      <DrawingPin pins={pins} dxfData={findUnitFloorPlan(unitFloorPlans, buildingId, unit)} />
      <div style={{ marginTop: 12, fontSize: 11.5, color: "var(--ink-faint)", display: "flex", gap: 14, flexWrap: "wrap" }}>
        <span><span style={{ color: "#276b45" }}>●</span> 승인</span>
        <span><span style={{ color: "#a6392a" }}>●</span> 반려(NCR)</span>
        <span><span style={{ color: "#a8730f" }}>●</span> 대기중</span>
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
