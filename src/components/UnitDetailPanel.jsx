import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { CATEGORIES, getCategory, formatDateTime, categoryProgress, itemsForCategory, itemStatusForUnit, findUnitFloorPlan } from "../data.js";
import { Icon, EmptyState, CategoryTag, StatusBadge } from "./UI.jsx";
import DrawingPin from "./DrawingPin.jsx";
import * as api from "../api.js";
import { progressForUnit } from "../unitProgress.js";

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

// ---------------- 음성 보고로 읽은 진행도 ----------------
// 하도급사가 "301호 도배 완료"처럼 말해 남긴 음성 보고(voiceReports)에서 호실별·항목별 진행 상황을 자동으로 읽어 보여 준다.
// 감리 승인으로 계산하는 위쪽 진행도와는 따로 보여 주는 '음성 보고' 층이다. 진행도는 저장해 두지 않고 보고에 저장된 글에서 그때그때 계산한다.
// 한 층의 보고를 한 번 읽어 그 층의 모든 호실이 함께 쓰고(1분 동안 기억), 새로고침 버튼으로 다시 읽을 수 있다.

const VOICE_CACHE_MS = 60 * 1000;
const EFFECT_PAGE = 5;

function useFloorVoiceReports(buildingId, floor) {
  const key = `${buildingId}|${floor}`;
  const [state, setState] = useState({ status: "loading", list: [], key });
  const cache = useRef(new Map());
  const seq = useRef(0);

  const load = useCallback(
    async (force) => {
      if (!buildingId || !Number.isInteger(Number(floor))) {
        setState({ status: "ready", list: [], key });
        return;
      }
      const hit = cache.current.get(key);
      if (!force && hit && Date.now() - hit.at < VOICE_CACHE_MS) {
        setState({ status: "ready", list: hit.list, key });
        return;
      }
      const my = ++seq.current;
      setState((prev) => ({ status: "loading", list: prev.key === key ? prev.list : [], key }));
      try {
        const list = await api.fetchFloorVoiceReports(buildingId, floor);
        if (seq.current !== my) return; // 그 사이 다른 층으로 바꿨거나 화면이 닫혔으면 버린다
        cache.current.set(key, { list, at: Date.now() });
        setState({ status: "ready", list, key });
      } catch {
        if (seq.current !== my) return;
        setState((prev) => ({ status: "error", list: prev.key === key ? prev.list : [], key }));
      }
    },
    [buildingId, floor, key]
  );

  useEffect(() => {
    load(false);
    return () => {
      seq.current += 1;
    };
  }, [load]);

  // 관리자가 보고를 제외/복구하면 기억해 둔 목록에도 바로 반영한다(1분 안에 다른 호실로 옮겨 가도 같은 상태가 보이도록).
  const patch = useCallback((id, fields) => {
    cache.current.forEach((entry) => {
      entry.list = entry.list.map((r) => (r.id === id ? { ...r, ...fields } : r));
    });
    setState((prev) => ({ ...prev, list: prev.list.map((r) => (r.id === id ? { ...r, ...fields } : r)) }));
  }, []);

  return { status: state.key === key ? state.status : "loading", list: state.key === key ? state.list : [], reload: () => load(true), patch };
}

const STATE_LABEL = (v) => (v.state === "done" ? "완료" : `${v.percent}%`);

function VoiceChip({ value, testId }) {
  return (
    <span className={`up-chip ${value.state === "done" ? "is-done" : "is-doing"}`} data-testid={testId}>
      음성 {STATE_LABEL(value)}
    </span>
  );
}

// 보고 하나가 이 호실에 반영한 내용(어떤 항목이 완료/진행중으로 읽혔는지)
function EffectRow({ entry, effect, canEdit, busy, onToggle }) {
  const r = entry.report;
  const text = String(r.normalized || r.rawText || "");
  return (
    <div className={`up-eff${effect.off ? " is-off" : ""}`} data-testid="up-eff">
      <div className="up-eff-head">
        <strong>{r.author || "익명"}</strong>
        <time>{formatDateTime(r.createdAt)}</time>
        {effect.off && <span className="up-eff-off">진행도에서 제외됨</span>}
      </div>
      <div className="up-eff-text">“{text.length > 90 ? `${text.slice(0, 90)}…` : text}”</div>
      <div className="up-eff-chips">
        {effect.categories.map((c) => (
          <span key={c.categoryId} className="up-chip is-done">
            {(getCategory(c.categoryId) || {}).name || c.categoryId} 전체 완료
          </span>
        ))}
        {effect.items.map((i) => (
          <span key={i.itemId} className={`up-chip ${i.state === "done" ? "is-done" : "is-doing"}`}>
            {i.text} · {i.state === "done" ? "완료" : `진행중 ${i.percent}%`}
          </span>
        ))}
      </div>
      {canEdit && (
        <button type="button" className="btn btn-ghost btn-sm up-eff-toggle" disabled={busy} onClick={() => onToggle(r.id, !effect.off)} data-testid="up-eff-toggle">
          {effect.off ? "다시 반영" : "진행도에서 제외"}
        </button>
      )}
    </div>
  );
}

