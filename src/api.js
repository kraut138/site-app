const BASE = "/api";

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  let body = null;
  try {
    body = await res.json();
  } catch (e) {
    body = null;
  }
  if (!res.ok) {
    throw new Error((body && body.error) || `요청에 실패했습니다 (${res.status})`);
  }
  return body;
}

export function fetchBootstrap() {
  return request("/bootstrap");
}

export function createBuilding(data) {
  return request("/buildings", { method: "POST", body: JSON.stringify(data) });
}

export function deleteBuilding(id) {
  return request(`/buildings/${id}`, { method: "DELETE" });
}

export function updateBuilding(id, data) {
  return request(`/buildings/${id}`, { method: "PATCH", body: JSON.stringify(data) });
}

export function fetchSiteSettings() {
  return request("/sitesettings");
}

export function updateSiteSettings(data) {
  return request("/sitesettings", { method: "PATCH", body: JSON.stringify(data) });
}

export function createUnitNote(data) {
  return request("/unitnotes", { method: "POST", body: JSON.stringify(data) });
}

export function deleteUnitNote(id) {
  return request(`/unitnotes/${id}`, { method: "DELETE" });
}

export function createChecklistItem(data) {
  return request("/checklistitems", { method: "POST", body: JSON.stringify(data) });
}

export function deleteChecklistItem(id) {
  return request(`/checklistitems/${id}`, { method: "DELETE" });
}

export function resetChecklistCategory(categoryId, items) {
  return request("/checklistitems/reset", { method: "POST", body: JSON.stringify({ categoryId, items }) });
}

export function createInspection(data) {
  return request("/inspections", { method: "POST", body: JSON.stringify(data) });
}

export function updateInspectionStatus(id, data) {
  return request(`/inspections/${id}`, { method: "PATCH", body: JSON.stringify(data) });
}

export function updateNcrStatus(id, data) {
  return request(`/ncrs/${id}`, { method: "PATCH", body: JSON.stringify(data) });
}

// 브라우저에서 이미지를 리사이즈/압축하여 base64 데이터 URL로 변환
export function compressImage(file, maxSize = 1100, quality = 0.68) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("이미지를 읽을 수 없습니다."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("이미지를 처리할 수 없습니다."));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxSize || height > maxSize) {
          if (width > height) {
            height = Math.round((height * maxSize) / width);
            width = maxSize;
          } else {
            width = Math.round((width * maxSize) / height);
            height = maxSize;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
