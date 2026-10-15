
"use strict";

const $ = (id) => document.getElementById(id);

const KEYS = {
  records: "healthMateRecordsV2",
  reminders: "healthMateRemindersV2"
};

function loadData(key) {
  try {
    const data = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function saveData(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    alert("Could not save data. Browser storage may be unavailable or full.");
    return false;
  }
}

function localDate() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function makeId() {
  return window.crypto?.randomUUID?.() ||
    `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

let records = loadData(KEYS.records);
let reminders = loadData(KEYS.reminders);
let audioContext = null;
let sirenOscillators = [];
let sirenGains = [];
let sirenStopTimer = null;
let scheduler = null;
let notificationsAllowed = false;
let alerted = new Set();

// ---------- SYMPTOM CHECKER ----------

const symptomGroups = [
  {
    name: "Cold-like symptoms",
    terms: ["cough", "sore throat", "runny nose", "sneezing", "congestion"],
    explanation: "These symptoms can occur with respiratory infections, allergies, and other conditions.",
    care: "Rest, drink fluids as tolerated, and avoid smoke. Seek professional advice if symptoms worsen or persist."
  },
  {
    name: "Fever-related symptoms",
    terms: ["fever", "high temperature", "chills"],
    explanation: "Fever can have many causes, including infections. Symptoms and measured temperature help guide assessment.",
    care: "Monitor your temperature and drink fluids. Seek medical advice if the fever is persistent, severe, or accompanied by worrying symptoms."
  },
  {
    name: "Headache",
    terms: ["headache", "head pain"],
    explanation: "Headaches can be associated with dehydration, tension, migraine, infection, and other causes.",
    care: "Rest and drink water. A sudden severe headache or headache with weakness, confusion, or vision changes needs urgent medical assessment."
  },
  {
    name: "Digestive symptoms",
    terms: ["nausea", "vomiting", "diarrhea", "stomach pain", "abdominal pain"],
    explanation: "Digestive symptoms can arise from infections, food-related illness, medicines, and other conditions.",
    care: "Take small, frequent sips of fluids if tolerated. Seek care for severe pain, blood in vomit or stool, dehydration, or persistent vomiting."
  },
  {
    name: "Allergy-like or skin symptoms",
    terms: ["itchy eyes", "itchy skin", "rash", "hives"],
    explanation: "Skin or eye symptoms can occur with allergies, irritation, infections, or other conditions.",
    care: "Avoid a suspected trigger when possible and seek advice about appropriate treatment. Swelling of the tongue or throat or difficulty breathing is an emergency."
  },
  {
    name: "Muscle or joint pain",
    terms: ["back pain", "joint pain", "muscle pain"],
    explanation: "Pain may be related to strain, injury, inflammation, or other causes.",
    care: "Avoid activities that worsen the pain. Seek assessment for severe, persistent, or worsening pain, or pain after a serious injury."
  }
];

function containsTerm(text, term) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z])${escaped}([^a-z]|$)`, "i").test(text);
}

function getSafetyWarning(text, manualFlag) {
  const emergencyPatterns = [
    /difficulty breathing|shortness of breath|cannot breathe|can't breathe|trouble breathing/i,
    /severe chest pain|chest pressure/i,
    /fainting|passed out|unconscious|confusion/i,
    /face drooping|slurred speech|sudden weakness/i,
    /swelling of (the )?(tongue|throat)/i,
    /severe bleeding/i
  ];

  return manualFlag || emergencyPatterns.some((pattern) => pattern.test(text));
}

