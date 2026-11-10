import React, { useEffect, useState } from "react";
import TbmFieldsEditor from "./TbmFields.jsx";
import { tradeName } from "../voice.js";
import { hhmm } from "../paperwork/dayTools.js";
import { describeMeeting } from "../paperwork/tbmMeetingDoc.js";

// 서류 탭의 TBM 일지 카드에서, 그 날 현장(공종별 QR 화면의 'TBM 회의')에서 서버에 저장한 회의를 골라 일지의 칸을 채우게 하는 부분.
//   - 그 날 저장된 회의가 목록으로 나온다(공종·반마다 따로 회의를 했으면 여러 건). 하나를 고르면 그 회의의 칸 값이 아래 일지 표와 내려받을 파일에 들어간다.
//   - 고른 회의는 칸마다 확인하고 고칠 수 있다. 고친 값은 곧바로 일지에 들어가고, '서버에 저장'을 눌러야 서버의 회의가 바뀐다(눌러 두면 다음에 열어도 고친 값이다).
//   - '회의 내용 없이'를 고르면 예전처럼 이 날 음성 기록(순화한 내용)만으로 채운다.
// 값과 서버 호출은 부모(Paperwork.jsx)가 쥐고, 이 컴포넌트는 보여 주고 누른 것을 알리기만 한다.

