import * as THREE from 'three';
import { BloomEffect, EffectComposer, EffectPass, RenderPass } from 'postprocessing';
import { ChaseCamera } from './camera/chase-camera';
import { CityWorld } from './world/world';
import { PlayerVehicle, type DriveInput } from './vehicle/vehicle';
import './style.css';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('App root was not found');
app.innerHTML = '<div class="boot-screen"><span class="boot-mark">N</span><span>BUILDING THE NIGHT</span><i></i></div>';
const RAPIER = await import('@dimforge/rapier3d-compat');
await RAPIER.init();

app.innerHTML = `
  <canvas id="game-canvas" aria-label="Neon City game"></canvas>
  <div class="grain" aria-hidden="true"></div>
  <header class="topbar">
    <a class="brand" href="#" aria-label="Neon City home"><span class="brand-mark">N</span><span>NEON<span class="brand-muted">CITY</span></span></a>
    <div class="topbar-status"><span class="status-dot"></span><span>VICE DISTRICT</span><i></i><span>1986</span></div>
    <div class="station-tag"><span>FM</span> 88.4 <i>STEREO</i></div>
  </header>
  <div class="crosshair" aria-hidden="true"><span></span><span></span></div>
  <section id="intro" class="intro-screen">
    <div class="intro-copy">
      <p class="eyebrow"><span class="eyebrow-line"></span> WELCOME TO THE AFTERGLOW</p>
      <h1>NEON<br><span>CITY</span></h1>
      <p class="intro-description">The night is yours.<br>Find your line through the city.</p>
      <button id="play-button" class="play-button"><span>ENTER THE CITY</span><b>↗</b></button>
      <p class="intro-meta">OPEN WORLD <span>·</span> NIGHT DRIVE <span>·</span> NO RULES</p>
    </div>
    <div class="intro-orbit" aria-hidden="true"><div class="orbit-ring"></div><div class="orbit-ring orbit-ring-two"></div><div class="orbit-core"></div><span>25° 46' N<br>80° 12' W</span></div>
    <div class="intro-footer"><span>MIAMI, FLORIDA</span><span>01 — 08</span><span>STAY FOR THE SUNRISE</span></div>
  </section>
  <aside id="hud" class="hud" aria-live="polite">
    <div class="hud-left"><div class="speed-card"><span class="hud-label">GROUND SPEED</span><div class="speed-value"><strong id="speed-value">000</strong><span>KM/H</span></div><div class="speed-track"><i id="speed-bar"></i></div><div class="gear-row"><span>GEAR <b id="gear-value">N</b></span><span>DRIVE MODE <b id="drive-value">CRUISE</b></span></div></div></div>
    <div class="hud-right"><div class="district-card"><span class="hud-label">CURRENT DISTRICT</span><strong>OCEAN DRIVE</strong><span class="district-coords">SOUTH BEACH <i>↗</i></span></div><div class="mini-map"><div class="map-grid"></div><span class="map-player"></span><span class="map-pulse"></span><span class="map-label">MAP / 01</span></div></div>
    <div class="control-hint"><span class="keycap">W</span><span class="keycap">A</span><span class="keycap">S</span><span class="keycap">D</span><span>DRIVE</span><span class="hint-gap"></span><span class="keycap wide">SPACE</span><span>HANDBRAKE</span></div>
  </aside>
  <section id="pause-screen" class="pause-screen hidden"><p class="eyebrow">TAKE YOUR TIME</p><h2>PAUSED</h2><button id="resume-button" class="play-button"><span>BACK TO THE NIGHT</span><b>↗</b></button><p class="pause-help">PRESS ESC TO RESUME</p></section>
  <div class="corner-note"><span>NEON CITY / 001</span><span>PROCEDURAL NIGHTS</span></div>
`;

const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas')!;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.shadowMap.enabled = false;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x55304f, 0.00235);
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(850, 24, 16),
  new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader: 'varying vec3 vDirection; void main(){ vDirection = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `
      varying vec3 vDirection;
      void main() {
        float h = normalize(vDirection).y;
        vec3 top = vec3(0.035, 0.045, 0.13);
        vec3 violet = vec3(0.27, 0.12, 0.34);
        vec3 rose = vec3(0.78, 0.25, 0.43);
        vec3 amber = vec3(1.0, 0.48, 0.25);
        vec3 color = mix(amber, rose, smoothstep(-0.08, 0.10, h));
        color = mix(color, violet, smoothstep(0.08, 0.35, h));
        color = mix(color, top, smoothstep(0.34, 0.72, h));
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  }),
);
scene.add(sky);
scene.add(new THREE.HemisphereLight(0x9c81ff, 0x1b1a2b, 1.05));
const moonlight = new THREE.DirectionalLight(0xffa77d, 1.1);
moonlight.position.set(-45, 85, -25);
scene.add(moonlight);
const ambientNeon = new THREE.PointLight(0x7427ad, 135, 240, 2);
ambientNeon.position.set(5, 18, 5);
scene.add(ambientNeon);