$("symptomForm").addEventListener("submit", (event) => {
  event.preventDefault();

  const original = $("symptomsInput").value.trim();
  const text = original.toLowerCase();
  const output = $("symptomResult");

  if (!original) {
    output.textContent = "Please describe your symptoms.";
    return;
  }

  const emergency = getSafetyWarning(text, $("redFlags").checked);
  const ageGroup = $("ageGroup").value;
  const duration = $("duration").value;

  let html = "";

  if (emergency) {
    output.className = "result emergency";
    html = `
      <h3>Urgent safety warning</h3>
      <p>Some symptoms you reported may indicate an emergency.
      Seek urgent medical help now for difficulty breathing, severe chest
      pain, fainting, confusion, sudden stroke-like symptoms, or swelling
      of the tongue or throat.</p>
      <p>In India, call 112 for emergency assistance when needed.
      Do not wait for an online checker to assess you.</p>
      <p><strong>Medicine advice:</strong> Do not delay urgent care to try
      a medicine suggested online.</p>`;
  } else {
    const matched = symptomGroups.filter((group) =>
      group.terms.some((term) => containsTerm(text, term))
    );

    output.className = "result" + (matched.length ? "" : " warning");
    html = "<h3>Possible explanations, not a diagnosis</h3>";

    if (matched.length) {
      html += "<ul>";
      for (const group of matched) {
        html += `<li><strong>${escapeHTML(group.name)}:</strong>
          ${escapeHTML(group.explanation)}
          <br><strong>General care:</strong> ${escapeHTML(group.care)}</li>`;
      }
      html += "</ul>";
    } else {
      html += `<p>This basic prototype does not recognize the symptom pattern.
      This does not mean that your symptoms are harmless. Please consult
      a healthcare professional if you are concerned.</p>`;
    }

    if (duration === "long") {
      html += `<p><strong>Duration:</strong> Because symptoms have lasted
      more than three days, consider professional assessment, especially
      if they are not improving.</p>`;
    } else if (duration === "fewdays") {
      html += `<p><strong>Duration:</strong> Monitor symptoms and seek
      advice if they worsen or do not improve.</p>`;
    }

    if (ageGroup === "child") {
      html += `<p><strong>Child safety:</strong> Ask a pediatric healthcare
      professional before giving medicines to a child.</p>`;
    } else if (ageGroup === "older") {
      html += `<p><strong>Older adult:</strong> Seek earlier assessment
      for new, persistent, or worsening symptoms.</p>`;
    }

    html += `
      <h3>Medicine information</h3>
      <p>This tool cannot safely choose a medicine or dose from symptoms
      alone. A pharmacist or clinician can assess suitable options,
      contraindications, allergies, and interactions. Do not start
      antibiotics or prescription medicines without professional advice.</p>`;
  }

  html += `<p class="muted">This educational tool is not a medical diagnosis.</p>`;
  output.innerHTML = html;

  // Save the symptom entry into today's diary.
  const date = localDate();
  let record = records.find((r) => r.date === date);

  if (record) {
    record.notes = [record.notes, `Symptoms: ${original}`]
      .filter(Boolean).join("\n");
  } else {
    record = {
      id: makeId(),
      date,
      temperature: "",
      water: 0,
      sleep: 0,
      mood: "Unwell",
      notes: `Symptoms: ${original}`
    };
    records.push(record);
  }

  if (saveData(KEYS.records, records)) renderRecords();
});

// ---------- DAILY HEALTH TRACKER ----------

$("trackDate").value = localDate();

$("trackerForm").addEventListener("submit", (event) => {
  event.preventDefault();

  const date = $("trackDate").value;
  const temperature = $("temperature").value;
  const water = Number($("water").value);
  const sleep = Number($("sleep").value);

  if (!date || !Number.isFinite(water) || !Number.isFinite(sleep)) {
    alert("Please enter valid record details.");
    return;
  }

  if (temperature !== "" &&
      (!Number.isFinite(Number(temperature)) ||
       Number(temperature) < 30 || Number(temperature) > 45)) {
    alert("Please enter a valid temperature in °C.");
    return;
  }

  if (water < 0 || water > 100 || sleep < 0 || sleep > 24) {
    alert("Please check your water and sleep values.");
    return;
  }

  const previous = records.find((r) => r.date === date);
  const entry = {
    id: previous?.id || makeId(),
    date,
    temperature,
    water,
    sleep,
    mood: $("mood").value,
    notes: $("dailyNotes").value.trim()
  };

  if (previous) Object.assign(previous, entry);
  else records.push(entry);

  if (saveData(KEYS.records, records)) {
    renderRecords();
    alert("Daily health record saved.");
  }
});

