import React, { useState } from "react";
import { Icon } from "./UI.jsx";
import FoldToggle from "./FoldToggle.jsx";
import { tbmMissing, TBM_MISSING_HINTS, CHECK_KEYS, CHECK_LABELS, TBM_LIMITS, TBM_RISK_MAX, TBM_NOTES_MAX } from "../paperwork/tbmSummary.js";

// TBM 일지의 칸별 값(현장명·진행자·참석 인원·시간·작업 장소·작업 내용·위험요인과 대책·점검 항목·교육 전달 사항)을 확인하고 고치는 입력 칸 묶음.
// 두 곳에서 같은 모양으로 쓴다: 현장(공종별 QR 화면)의 회의 녹음 화면(TbmMeeting.jsx)과 사무실 서류 탭의 회의 고르기(TbmPicker.jsx).
// 값(fields)은 부모가 쥐고, 이 컴포넌트는 고칠 때마다 onFields(이전 값을 받아 새 값을 돌려주는 함수)를 부른다.

// 비어 있는 칸을 알릴 목록(작업 장소와 작업 내용이 둘 다 비면 한 줄로 묶는다)
export function missingItems(fields) {
  const keys = tbmMissing(fields);
  const has = (k) => keys.includes(k);
  const out = [];
  if (has("site")) out.push({ key: "site", ...TBM_MISSING_HINTS.site });
  if (has("leader")) out.push({ key: "leader", ...TBM_MISSING_HINTS.leader });
  if (has("headcount")) out.push({ key: "headcount", ...TBM_MISSING_HINTS.headcount });
  if (has("place") && has("work")) out.push({ key: "work", label: "작업 장소·작업 내용", example: TBM_MISSING_HINTS.work.example });
  else if (has("place")) out.push({ key: "place", ...TBM_MISSING_HINTS.place });
  else if (has("work")) out.push({ key: "work", ...TBM_MISSING_HINTS.work });
  if (has("risks")) out.push({ key: "risks", ...TBM_MISSING_HINTS.risks });
  else if (has("measures")) out.push({ key: "measures", ...TBM_MISSING_HINTS.measures, note: "대책을 말하지 않은 위험요인이 있어요" });
  return out;
}

function TextField({ id, label, value, onChange, max, placeholder, wide, suffix, inputMode, testId }) {
  return (
    <div className={`tbm-f${wide ? " tbm-f-wide" : ""}`}>
      <label htmlFor={id}>{label}</label>
      <div className="tbm-f-box">
        <input
          id={id}
          className="input"
          value={value}
          maxLength={max}
          inputMode={inputMode}
          placeholder={placeholder}
          autoComplete="off"
          onChange={(e) => onChange(e.target.value)}
          data-testid={testId}
        />
        {suffix && <span className="tbm-f-suffix">{suffix}</span>}
      </div>
    </div>
  );
}