// props
//   status          loading | ready | error   meetings  불러온 회의(readMeetingDoc 모양, 오래된 것부터)   pickedId  고른 회의의 id(없으면 "")
//   onPick(id)      회의를 골랐다("" = 회의 내용 없이)   onReload()  다시 불러오기
//   work            고른 회의의 작업 사본 { id, fields }  dirty  작업 사본이 서버의 값과 다른지
//   onWorkFields(update)  칸을 고쳤다   onSaveWork()  고친 값을 서버에 저장   onDiscardWork()  고친 값을 버리고 서버 값으로
//   onDelete(id)    회의를 서버에서 지운다   busy  "" | "save" | "delete" (서버에 쓰는 중)
//   fallbackPlace / fallbackWork  칸을 비워 두면 일지에 들어갈 이 날 음성 기록의 값
export default function TbmPicker({ status, meetings, pickedId, onPick, onReload, work, dirty, onWorkFields, onSaveWork, onDiscardWork, onDelete, busy = "", fallbackPlace = "", fallbackWork = "" }) {
  const [open, setOpen] = useState(false); // 칸별로 확인하고 고치는 영역
  const [showText, setShowText] = useState(false); // 받아 적은 글 보기
  const [confirmDel, setConfirmDel] = useState(false);
  const picked = meetings.find((m) => m.id === pickedId) || null;

  useEffect(() => {
    setOpen(false);
    setShowText(false);
    setConfirmDel(false);
  }, [pickedId]);

  const rowTitle = (m) => {
    const trade = tradeName(m.trade);
    return [trade, m.author].filter(Boolean).join(" · ") || "이름 없는 회의";
  };
  const savedAt = picked && Date.parse(picked.updatedAt) ? hhmm(Date.parse(picked.updatedAt)) : "";

  return (
    <div className="tbm-pick" data-testid="tbm-pick">
      <div className="tbm-pick-head">
        <div>
          <h3 className="tbm-title">이 날 현장에서 저장한 TBM 회의</h3>
          <p className="tbm-sub">공종별 QR 화면의 'TBM 회의'에서 녹음해 저장한 회의예요. 하나를 고르면 그 내용이 아래 일지의 칸에 들어가요.</p>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onReload} disabled={status === "loading" || !!busy} data-testid="tbm-pick-reload">
          다시 불러오기
        </button>
      </div>

      {status === "loading" && (
        <div className="tbm-pick-note" role="status" data-testid="tbm-pick-loading">
          저장된 회의를 불러오는 중…
        </div>
      )}
      {status === "error" && (
        <div className="tbm-alert" role="status" data-testid="tbm-pick-error">
          저장된 회의를 불러오지 못했어요. 연결을 확인하고 '다시 불러오기'를 눌러 주세요.
        </div>
      )}
      {status === "ready" && meetings.length === 0 && (
        <div className="tbm-pick-note" data-testid="tbm-pick-empty">
          이 날 저장된 TBM 회의가 없어요. 현장에서 공종별 QR을 스캔해 'TBM 회의'로 녹음하고 '서버에 저장'을 누르면 여기에 나타나요. 지금은 이 날 음성 기록의 위험 낱말만 옮겨 적어요.
        </div>
      )}

      {status === "ready" && meetings.length > 0 && (
        <div className="tbm-pick-list" role="radiogroup" aria-label="일지에 쓸 TBM 회의" data-testid="tbm-pick-list">
          {meetings.map((m, i) => {
            const d = describeMeeting(m, hhmm);
            const on = m.id === pickedId;
            return (
              <label key={m.id} className={`tbm-pick-row${on ? " is-on" : ""}`} data-testid="tbm-pick-row">
                <input type="radio" name="tbm-pick" checked={on} onChange={() => onPick(m.id)} disabled={!!busy || dirty} data-testid={`tbm-pick-radio-${i}`} />
                <span className="tbm-pick-main">
                  <strong>
                    {d.time && <span className="tbm-pick-time">{d.time}</span>}
                    {rowTitle(m)}
                  </strong>
                  <span className="tbm-pick-sub">{d.lines.length ? d.lines.join(" · ") : "칸이 비어 있어요"}</span>
                </span>
              </label>
            );
          })}
          <label className={`tbm-pick-row${!pickedId ? " is-on" : ""}`} data-testid="tbm-pick-none">
            <input type="radio" name="tbm-pick" checked={!pickedId} onChange={() => onPick("")} disabled={!!busy || dirty} data-testid="tbm-pick-radio-none" />
            <span className="tbm-pick-main">
              <strong>회의 내용 없이</strong>
              <span className="tbm-pick-sub">이 날 음성 기록(순화한 내용)만으로 채워요</span>
            </span>
          </label>
        </div>
      )}

      {picked && work && (
        <div className="tbm-pick-detail" data-testid="tbm-pick-detail">
          <div className="tbm-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen((v) => !v)} aria-expanded={open} data-testid="tbm-pick-edit">
              {open ? "칸 확인·고치기 접기" : "칸 확인하고 고치기"}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowText((v) => !v)} aria-expanded={showText} data-testid="tbm-pick-text-toggle">
              {showText ? "받아 적은 글 접기" : "받아 적은 글 보기"}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmDel(true)} disabled={!!busy} data-testid="tbm-pick-delete">
              이 회의 지우기
            </button>
          </div>
          <p className="tbm-pick-meta" data-testid="tbm-pick-meta">
            {picked.updatedFrom === "office" ? "서류 탭에서 고쳐 저장" : "현장 화면에서 저장"}
            {savedAt ? ` · ${savedAt}` : ""}
            {picked.summarized ? " · 녹음 글을 읽어 칸을 채운 회의" : ""}
          </p>

          {confirmDel && (
            <div className="tbm-confirm" role="group" aria-label="회의를 지울지 묻기" data-testid="tbm-pick-confirm-delete">
              <span>이 회의를 서버에서 지워요. 현장 휴대폰에 남아 있는 내용은 그대로예요. 그래도 지울까요?</span>
              <span className="tbm-confirm-btns">
                <button type="button" className="btn btn-fail btn-sm" onClick={() => onDelete(picked.id)} disabled={!!busy} data-testid="tbm-pick-delete-yes">
                  {busy === "delete" ? "지우는 중…" : "지우기"}
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmDel(false)} data-testid="tbm-pick-delete-no">
                  취소
                </button>
              </span>
            </div>
          )}

          {dirty && (
            <div className="tbm-confirm" role="status" data-testid="tbm-pick-dirty">
              <span>고친 내용은 지금 만드는 일지에 들어가요. 서버의 회의에는 아직 저장하지 않았어요. 저장하거나 버려야 다른 회의나 다른 날짜로 바꿀 수 있어요.</span>
              <span className="tbm-confirm-btns">
                <button type="button" className="btn btn-primary btn-sm" onClick={onSaveWork} disabled={!!busy} data-testid="tbm-pick-save">
                  {busy === "save" ? "저장하는 중…" : "고친 내용 서버에 저장"}
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={onDiscardWork} disabled={!!busy} data-testid="tbm-pick-discard">
                  고친 내용 버리기
                </button>
              </span>
            </div>
          )}

          {showText && (
            <pre className="tbm-pick-text" data-testid="tbm-pick-text">
              {picked.text || "(받아 적은 글이 없어요)"}
            </pre>
          )}

          {open && <TbmFieldsEditor key={picked.id} fields={work.fields} onFields={onWorkFields} summarized={picked.summarized} fallbackPlace={fallbackPlace} fallbackWork={fallbackWork} />}
        </div>
      )}
    </div>
  );
}