function renderRecords() {
  records.sort((a, b) => b.date.localeCompare(a.date));

  $("recordCount").textContent = records.length;
  const todayRecord = records.find((r) => r.date === localDate());

  $("todayWater").textContent = todayRecord?.water ?? 0;
  $("todaySleep").textContent =
    todayRecord && todayRecord.sleep !== "" ? todayRecord.sleep : "—";

  if (!records.length) {
    $("history").innerHTML =
      '<p class="empty">No health records saved yet.</p>';
    return;
  }

  $("history").innerHTML = records.map((r) => `
    <article class="history-item">
      <strong>${escapeHTML(r.date)}</strong>
      <p>Temperature: ${
        r.temperature === "" ? "Not recorded" :
        escapeHTML(r.temperature) + " °C"
      }</p>
      <p>Water: ${escapeHTML(r.water)} glasses ·
      Sleep: ${escapeHTML(r.sleep)} hours ·
      Mood: ${escapeHTML(r.mood)}</p>
      ${r.notes ? `<p>Notes: ${escapeHTML(r.notes).replace(/\n/g, "<br>")}</p>` : ""}
      <button class="danger-button delete-record" data-id="${escapeHTML(r.id)}"
        type="button">Delete record</button>
    </article>
  `).join("");
}

$("history").addEventListener("click", (event) => {
  const button = event.target.closest(".delete-record");
  if (!button) return;

  if (!confirm("Delete this health record?")) return;

  records = records.filter((r) => String(r.id) !== button.dataset.id);
  if (saveData(KEYS.records, records)) renderRecords();
});

$("clearData").addEventListener("click", () => {
  if (!confirm("Delete all health records saved in this browser?")) return;

  records = [];
  if (saveData(KEYS.records, records)) renderRecords();
});

