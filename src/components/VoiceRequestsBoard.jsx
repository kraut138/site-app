import React, { useEffect, useMemo, useState } from "react";
import { Icon, EmptyState } from "./UI.jsx";
import { VoiceRecordMeta } from "./VoiceAudio.jsx";
import { formatDateTime } from "../data.js";
import { findTrade, tradeName, convertedText } from "../voice.js";
import { resolveUnit } from "../unitProgress.js";
import * as api from "../api.js";

// "6. 공사 확인 음성요청 내역" - 하도급 반장이 모바일 모드에서 남긴 음성 보고(voiceReports) 전부를,
// 말한 글에서 동·호수를 스스로 판별해(resolveUnit, 호실 정보 화면과 같은 로직) 동·호수 칸으로 모아 보여 준다.
// 칸을 클릭하면 그 호실에 쌓인 모든 기록(원문 · 순화한 문장 · 요약 · 작성자 · 시간)을 한 번에 확인할 수 있다.
// 동·층·부재만으로는 호실이 판별되지 않는 기록(여러 호실이 함께 언급되었거나 호실 표현이 아예 없는 경우)은
// "호실 미확인" 칸에 따로 모아, 어떤 기록도 빠짐없이 확인할 수 있게 한다.

const LOAD_COUNT = 4000; // 최근 기록부터 최대 이만큼 읽어 전부(사실상 전체) 모은다

