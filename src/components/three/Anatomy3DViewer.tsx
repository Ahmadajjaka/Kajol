import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Eye, EyeOff, HeartPulse, Wind, Activity } from 'lucide-react';
import { ExamSystemId, Language } from '../../types/clinical';

interface Anatomy3DViewerProps {
  heartRate: number;
  respiratoryRate: number;
  language: Language;
  focusedSystem: ExamSystemId;
  onSelectOrganSystem: (system: ExamSystemId) => void;
}

type RenderPreset = 'glass' | 'tissue' | 'scan';

const _targetVec = new THREE.Vector3();
const _camGoal = new THREE.Vector3();

function detectSoftwareGl(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export function Anatomy3DViewer({
  heartRate,
  respiratoryRate,
  language,
  focusedSystem,
  onSelectOrganSystem,
}: Anatomy3DViewerProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [renderPreset, setRenderPreset] = useState<RenderPreset>('glass');
  const [dockCollapsed, setDockCollapsed] = useState(false);

  const hrRef = useRef(heartRate);
  const rrRef = useRef(respiratoryRate);
  const presetRef = useRef<RenderPreset>(renderPreset);
  const focusRef = useRef<ExamSystemId>(focusedSystem);

  hrRef.current = heartRate;
  rrRef.current = respiratoryRate;
  presetRef.current = renderPreset;
  focusRef.current = focusedSystem;

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareGl();
    const width = container.clientWidth || 560;
    const height = container.clientHeight || 380;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#081327');
    scene.fog = new THREE.FogExp2('#081327', 0.05);

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 80);
    camera.position.set(0.5, 0.8, 5.4);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    container.appendChild(renderer.domElement);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTex = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    pmremGenerator.dispose();

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.minDistance = 2.8;
    controls.maxDistance = 8.5;

    // 3-Point Studio Lighting
    const hemi = new THREE.HemisphereLight(0x7dd3fc, 0x0b162c, 0.75);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xfff1f2, 1.9);
    keyLight.position.set(4, 5, 5);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x14b8a6, 1.4);
    rimLight.position.set(-4, 2, -4);
    scene.add(rimLight);

    // Composite Multi-Part Thoracic & Cardiac Group (9 distinct anatomical parts)
    const thoraxGroup = new THREE.Group();
    scene.add(thoraxGroup);

    // Materials
    const heartMat = new THREE.MeshPhysicalMaterial({
      color: 0xe11d48,
      roughness: 0.28,
      metalness: 0.08,
      clearcoat: 0.85,
      clearcoatRoughness: 0.18,
      emissive: 0x881337,
      emissiveIntensity: 0.25,
    });

    const vesselMat = new THREE.MeshPhysicalMaterial({
      color: 0xf43f5e,
      roughness: 0.34,
      metalness: 0.1,
      clearcoat: 0.65,
    });

    const pulmonaryMat = new THREE.MeshPhysicalMaterial({
      color: 0x0284c7,
      roughness: 0.3,
      metalness: 0.12,
      clearcoat: 0.6,
    });

    const lungMat = new THREE.MeshPhysicalMaterial({
      color: 0x38bdf8,
      roughness: 0.22,
      metalness: 0.05,
      transparent: true,
      opacity: 0.34,
      transmission: isSoftwareGl ? 0 : 0.45,
      depthWrite: false,
    });

    const airwayMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      roughness: 0.48,
      metalness: 0.35,
    });

    const scanRingMat = new THREE.MeshStandardMaterial({
      color: 0x14b8a6,
      roughness: 0.3,
      metalness: 0.7,
      transparent: true,
      opacity: 0.4,
    });

    // 1. Heart Group (Ventricles + Atria + Aortic Arch + Pulmonary Trunk)
    const heartGroup = new THREE.Group();
    heartGroup.position.set(0.18, -0.08, 0.25);
    thoraxGroup.add(heartGroup);

    // Ventricular Cone (LatheGeometry anatomical silhouette)
    const heartProfile = [
      new THREE.Vector2(0.0, -0.68),
      new THREE.Vector2(0.28, -0.45),
      new THREE.Vector2(0.52, -0.05),
      new THREE.Vector2(0.5, 0.32),
      new THREE.Vector2(0.28, 0.52),
      new THREE.Vector2(0.0, 0.56),
    ];
    const ventricleGeo = new THREE.LatheGeometry(heartProfile, 28);
    const ventricleMesh = new THREE.Mesh(ventricleGeo, heartMat);
    ventricleMesh.rotation.z = 0.28;
    ventricleMesh.scale.set(1.0, 1.05, 0.85);
    heartGroup.add(ventricleMesh);

    // Right Atrium Chamber
    const atriumGeo = new THREE.SphereGeometry(0.28, 20, 20);
    const rightAtrium = new THREE.Mesh(atriumGeo, vesselMat);
    rightAtrium.position.set(-0.32, 0.34, 0.06);
    heartGroup.add(rightAtrium);

    // Aortic Arch Tube
    const aortaCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.02, 0.38, 0.0),
      new THREE.Vector3(-0.08, 0.88, 0.06),
      new THREE.Vector3(0.18, 1.05, -0.08),
      new THREE.Vector3(0.22, 0.3, -0.25),
      new THREE.Vector3(0.14, -0.75, -0.28),
    ]);
    const aortaGeo = new THREE.TubeGeometry(aortaCurve, 40, 0.11, 12, false);
    const aortaMesh = new THREE.Mesh(aortaGeo, vesselMat);
    heartGroup.add(aortaMesh);

    // Pulmonary Artery Trunk
    const pulmCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.12, 0.3, 0.18),
      new THREE.Vector3(0.05, 0.68, 0.14),
      new THREE.Vector3(-0.42, 0.65, -0.02),
    ]);
    const pulmGeo = new THREE.TubeGeometry(pulmCurve, 28, 0.08, 10, false);
    const pulmMesh = new THREE.Mesh(pulmGeo, pulmonaryMat);
    heartGroup.add(pulmMesh);

    // 2. Bilateral Lungs (Left & Right) + Trachea
    const lungGeo = new THREE.SphereGeometry(0.75, 24, 24);
    const rightLung = new THREE.Mesh(lungGeo, lungMat);
    rightLung.position.set(-0.98, 0.15, -0.1);
    rightLung.scale.set(0.85, 1.48, 0.82);
    thoraxGroup.add(rightLung);

    const leftLung = new THREE.Mesh(lungGeo, lungMat);
    leftLung.position.set(1.02, 0.18, -0.1);
    leftLung.scale.set(0.8, 1.44, 0.8);
    thoraxGroup.add(leftLung);

    // Trachea & Carina Bifurcation
    const tracheaCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 1.45, -0.16),
      new THREE.Vector3(0, 0.75, -0.16),
    ]);
    const tracheaGeo = new THREE.TubeGeometry(tracheaCurve, 16, 0.085, 12, false);
    const tracheaMesh = new THREE.Mesh(tracheaGeo, airwayMat);
    thoraxGroup.add(tracheaMesh);

    // Diagnostic Ribcage Framing Rings
    const ribGeo = new THREE.TorusGeometry(1.75, 0.02, 12, 64);
    const ribTop = new THREE.Mesh(ribGeo, scanRingMat);
    ribTop.rotation.x = Math.PI / 2;
    ribTop.position.y = 0.65;
    thoraxGroup.add(ribTop);

    const ribBot = new THREE.Mesh(ribGeo, scanRingMat);
    ribBot.rotation.x = Math.PI / 2;
    ribBot.position.y = -0.65;
    thoraxGroup.add(ribBot);

    let cameraTransitionActive = false;
    const onControlStart = () => {
      cameraTransitionActive = false;
    };
    controls.addEventListener('start', onControlStart);

    const clock = new THREE.Clock();
    let frameId = 0;
    let disposed = false;
    let lastPreset: RenderPreset = presetRef.current;
    let lastFocus: ExamSystemId = focusRef.current;

    function applyRenderPreset(preset: RenderPreset) {
      if (preset === 'scan') {
        lungMat.wireframe = true;
        lungMat.opacity = 0.55;
        heartMat.wireframe = true;
      } else if (preset === 'tissue') {
        lungMat.wireframe = false;
        lungMat.opacity = 0.72;
        heartMat.wireframe = false;
      } else {
        lungMat.wireframe = false;
        lungMat.opacity = 0.34;
        heartMat.wireframe = false;
      }
    }

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function tick() {
      if (disposed) return;
      const dt = Math.min(clock.getDelta(), 0.1);
      const elapsed = clock.getElapsedTime();

      if (presetRef.current !== lastPreset) {
        lastPreset = presetRef.current;
        applyRenderPreset(lastPreset);
      }

      if (focusRef.current !== lastFocus) {
        lastFocus = focusRef.current;
        cameraTransitionActive = true;
      }

      if (cameraTransitionActive) {
        if (lastFocus === 'cardiovascular') {
          _camGoal.set(0.65, 0.25, 3.6);
          _targetVec.set(0.18, -0.05, 0.2);
        } else if (lastFocus === 'respiratory') {
          _camGoal.set(-0.3, 0.55, 5.2);
          _targetVec.set(0, 0.2, -0.08);
        } else {
          _camGoal.set(0.5, 0.8, 5.4);
          _targetVec.set(0, 0.05, 0);
        }
        camera.position.lerp(_camGoal, 1 - Math.exp(-5 * dt));
        controls.target.lerp(_targetVec, 1 - Math.exp(-5 * dt));
        if (camera.position.distanceTo(_camGoal) < 0.05) {
          cameraTransitionActive = false;
        }
      }

      // Physiologically paced Heartbeat & Respiratory Excursion
      const beatsPerSec = Math.max(40, Math.min(180, hrRef.current)) / 60;
      const beatPhase = (elapsed * beatsPerSec) % 1;
      const systoleSpike =
        beatPhase < 0.18
          ? Math.sin((beatPhase / 0.18) * Math.PI) * 0.1
          : beatPhase < 0.35
            ? Math.sin(((beatPhase - 0.18) / 0.17) * Math.PI) * 0.045
            : 0;
      heartGroup.scale.setScalar(1 + systoleSpike);

      const breathsPerSec = Math.max(8, Math.min(45, rrRef.current)) / 60;
      const breathExpand = 1 + Math.sin(elapsed * breathsPerSec * Math.PI * 2) * 0.04;
      rightLung.scale.set(0.85 * breathExpand, 1.48, 0.82 * breathExpand);
      leftLung.scale.set(0.8 * breathExpand, 1.44, 0.8 * breathExpand);

      thoraxGroup.rotation.y = Math.sin(elapsed * 0.25) * 0.12;
      controls.update();
      renderer.render(scene, camera);

      if (isSoftwareGl) afterDraw(tick);
      else frameId = requestAnimationFrame(tick);
    }

    tick();

    const handleResize = () => {
      if (!container || disposed) return;
      const w = container.clientWidth || 560;
      const h = container.clientHeight || 380;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      disposed = true;
      controls.removeEventListener('start', onControlStart);
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      controls.dispose();
      ventricleGeo.dispose();
      atriumGeo.dispose();
      aortaGeo.dispose();
      pulmGeo.dispose();
      lungGeo.dispose();
      tracheaGeo.dispose();
      ribGeo.dispose();
      heartMat.dispose();
      vesselMat.dispose();
      pulmonaryMat.dispose();
      lungMat.dispose();
      airwayMat.dispose();
      scanRingMat.dispose();
      envTex.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div className="relative w-full h-[260px] sm:h-[360px] lg:h-[420px] rounded-2xl overflow-hidden border border-slate-200 dark:border-sky-500/20 bg-[#081327]">
      {/* Isolated WebGL Canvas Container */}
      <div ref={mountRef} className="w-full h-full" />

      {/* Top Left Minimal Telemetry Label (No backdrop-filter over WebGL) */}
      <div className="absolute top-3 start-3 z-10 px-3 py-1.5 rounded-lg bg-[#0B162C]/90 border border-sky-400/25 text-xs text-slate-200 flex items-center gap-3 pointer-events-none">
        <span className="font-mono-tabular text-rose-400">HR {heartRate} bpm</span>
        <span aria-hidden="true" className="text-slate-500">·</span>
        <span className="font-mono-tabular text-sky-400">RR {respiratoryRate} /min</span>
      </div>

      {/* Collapsible Bottom Control Dock (Zero Viewport Occlusion) */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center max-w-[94%]">
        <button
          type="button"
          onClick={() => setDockCollapsed((v) => !v)}
          className="mb-1.5 px-3 py-1 rounded-md bg-[#0B162C]/95 border border-sky-400/25 text-[11px] font-medium text-sky-300 hover:bg-sky-900/60 flex items-center gap-1.5 cursor-pointer"
        >
          {dockCollapsed ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          <span>{dockCollapsed ? (language === 'ar' ? 'إظهار التحكم 3D' : 'Show 3D Controls') : (language === 'ar' ? 'إخفاء التحكم 3D' : 'Hide 3D Controls')}</span>
        </button>

        {!dockCollapsed && (
          <div className="flex flex-wrap items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-[#0B162C]/95 border border-sky-400/25 shadow-lg">
            <button
              type="button"
              onClick={() => onSelectOrganSystem('cardiovascular')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors ${
                focusedSystem === 'cardiovascular'
                  ? 'bg-rose-600 text-white'
                  : 'text-slate-200 hover:bg-slate-800'
              }`}
            >
              <HeartPulse className="w-3.5 h-3.5" />
              <span>{language === 'ar' ? 'القلب' : 'Heart'}</span>
            </button>
            <button
              type="button"
              onClick={() => onSelectOrganSystem('respiratory')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors ${
                focusedSystem === 'respiratory'
                  ? 'bg-sky-600 text-white'
                  : 'text-slate-200 hover:bg-slate-800'
              }`}
            >
              <Wind className="w-3.5 h-3.5" />
              <span>{language === 'ar' ? 'الرئتين' : 'Lungs'}</span>
            </button>
            <button
              type="button"
              onClick={() => onSelectOrganSystem('general')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors ${
                focusedSystem === 'general'
                  ? 'bg-teal-600 text-white'
                  : 'text-slate-200 hover:bg-slate-800'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>{language === 'ar' ? 'المنصف العام' : 'Thorax'}</span>
            </button>

            <span className="h-4 w-px bg-slate-700 mx-1" aria-hidden="true" />

            {(['glass', 'tissue', 'scan'] as RenderPreset[]).map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setRenderPreset(preset)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap cursor-pointer transition-colors ${
                  renderPreset === preset
                    ? 'bg-sky-500/25 text-sky-300 border border-sky-400/40'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {preset === 'glass'
                  ? language === 'ar'
                    ? 'زجاجي'
                    : 'Glass'
                  : preset === 'tissue'
                    ? language === 'ar'
                      ? 'نسيجي'
                      : 'Tissue'
                    : language === 'ar'
                      ? 'مسح شبكي'
                      : 'Scan'}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