$("exportData").addEventListener("click", () => {
  const columns = [
    "date", "temperature", "water", "sleep", "mood", "notes"
  ];

  const quote = (value) =>
    '"' + String(value ?? "").replace(/"/g, '""') + '"';

  const csv = [
    columns.join(","),
    ...records.map((r) => columns.map((key) => quote(r[key])).join(","))
  ].join("\r\n");

  const blob = new Blob(["\uFEFF" + csv], {
    type: "text/csv;charset=utf-8"
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "health-mate-records.csv";
  link.click();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

// ---------- FIRE-ENGINE-STYLE SIREN ----------

async function prepareAudio() {
  const AudioClass = window.AudioContext || window.webkitAudioContext;

  if (!AudioClass) {
    throw new Error("This browser does not support generated audio.");
  }

  if (!audioContext) audioContext = new AudioClass();

  if (audioContext.state === "suspended") {
    await audioContext.resume();
  }

  if (audioContext.state !== "running") {
    throw new Error("Audio is unavailable. Check browser settings.");
  }
}

function stopSiren() {
  if (sirenStopTimer) {
    clearTimeout(sirenStopTimer);
    sirenStopTimer = null;
  }

  const now = audioContext?.currentTime || 0;

  for (const gain of sirenGains) {
    try {
      gain.gain.cancelScheduledValues(now);
      gain.gain.setTargetAtTime(0.0001, now, 0.025);
    } catch {}
  }

  for (const oscillator of sirenOscillators) {
    try {
      oscillator.stop(now + 0.12);
    } catch {}
  }

  sirenOscillators = [];
  sirenGains = [];
}

async function playSiren() {
  await prepareAudio();
  stopSiren();

  const ctx = audioContext;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  const start = ctx.currentTime;
  const duration = 3.2;
  const volume = Number($("soundVolume").value) / 100;

  oscillator.type = "sawtooth";
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(volume, start + 0.12);
  gain.gain.setValueAtTime(volume, start + duration - 0.15);
  gain.gain.linearRampToValueAtTime(0.0001, start + duration);

  // Alternating rising and falling siren pitch.
  oscillator.frequency.setValueAtTime(650, start);

  for (let i = 0; i < 8; i++) {
    const time = start + i * 0.4;
    const frequency = i % 2 === 0 ? 980 : 580;
    oscillator.frequency.setTargetAtTime(frequency, time, 0.055);
  }

  oscillator.connect(gain);
  gain.connect(ctx.destination);

  sirenOscillators = [oscillator];
  sirenGains = [gain];

  oscillator.start(start);
  oscillator.stop(start + duration + 0.03);

  sirenStopTimer = setTimeout(() => {
    sirenOscillators = [];
    sirenGains = [];
    sirenStopTimer = null;
  }, (duration + 0.2) * 1000);
}

$("testSound").addEventListener("click", async () => {
  try {
    await playSiren();
    $("notificationStatus").textContent =
      "Siren sound tested. Adjust the volume if needed.";
  } catch (error) {
    $("notificationStatus").textContent = error.message;
  }
});

$("stopSound").addEventListener("click", () => {
  stopSiren();
  $("notificationStatus").textContent = "Siren sound stopped.";
});

// ---------- BROWSER NOTIFICATIONS ----------

$("enableNotifications").addEventListener("click", async () => {
  try {
    await prepareAudio();

    if (!("Notification" in window)) {
      throw new Error("Browser notifications are not supported here.");
    }

    if (!window.isSecureContext) {
      throw new Error("Open this website using localhost or HTTPS to enable notifications.");
    }

    const permission = await Notification.requestPermission();
    notificationsAllowed = permission === "granted";

    if (!notificationsAllowed) {
      $("notificationStatus").textContent =
        "Notifications were not enabled. Check your browser site permissions.";
      return;
    }

    $("notificationStatus").textContent =
      "Notifications enabled. Keep this page open for scheduled reminders.";

    new Notification("Health Mate", {
      body: "Notifications enabled. Your reminders are ready."
    });

    await playSiren();
  } catch (error) {
    $("notificationStatus").textContent =
      error.message || "Could not enable notifications.";
  }
});

// ---------- REMINDER MANAGEMENT ----------

$("reminderForm").addEventListener("submit", (event) => {
  event.preventDefault();

  const name = $("reminderName").value.trim();
  const time = $("reminderTime").value;

  if (!name || !time) {
    alert("Please enter a reminder name and time.");
    return;
  }

  reminders.push({
    id: makeId(),
    name,
    time,
    type: $("reminderType").value,
    days: $("reminderDays").value,
    createdDate: localDate(),
    lastFiredDate: ""
  });

  if (saveData(KEYS.reminders, reminders)) {
    renderReminders();
    $("reminderForm").reset();
    $("notificationStatus").textContent =
      "Reminder saved. Keep the page open at the scheduled time.";
  }
});

function renderReminders() {
  if (!reminders.length) {
    $("reminderList").innerHTML =
      '<p class="empty">No reminders added yet.</p>';
    return;
  }

  $("reminderList").innerHTML = reminders.map((r) => `
    <article class="history-item">
      <strong>${escapeHTML(r.name)}</strong>
      <p>${escapeHTML(r.time)} · ${escapeHTML(r.type)} ·
      ${r.days === "daily" ? "Every day" : "Today only"}</p>
      <button class="danger-button delete-reminder" data-id="${escapeHTML(r.id)}"
        type="button">Delete reminder</button>
    </article>
  `).join("");
}

$("reminderList").addEventListener("click", (event) => {
  const button = event.target.closest(".delete-reminder");
  if (!button) return;

  reminders = reminders.filter((r) => String(r.id) !== button.dataset.id);
  alerted = new Set();

  if (saveData(KEYS.reminders, reminders)) renderReminders();
});

async function checkReminders() {
  const now = new Date();
  const date = localDate();
  const time =
    String(now.getHours()).padStart(2, "0") + ":" +
    String(now.getMinutes()).padStart(2, "0");

  let changed = false;

  for (const reminder of reminders) {
    if (reminder.days === "once" && reminder.createdDate !== date) continue;
    if (reminder.time !== time || reminder.lastFiredDate === date) continue;

    const key = `${reminder.id}-${date}`;
    if (alerted.has(key)) continue;

    alerted.add(key);
    reminder.lastFiredDate = date;
    changed = true;

    if (notificationsAllowed &&
        "Notification" in window &&
        Notification.permission === "granted") {
      try {
        new Notification("Health Mate reminder", {
          body: reminder.name,
          tag: key
        });
      } catch (error) {
        console.warn("Notification could not be displayed.", error);
      }
    }

    // Sound may be blocked if the browser suspends audio.
    try {
      await playSiren();
    } catch (error) {
      $("notificationStatus").textContent =
        "Reminder due, but sound was blocked. Open the page and test sound.";
    }

    // Visible fallback when the page is open.
    alert("Health Mate reminder: " + reminder.name);
  }

  if (changed) saveData(KEYS.reminders, reminders);
}

function startScheduler() {
  if (scheduler) clearInterval(scheduler);

  checkReminders();
  scheduler = setInterval(checkReminders, 10000);
}

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) checkReminders();
});

// ---------- INITIALIZE ----------

renderRecords();
renderReminders();
startScheduler();