export default function VoiceRequestsBoard({ buildings, notify }) {
  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [reports, setReports] = useState([]);
  const [selectedKey, setSelectedKey] = useState(null);

  useEffect(() => {
    setStatus("loading");
    const unsub = api.subscribeRecentVoiceReports(
      LOAD_COUNT,
      (list) => {
        setReports(list);
        setStatus("ready");
      },
      () => {
        setStatus("error");
        if (notify) notify("음성요청 내역을 불러오지 못했습니다. 연결을 확인해 주세요.");
      }
    );
    return () => unsub && unsub();
  }, [notify]);

  const buildingById = useMemo(() => {
    const m = new Map();
    (buildings || []).forEach((b) => m.set(b.id, b));
    return m;
  }, [buildings]);

  // 동·호수 칸으로 묶기. 판별되지 않는 기록은 따로 모아 둔다(하나도 빠뜨리지 않기 위해).
  const groups = useMemo(() => {
    const map = new Map();
    const unresolved = [];
    reports.forEach((r) => {
      const building = buildingById.get(r.buildingId);
      const unitsPerFloor = building ? building.unitsPerFloor : 0;
      const resolved = resolveUnit(r, { unitsPerFloor });
      if (resolved.ok) {
        const key = resolved.key;
        if (!map.has(key)) {
          map.set(key, {
            key,
            buildingName: r.buildingName || (building && building.name) || "",
            floor: resolved.floor,
            unit: resolved.unit,
            records: [],
          });
        }
        map.get(key).records.push(r);
      } else {
        unresolved.push(r);
      }
    });
    const list = Array.from(map.values());
    list.forEach((g) => g.records.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)));
    list.sort((a, b) => {
      const byName = String(a.buildingName).localeCompare(String(b.buildingName), "ko");
      if (byName !== 0) return byName;
      if (a.floor !== b.floor) return a.floor - b.floor;
      return String(a.unit).localeCompare(String(b.unit));
    });
    unresolved.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    return { list, unresolved };
  }, [reports, buildingById]);

  const selectedGroup = useMemo(() => groups.list.find((g) => g.key === selectedKey) || null, [groups.list, selectedKey]);
  const showUnresolved = selectedKey === "__unresolved__";

  if (status === "loading") {
    return (
      <div className="card" style={{ padding: "32px 20px", textAlign: "center", color: "var(--ink-faint)", fontSize: 13 }}>
        불러오는 중…
      </div>
    );
  }
  if (status === "error") {
    return <EmptyState message="음성요청 내역을 불러오지 못했습니다. 연결을 확인하고 다시 시도해 주세요." />;
  }

  const totalCount = reports.length;

  return (
    <div className="vr-board">
      <div className="card vr-board-head">
        <div className="section-title">
          동·호수별 음성요청 내역 ({groups.list.length}개 호실 · 총 {totalCount}건)
        </div>
        <div style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: 4 }}>
          하도급 반장이 남긴 음성 보고를 동·호수 칸으로 모았습니다. 칸을 클릭하면 그 호실의 기록을 모두 확인할 수 있습니다.
        </div>
      </div>

      {groups.list.length === 0 && groups.unresolved.length === 0 ? (
        <EmptyState message="아직 접수된 음성요청이 없습니다." />
      ) : (
        <div className="vr-grid">
          {groups.list.map((g) => (
            <button
              type="button"
              key={g.key}
              className={`vr-cell${selectedKey === g.key ? " is-active" : ""}`}
              onClick={() => setSelectedKey(selectedKey === g.key ? null : g.key)}
            >
              <span className="vr-cell-loc">
                <Icon.Pin width="13" height="13" />
                {g.buildingName} {g.floor}층 {g.unit}호
              </span>
              <span className="vr-cell-count">{g.records.length}건</span>
            </button>
          ))}
          {groups.unresolved.length > 0 && (
            <button
              type="button"
              className={`vr-cell is-unresolved${showUnresolved ? " is-active" : ""}`}
              onClick={() => setSelectedKey(showUnresolved ? null : "__unresolved__")}
            >
              <span className="vr-cell-loc">
                <Icon.Pin width="13" height="13" />
                호실 미확인
              </span>
              <span className="vr-cell-count">{groups.unresolved.length}건</span>
            </button>
          )}
        </div>
      )}

      {(selectedGroup || showUnresolved) && (
        <div className="card vr-detail">
          <div className="vr-detail-head">
            <div className="section-title">
              {showUnresolved
                ? "호실 미확인 음성요청"
                : `${selectedGroup.buildingName} ${selectedGroup.floor}층 ${selectedGroup.unit}호`}
            </div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelectedKey(null)}>
              닫기
            </button>
          </div>
          {showUnresolved && (
            <div style={{ fontSize: 12, color: "var(--ink-faint)", margin: "4px 0 12px" }}>
              말한 글에서 동·호수가 분명하게 판별되지 않은 기록입니다. 내용을 확인한 뒤 필요하면 해당 호실을 직접 찾아 알려 주세요.
            </div>
          )}
          <div className="vr-detail-list">
            {(showUnresolved ? groups.unresolved : selectedGroup.records).map((r) => (
              <VoiceRequestCard key={r.id} report={r} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function VoiceRequestCard({ report }) {
  const r = report;
  const trade = findTrade(r.trade);
  return (
    <article className="vl-card" style={{ "--vl": trade ? trade.color : "var(--line-strong)" }}>
      <header className="vl-card-head">
        {trade && <span className="vl-card-trade">{tradeName(trade.id) || trade.id}</span>}
        <strong>{r.author || "이름 없음"}</strong>
        {r.via === "text" && <span className="vl-card-via">직접 입력</span>}
        <time className="vl-card-time">{formatDateTime(r.createdAt)}</time>
      </header>
      <div className="vl-card-loc">
        <Icon.Pin width="13" height="13" />
        {r.buildingName ? `${r.buildingName} ` : ""}
        {r.floor}층 · {r.elem}
      </div>
      <div className="vl-card-raw">“{r.rawText}”</div>
      {convertedText(r) && convertedText(r) !== r.rawText && (
        <div className="vl-card-norm">
          <span aria-hidden="true">→ </span>
          {convertedText(r)}
        </div>
      )}
      {r.summary && <div className="vl-card-summary">{r.summary}</div>}
      <VoiceRecordMeta report={r} prefix="vr" />
    </article>
  );
}