/**
 * 호실 하나의 상세 정보(공종별 진행도 / 특이사항 / 평면도)를 보여주는 공용 패널.
 * props:
 * - building, buildingId, floor, unit
 * - inspections, checklistItems, unitNotes, unitFloorPlans
 * - onCreateNote, onDeleteNote, notify
 * - layout: "split"(기본, 좌우 2열) | "stacked"(세로로 순서대로, 모바일 화면용)
 * - canEdit: 관리자만 true - 잘못 반영된 음성 보고를 진행도에서 제외/복구할 수 있다. userName: 그때 기록해 둘 이름.
 * - extraVoiceReports: 이 화면에서 방금 저장한 음성 보고들(저장 직후 목록을 다시 읽지 않고도 바로 진행도에 반영하려고 받는다)
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
  canEdit = false,
  userName = "",
  extraVoiceReports = [],
}) {
  const [noteText, setNoteText] = useState("");
  const [busy, setBusy] = useState(false);
  const [addingPin, setAddingPin] = useState(false);
  const [draftPin, setDraftPin] = useState(null);

  const unitInspections = inspections.filter((i) => i.buildingId === buildingId && String(i.floor) === String(floor) && i.unit === unit);

  // 음성 보고로 읽은 진행도
  const voice = useFloorVoiceReports(buildingId, floor);
  const [offMap, setOffMap] = useState({}); // 이 화면에서 제외/복구한 보고 { id: 제외 여부 }
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [effectsShown, setEffectsShown] = useState(EFFECT_PAGE);
  const unitsPerFloor = building ? building.unitsPerFloor : 0;
  const voiceProgress = useMemo(() => {
    const byId = new Map(voice.list.map((r) => [r.id, r]));
    (Array.isArray(extraVoiceReports) ? extraVoiceReports : []).forEach((r) => r && byId.set(r.id, r));
    const merged = [...byId.values()].map((r) => (Object.prototype.hasOwnProperty.call(offMap, r.id) ? { ...r, progressOff: offMap[r.id] } : r));
    return progressForUnit(merged, { buildingId, floor, unit }, checklistItems, unitsPerFloor);
  }, [voice.list, extraVoiceReports, offMap, buildingId, floor, unit, checklistItems, unitsPerFloor]);
  const voiceEffects = useMemo(() => {
    const byId = new Map(voiceProgress.entries.map((e) => [e.id, e]));
    return voiceProgress.effects
      .map((effect) => ({ effect, entry: byId.get(effect.reportId) }))
      .filter((x) => x.entry)
      .sort((a, b) => (b.entry.timestamp || 0) - (a.entry.timestamp || 0));
  }, [voiceProgress]);
  const hasVoiceProgress = CATEGORIES.some((c) => voiceProgress.byCategory[c.id].done + voiceProgress.byCategory[c.id].doing > 0);

  useEffect(() => {
    setEffectsShown(EFFECT_PAGE);
  }, [buildingId, floor, unit]);

  async function toggleVoiceReport(id, off) {
    setVoiceBusy(true);
    try {
      const fields = await api.setVoiceReportProgressOff(id, off, userName);
      voice.patch(id, fields);
      setOffMap((prev) => ({ ...prev, [id]: off }));
      notify(off ? "이 보고를 호실 진행도에서 제외했습니다." : "이 보고를 호실 진행도에 다시 반영했습니다.");
    } catch {
      notify("변경하지 못했습니다. 연결을 확인하고 다시 시도해 주세요.");
    } finally {
      setVoiceBusy(false);
    }
  }

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
      <div className="up-legend" data-testid="up-voice-legend">
        <span className="up-legend-item">
          <i className="up-dot is-approval" /> 감리 승인 기준
        </span>
        <span className="up-legend-item">
          <i className="up-dot is-voice" /> 음성 보고 기준(자동)
        </span>
        <button type="button" className="btn btn-ghost btn-sm up-voice-refresh" onClick={voice.reload} disabled={voice.status === "loading"} data-testid="up-voice-refresh">
          {voice.status === "loading" ? "읽는 중…" : "음성 새로고침"}
        </button>
      </div>
      {voice.status === "error" && (
        <div className="up-voice-note is-error" data-testid="up-voice-error">
          음성 보고를 불러오지 못했어요. 연결을 확인하고 ‘음성 새로고침’을 눌러 주세요.
        </div>
      )}
      {voice.status === "ready" && !hasVoiceProgress && (
        <div className="up-voice-note" data-testid="up-voice-empty">
          아직 음성 보고에서 읽은 진행이 없어요. 음성 검측에서 ‘도배 완료’처럼 항목과 상태를 말하면 여기에 표시돼요.
        </div>
      )}
      {CATEGORIES.map((c) => {
        const prog = categoryProgress(inspections, checklistItems, buildingId, floor, unit, c.id);
        const items = itemsForCategory(checklistItems, c.id);
        const vc = voiceProgress.byCategory[c.id];
        return (
          <div key={c.id} style={{ marginBottom: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <CategoryTag category={c} />
              <StatusBadge status={prog.status} />
            </div>
            <div className="bar-track" style={{ marginBottom: vc.done + vc.doing > 0 ? 6 : 10 }}>
              <div className="bar-fill" style={{ width: `${prog.percent}%`, background: BAR_COLOR[prog.status] }} />
            </div>
            {vc.done + vc.doing > 0 && (
              <div className="up-voice" data-testid={`up-voice-row-${c.id}`}>
                <span className="up-voice-label">음성 보고</span>
                <div className="bar-track up-voice-track">
                  <div className="bar-fill up-voice-fill" style={{ width: `${vc.percent}%` }} />
                </div>
                <span className="up-voice-pct" data-testid={`up-voice-pct-${c.id}`}>
                  {vc.percent}%
                </span>
                <span className="up-voice-count">
                  완료 {vc.done}/{vc.total}
                  {vc.doing > 0 ? ` · 진행중 ${vc.doing}` : ""}
                </span>
              </div>
            )}
            {items.length === 0 ? (
              <div style={{ fontSize: 11.5, color: "var(--ink-faint)" }}>등록된 세부 항목이 없습니다.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingLeft: 2 }}>
                {items.map((item) => {
                  const st = itemStatusForUnit(inspections, buildingId, floor, unit, item.id);
                  const vi = voiceProgress.byItem[item.id];
                  return (
                    <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
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
                      {vi && <VoiceChip value={vi} testId={`up-voice-chip-${item.id}`} />}
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

  const voiceCard = (
    <div className="card card-pad" style={{ marginBottom: 16 }} data-testid="up-voice-card">
      <div className="section-head">
        <div className="section-title">음성 보고 반영 내역</div>
        <span className="eyebrow" data-testid="up-voice-count">
          {voiceEffects.length}건
        </span>
      </div>
      {voiceEffects.length === 0 ? (
        <div style={{ fontSize: 12.5, color: "var(--ink-faint)" }}>
          {voice.status === "loading" ? "불러오는 중…" : "이 호실의 진행도에 반영된 음성 보고가 없습니다."}
        </div>
      ) : (
        <>
          {voiceEffects.slice(0, effectsShown).map(({ effect, entry }) => (
            <EffectRow key={effect.reportId} entry={entry} effect={effect} canEdit={canEdit} busy={voiceBusy} onToggle={toggleVoiceReport} />
          ))}
          {voiceEffects.length > effectsShown && (
            <button type="button" className="btn btn-ghost btn-block" onClick={() => setEffectsShown((n) => n + EFFECT_PAGE)} data-testid="up-eff-more">
              더 보기
            </button>
          )}
        </>
      )}
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
        {voiceCard}
        {notesCard}
        {planCard}
      </div>
    );
  }

  return (
    <div className="grid grid-2" style={{ alignItems: "start" }}>
      <div>
        {progressCard}
        {voiceCard}
        {notesCard}
      </div>
      {planCard}
    </div>
  );
}