// props
//   fields           화면에서 고치는 칸 값(tbmDraft.js fieldsForEdit 모양)
//   onFields(update) update(이전 fields) → 새 fields. 부모가 '고쳤다'는 표시도 함께 한다.
//   summarized       받아 적은 글을 읽어 채운 값이면 true: 못 찾은 칸을 알려 준다
//   fallbackPlace / fallbackWork   칸을 비워 두면 서류에 들어갈, 그 날 음성 기록에서 읽은 값(서류 탭에서만 준다)
//   title            접는 제목 글   defaultFolded  처음부터 접어 둘지
export default function TbmFieldsEditor({ fields, onFields, summarized = false, fallbackPlace = "", fallbackWork = "", title = "칸별로 확인하고 고치기", defaultFolded = false }) {
  const [folded, setFolded] = useState(defaultFolded);

  const setField = (key, value) => onFields((f) => ({ ...f, [key]: value }));
  const setCheck = (key, value) => onFields((f) => ({ ...f, checks: { ...f.checks, [key]: value } }));
  const setRisk = (i, key, value) => onFields((f) => ({ ...f, risks: f.risks.map((r, j) => (j === i ? { ...r, [key]: value } : r)) }));
  const addRisk = () => onFields((f) => (f.risks.length >= TBM_RISK_MAX ? f : { ...f, risks: [...f.risks, { hazard: "", measure: "" }] }));
  const delRisk = (i) => onFields((f) => ({ ...f, risks: f.risks.filter((_, j) => j !== i) }));

  const missing = summarized ? missingItems(fields) : [];
  const anyCheck = CHECK_KEYS.some((k) => fields.checks[k]);
  const noteLines = fields.notes.split("\n").filter((l) => l.trim());
  const notesOver = noteLines.length > TBM_NOTES_MAX || noteLines.some((l) => l.trim().length > TBM_LIMITS.note);

  return (
    <div className="tbm-edit" data-testid="tbm-edit">
      <div className="tbm-edit-head">
        <h4 className="tbm-edit-title">{title}</h4>
        <FoldToggle folded={folded} onToggle={() => setFolded((f) => !f)} label={title} controls="tbm-edit-body" testId="tbm-edit-fold" />
      </div>
      {missing.length > 0 && (
        <div className="tbm-missing" role="status" data-testid="tbm-missing">
          <div className="tbm-missing-title">회의 내용에서 못 찾은 칸이 있어요</div>
          <p className="tbm-missing-lead">아래 칸에 직접 적거나, 빠진 내용만 이어서 녹음해 주세요. 못 찾은 칸은 서류에도 비워 둬요.</p>
          <ul className="tbm-missing-list">
            {missing.map((m) => (
              <li key={m.key} data-testid={`tbm-missing-${m.key}`}>
                <strong>{m.label}</strong>
                {m.note && <span className="tbm-missing-note">{m.note}</span>}
                <span className="tbm-missing-eg">예) {m.example}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {summarized && missing.length === 0 && (
        <div className="tbm-okbox" role="status" data-testid="tbm-nomissing">
          현장명·진행자·참석 인원·작업·위험요인과 대책을 모두 찾았어요.
        </div>
      )}

      {!folded && (
        <div id="tbm-edit-body" className="tbm-edit-body">
          <div className="tbm-grid">
            <TextField id="tbm-f-site" label="현장명" value={fields.site} onChange={(v) => setField("site", v)} max={TBM_LIMITS.site} placeholder="예) OO아파트 신축공사" testId="tbm-field-site" />
            <TextField id="tbm-f-leader" label="진행자" value={fields.leader} onChange={(v) => setField("leader", v)} max={TBM_LIMITS.leader} placeholder="예) OO건설 홍길동 소장" testId="tbm-field-leader" />
            <TextField
              id="tbm-f-headcount"
              label="참석 인원"
              value={fields.headcount}
              onChange={(v) => setField("headcount", v.replace(/[^\d]/g, ""))}
              max={4}
              inputMode="numeric"
              suffix="명"
              placeholder="예) 12"
              testId="tbm-field-headcount"
            />
            <div className="tbm-f">
              <label htmlFor="tbm-f-from">회의 시간</label>
              <div className="tbm-f-box tbm-time">
                <input id="tbm-f-from" type="time" className="input" value={fields.from} onChange={(e) => setField("from", e.target.value)} aria-label="시작 시각" data-testid="tbm-field-from" />
                <span aria-hidden="true">~</span>
                <input id="tbm-f-to" type="time" className="input" value={fields.to} onChange={(e) => setField("to", e.target.value)} aria-label="끝난 시각" data-testid="tbm-field-to" />
              </div>
            </div>
            <TextField
              id="tbm-f-place"
              label="작업 장소"
              wide
              value={fields.place}
              onChange={(v) => setField("place", v)}
              max={TBM_LIMITS.place}
              placeholder={fallbackPlace ? `비워 두면 이 날 음성 기록의 장소가 들어가요: ${fallbackPlace}` : "예) 101동 3층, 102동 지하 1층"}
              testId="tbm-field-place"
            />
            <TextField
              id="tbm-f-work"
              label="작업 내용"
              wide
              value={fields.work}
              onChange={(v) => setField("work", v)}
              max={TBM_LIMITS.work}
              placeholder={fallbackWork ? `비워 두면 이 날 음성 기록의 공종이 들어가요: ${fallbackWork}` : "예) 도배, 방수"}
              testId="tbm-field-work"
            />
          </div>

          <div className="tbm-risks" data-testid="tbm-risks">
            <div className="tbm-label-row">
              <span className="tbm-label">오늘의 위험요인과 대책</span>
              <span className="tbm-count">
                {fields.risks.length}/{TBM_RISK_MAX}줄
              </span>
            </div>
            {fields.risks.length === 0 && <p className="tbm-empty">위험요인을 찾지 못했어요. 아래 '줄 추가'로 직접 적을 수 있어요.</p>}
            {fields.risks.map((r, i) => (
              <div className="tbm-risk" key={i} data-testid={`tbm-risk-${i}`}>
                <span className="tbm-no">{i + 1}</span>
                <div className="tbm-risk-cells">
                  <label>
                    <span>위험요인 (어디서, 무엇 때문에)</span>
                    <textarea
                      className="input"
                      rows={2}
                      maxLength={TBM_LIMITS.hazard}
                      value={r.hazard}
                      onChange={(e) => setRisk(i, "hazard", e.target.value)}
                      data-testid={`tbm-risk-hazard-${i}`}
                    />
                  </label>
                  <label>
                    <span>대책 (누가, 어떻게)</span>
                    <textarea
                      className="input"
                      rows={2}
                      maxLength={TBM_LIMITS.measure}
                      value={r.measure}
                      onChange={(e) => setRisk(i, "measure", e.target.value)}
                      data-testid={`tbm-risk-measure-${i}`}
                    />
                  </label>
                </div>
                <button type="button" className="btn btn-ghost btn-sm tbm-risk-del" onClick={() => delRisk(i)} aria-label={`${i + 1}번 줄 지우기`} data-testid={`tbm-risk-del-${i}`}>
                  <Icon.Trash width="14" height="14" />
                </button>
              </div>
            ))}
            <button type="button" className="btn btn-ghost btn-sm" onClick={addRisk} disabled={fields.risks.length >= TBM_RISK_MAX} data-testid="tbm-risk-add">
              <Icon.Plus width="14" height="14" />줄 추가
            </button>
          </div>

          <div className="tbm-checks" data-testid="tbm-checks">
            <div className="tbm-label-row">
              <span className="tbm-label">점검 항목 (확인한 것에 표시)</span>
            </div>
            {CHECK_KEYS.map((k) => (
              <label key={k} className={`tbm-check${fields.checks[k] ? " is-on" : ""}`}>
                <input type="checkbox" checked={!!fields.checks[k]} onChange={(e) => setCheck(k, e.target.checked)} data-testid={`tbm-check-${k}`} />
                <span>{CHECK_LABELS[k]}</span>
              </label>
            ))}
            {anyCheck && <p className="tbm-tipline">표시는 회의에서 말한 내용만 보고 정했어요. 실제로 확인한 항목인지 꼭 살펴보고, 아니면 체크를 풀어 주세요.</p>}
          </div>

          <div className="tbm-notes">
            <div className="tbm-label-row">
              <label htmlFor="tbm-f-notes" className="tbm-label">
                교육·전달 사항 (한 줄에 하나)
              </label>
              <span className="tbm-count">
                {noteLines.length}/{TBM_NOTES_MAX}줄
              </span>
            </div>
            <textarea
              id="tbm-f-notes"
              className="input"
              rows={4}
              value={fields.notes}
              onChange={(e) => setField("notes", e.target.value)}
              placeholder="예) 오후에 비 예보가 있으니 작업 전 기상 확인"
              data-testid="tbm-field-notes"
            />
            {notesOver && (
              <p className="tbm-warnline" data-testid="tbm-notes-over">
                서류에는 {TBM_NOTES_MAX}줄까지, 한 줄에 {TBM_LIMITS.note}자까지만 들어가요. 넘치는 줄은 빠지고 긴 줄은 잘려요.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
