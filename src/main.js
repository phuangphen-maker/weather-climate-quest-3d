import * as THREE from "three";
import questions from "./questions.json";
import "./style.css";
const $ = (s) => document.querySelector(s),
  overlay = $("#overlay"),
  KEY = "weather-quest-v1";
const stages = [
  ["ความดันอากาศกับความสูง", "ว 2.2 ม.1/1", 0x88bfa1],
  ["ชั้นบรรยากาศ", "ว 3.2 ม.1/1", 0x8daed0],
  ["ปัจจัยที่มีผลต่อลมฟ้าอากาศ", "ว 3.2 ม.1/2", 0x9fcdb5],
  ["พายุและการรับมือ", "ว 3.2 ม.1/3", 0x8d9cab],
  ["การพยากรณ์อากาศ", "ว 3.2 ม.1/4–5", 0xc4cda0],
  ["การเปลี่ยนแปลงภูมิอากาศโลก", "ว 3.2 ม.1/6–7", 0xabc1a0],
];
const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
let state = null,
  stage = 0,
  muted = false,
  audio,
  nearest = -1,
  vy = 0,
  grounded = true,
  active = false,
  toastTimer;
const keys = new Set();
try {
  const s = JSON.parse(localStorage.getItem(KEY));
  if (
    s?.version === 1 &&
    s.profile &&
    Array.isArray(s.answers) &&
    s.answers.length === 30 &&
    s.answers.every(
      (a) => a === null || (Number.isInteger(a) && a >= 0 && a < 4),
    )
  ) {
    state = s;
    stage = Math.min(5, Math.max(0, s.stage | 0));
  }
} catch {}
function save() {
  if (!state) return;
  state.stage = stage;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    toast("บันทึกไม่ได้: พื้นที่จัดเก็บไม่พร้อม โปรดดาวน์โหลด CSV ก่อนปิด");
  }
}
function toast(t) {
  $("#toast").textContent = t;
  $("#toast").style.display = "block";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($("#toast").style.display = "none"), 3500);
}
function beep(ok = true) {
  if (muted) return;
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    audio.resume();
    const o = audio.createOscillator(),
      g = audio.createGain();
    o.connect(g);
    g.connect(audio.destination);
    o.frequency.setValueAtTime(ok ? 523 : 220, audio.currentTime);
    o.frequency.exponentialRampToValueAtTime(
      ok ? 784 : 165,
      audio.currentTime + 0.15,
    );
    g.gain.setValueAtTime(0.07, audio.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.3);
    o.start();
    o.stop(audio.currentTime + 0.3);
  } catch {}
}
$("#sound").onclick = () => {
  muted = !muted;
  $("#sound").textContent = `เสียง: ${muted ? "ปิด" : "เปิด"}`;
  if (!muted) beep();
};
function card(html) {
  keys.clear();
  overlay.innerHTML = `<section class="card" role="dialog" aria-modal="true">${html}</section>`;
  overlay.querySelector("button,input,select")?.focus();
}
function close() {
  overlay.innerHTML = "";
  keys.clear();
}
function login() {
  card(
    `<div class="eyebrow">ออกเดินทางสู่โลกวิทยาศาสตร์</div><h1>Weather & Climate<br><em>Quest 3D</em></h1><p>สวมบทนักสำรวจ เดินทางผ่าน 6 โลก ทดลองวิทยาศาสตร์ และค้นหาคำตอบเรื่องลมฟ้าอากาศ</p><div class="tags"><span>6 ด่านผจญภัย</span><span>30 คำถาม</span><span>สำหรับ ม.1</span></div><form id="register"><div class="fields"><label>ชื่อ–นามสกุล<input name="name" required maxlength="100" placeholder="ชื่อและนามสกุลของนักสำรวจ" autocomplete="name"></label><label>ชั้น<input name="classroom" required maxlength="30" placeholder="เช่น ม.1/1"></label><label>เลขที่<input name="number" required type="number" min="1" max="999" step="1" placeholder="เลขที่"></label></div><button class="primary">เริ่มการผจญภัย →</button></form>${state ? '<button id="resume" class="secondary" style="width:100%;margin-top:10px">เล่นต่อจากความคืบหน้าที่บันทึกไว้</button>' : ""}<p class="muted">บันทึกในอุปกรณ์นี้เท่านั้น ไม่มีการส่งข้อมูลนักเรียนไปยังเซิร์ฟเวอร์ การเริ่มใหม่จะแทนที่ข้อมูลเดิม</p>`,
  );
  $("#register").onsubmit = (e) => {
    e.preventDefault();
    const f = new FormData(e.target),
      name = f.get("name").trim(),
      room = f.get("classroom").trim();
    if (!name || !room) return toast("กรุณากรอกชื่อและชั้น");
    state = {
      version: 1,
      profile: { name, classroom: room, number: f.get("number") },
      answers: Array(30).fill(null),
      stage: 0,
      startedAt: new Date().toISOString(),
    };
    stage = 0;
    save();
    start();
  };
  if ($("#resume")) $("#resume").onclick = start;
}
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xc9e5e7);
scene.fog = new THREE.Fog(0xc9e5e7, 35, 95);
const renderer = new THREE.WebGLRenderer({
  canvas: $("#world"),
  antialias: true,
});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 150);
scene.add(new THREE.HemisphereLight(0xffffff, 0x6a8979, 2.4));
const sun = new THREE.DirectionalLight(0xfff3d7, 3);
sun.position.set(-12, 26, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -35;
sun.shadow.camera.right = 35;
sun.shadow.camera.top = 35;
sun.shadow.camera.bottom = -35;
scene.add(sun);
function mesh(geo, color, parent = scene) {
  const m = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ color, roughness: 0.85 }),
  );
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
function box(w, h, d, color, x, y, z, parent = scene) {
  const m = mesh(new THREE.BoxGeometry(w, h, d), color, parent);
  m.position.set(x, y, z);
  return m;
}
const terrain = new THREE.Group();
scene.add(terrain);
const markers = [],
  clouds = [];
