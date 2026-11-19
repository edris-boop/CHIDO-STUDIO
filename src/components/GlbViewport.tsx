import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export interface GlbModelStats {
  meshCount: number;
  triangleCount: number;
  dimensionsMeters: [number, number, number];
}

interface GlbViewportProps {
  glbUrl: string;
  mode: 'local' | 'cloud';
  wireframe: boolean;
  showGrid: boolean;
  lightingPreset: 'studio' | 'warm' | 'clay';
  onStatsLoaded?: (stats: GlbModelStats) => void;
  resetSignal?: number;
}

const isSoftwareGl = (() => {
  if (typeof document === 'undefined') return false;
  const gl = document.createElement('canvas').getContext('webgl2');
  if (!gl) return true;
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
  const gpu = String(gl.getParameter(param));
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
})();

export function GlbViewport({
  glbUrl,
  mode,
  wireframe,
  showGrid,
  lightingPreset,
  onStatsLoaded,
  resetSignal = 0,
}: GlbViewportProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorText, setErrorText] = useState<string>('');
  const onStatsRef = useRef(onStatsLoaded);
  onStatsRef.current = onStatsLoaded;

  const displayOptsRef = useRef({ wireframe, lightingPreset });
  displayOptsRef.current = { wireframe, lightingPreset };

  const sceneRefs = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    modelGroup: THREE.Group;
    grid: THREE.GridHelper;
    keyLight: THREE.DirectionalLight;
    hemiLight: THREE.HemisphereLight;
    requestRender: () => void;
    applyMaterialDisplay: () => void;
    originalMaterials: Map<THREE.Mesh, THREE.Material | THREE.Material[]>;
    clayMaterial: THREE.MeshStandardMaterial;
    fittedCameraPos: THREE.Vector3;
    fittedTarget: THREE.Vector3;
  } | null>(null);

  // Mount WebGLRenderer + Scene once
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const width = Math.max(320, mount.clientWidth);
    const height = Math.max(240, mount.clientHeight);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setSize(width, height);

    mount.innerHTML = '';
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(mode === 'cloud' ? 0x111827 : 0x1e293b);
    scene.fog = new THREE.Fog(mode === 'cloud' ? 0x111827 : 0x1e293b, 8, 22);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTexture = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTexture;
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.05, 50);
    camera.position.set(2.3, 1.55, 2.5);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0.45, 0);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.08;
    controls.minDistance = 0.8;
    controls.maxDistance = 10;
    controls.maxPolarAngle = Math.PI / 2 - 0.02;

    const hemiLight = new THREE.HemisphereLight(0xdbeafe, 0x334155, 0.95);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff4e6, 2.2);
    keyLight.position.set(3.5, 5.2, 3.0);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.left = -2.5;
    keyLight.shadow.camera.right = 2.5;
    keyLight.shadow.camera.top = 2.5;
    keyLight.shadow.camera.bottom = -2.5;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x93c5fd, 1.0);
    rimLight.position.set(-3.0, 2.4, -3.5);
    scene.add(rimLight);

    // Ground disc & reference grid
    const floorGeom = new THREE.CircleGeometry(4.5, 48);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.92,
      metalness: 0.05,
    });
    const floorMesh = new THREE.Mesh(floorGeom, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.y = -0.002;
    floorMesh.receiveShadow = true;
    scene.add(floorMesh);

    const grid = new THREE.GridHelper(6, 12, 0x475569, 0x334155);
    grid.position.y = 0.002;
    scene.add(grid);

    const modelGroup = new THREE.Group();
    scene.add(modelGroup);

    const clayMaterial = new THREE.MeshStandardMaterial({
      color: 0xd6d3d1,
      roughness: 0.72,
      metalness: 0.05,
    });

    const originalMaterials = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();

    let rafId = 0;
    let cooldownTimer = 0;
    let renderScheduled = false;
    let renderDirty = false;
    let disposed = false;

    function requestRender() {
      if (disposed) return;
      if (renderScheduled) {
        renderDirty = true;
        return;
      }
      renderScheduled = true;
      rafId = requestAnimationFrame(() => {
        if (disposed) return;
        renderDirty = false;
        controls.update();
        renderer.render(scene, camera);

        const finish = () => {
          renderScheduled = false;
          if (renderDirty && !disposed) {
            requestRender();
          }
        };

        if (isSoftwareGl) {
          // Brief cooldown prevents starving software WebGL during continuous pointer drags
          cooldownTimer = window.setTimeout(finish, 32);
        } else {
          finish();
        }
      });
    }

    function applyMaterialDisplay() {
      const { wireframe: wf, lightingPreset: preset } = displayOptsRef.current;
      modelGroup.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        if (preset === 'clay') {
          clayMaterial.wireframe = wf;
          mesh.material = clayMaterial;
        } else {
          const orig = originalMaterials.get(mesh);
          if (orig) {
            mesh.material = orig;
          }
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const m of mats) {
            if ('wireframe' in m) {
              (m as THREE.MeshStandardMaterial).wireframe = wf;
            }
          }
        }
      });
    }

    controls.addEventListener('change', requestRender);

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.max(240, Math.floor(entry.contentRect.width));
        const h = Math.max(200, Math.floor(entry.contentRect.height));
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
        requestRender();
      }
    });
    ro.observe(mount);

    sceneRefs.current = {
      renderer,
      scene,
      camera,
      controls,
      modelGroup,
      grid,
      keyLight,
      hemiLight,
      requestRender,
      applyMaterialDisplay,
      originalMaterials,
      clayMaterial,
      fittedCameraPos: new THREE.Vector3(2.3, 1.55, 2.5),
      fittedTarget: new THREE.Vector3(0, 0.45, 0),
    };

    requestRender();

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      clearTimeout(cooldownTimer);
      ro.disconnect();
      controls.dispose();
      floorGeom.dispose();
      floorMat.dispose();
      clayMaterial.dispose();
      envTexture.dispose();
      renderer.dispose();
      sceneRefs.current = null;
    };
  }, []);

  // Load GLB model when URL changes
  useEffect(() => {
    const refs = sceneRefs.current;
    if (!refs || !glbUrl) return;

    let cancelled = false;
    setLoadState('loading');
    setErrorText('');

    const loader = new GLTFLoader();
    loader.load(
      glbUrl,
      (gltf) => {
        if (cancelled) return;

        // Clear previous meshes cleanly
        refs.modelGroup.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            (child as THREE.Mesh).geometry.dispose();
          }
        });
        refs.modelGroup.clear();
        refs.originalMaterials.clear();

        const root = gltf.scene;
        root.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(root);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());

        // Ground at y = 0 and center horizontally
        root.position.x -= center.x;
        root.position.z -= center.z;
        root.position.y -= box.min.y;

        let meshCount = 0;
        let triangleCount = 0;
        root.traverse((obj) => {
          const mesh = obj as THREE.Mesh;
          if (mesh.isMesh) {
            meshCount += 1;
            mesh.castShadow = !isSoftwareGl;
            mesh.receiveShadow = true;
            refs.originalMaterials.set(mesh, mesh.material);
            if (mesh.geometry.index) {
              triangleCount += mesh.geometry.index.count / 3;
            } else if (mesh.geometry.attributes.position) {
              triangleCount += mesh.geometry.attributes.position.count / 3;
            }
          }
        });

        refs.modelGroup.add(root);
        refs.applyMaterialDisplay();

        const maxDim = Math.max(size.x, size.y, size.z, 0.5);
        refs.fittedTarget.set(0, size.y * 0.45, 0);
        refs.fittedCameraPos.set(maxDim * 1.45, maxDim * 0.95, maxDim * 1.55);
        refs.controls.target.copy(refs.fittedTarget);
        refs.camera.position.copy(refs.fittedCameraPos);
        refs.controls.update();

        setLoadState('ready');
        onStatsRef.current?.({
          meshCount,
          triangleCount: Math.round(triangleCount),
          dimensionsMeters: [
            Number(size.x.toFixed(2)),
            Number(size.y.toFixed(2)),
            Number(size.z.toFixed(2)),
          ],
        });
        refs.requestRender();
      },
      undefined,
      (err) => {
        if (cancelled) return;
        setLoadState('error');
        setErrorText(err instanceof Error ? err.message : 'خطا در بارگذاری فایل GLB');
      }
    );

    return () => {
      cancelled = true;
    };
  }, [glbUrl]);

  // Apply wireframe, grid, mode, and lighting updates without tearing down canvas
  useEffect(() => {
    const refs = sceneRefs.current;
    if (!refs) return;

    const bgHex = mode === 'cloud' ? 0x111827 : 0x1e293b;
    refs.scene.background = new THREE.Color(bgHex);
    refs.scene.fog = new THREE.Fog(bgHex, 8, 22);
    refs.grid.visible = showGrid;

    if (lightingPreset === 'warm') {
      refs.keyLight.color.setHex(0xffedd5);
      refs.keyLight.intensity = 2.5;
      refs.hemiLight.intensity = 0.75;
    } else {
      refs.keyLight.color.setHex(0xfff7ed);
      refs.keyLight.intensity = 2.2;
      refs.hemiLight.intensity = 0.95;
    }

    refs.applyMaterialDisplay();
    refs.requestRender();
  }, [mode, wireframe, showGrid, lightingPreset]);

  // Camera reset
  useEffect(() => {
    const refs = sceneRefs.current;
    if (!refs || resetSignal === 0) return;
    refs.camera.position.copy(refs.fittedCameraPos);
    refs.controls.target.copy(refs.fittedTarget);
    refs.controls.update();
    refs.requestRender();
  }, [resetSignal]);

  return (
    <div className="relative w-full h-full min-h-[360px] rounded-xl overflow-hidden bg-slate-900 border border-slate-700/60">
      <div ref={mountRef} data-testid="glb-canvas-mount" className="w-full h-full" />
      {loadState === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80 text-slate-200 text-xs">
          در حال بارگذاری مدل سه‌بعدی GLB...
        </div>
      )}
      {loadState === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-900/90 text-rose-300 text-xs p-4 text-center">
          {errorText}
        </div>
      )}
    </div>
  );
}
