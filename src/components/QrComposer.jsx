import React, { useEffect, useRef, useState } from "react";
import { Icon } from "./UI.jsx";
import { useLanguage } from "../LanguageContext.jsx";
import { QR_LIMITS, formatDuration } from "../qr.js";
import { canRecordAudio, pickAudioMime, blobToDataUrl, imageToBudget, audioFileToData } from "../qrMedia.js";

// QR을 스캔한 사람이 메모·사진·음성을 남기는 입력 칸. 셋 중 하나만 남겨도 되고, 함께 남겨도 한 건의 기록으로 저장된다.
// 화면 문구는 스캔하는 사람이 외국인 근로자일 수 있어 번역 사전(qr.compose.*)을 쓴다.

const AUTHOR_KEY = "qrBoardAuthor";

function readAuthor() {
  try {
    return window.localStorage.getItem(AUTHOR_KEY) || "";
  } catch {
    return "";
  }
}

function writeAuthor(value) {
  try {
    window.localStorage.setItem(AUTHOR_KEY, value);
  } catch {
    // 이름을 기억해 두지 못해도 기록을 남기는 데에는 영향이 없다.
  }
}

export default function QrComposer({ onSubmit }) {
  const { t } = useLanguage();
  const [author, setAuthor] = useState(readAuthor);
  const [text, setText] = useState("");
  const [image, setImage] = useState(null); // { full, thumb }
  const [imageBusy, setImageBusy] = useState(false);
  const [audio, setAudio] = useState(null); // { data, sec }
  const [recording, setRecording] = useState(null); // null | { elapsed }
  const [audioNote, setAudioNote] = useState(""); // 녹음 관련 안내·오류 문구
  const [allowAudioFile, setAllowAudioFile] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const imageInputRef = useRef(null);
  const audioFileRef = useRef(null);
  const recRef = useRef(null);

  // 화면을 떠날 때 녹음이 진행 중이면 결과를 버리고 마이크를 놓아준다.
  useEffect(
    () => () => {
      const s = recRef.current;
      if (!s) return;
      s.discard = true;
      clearInterval(s.timer);
      try {
        if (s.recorder.state !== "inactive") s.recorder.stop();
      } catch {
        // 이미 멈춘 상태면 무시
      }
      s.stream.getTracks().forEach((track) => track.stop());
    },
    []
  );

  useEffect(() => {
    if (!saved) return undefined;
    const timer = setTimeout(() => setSaved(false), 3500);
    return () => clearTimeout(timer);
  }, [saved]);

  // ---------------- 사진 ----------------
  async function onPickImage(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = ""; // 같은 사진을 다시 골라도 변경 이벤트가 오도록 비운다
    if (!file) return;
    setImageBusy(true);
    setError("");
    try {
      setImage(await imageToBudget(file));
    } catch {
      setError(t("qr.compose.photoError"));
    } finally {
      setImageBusy(false);
    }
  }

  // ---------------- 음성 ----------------
  function stopRecording() {
    const s = recRef.current;
    if (s && s.recorder.state !== "inactive") s.recorder.stop();
  }

  function cancelRecording() {
    const s = recRef.current;
    if (!s) return;
    s.discard = true;
    stopRecording();
  }

  function unsupported(message) {
    setAudioNote(message);
    setAllowAudioFile(true); // 바로 녹음이 안 되면 음성 파일을 골라 올리는 방법을 열어준다
  }

  async function startRecording() {
    setAudioNote("");
    setError("");
    if (!canRecordAudio()) {
      unsupported(t("qr.compose.recUnsupported"));
      return;
    }
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      const denied = err && (err.name === "NotAllowedError" || err.name === "SecurityError" || err.name === "PermissionDeniedError");
      unsupported(denied ? t("qr.compose.recDenied") : t("qr.compose.recUnsupported"));
      return;
    }
    const mime = pickAudioMime();
    let recorder;
    try {
      recorder = new window.MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: QR_LIMITS.audioBitsPerSecond });
    } catch {
      try {
        recorder = new window.MediaRecorder(stream);
      } catch {
        stream.getTracks().forEach((track) => track.stop());
        unsupported(t("qr.compose.recUnsupported"));
        return;
      }
    }

    const s = { recorder, stream, chunks: [], bytes: 0, startedAt: Date.now(), auto: false, discard: false, timer: null };
    recRef.current = s;

    recorder.ondataavailable = (e) => {
      if (!e.data || e.data.size === 0) return;
      s.chunks.push(e.data);
      s.bytes += e.data.size;
      // 비트레이트 설정이 무시되는 기기에서도 용량 한도를 넘지 않도록, 한도에 닿으면 자동으로 멈춘다.
      if (s.bytes >= QR_LIMITS.audioMaxRawBytes) {
        s.auto = true;
        stopRecording();
      }
    };
    recorder.onerror = () => {
      s.discard = true;
      stopRecording();
      unsupported(t("qr.compose.recUnsupported"));
    };
    recorder.onstop = async () => {
      clearInterval(s.timer);
      s.stream.getTracks().forEach((track) => track.stop());
      if (recRef.current === s) recRef.current = null;
      setRecording(null);
      if (s.discard) return;
      const sec = Math.min(QR_LIMITS.audioMaxSec, Math.max(1, Math.round((Date.now() - s.startedAt) / 1000)));
      const blob = new Blob(s.chunks, { type: recorder.mimeType || mime || "audio/webm" });
      if (blob.size === 0) {
        unsupported(t("qr.compose.recUnsupported"));
        return;
      }
      if (blob.size > QR_LIMITS.audioMaxRawBytes * 1.1) {
        setAudioNote(t("qr.compose.audioTooBig"));
        return;
      }
      try {
        const data = await blobToDataUrl(blob);
        setAudio({ data, sec });
        if (s.auto) setAudioNote(t("qr.compose.recAutoStop"));
      } catch {
        unsupported(t("qr.compose.recUnsupported"));
      }
    };

    setAudio(null);
    recorder.start(1000); // 1초마다 조각을 받아 용량을 확인한다
    setRecording({ elapsed: 0 });
    s.timer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - s.startedAt) / 1000);
      setRecording({ elapsed });
      if (elapsed >= QR_LIMITS.audioMaxSec) {
        s.auto = true;
        stopRecording();
      }
    }, 250);
  }

  async function onPickAudioFile(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setAudioNote("");
    try {
      const picked = await audioFileToData(file);
      setAudio(picked);
    } catch (err) {
      setAudioNote(err && err.code === "qr/audio-too-big" ? t("qr.compose.audioTooBig") : t("qr.compose.audioReadError"));
    }
  }

  // ---------------- 저장 ----------------
  async function submit() {
    if (saving || recording || imageBusy) return;
    setError("");
    setSaved(false);
    if (!text.trim() && !image && !audio) {
      setError(t("qr.compose.empty"));
      return;
    }
    const mediaChars = (image ? image.full.length : 0) + (audio ? audio.data.length : 0);
    if (mediaChars > QR_LIMITS.mediaDocMaxChars) {
      setError(t("qr.compose.tooBig"));
      return;
    }
    setSaving(true);
    try {
      await onSubmit({
        author: author.trim(),
        text: text.trim(),
        image: image ? image.full : null,
        thumb: image ? image.thumb : null,
        audio: audio ? audio.data : null,
        audioSec: audio ? audio.sec : 0,
      });
      writeAuthor(author.trim());
      setText("");
      setImage(null);
      setAudio(null);
      setAudioNote("");
      setSaved(true);
    } catch (err) {
      setError(err && err.code === "qr/too-large" ? t("qr.compose.tooBig") : t("qr.compose.saveError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card card-pad qr-compose" data-testid="qr-compose">
      <div className="section-head">
        <div className="section-title">{t("qr.compose.title")}</div>
      </div>
      <p className="qr-hint">{t("qr.compose.hint")}</p>

      <div className="field">
        <label htmlFor="qr-author">{t("qr.compose.name")}</label>
        <input
          id="qr-author"
          className="input"
          value={author}
          maxLength={QR_LIMITS.authorMax}
          placeholder={t("qr.compose.namePh")}
          onChange={(e) => setAuthor(e.target.value)}
          data-testid="qr-author"
        />
      </div>

      <div className="field">
        <label htmlFor="qr-text">{t("qr.compose.text")}</label>
        <textarea
          id="qr-text"
          className="input"
          rows={4}
          maxLength={QR_LIMITS.textMax}
          placeholder={t("qr.compose.textPh")}
          value={text}
          onChange={(e) => setText(e.target.value)}
          data-testid="qr-text"
        />
      </div>

      <div className="field">
        <label>{t("qr.compose.photo")}</label>
        {image ? (
          <div className="qr-attach" data-testid="qr-image-preview">
            <img className="qr-attach-thumb" src={image.thumb} alt="" />
            <div className="qr-attach-actions">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => imageInputRef.current && imageInputRef.current.click()}>
                {t("qr.compose.photoChange")}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setImage(null)} data-testid="qr-image-remove">
                {t("qr.compose.photoRemove")}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="btn btn-ghost qr-attach-btn"
            disabled={imageBusy}
            onClick={() => imageInputRef.current && imageInputRef.current.click()}
            data-testid="qr-image-add"
          >
            <Icon.Camera width="17" height="17" /> {imageBusy ? t("qr.compose.photoBusy") : t("qr.compose.photoAdd")}
          </button>
        )}
        <input ref={imageInputRef} type="file" accept="image/*" hidden onChange={onPickImage} data-testid="qr-image-input" />
      </div>

      <div className="field">
        <label>{t("qr.compose.voice")}</label>
        {recording ? (
          <div className="qr-rec" data-testid="qr-recording">
            <span className="qr-rec-dot" aria-hidden="true" />
            <span className="qr-rec-time">
              {t("qr.compose.recording", { time: `${formatDuration(recording.elapsed)} / ${formatDuration(QR_LIMITS.audioMaxSec)}` })}
            </span>
            <button type="button" className="btn btn-primary btn-sm" onClick={stopRecording} data-testid="qr-rec-stop">
              {t("qr.compose.recStop")}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={cancelRecording} data-testid="qr-rec-cancel">
              {t("qr.compose.recCancel")}
            </button>
          </div>
        ) : audio ? (
          <div className="qr-attach qr-attach-audio" data-testid="qr-audio-preview">
            <audio controls src={audio.data} />
            <div className="qr-attach-actions">
              {audio.sec > 0 && <span className="qr-attach-meta">{formatDuration(audio.sec)}</span>}
              <button type="button" className="btn btn-ghost btn-sm" onClick={startRecording} data-testid="qr-rec-again">
                {t("qr.compose.recAgain")}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAudio(null)} data-testid="qr-audio-remove">
                {t("qr.compose.recRemove")}
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="btn btn-ghost qr-attach-btn" onClick={startRecording} data-testid="qr-rec-start">
            <Icon.Mic width="17" height="17" /> {t("qr.compose.recStart")}
          </button>
        )}
        <div className="qr-attach-hint">{t("qr.compose.recMax", { sec: QR_LIMITS.audioMaxSec })}</div>
        {audioNote && (
          <div className="qr-note" data-testid="qr-audio-note">
            {audioNote}
          </div>
        )}
        {allowAudioFile && (
          <>
            <button type="button" className="qr-linkbtn" onClick={() => audioFileRef.current && audioFileRef.current.click()} data-testid="qr-audio-file-btn">
              {t("qr.compose.audioFile")}
            </button>
            <input ref={audioFileRef} type="file" accept="audio/*" hidden onChange={onPickAudioFile} data-testid="qr-audio-file" />
          </>
        )}
      </div>

      {error && (
        <div className="qr-error" role="alert" data-testid="qr-error">
          {error}
        </div>
      )}
      {saved && (
        <div className="qr-saved" role="status" data-testid="qr-saved">
          <Icon.Check width="15" height="15" /> {t("qr.compose.saved")}
        </div>
      )}
      <button
        type="button"
        className="btn btn-primary btn-block qr-submit"
        onClick={submit}
        disabled={saving || !!recording || imageBusy}
        data-testid="qr-submit"
      >
        {saving ? t("qr.compose.saving") : t("qr.compose.submit")}
      </button>
    </div>
  );
}
