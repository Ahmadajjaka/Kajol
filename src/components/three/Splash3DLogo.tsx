import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Language } from '../../types/clinical';

interface Splash3DLogoProps {
  language: Language;
  onComplete: () => void;
}

const _vec3 = new THREE.Vector3();

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

export function Splash3DLogo({ language, onComplete }: Splash3DLogoProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const completedRef = useRef(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!completedRef.current) {
        completedRef.current = true;
        onComplete();
      }
    }, 4500);
    return () => window.clearTimeout(timer);
  }, [onComplete]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareGl();
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#060E1F');
    scene.fog = new THREE.FogExp2('#060E1F', 0.065);

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
    camera.position.set(0, 0.35, 6.8);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    container.appendChild(renderer.domElement);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTexture = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTexture;
    pmremGenerator.dispose();

    // Studio Lighting Rig
    const hemi = new THREE.HemisphereLight(0x38bdf8, 0x0b162c, 0.85);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xe0f2fe, 2.2);
    keyLight.position.set(4, 5, 6);
    scene.add(keyLight);

    const rimLight = new THREE.PointLight(0x14b8a6, 6.5, 18, 1.5);
    rimLight.position.set(-3.5, 1.8, -2.5);
    scene.add(rimLight);

    const blueAccentLight = new THREE.PointLight(0x0ea5e9, 7.0, 18, 1.5);
    blueAccentLight.position.set(3.5, -1.5, 2.5);
    scene.add(blueAccentLight);

    // Composite 8-Part 3D MAMO Medical Emblem Group
    const emblemGroup = new THREE.Group();
    scene.add(emblemGroup);

    const navyMetalMat = new THREE.MeshPhysicalMaterial({
      color: 0x0f274a,
      metalness: 0.85,
      roughness: 0.2,
      clearcoat: 1.0,
      clearcoatRoughness: 0.12,
    });

    const turquoiseGlassMat = new THREE.MeshPhysicalMaterial({
      color: 0x14b8a6,
      metalness: 0.15,
      roughness: 0.15,
      transmission: isSoftwareGl ? 0 : 0.72,
      transparent: true,
      opacity: isSoftwareGl ? 0.65 : 0.92,
      ior: 1.5,
      thickness: 0.8,
      emissive: 0x0d9488,
      emissiveIntensity: 0.35,
    });

    const skyHaloMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      metalness: 0.75,
      roughness: 0.25,
      emissive: 0x0284c7,
      emissiveIntensity: 0.5,
    });

    // Part 1 & 2: Beveled 3D Medical Cross (Vertical + Horizontal Bars)
    const crossShapeV = new THREE.Shape();
    crossShapeV.moveTo(-0.34, -0.95);
    crossShapeV.lineTo(0.34, -0.95);
    crossShapeV.lineTo(0.34, 0.95);
    crossShapeV.lineTo(-0.34, 0.95);
    crossShapeV.closePath();

    const extrudeSettings = {
      depth: 0.28,
      bevelEnabled: true,
      bevelThickness: 0.06,
      bevelSize: 0.05,
      bevelSegments: 3,
    };

    const crossVGeo = new THREE.ExtrudeGeometry(crossShapeV, extrudeSettings);
    crossVGeo.center();
    const crossVMesh = new THREE.Mesh(crossVGeo, navyMetalMat);
    emblemGroup.add(crossVMesh);

    const crossHMesh = new THREE.Mesh(crossVGeo, navyMetalMat);
    crossHMesh.rotation.z = Math.PI / 2;
    crossHMesh.position.z = 0.02;
    emblemGroup.add(crossHMesh);

    // Part 3: Inner Pulsing Turquoise Core Sphere
    const coreGeo = new THREE.OctahedronGeometry(0.42, 2);
    const coreMesh = new THREE.Mesh(coreGeo, turquoiseGlassMat);
    coreMesh.position.z = 0.24;
    emblemGroup.add(coreMesh);

    // Part 4 & 5: Dual Gyroscopic Clinical Rings
    const outerRingGeo = new THREE.TorusGeometry(1.55, 0.04, 16, 72);
    const outerRing = new THREE.Mesh(outerRingGeo, skyHaloMat);
    outerRing.rotation.x = Math.PI / 5;
    emblemGroup.add(outerRing);

    const innerRingGeo = new THREE.TorusGeometry(1.26, 0.028, 16, 64);
    const innerRing = new THREE.Mesh(innerRingGeo, turquoiseGlassMat);
    innerRing.rotation.y = Math.PI / 3;
    emblemGroup.add(innerRing);

    // Part 6: Orbiting ECG Waveform Curve Tube
    const ecgPoints = [
      new THREE.Vector3(-2.1, 0, 0),
      new THREE.Vector3(-1.1, 0, 0),
      new THREE.Vector3(-0.75, 0.14, 0.2),
      new THREE.Vector3(-0.45, -0.22, 0.28),
      new THREE.Vector3(-0.15, 0.95, 0.35),
      new THREE.Vector3(0.18, -0.45, 0.3),
      new THREE.Vector3(0.45, 0.18, 0.2),
      new THREE.Vector3(0.95, 0, 0),
      new THREE.Vector3(2.1, 0, 0),
    ];
    const ecgCurve = new THREE.CatmullRomCurve3(ecgPoints);
    const ecgTubeGeo = new THREE.TubeGeometry(ecgCurve, 64, 0.035, 10, false);
    const ecgMesh = new THREE.Mesh(ecgTubeGeo, skyHaloMat);
    ecgMesh.position.y = -1.65;
    emblemGroup.add(ecgMesh);

    // Part 7: Subtle Orbital Particles via InstancedMesh
    const particleCount = 28;
    const pGeo = new THREE.SphereGeometry(0.035, 8, 8);
    const particles = new THREE.InstancedMesh(pGeo, skyHaloMat, particleCount);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < particleCount; i++) {
      const angle = (i / particleCount) * Math.PI * 2;
      const radius = 2.05 + (i % 3) * 0.28;
      dummy.position.set(
        Math.cos(angle) * radius,
        Math.sin(angle * 2) * 0.55,
        Math.sin(angle) * radius * 0.5
      );
      dummy.scale.setScalar(0.7 + (i % 3) * 0.25);
      dummy.updateMatrix();
      particles.setMatrixAt(i, dummy.matrix);
    }
    particles.computeBoundingSphere();
    emblemGroup.add(particles);

    // Animation Loop
    const clock = new THREE.Clock();
    let frameId = 0;
    let disposed = false;

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
      const elapsed = clock.getElapsedTime();

      emblemGroup.rotation.y = Math.sin(elapsed * 0.75) * 0.42;
      outerRing.rotation.z = elapsed * 0.55;
      innerRing.rotation.x = -elapsed * 0.68;
      particles.rotation.y = elapsed * 0.22;

      const heartbeat = 1 + Math.pow(Math.max(0, Math.sin(elapsed * 3.8)), 6) * 0.16;
      coreMesh.scale.setScalar(heartbeat);

      _vec3.set(0, 0.1, 0);
      camera.lookAt(_vec3);
      renderer.render(scene, camera);

      if (isSoftwareGl) afterDraw(tick);
      else frameId = requestAnimationFrame(tick);
    }

    tick();

    const handleResize = () => {
      if (!container || disposed) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      disposed = true;
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      crossVGeo.dispose();
      coreGeo.dispose();
      outerRingGeo.dispose();
      innerRingGeo.dispose();
      ecgTubeGeo.dispose();
      pGeo.dispose();
      navyMetalMat.dispose();
      turquoiseGlassMat.dispose();
      skyHaloMat.dispose();
      envTexture.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  const handleSkip = () => {
    if (!completedRef.current) {
      completedRef.current = true;
      onComplete();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#060E1F] text-white overflow-hidden select-none">
      {/* Isolated WebGL Mount */}
      <div ref={mountRef} className="absolute inset-0 w-full h-full" />

      {/* Semantic Overlay (No backdrop-filter over active WebGL) */}
      <div className="relative z-10 h-full flex flex-col justify-between items-center py-10 px-6 pointer-events-none">
        <div className="w-full max-w-6xl flex items-center justify-between">
          <span className="text-xs font-mono-tabular tracking-widest text-sky-300/80 uppercase">
            MAMO Medical Intelligence
          </span>
          <button
            type="button"
            onClick={handleSkip}
            className="pointer-events-auto px-4 py-2 text-xs font-medium text-slate-200 bg-[#0F1D36]/90 border border-sky-400/30 rounded-lg hover:bg-sky-500/20 transition-colors cursor-pointer"
          >
            {language === 'ar' ? 'تخطي المقدمة' : 'Skip Intro'}
          </button>
        </div>

        <div className="text-center max-w-2xl mt-auto pb-8">
          <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-white mb-3">
            MAMO CLINICAL SIMULATOR AI
          </h1>
          <p className="text-base sm:text-xl font-medium text-teal-300 tracking-wide">
            Train Your Clinical Mind.
          </p>
          <div className="mt-6 w-56 h-1 mx-auto bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-sky-400 to-teal-400 animate-[splashBar_4.4s_linear_forwards]" />
          </div>
        </div>
      </div>

      <style>{`
        @keyframes splashBar {
          from { width: 0%; }
          to { width: 100%; }
        }
      `}</style>
    </div>
  );
}
