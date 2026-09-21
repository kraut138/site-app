import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { unitOptions, findUnitFloorPlan } from "../data.js";
import { computeBuildingLayout, normalizeScale } from "../three-extrude.js";

const FLOOR_HEIGHT = 3.3; // m
const WALL_THICKNESS = 0.12;
// 동을 구분하기 위해 순서대로 돌려 쓰는 색상 팔레트 (동 관리 탭의 배치 핀 색상과 동일한 감각으로 맞춤)
const BUILDING_COLORS = [0xc0392b, 0x8e44ad, 0x2166ac, 0x158a72, 0xb8860b, 0x5b6b74, 0xc2185b, 0x1f6f3f];

function isFiniteNum(n) {
  return typeof n === "number" && Number.isFinite(n);
}

export default function Site3DView({ buildings, unitFloorPlans, siteSettings }) {
  const containerRef = useRef(null);
  const [noPlacement, setNoPlacement] = useState(false);
  const [renderError, setRenderError] = useState("");
  const [skippedNames, setSkippedNames] = useState([]);
  // 배치도 자동 스케일 추정이 실제 도면과 어긋날 수 있어, 동 사이 배치 간격만 눈으로 보며
  // 직접 보정할 수 있게 한다(건물 자체의 크기는 항상 등록된 평면도 실측 그대로 유지된다).
  const [spacingAdjust, setSpacingAdjust] = useState(1);
  const [autoScaleInfo, setAutoScaleInfo] = useState(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const placed = buildings.filter((b) => typeof b.siteX === "number" && typeof b.siteY === "number");
    if (placed.length === 0) {
      setNoPlacement(true);
      return;
    }
    setNoPlacement(false);
    setRenderError("");
    setSkippedNames([]);

    let renderer;
    let animationId;
    let controls;
    const disposables = [];

    try {
      // ---- 배치 좌표계 준비: 동의 siteX/siteY(%) -> 실제 좌표(m) ----
      const masterBounds = siteSettings?.siteMasterPlan?.bounds || null;
      // 배치도가 없으면, 동 개수만큼 적당히 넓게 펼쳐놓을 가상의 기준 폭을 하나 잡는다.
      const refWidth = masterBounds && isFiniteNum(masterBounds.width) && masterBounds.width > 0 ? masterBounds.width : Math.max(60, placed.length * 40);
      const refHeight = masterBounds && isFiniteNum(masterBounds.height) && masterBounds.height > 0 ? masterBounds.height : 60;
      const refMinX = masterBounds && isFiniteNum(masterBounds.minX) ? masterBounds.minX : 0;
      const refMinY = masterBounds && isFiniteNum(masterBounds.minY) ? masterBounds.minY : 0;
      // 배치도 자체도 mm로 그려졌을 수 있으므로 m로 정규화한다. 호실 평면도와 반드시 같은 기준(normalizeScale)을
      // 써야 한다 - 배치도는 부지 규모(수백 m대)라 임계값이 다르면, 같은 mm 도면인데도 호실 평면도는 "mm"로
      // 판정하고 배치도는 "이미 m"로 잘못 판정하는 식으로 서로 다르게 해석되어 동과 배치도 사이 비율이 어긋난다.
      // 그래도 자동 추정이 실제 도면과 다를 수 있으므로, spacingAdjust로 사용자가 배치 간격만 직접 보정할 수 있게 한다.
      const autoScale = masterBounds ? normalizeScale(masterBounds) : 1;
      const planScale = autoScale * spacingAdjust;
      setAutoScaleInfo(masterBounds ? { autoScale, refWidth, refHeight } : null);

      function siteWorldPos(b) {
        const sx = isFiniteNum(b.siteX) ? b.siteX : 0;
        const sy = isFiniteNum(b.siteY) ? b.siteY : 0;
        const wx = (refMinX + (sx / 100) * refWidth) * planScale;
        const wz = (refMinY + (sy / 100) * refHeight) * planScale;
        return { x: wx, z: wz };
      }

      // ---- three.js 기본 씬 구성 ----
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0xeef1ef);

      const width = container.clientWidth || 800;
      const height = container.clientHeight || 560;
      const camera = new THREE.PerspectiveCamera(45, width / height, 0.5, 5000);
      // hasAny가 끝내 false로 남더라도(모든 동 처리가 실패하더라도) 카메라가 원점(0,0,0)에 방치되어
      // 아무 것도 안 보이는 화면이 되는 일이 없도록, 지면을 내려다보는 안전한 기본 위치를 먼저 잡아둔다.
      camera.position.set(60, 60, 60);
      camera.lookAt(0, 0, 0);

      renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      container.innerHTML = "";
      container.appendChild(renderer.domElement);

      scene.add(new THREE.AmbientLight(0xffffff, 0.65));
      const sun = new THREE.DirectionalLight(0xffffff, 0.75);
      sun.position.set(120, 200, 80);
      scene.add(sun);

      // ---- 지면(현장 배치도 경계가 있으면 그 크기로, 없으면 대략적인 크기로) ----
      const groundW = masterBounds ? refWidth * planScale : refWidth;
      const groundD = masterBounds ? refHeight * planScale : refHeight;
      const groundGeo = new THREE.PlaneGeometry(groundW * 1.6, groundD * 1.6);
      const groundMat = new THREE.MeshStandardMaterial({ color: 0xdfe6e1, roughness: 1 });
      const ground = new THREE.Mesh(groundGeo, groundMat);
      ground.rotation.x = -Math.PI / 2;
      ground.position.set(refMinX * planScale + groundW / 2, -0.05, refMinY * planScale + groundD / 2);
      scene.add(ground);
      disposables.push(groundGeo, groundMat);

      const grid = new THREE.GridHelper(Math.max(groundW, groundD) * 1.6, 20, 0xb9c3bd, 0xd3dad6);
      grid.position.set(ground.position.x, 0, ground.position.z);
      scene.add(grid);

      // ---- 각 동을 실제 매스로 쌓기 ----
      const wallGeo = new THREE.BoxGeometry(1, 1, 1); // 세그먼트마다 scale로 크기만 다르게 재사용(성능)
      disposables.push(wallGeo);

      const box = new THREE.Box3();
      let hasAny = false;
      const allGroups = [];
      const skipped = [];
      window.__debugSite3D = { positions: [], skipped: [] };

      placed.forEach((building, bi) => {
        // 동 하나 처리 중 예상 못한 값(층수/세대수 이상, 평면도 데이터 이상 등)이 있어도, 그 동만 건너뛰고
        // 나머지 동은 정상적으로 계속 그려지도록 동 단위로 개별 예외 처리한다.
        try {
          const floors = Math.max(1, Math.round(Number(building.floors)) || 1);
          const unitsPerFloorNum = Math.max(1, Math.round(Number(building.unitsPerFloor)) || 1);
          const safeBuilding = { ...building, floors, unitsPerFloor: unitsPerFloorNum };

          const layout = computeBuildingLayout(safeBuilding, unitFloorPlans, unitOptions, findUnitFloorPlan, FLOOR_HEIGHT);
          if (!layout || !Array.isArray(layout.units) || layout.units.length === 0 || !isFiniteNum(layout.totalWidth) || !isFiniteNum(layout.totalDepth)) {
            throw new Error("평면도 배치 계산 결과가 비어있거나 올바르지 않습니다.");
          }

          const { x: originX, z: originZ } = siteWorldPos(building);
          const color = BUILDING_COLORS[bi % BUILDING_COLORS.length];
          const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.05 });
          disposables.push(mat);

          const group = new THREE.Group();
          // 동 하나의 폭 중심이 site 핀 위치에 오도록 정렬
          group.position.set(originX - layout.totalWidth / 2, 0, originZ - layout.totalDepth / 2);

          for (let f = 0; f < floors; f++) {
            const baseY = f * FLOOR_HEIGHT;
            layout.units.forEach((u) => {
              const width = isFiniteNum(u.width) && u.width > 0 ? u.width : 8;
              const depth = isFiniteNum(u.depth) && u.depth > 0 ? u.depth : 10;
              const x0 = isFiniteNum(u.x0) ? u.x0 : 0;
              (u.wallSegments || []).forEach((seg) => {
                if (!isFiniteNum(seg.length) || !isFiniteNum(seg.cx) || !isFiniteNum(seg.cz) || !isFiniteNum(seg.angle) || seg.length <= 0) return;
                const mesh = new THREE.Mesh(wallGeo, mat);
                mesh.scale.set(seg.length, FLOOR_HEIGHT, WALL_THICKNESS);
                mesh.position.set(x0 + seg.cx, baseY + FLOOR_HEIGHT / 2, seg.cz);
                mesh.rotation.y = -seg.angle;
                group.add(mesh);
              });
              // 벽선(도면)이 전혀 없는 유닛(평면도 미등록)은 반투명 상자로 대략적인 자리만 표시
              if (!u.wallSegments || u.wallSegments.length === 0) {
                const placeholderGeo = new THREE.BoxGeometry(width, FLOOR_HEIGHT * 0.94, depth);
                const placeholderMat = new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.28 });
                const ph = new THREE.Mesh(placeholderGeo, placeholderMat);
                ph.position.set(x0 + width / 2, baseY + FLOOR_HEIGHT / 2, depth / 2);
                group.add(ph);
                disposables.push(placeholderGeo, placeholderMat);
              }
            });
          }

          scene.add(group);
          allGroups.push(group);
          hasAny = true;
          window.__debugSite3D.positions.push({
            name: building.name,
            siteX: building.siteX,
            siteY: building.siteY,
            worldX: originX,
            worldZ: originZ,
            groupPos: [group.position.x, group.position.y, group.position.z],
            totalWidth: layout.totalWidth,
            totalDepth: layout.totalDepth,
            unitCount: layout.units.length,
          });
        } catch (buildingErr) {
          skipped.push({ name: building.name, reason: buildingErr.message });
          window.__debugSite3D.skipped.push({ name: building.name, reason: buildingErr.message });
        }
      });

      setSkippedNames(skipped.map((s) => s.name));

      // group.position 등 방금 준 변환은 실제로 렌더링(또는 명시적 갱신)이 있어야 matrixWorld에
      // 반영된다. bounding box는 matrixWorld 기준으로 계산되므로, 갱신 없이 바로 box를 구하면
      // 모든 오브젝트가 원점 근처에 있는 것처럼 계산되어 카메라가 엉뚱하게 맞춰진다.
      scene.updateMatrixWorld(true);
      allGroups.forEach((group) => box.expandByObject(group));

      // ---- 카메라를 전체 매스가 한 화면에 들어오도록 자동 배치 ----
      // box/size/center 계산이 (이론상 있어서는 안 되지만) NaN으로 새는 경우에도 카메라가
      // 원점에 방치되지 않도록, 계산이 유효할 때만 카메라를 옮기고 아니면 기본 위치를 유지한다.
      if (hasAny) {
        const size = new THREE.Vector3();
        const center = new THREE.Vector3();
        box.getSize(size);
        box.getCenter(center);
        const maxDim = Math.max(size.x, size.y, size.z, 20);
        const dist = maxDim * 1.6;
        const validGeometry = isFiniteNum(center.x) && isFiniteNum(center.y) && isFiniteNum(center.z) && isFiniteNum(dist);
        if (validGeometry) {
          camera.position.set(center.x + dist * 0.7, dist * 0.55, center.z + dist * 0.7);
          camera.lookAt(center);
        } else {
          skipped.push({ name: "(카메라 위치 계산)", reason: "동 배치 좌표 계산 결과가 유효하지 않습니다(NaN)." });
          setSkippedNames((prev) => [...prev, "(카메라 위치 계산)"]);
        }
        window.__debugSite3D.box = { size: [size.x, size.y, size.z], center: [center.x, center.y, center.z], maxDim, dist, validGeometry, cameraPos: [camera.position.x, camera.position.y, camera.position.z] };
        controls = new OrbitControls(camera, renderer.domElement);
        controls.target.copy(validGeometry ? center : new THREE.Vector3(0, 0, 0));
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.update();
      } else {
        // 배치된 동은 있었지만 전부 처리에 실패한 경우 - 지면이라도 잘 보이도록 컨트롤은 만들어둔다.
        controls = new OrbitControls(camera, renderer.domElement);
        controls.target.set(0, 0, 0);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.update();
      }

      function animate() {
        animationId = requestAnimationFrame(animate);
        if (controls) controls.update();
        renderer.render(scene, camera);
      }
      animate();

      function handleResize() {
        const w = container.clientWidth || width;
        const h = container.clientHeight || height;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      }
      window.addEventListener("resize", handleResize);

      return () => {
        window.removeEventListener("resize", handleResize);
        cancelAnimationFrame(animationId);
        if (controls) controls.dispose();
        disposables.forEach((d) => d.dispose && d.dispose());
        renderer.dispose();
        container.innerHTML = "";
      };
    } catch (err) {
      setRenderError(err.message || "3D 렌더링 중 오류가 발생했습니다.");
      return undefined;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildings, unitFloorPlans, siteSettings, spacingAdjust]);

  if (noPlacement) {
    return (
      <div className="card card-pad" style={{ textAlign: "center", padding: "60px 20px", color: "var(--ink-faint)", fontSize: 13 }}>
        아직 위치가 지정된 동이 없습니다. 먼저 "동 관리" 탭의 현장 배치도에서 동의 위치를 지정해주세요.
      </div>
    );
  }

  return (
    <div className="card" style={{ overflow: "hidden" }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <label style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink-soft)", flexShrink: 0 }}>배치 간격 보정</label>
        <input
          type="range"
          min="0.1"
          max="8"
          step="0.05"
          value={spacingAdjust}
          onChange={(e) => setSpacingAdjust(Number(e.target.value))}
          style={{ flex: 1, minWidth: 160, maxWidth: 320 }}
        />
        <span className="mono" style={{ fontSize: 12, color: "var(--ink-soft)", width: 46, flexShrink: 0 }}>
          {spacingAdjust.toFixed(2)}x
        </span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSpacingAdjust(1)} disabled={spacingAdjust === 1}>
          자동값으로
        </button>
        <span style={{ fontSize: 11.5, color: "var(--ink-faint)" }}>
          동 사이의 배치 간격만 조정합니다. 건물 자체 크기는 등록된 호실 평면도 실측 그대로입니다.
        </span>
      </div>
      {renderError && (
        <div style={{ padding: "12px 16px", color: "var(--fail)", fontSize: 12.5, borderBottom: "1px solid var(--line)" }}>
          {renderError}
        </div>
      )}
      {skippedNames.length > 0 && (
        <div style={{ padding: "12px 16px", color: "var(--fail)", fontSize: 12.5, borderBottom: "1px solid var(--line)" }}>
          다음 동은 정보가 올바르지 않아 3D로 표시하지 못했습니다: {skippedNames.join(", ")}
        </div>
      )}
      <div ref={containerRef} style={{ width: "100%", height: 560 }} />
      <div style={{ padding: "10px 16px", fontSize: 11.5, color: "var(--ink-faint)", borderTop: "1px solid var(--line)" }}>
        드래그로 회전, 스크롤로 확대·축소할 수 있습니다. 평면도가 등록되지 않은 호실은 반투명 상자로 자리만 표시됩니다.
        {autoScaleInfo && ` (배치도 자동 추정 배율: ${autoScaleInfo.autoScale}×)`}
      </div>
    </div>
  );
}