const physics = new RAPIER.World({ x: 0, y: -19.62, z: 0 });
physics.timestep = 1 / 60;
const city = new CityWorld(physics, RAPIER);
city.build();
scene.add(city.group);
const vehicle = new PlayerVehicle(physics, RAPIER);
scene.add(vehicle.visual);

const camera = new THREE.PerspectiveCamera(64, window.innerWidth / window.innerHeight, 0.1, 1100);
const chaseCamera = new ChaseCamera();
const composer = new EffectComposer(renderer, { multisampling: 0 });
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new EffectPass(camera, new BloomEffect({ intensity: 1.3, luminanceThreshold: 0.68, luminanceSmoothing: 0.16, mipmapBlur: true })));

const input: DriveInput = { throttle: 0, steer: 0, handbrake: false };
const held = new Set<string>();
const codeSet = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);
let started = false;
let paused = false;
let overheadView = false;
const intro = document.querySelector<HTMLElement>('#intro')!;
const pauseScreen = document.querySelector<HTMLElement>('#pause-screen')!;
const hud = document.querySelector<HTMLElement>('#hud')!;

function updateInput(): void {
  input.throttle = Number(held.has('KeyW') || held.has('ArrowUp')) - Number(held.has('KeyS') || held.has('ArrowDown'));
  input.steer = Number(held.has('KeyD') || held.has('ArrowRight')) - Number(held.has('KeyA') || held.has('ArrowLeft'));
  input.handbrake = held.has('Space');
}

window.addEventListener('keydown', (event) => {
  if (codeSet.has(event.code)) event.preventDefault();
  if (event.code === 'Escape' && started) {
    paused = !paused;
    pauseScreen.classList.toggle('hidden', !paused);
    held.clear();
    updateInput();
  }
  if (event.code === 'KeyV' && started && !paused) overheadView = !overheadView;
  if (codeSet.has(event.code)) held.add(event.code);
  updateInput();
});
window.addEventListener('keyup', (event) => {
  held.delete(event.code);
  updateInput();
});
window.addEventListener('blur', () => {
  held.clear();
  updateInput();
});

function beginDrive(): void {
  started = true;
  paused = false;
  intro.classList.add('intro-hidden');
  pauseScreen.classList.add('hidden');
  hud.classList.add('hud-visible');
  document.body.classList.add('playing');
}
document.querySelector<HTMLButtonElement>('#play-button')!.addEventListener('click', beginDrive);
document.querySelector<HTMLButtonElement>('#resume-button')!.addEventListener('click', () => {
  paused = false;
  pauseScreen.classList.add('hidden');
});
const speedValue = document.querySelector<HTMLElement>('#speed-value')!;
const speedBar = document.querySelector<HTMLElement>('#speed-bar')!;
const gearValue = document.querySelector<HTMLElement>('#gear-value')!;
const driveValue = document.querySelector<HTMLElement>('#drive-value')!;
let lastFrame = performance.now();
let hudElapsed = 0;

function animate(frameTime: number): void {
  requestAnimationFrame(animate);
  const delta = Math.min((frameTime - lastFrame) / 1000, 0.05);
  lastFrame = frameTime;
  if (started && !paused) vehicle.update(input, delta, physics);
  const position = vehicle.position;
  if (overheadView) {
    camera.position.lerp(position.clone().add(new THREE.Vector3(0, 78, 0.01)), 1 - Math.exp(-delta * 3));
    camera.lookAt(position);
  } else {
    chaseCamera.update(camera, position, vehicle.yaw, vehicle.speedKmh, delta);
  }
  if (started && !paused) {
    hudElapsed += delta;
    if (hudElapsed > 0.08) {
      const speed = vehicle.speedKmh;
      speedValue.textContent = String(speed).padStart(3, '0');
      speedBar.style.width = `${Math.min(speed / 160, 1) * 100}%`;
      gearValue.textContent = speed < 1 ? 'N' : String(Math.min(5, Math.ceil(speed / 32)));
      driveValue.textContent = input.handbrake ? 'SLIDE' : speed > 4 ? 'SPORT' : 'CRUISE';
      hudElapsed = 0;
    }
  }
  composer.render();
}
animate(performance.now());

function onResize(): void {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
  renderer.setSize(width, height);
  composer.setSize(width, height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', onResize);