const player = new THREE.Group();
scene.add(player);
box(0.62, 0.85, 0.4, 0xe9a249, 0, 1.12, 0, player);
mesh(new THREE.SphereGeometry(0.31, 16, 12), 0xf1c6a0, player).position.set(
  0,
  1.85,
  0,
);
mesh(
  new THREE.CylinderGeometry(0.4, 0.4, 0.12, 16),
  0xf8e1ac,
  player,
).position.set(0, 2.08, 0);
box(0.35, 0.5, 0.22, 0x315c60, 0, 1.2, 0.3, player);
const legs = [
  box(0.21, 0.65, 0.23, 0x284e58, -0.19, 0.4, 0, player),
  box(0.21, 0.65, 0.23, 0x284e58, 0.19, 0.4, 0, player),
];
box(0.18, 0.7, 0.2, 0xf1c6a0, -0.43, 1.08, 0, player);
box(0.18, 0.7, 0.2, 0xf1c6a0, 0.43, 1.08, 0, player);
const locations = [
  [-9, 7],
  [8, 1],
  [-8, -7],
  [9, -15],
  [0, -24],
];
function label(text, color) {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext("2d");
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(64, 64, 58, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = "bold 80px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 64, 68);
  const tex = new THREE.CanvasTexture(c),
    s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex }));
  s.scale.set(1.9, 1.9, 1);
  return s;
}
function buildWorld() {
  for (const obj of [...terrain.children]) {
    obj.traverse((o) => {
      o.geometry?.dispose();
      if (o.material) {
        o.material.map?.dispose();
        o.material.dispose();
      }
    });
    terrain.remove(obj);
  }
  markers.length = 0;
  clouds.length = 0;
  box(42, 1.8, 62, stages[stage][2], 0, -1, -8, terrain);
  box(5, 0.06, 52, 0xe6d8ae, 0, -0.06, -8, terrain);
  for (let i = 0; i < 5; i++) {
    const [x, z] = locations[i];
    box(Math.abs(x) + 1, 0.08, 2, 0xe6d8ae, x / 2, -0.04, z, terrain);
    const ring = mesh(
      new THREE.CylinderGeometry(1.3, 1.5, 0.35, 32),
      0xf1deb0,
      terrain,
    );
    ring.position.set(x, 0.1, z);
    const s = label(
      state?.answers[stage * 5 + i] !== null && state ? "✓" : "?",
      state?.answers[stage * 5 + i] !== null && state ? "#2d8a70" : "#db9841",
    );
    s.position.set(x, 2.7, z);
    terrain.add(s);
    markers.push(s);
  }
  for (let i = 0; i < 28; i++) {
    const x = (i % 2 ? 1 : -1) * (13 + ((i * 7) % 7)),
      z = -33 + ((i * 13) % 53);
    const tree = new THREE.Group();
    terrain.add(tree);
    tree.position.set(x, 0, z);
    box(0.35, 1.8, 0.35, 0x93785b, 0, 0.8, 0, tree);
    mesh(
      new THREE.ConeGeometry(1.3, 3, 7),
      stage === 3 ? 0x526e73 : 0x4c8b70,
      tree,
    ).position.y = 2.6;
  }
  for (let i = 0; i < 7; i++) {
    const c = new THREE.Group();
    terrain.add(c);
    c.position.set(-25 + i * 9, 11 + (i % 3), -29 + (i % 2) * 24);
    for (let j = 0; j < 3; j++)
      mesh(
        new THREE.SphereGeometry(1.6, 10, 8),
        stage === 3 ? 0x8597a4 : 0xf5faf1,
        c,
      ).position.set(j * 1.7, (j % 2) * 0.6, 0);
    clouds.push(c);
  }
  // A visible water-filled pit: the physical ground is absent within this region.
  box(5, 0.13, 5, 0x3b91a6, 6, -0.15, 11, terrain);
  for (let i = 0; i < 9; i++) {
    const m = mesh(
      new THREE.ConeGeometry(4, 7 + (i % 3), 5),
      0x799a92,
      terrain,
    );
    m.position.set(-33 + i * 8, 1, -48);
  }
  // Distinct scientific landmarks for each expedition.
  if (stage === 0) {
    for (let i = 0; i < 4; i++)
      box(
        3,
        1.5 * (i + 1),
        3,
        0xa8b7a1,
        -16,
        0.75 * (i + 1),
        -16 - i * 4,
        terrain,
      );
  }
  if (stage === 1) {
    for (let i = 0; i < 5; i++)
      box(
        3,
        0.6,
        3,
        [0x7bbcb1, 0x6ca5cf, 0x8e88bf, 0xb79bcd, 0xd2bbdb][i],
        -16,
        1 + i * 1.5,
        -15,
        terrain,
      );
  }
  if (stage === 2) {
    const pole = box(0.18, 5, 0.18, 0xf4e5c5, -16, 2.5, -15, terrain);
    box(2, 0.8, 0.1, 0xe3ab56, -15, 4.5, -15, terrain);
  }
  if (stage === 3) {
    for (let i = 0; i < 9; i++) {
      const a = i * 0.9;
      mesh(new THREE.SphereGeometry(1.4, 8, 8), 0x687e8c, terrain).position.set(
        -16 + Math.cos(a) * 2,
        1 + i * 0.6,
        -15 + Math.sin(a) * 2,
      );
    }
  }
  if (stage === 4) {
    box(3, 2.5, 3, 0xf4e9c9, -16, 1.25, -15, terrain);
    mesh(new THREE.SphereGeometry(1.8, 12, 8), 0xf1f4e8, terrain).position.set(
      -16,
      4,
      -15,
    );
  }
  if (stage === 5) {
    for (let i = 0; i < 3; i++)
      box(2, 0.2, 2, 0x355e85, -17 + i * 2, 1, -15, terrain);
  }
  player.position.set(0, 0, 15);
  vy = 0;
  player.rotation.y = 0;
  camera.position.set(0, 8, 27);
}
function score() {
  return state.answers.reduce(
    (s, a, i) => s + (a === questions[i].answer ? 1 : 0),
    0,
  );
}
function hud() {
  $("#stageTitle").textContent = `${stage + 1}. ${stages[stage][0]}`;
  $("#standard").textContent =
    `EXPEDITION 0${stage + 1} / 06 · ${stages[stage][1]}`;
  $("#score").textContent = `${score()} / 30`;
  $("#playerName").textContent = state.profile.name;
  $("#progress").innerHTML = Array.from(
    { length: 5 },
    (_, i) =>
      `<span class="dot ${state.answers[stage * 5 + i] !== null ? "done" : ""}"></span>`,
  ).join("");
}
function start() {
  active = true;
  ["#hud", "#guide", "#mobile"].forEach((s) => ($(s).hidden = false));
  close();
  buildWorld();
  hud();
  save();
  if (state.answers.every((a) => a !== null)) summary();
  else toast("เดินไปหาเครื่องหมาย ? หรือเปิดห้องทดลอง");
}
function ask(i) {
  const index = stage * 5 + i,
    q = questions[index];
  if (state.answers[index] !== null)
    return toast("ตอบจุดนี้แล้ว ลองสำรวจจุดอื่น");
  card(
    `<div class="eyebrow">ด่าน ${stage + 1} · ข้อ ${index + 1} / 30</div><h2>${esc(q.question)}</h2><div id="options">${q.options.map((o, k) => `<button class="option" data-answer="${k}"><span>${"กขคง"[k]}</span>${esc(o)}</button>`).join("")}</div><div id="feedback" aria-live="polite"></div><button id="cancel" class="secondary">กลับไปสำรวจ</button>`,
  );
  $("#cancel").onclick = close;
  document.querySelectorAll("[data-answer]").forEach(
    (b) =>
      (b.onclick = () => {
        if (state.answers[index] !== null) return;
        const a = +b.dataset.answer;
        state.answers[index] = a;
        if (state.answers.every((x) => x !== null))
          state.completedAt = new Date().toISOString();
        save();
        beep(a === q.answer);
        document.querySelectorAll("[data-answer]").forEach((el) => {
          el.disabled = true;
          if (+el.dataset.answer === q.answer) el.classList.add("correct");
          else if (el === b) el.classList.add("wrong");
        });
        $("#feedback").innerHTML =
          `<div class="feedback"><b>${a === q.answer ? "ถูกต้อง! +1 คะแนน" : "ยังไม่ถูกต้อง"}</b><br>เฉลย ${"กขคง"[q.answer]}. ${esc(q.options[q.answer])}<br>${esc(q.explanation)}</div>`;
        $("#cancel").textContent = "อ่านแล้ว · สำรวจต่อ →";
        $("#cancel").onclick = () => {
          close();
          buildMarkers();
          hud();
          if (
            state.answers
              .slice(stage * 5, stage * 5 + 5)
              .every((x) => x !== null)
          )
            stageDone();
        };
        hud();
      }),
  );
}
function buildMarkers() {
  markers.forEach((s, i) => {
    if (state.answers[stage * 5 + i] !== null) {
      s.material.map.dispose();
      s.material.dispose();
      const replacement = label("✓", "#2d8a70");
      s.material = replacement.material;
    }
  });
}
function stageDone() {
  if (stage === 5) return summary();
  card(
    `<div class="eyebrow">EXPEDITION COMPLETE</div><h1>ผ่านด่าน ${stage + 1} แล้ว!</h1><p>สะสมแล้ว ${score()} คะแนนจาก 30 คะแนน<br>พร้อมออกเดินทางสู่${esc(stages[stage + 1][0])}</p><button id="next" class="primary">ไปด่าน ${stage + 2} →</button><button id="stay" class="secondary">สำรวจด่านนี้ต่อ</button>`,
  );
  $("#next").onclick = () => {
    stage++;
    save();
    close();
    buildWorld();
    hud();
    lab();
  };
  $("#stay").onclick = close;
}
function csv() {
  const cell = (v) => {
    let text = String(v);
    if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  };
  const rows = [
    [
      "ชื่อ–นามสกุล",
      "ชั้น",
      "เลขที่",
      "ด่าน",
      "ข้อ",
      "คำถาม",
      "คำตอบที่เลือก",
      "เฉลย",
      "คะแนน",
      "คำอธิบาย",
    ],
    ...questions.map((q, i) => [
      state.profile.name,
      state.profile.classroom,
      state.profile.number,
      Math.floor(i / 5) + 1,
      i + 1,
      q.question,
      state.answers[i] === null ? "ยังไม่ตอบ" : q.options[state.answers[i]],
      q.options[q.answer],
      state.answers[i] === q.answer ? 1 : 0,
      q.explanation,
    ]),
    ["รวม", "", "", "", "", "", "", "", score(), "คะแนนเต็ม 30"],
  ];
  const blob = new Blob(
      ["\ufeff" + rows.map((r) => r.map(cell).join(",")).join("\r\n")],
      { type: "text/csv;charset=utf-8" },
    ),
    url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = "weather-climate-results.csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function summary() {
  const complete = state.answers.every((a) => a !== null);
  card(
    `<div class="eyebrow">${complete ? "QUEST COMPLETE" : "EXPLORER JOURNAL"}</div><h1>${complete ? "สำรวจครบทั้ง 6 ด่าน!" : "บันทึกการเดินทาง"}</h1><p>${esc(state.profile.name)} · ${esc(state.profile.classroom)} · เลขที่ ${esc(state.profile.number)}</p><div class="bigscore">${score()} <small>/ 30 คะแนน</small></div><p>ตอบแล้ว ${state.answers.filter((x) => x !== null).length} / 30 ข้อ</p><table><thead><tr><th>ด่าน</th><th>ตอบแล้ว</th><th>คะแนน</th></tr></thead><tbody>${stages.map((s, i) => `<tr><td>${i + 1}. ${s[0]}</td><td>${state.answers.slice(i * 5, i * 5 + 5).filter((x) => x !== null).length}/5</td><td>${state.answers.slice(i * 5, i * 5 + 5).reduce((n, a, k) => n + (a === questions[i * 5 + k].answer ? 1 : 0), 0)}/5</td></tr>`).join("")}</tbody></table><div class="row"><button id="download" class="primary">ดาวน์โหลด CSV</button><button id="back" class="secondary">สำรวจต่อ</button>${!complete && state.answers.slice(stage * 5, stage * 5 + 5).every((x) => x !== null) && stage < 5 ? '<button id="goNext">ไปด่านถัดไป →</button>' : ""}<button id="restart">เริ่มเกมใหม่จากด่าน 1</button></div><div id="confirm"></div>`,
  );
  $("#download").onclick = csv;
  $("#back").onclick = close;
  if ($("#goNext"))
    $("#goNext").onclick = () => {
      stage++;
      save();
      close();
      buildWorld();
      hud();
      lab();
    };
  $("#restart").onclick = () => {
    $("#confirm").innerHTML =
      '<p>เริ่มใหม่จะล้างคำตอบเดิม ควรดาวน์โหลด CSV ก่อน</p><button id="yesRestart" class="primary">ยืนยันเริ่มเกมใหม่</button>';
    $("#yesRestart").onclick = () => {
      state.answers = Array(30).fill(null);
      state.startedAt = new Date().toISOString();
      delete state.completedAt;
      stage = 0;
      save();
      close();
      buildWorld();
      hud();
    };
  };
}
const labs = [
  {
    title: "ลิฟต์สำรวจความดัน",
    intro: "เลื่อนระดับความสูง สังเกตค่าบารอมิเตอร์และมวลอากาศที่กดทับ",
    label: "ความสูงเหนือระดับทะเล (เมตร)",
    min: 0,
    max: 5000,
    value: 0,
    run: (v) =>
      `ความสูง ${v} เมตร\nความดันประมาณ ${(1013.25 * Math.exp(-v / 8400)).toFixed(1)} hPa\n${"▰".repeat(Math.max(1, 10 - Math.floor(v / 550)))} มวลอากาศเหนือจุดวัด\nยิ่งสูง มวลอากาศกดทับยิ่งน้อย ความดันจึงลดลง`,
  },
  {
    title: "บอลลูนสำรวจชั้นบรรยากาศ",
    intro: "เลือกชั้นเพื่อค้นหาปรากฏการณ์และหน้าที่ของบรรยากาศ",
    label: "ชั้นบรรยากาศจากพื้นโลก",
    options: [
      "โทรโพสเฟียร์",
      "สตราโตสเฟียร์",
      "มีโซสเฟียร์",
      "เทอร์โมสเฟียร์",
      "เอกโซสเฟียร์",
    ],
    run: (v) =>
      [
        "☁ 0–12 กม. โดยประมาณ · เมฆ ฝน ไอน้ำ และลมฟ้าอากาศ ช่วยเอื้อต่อสิ่งมีชีวิต",
        "☀ 12–50 กม. · โอโซนดูดกลืนรังสี UV ช่วยปกป้องสิ่งมีชีวิต",
        "☄ 50–85 กม. · สะเก็ดดาวจำนวนมากเผาไหม้ ช่วยลดวัตถุที่มาถึงพื้นโลก",
        "✧ 85–600 กม. · ออโรราและไอโอโนสเฟียร์เกี่ยวข้องกับคลื่นวิทยุ",
        "🛰 ประมาณ 600 กม. ขึ้นไป · อากาศเบาบาง ค่อย ๆ ต่อเนื่องสู่อวกาศ",
      ][v],
  },
  {
    title: "สถานีทดลองลมฟ้าอากาศ",
    intro:
      "เปลี่ยนความร้อนที่พื้นดิน แล้วสังเกตการลอยตัว ความชื้นสัมพัทธ์ และทิศทางลม",
    label: "อุณหภูมิพื้นดิน (°C)",
    min: 15,
    max: 40,
    value: 25,
    run: (v) =>
      `พื้นดิน ${v} °C · บริเวณใกล้เคียง 25 °C\n${v > 25 ? "↑ อากาศเหนือพื้นดินร้อน ขยายตัว ลอยขึ้น ลมผิวพื้นไหลเข้าหา" : v < 25 ? "↓ อากาศเย็น หนาแน่นกว่า มีแนวโน้มจมตัว ลมผิวพื้นไหลออก" : "อุณหภูมิเท่ากัน แบบจำลองยังไม่มีแรงขับจากความร้อนต่างกัน"}\nเมื่อปริมาณไอน้ำคงเดิม ความชื้นสัมพัทธ์ประมาณ ${Math.min(100, Math.round(60 * Math.exp((25 - v) * 0.06)))}%\nถ้าเย็นถึงจุดน้ำค้างและมีเงื่อนไขเหมาะสม ไอน้ำควบแน่น`,
  },
  {
    title: "เปรียบเทียบระบบพายุ",
    intro: "เปรียบเทียบกลไกและขนาด แล้วเลือกแผนรับมือที่ปลอดภัย",
    label: "ระบบพายุ",
    options: ["พายุฝนฟ้าคะนอง", "พายุหมุนเขตร้อน"],
    run: (v) =>
      +v === 0
        ? "☁ ↑ อากาศอุ่นชื้นยกตัว → เมฆคิวมูโลนิมบัส → ฝน ลมกระโชก ฟ้าผ่า\nมักมีขนาดเล็กกว่าพายุหมุนเขตร้อน\nแผนปลอดภัย: เข้าอาคารมั่นคง หลีกเลี่ยงต้นไม้สูง พื้นที่โล่ง และแหล่งน้ำ"
        : "🌀 ทะเลอุ่น + ความชื้น + สภาพแวดล้อมเหมาะสม → ระบบหมุนเวียนขนาดใหญ่\nอาจมีฝนฟ้าคะนองร่วมด้วย เกิดลมแรง คลื่นสูง น้ำท่วม\nแผนปลอดภัย: ติดตามประกาศทางการ เตรียมของจำเป็น อพยพตามคำสั่ง",
  },
  {
    title: "โต๊ะนักพยากรณ์อากาศ",
    intro: "เลือกข้อมูลตรวจวัด เปรียบเทียบแนวโน้ม และทดลองวางแผนกิจกรรม",
    label: "ชุดข้อมูลจำลอง",
    options: [
      "แนวโน้มอุณหภูมิ 3 วัน",
      "เรดาร์พบกลุ่มฝนเคลื่อนเข้า",
      "อัปเดต: กลุ่มฝนเปลี่ยนทิศ",
    ],
    run: (v) =>
      [
        "📊 32 → 33 → 34 °C\nแนวโน้มอุณหภูมิสูงสุดเพิ่มขึ้นในช่วงที่วัด แต่ไม่รับประกันว่าพรุ่งนี้ 35 °C\nใช้วางแผนดื่มน้ำ พักในร่ม และติดตามพยากรณ์ล่าสุด",
        "📡 กลุ่มฝน → พื้นที่กิจกรรม\nข้อมูลเรดาร์ร่วมกับความชื้น ลม และแบบจำลองช่วยคาดการณ์\nแผน: ย้ายกิจกรรมเข้าอาคาร เผื่อแผนสำรอง หลีกเลี่ยงฟ้าผ่า",
        "📡 กลุ่มฝน ↗ ออกจากพื้นที่\nข้อมูลใหม่ทำให้พยากรณ์เปลี่ยนได้ ยังมีความไม่แน่นอน\nแผน: ตรวจประกาศล่าสุดก่อนตัดสินใจ ไม่รับประกันว่าฝนจะไม่ตก",
      ][v],
  },
  {
    title: "ห้องทดลองอนาคตภูมิอากาศ",
    intro: "ปรับการปล่อยแก๊สเรือนกระจก สังเกตแนวโน้มระยะยาวและออกแบบการรับมือ",
    label: "การปล่อยแก๊สเรือนกระจกสัมพัทธ์ (%)",
    min: 20,
    max: 180,
    value: 100,
    run: (v) =>
      `การปล่อย ${v}% ของกรณีอ้างอิง\n${v > 100 ? "↑ เพิ่มการสะสมแก๊สเรือนกระจก เพิ่มแนวโน้มการกักเก็บความร้อน" : v < 100 ? "↓ ลดการเพิ่มแก๊สเรือนกระจกเมื่อเทียบกับกรณีอ้างอิง แต่ไม่ได้ทำให้โลกเย็นลงทันที" : "การปล่อยยังดำเนินต่อไป ไม่ได้หมายถึงอุณหภูมิคงที่"}\nผลกระทบระยะยาว: คลื่นความร้อน ฝนหนัก และระดับน้ำทะเลสูงขึ้น\nลดสาเหตุ: ประหยัดพลังงาน เดินทางคาร์บอนต่ำ\nปรับตัว: จัดทางระบายน้ำ ระบบเตือนภัย และแผนอพยพ`,
  },
];
function lab() {
  const l = labs[stage];
  card(
    `<div class="eyebrow">FIELD LAB · ${stages[stage][1]}</div><h2>${l.title}</h2><p>${l.intro}</p><label>${l.label}${l.options ? `<select id="labInput">${l.options.map((o, i) => `<option value="${i}">${o}</option>`).join("")}</select>` : `<input id="labInput" type="range" min="${l.min}" max="${l.max}" value="${l.value}">`}</label><div class="lab-view"><div id="labBar" class="bar"></div><div id="labResult" aria-live="polite"></div></div><p class="muted">แบบจำลองเพื่อการเรียนรู้ ไม่ใช่ข้อมูลตรวจวัดหรือคำพยากรณ์จริง ${stage === 0 ? "ใช้สมการประมาณ P = 1013.25 × exp(−h/8400)" : ""}${stage === 1 ? "ขอบเขตชั้นบรรยากาศเปลี่ยนแปลงได้ตามพื้นที่และสภาวะ" : ""}</p><button id="labClose" class="primary">กลับสู่การผจญภัย</button>`,
  );
  const update = () => {
    const v = +$("#labInput").value;
    $("#labResult").textContent = l.run(v);
    $("#labBar").style.width =
      `${l.options ? 20 + v * 18 : 15 + (85 * (v - l.min)) / (l.max - l.min)}%`;
  };
  $("#labInput").oninput = update;
  update();
  $("#labClose").onclick = close;
}
$("#labOpen").onclick = lab;
$("#summaryOpen").onclick = summary;
function interact() {
  if (!active || overlay.children.length) return;
  if (nearest >= 0) ask(nearest);
  else toast("เดินเข้าใกล้เครื่องหมาย ? เพื่อสำรวจ");
}
$("#interact").onclick = interact;
window.addEventListener("keydown", (e) => {
  if (overlay.children.length) return;
  if (
    ["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(
      e.code,
    )
  )
    e.preventDefault();
  keys.add(e.code);
  if (e.code === "KeyE" && !e.repeat) interact();
});
window.addEventListener("keyup", (e) => keys.delete(e.code));
window.addEventListener("blur", () => keys.clear());
document.addEventListener("visibilitychange", () => keys.clear());
document.querySelectorAll("[data-key]").forEach((b) => {
  b.onpointerdown = (e) => {
    e.preventDefault();
    b.setPointerCapture(e.pointerId);
    keys.add(b.dataset.key);
  };
  for (const ev of ["pointerup", "pointercancel", "lostpointercapture"])
    b.addEventListener(ev, () => keys.delete(b.dataset.key));
});
function resize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize);
resize();
let last = performance.now(),
  time = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.04, (now - last) / 1000);
  last = now;
  time += dt;
  clouds.forEach(
    (c, i) => (c.position.x += Math.sin(time * 0.2 + i) * dt * 0.15),
  );
  markers.forEach((m, i) => {
    m.position.y = 2.7 + Math.sin(time * 2 + i) * 0.2;
  });
  if (active && !overlay.children.length) {
    const turn =
      (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0) -
      (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0);
    player.rotation.y += turn * 2.3 * dt;
    const forward =
      (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0) -
      (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0);
    if (forward) {
      const speed = keys.has("ShiftLeft") || keys.has("ShiftRight") ? 8 : 4.5;
      player.position.x -= Math.sin(player.rotation.y) * forward * speed * dt;
      player.position.z -= Math.cos(player.rotation.y) * forward * speed * dt;
      legs[0].rotation.x = Math.sin(time * speed * 2) * 0.6;
      legs[1].rotation.x = -legs[0].rotation.x;
    } else legs.forEach((l) => (l.rotation.x = 0));
    if (keys.has("Space") && grounded) {
      vy = 7;
      grounded = false;
      beep();
    }
    vy -= 18 * dt;
    player.position.y += vy * dt;
    const p = player.position,
      pit = Math.abs(p.x - 6) < 2.5 && Math.abs(p.z - 11) < 2.5,
      out = Math.abs(p.x) > 21 || p.z > 23 || p.z < -39;
    if (!pit && !out && p.y <= 0) {
      p.y = 0;
      vy = 0;
      grounded = true;
    } else if (pit || out) {
      grounded = false;
      if (p.y < -5) {
        p.set(0, 0, 15);
        vy = 0;
        grounded = true;
        toast("กลับสู่จุดปลอดภัยแล้ว");
      }
    }
    nearest = -1;
    let best = 3;
    locations.forEach(([mx, mz], i) => {
      const d = Math.hypot(mx - p.x, mz - p.z);
      if (d < best && state.answers[stage * 5 + i] === null) {
        best = d;
        nearest = i;
      }
    });
    $("#hint").hidden = nearest < 0;
    if (nearest >= 0)
      $("#hint").textContent =
        `จุดคำถาม ${stage * 5 + nearest + 1} · กด E หรือปุ่มสำรวจ`;
  }
  const target = new THREE.Vector3(
    player.position.x + Math.sin(player.rotation.y) * 11,
    player.position.y + 7,
    player.position.z + Math.cos(player.rotation.y) * 11,
  );
  camera.position.lerp(target, 1 - Math.exp(-dt * 5));
  camera.lookAt(
    player.position.x - Math.sin(player.rotation.y) * 3,
    player.position.y + 1,
    player.position.z - Math.cos(player.rotation.y) * 3,
  );
  renderer.render(scene, camera);
}
buildWorld();
login();
requestAnimationFrame(frame);
